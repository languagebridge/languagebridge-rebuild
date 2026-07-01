import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHash } from 'crypto';
import axios from 'axios';
import { TTSRequest, TTSResponse, AudioCacheMetadataDoc } from '../../shared/types';
import { getAudioCacheContainer, generateSasUrl } from '../../shared/blob-client';
import { getAudioCacheMetadataContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, isValidStudentCode, validateTTSText, validateApiKey, checkRateLimit, errorResponse } from '../../shared/validators';
import voiceConfig from '../../shared/voice-config.json';

/**
 * tts-router
 *
 * Routes TTS requests: cache hit → return URL, cache miss → generate → cache → return URL.
 * Every request is logged to Cosmos DB audio_cache_metadata.
 */

app.http('tts-router', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'tts-router',
  handler: ttsRouter,
});

export async function ttsRouter(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('tts-router invoked');

  // ── 0. Auth ──────────────────────────────────────────────────
  const keyCheck = validateApiKey(request);
  if (!keyCheck.valid) {
    return error(401, 'UNAUTHORIZED', keyCheck.error);
  }

  // ── 1. Parse body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'MISSING_FIELDS', 'Request body must be valid JSON');
  }

  // ── 2. Validate required fields ────────────────────────────────
  const fieldCheck = requireFields(body, ['text', 'language', 'studentCode']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { text, language, studentCode } = body as TTSRequest;
  if (!isValidStudentCode(studentCode)) {
    return error(400, 'INVALID_STUDENT_CODE', 'studentCode is malformed');
  }
  context.log(`tts-router request — student: ${studentCode}`);

  // ── 2b. Rate limit (per student, most expensive endpoint) ────
  // Lower limit — TTS generation is expensive (Azure API calls + blob upload)
  const rateCheck = await checkRateLimit(`tts:${studentCode}`, 60);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  // ── 3. Validate text ───────────────────────────────────────────
  const textCheck = validateTTSText(text);
  if (!textCheck.valid) {
    return error(400, 'TEXT_TOO_LONG', textCheck.reason);
  }

  // ── 4. Validate language ───────────────────────────────────────
  if (!isValidLanguage(language)) {
    return error(400, 'INVALID_LANGUAGE', `Language '${language}' is not supported`);
  }

  // ── 5. Generate cache key ──────────────────────────────────────
  const textHash = createHash('sha256').update(`${text}::${language}`).digest('hex');
  const blobName = `${language}/${textHash}.mp3`;

  // ── 6. Check cache ─────────────────────────────────────────────
  try {
    const audioContainer = getAudioCacheContainer();
    const blobClient = audioContainer.getBlobClient(blobName);
    const exists = await blobClient.exists();

    if (exists) {
      context.log(`Cache hit: ${blobName}`);
      await incrementCacheHit(textHash);

      const containerName = process.env.AZURE_STORAGE_CONTAINER_AUDIO ?? 'tts-audio-cache';
      const response: TTSResponse = {
        audioUrl: generateSasUrl(containerName, blobName),
        source: 'azure_cache',
        durationMs: 0,
        cached: true,
        textHash,
      };
      return { status: 200, jsonBody: response };
    }
  } catch (err) {
    context.log('Cache check failed, proceeding to generate:', err);
  }

  // ── 7. Try proprietary TTS service first ──────────────────────
  const proprietaryUrl = process.env.LB_TTS_SERVICE_URL; // e.g. https://lb-tts.azurecontainerapps.io
  let audioBuffer: Buffer | undefined;
  let ttsSource: TTSResponse['source'] = 'azure_live';

  if (proprietaryUrl) {
    try {
      const propResponse = await axios.post(
        `${proprietaryUrl}/synthesize`,
        { text, language },
        {
          headers: { 'Content-Type': 'application/json' },
          responseType: 'arraybuffer',
          timeout: 15000,
        }
      );
      audioBuffer = Buffer.from(propResponse.data);
      ttsSource = 'proprietary';
      const backend = propResponse.headers['x-lb-backend'] ?? 'unknown';
      const quality = propResponse.headers['x-lb-quality'] ?? 'unknown';
      context.log(`Proprietary TTS OK — backend: ${backend}, quality: ${quality}`);
    } catch (err: unknown) {
      // Proprietary service unavailable or failed — fall through to Azure
      if (axios.isAxiosError(err)) {
        context.log(`Proprietary TTS failed (${err.response?.status ?? 'no response'}), falling back to Azure`);
      } else {
        context.log('Proprietary TTS failed, falling back to Azure:', err);
      }
    }
  }

  // ── 8. Fall back to Azure TTS if proprietary didn't produce audio ─
  if (!audioBuffer) {
    const ttsKey = process.env.AZURE_TTS_KEY;
    const ttsRegion = process.env.AZURE_TTS_REGION ?? 'eastus';

    if (!ttsKey) {
      return error(500, 'INTERNAL_ERROR', 'TTS service not configured');
    }

    try {
      const ssml = buildSSML(text, language);
      const ttsResponse = await axios.post(
        `https://${ttsRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
        ssml,
        {
          headers: {
            'Ocp-Apim-Subscription-Key': ttsKey,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3',
          },
          responseType: 'arraybuffer',
          timeout: 10000,
        }
      );
      audioBuffer = Buffer.from(ttsResponse.data);
      ttsSource = 'azure_live';
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const body = err.response?.data
          ? Buffer.from(err.response.data).toString('utf8')
          : '(empty)';
        context.log(`Azure TTS failed — status: ${status}, body: ${body}`);
        context.log(`SSML sent: ${buildSSML(text, language)}`);
      } else {
        context.log('Azure TTS failed:', err);
      }
      return error(502, 'AZURE_SERVICE_ERROR', 'Failed to generate audio');
    }
  }

  // ── 9. Upload to Blob Storage ──────────────────────────────────
  const contentType = ttsSource === 'proprietary' ? 'audio/wav' : 'audio/mpeg';
  const finalBlobName = `${language}/${textHash}.mp3`;

  let audioUrl: string;
  try {
    const audioContainerName = process.env.AZURE_STORAGE_CONTAINER_AUDIO ?? 'tts-audio-cache';
    const audioContainer = getAudioCacheContainer();
    const blockBlobClient = audioContainer.getBlockBlobClient(finalBlobName);
    await blockBlobClient.upload(audioBuffer, audioBuffer.length, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
    audioUrl = generateSasUrl(audioContainerName, finalBlobName);
  } catch (err) {
    context.log('Blob upload failed:', err);
    return error(500, 'INTERNAL_ERROR', 'Failed to cache audio');
  }

  // ── 10. Write cache metadata to Cosmos DB (blocking — required for cache hits) ─
  // Without this metadata, future requests won't find the cached blob and will
  // regenerate audio unnecessarily. This write MUST succeed.
  try {
    const metadataContainer = getAudioCacheMetadataContainer();
    const doc: AudioCacheMetadataDoc = {
      id: textHash,
      textHash,
      language,
      audioUrl,
      blobName: finalBlobName,
      source: ttsSource,
      durationMs: 0,
      cachedAt: new Date().toISOString(),
      hitCount: 0,
    };
    await metadataContainer.items.upsert(doc);
  } catch (err) {
    // Retry once — transient failures are common on cold starts
    context.warn('Cosmos metadata write failed, retrying:', err);
    try {
      const metadataContainer = getAudioCacheMetadataContainer();
      await metadataContainer.items.upsert({
        id: textHash, textHash, language, audioUrl,
        blobName: finalBlobName, source: ttsSource,
        durationMs: 0, cachedAt: new Date().toISOString(), hitCount: 0,
      });
    } catch (retryErr) {
      // Audio was uploaded but metadata wasn't saved — log for investigation
      // The audio still works (URL is valid), but won't be found as cached next time
      context.error('Cosmos metadata write failed after retry — cache will miss on next request:', retryErr);
    }
  }

  const response: TTSResponse = {
    audioUrl,
    source: ttsSource,
    durationMs: 0,
    cached: false,
    textHash,
  };
  return { status: 200, jsonBody: response };
}

// ============================================
// HELPERS
// ============================================

const error = errorResponse;

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/'/g, '&apos;')
    .replace(/"/g, '&quot;');
}

function buildSSML(text: string, language: string): string {
  const langConfig = (voiceConfig as Record<string, { azure_voice: string }>)[language];
  const voice = langConfig?.azure_voice ?? 'en-US-AndrewNeural';
  const langCode = voice.split('-').slice(0, 2).join('-');

  return `<speak version='1.0' xml:lang='${langCode}'>
    <voice xml:lang='${langCode}' name='${voice}'>
      ${escapeXml(text)}
    </voice>
  </speak>`;
}

async function incrementCacheHit(textHash: string): Promise<void> {
  try {
    const container = getAudioCacheMetadataContainer();
    await container.item(textHash, textHash).patch([
      { op: 'incr', path: '/hitCount', value: 1 },
    ]);
  } catch {
    // Non-fatal: cache hit tracking should not block responses
  }
}
