import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHash } from 'crypto';
import axios from 'axios';
import { TTSRequest, TTSResponse, TTSErrorResponse, AudioCacheMetadataDoc } from '../../shared/types';
import { getAudioCacheContainer } from '../../shared/blob-client';
import { getAudioCacheMetadataContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, validateTTSText } from '../../shared/validators';

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

  // ── 1. Parse body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'MISSING_FIELDS', 'Request body must be valid JSON');
  }

  // ── 2. Validate required fields ────────────────────────────────
  const fieldCheck = requireFields(body, ['text', 'language', 'pilotId', 'sessionToken']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { text, language, pilotId, sessionToken } = body as TTSRequest;
  context.log(`tts-router request — pilot: ${pilotId}, session: ${sessionToken}`);

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

      const response: TTSResponse = {
        audioUrl: blobClient.url,
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

  // ── 7. Generate audio via Azure TTS ───────────────────────────
  const ttsKey = process.env.AZURE_TTS_KEY;
  const ttsRegion = process.env.AZURE_TTS_REGION ?? 'eastus';

  if (!ttsKey) {
    return error(500, 'INTERNAL_ERROR', 'TTS service not configured');
  }

  let audioBuffer: Buffer;
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
  } catch (err) {
    context.log('Azure TTS failed:', err);
    return error(502, 'AZURE_SERVICE_ERROR', 'Failed to generate audio from Azure TTS');
  }

  // ── 8. Upload to Blob Storage ──────────────────────────────────
  let audioUrl: string;
  try {
    const audioContainer = getAudioCacheContainer();
    const blockBlobClient = audioContainer.getBlockBlobClient(blobName);
    await blockBlobClient.upload(audioBuffer, audioBuffer.length, {
      blobHTTPHeaders: { blobContentType: 'audio/mpeg' },
    });
    audioUrl = blockBlobClient.url;
  } catch (err) {
    context.log('Blob upload failed:', err);
    return error(500, 'INTERNAL_ERROR', 'Failed to cache audio');
  }

  // ── 9. Write cache metadata to Cosmos DB ──────────────────────
  try {
    const metadataContainer = getAudioCacheMetadataContainer();
    const doc: AudioCacheMetadataDoc = {
      id: textHash,
      textHash,
      language,
      audioUrl,
      blobName,
      source: 'azure_live',
      durationMs: 0,
      cachedAt: new Date().toISOString(),
      hitCount: 0,
    };
    await metadataContainer.items.upsert(doc);
  } catch (err) {
    context.log('Cosmos metadata write failed (non-fatal):', err);
  }

  const response: TTSResponse = {
    audioUrl,
    source: 'azure_live',
    durationMs: 0,
    cached: false,
    textHash,
  };
  return { status: 200, jsonBody: response };
}

// ============================================
// HELPERS
// ============================================

function error(
  status: number,
  code: TTSErrorResponse['error'],
  details: string
): HttpResponseInit {
  const body: TTSErrorResponse = { error: code, details };
  return { status, jsonBody: body };
}

function buildSSML(text: string, language: string): string {
  const voiceMap: Record<string, string> = {
    dari: 'fa-AF-HasanNeural',
    pashto: 'ps-AF-GulNawazNeural',
    persian: 'fa-IR-DilaraNeural',
    arabic: 'ar-SA-HamedNeural',
    urdu: 'ur-PK-AsadNeural',
    somali: 'so-SO-MuuseNeural',
    ukrainian: 'uk-UA-OstapNeural',
    spanish: 'es-US-AlonsoNeural',
    english: 'en-US-AndrewNeural',
  };

  const voice = voiceMap[language] ?? 'en-US-AndrewNeural';
  const langCode = voice.split('-').slice(0, 2).join('-');

  return `<speak version='1.0' xml:lang='${langCode}'>
    <voice xml:lang='${langCode}' name='${voice}'>
      ${text}
    </voice>
  </speak>`;
}

async function incrementCacheHit(textHash: string): Promise<void> {
  try {
    const container = getAudioCacheMetadataContainer();
    const { resource } = await container.item(textHash, textHash).read();
    if (resource) {
      resource.hitCount = (resource.hitCount ?? 0) + 1;
      await container.item(textHash, textHash).replace(resource);
    }
  } catch {
    // Non-fatal: cache hit count is a nice-to-have metric
  }
}
