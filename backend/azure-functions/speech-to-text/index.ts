import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import axios from 'axios';
import {
  SpeechToTextRequest,
  SpeechToTextResponse,
  SpeechToTextErrorResponse,
} from '../../shared/types';
import { requireFields, isValidLanguage, validateApiKey, checkRateLimit, errorResponse } from '../../shared/validators';

/**
 * speech-to-text
 *
 * Accepts audio from the student's microphone, returns transcribed text in the
 * source language. Used by the "Talk to Teacher" feature.
 *
 * PRIVACY: The audio and transcript are never stored. This function is a
 * pure pass-through to Azure Speech-to-Text. The response is returned once
 * and forgotten — no Cosmos DB write, no blob storage.
 *
 * AUDIO FORMAT: We accept base64-encoded audio in webm (MediaRecorder default),
 * wav, mp3, or ogg. Maximum size is 4MB (~90 seconds at typical speech bitrates).
 */

app.http('speech-to-text', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'speech-to-text',
  handler: speechToText,
});

// Azure Speech-to-Text language codes (different from our supported language names)
// Note: Not all 21 languages are supported by Azure STT. Unsupported languages
// return LANGUAGE_NOT_SUPPORTED.
const STT_LANGUAGE_MAP: Record<string, string> = {
  arabic: 'ar-SA',
  french: 'fr-FR',
  portuguese: 'pt-BR',
  ukrainian: 'uk-UA',
  vietnamese: 'vi-VN',
  spanish: 'es-ES',
  persian: 'fa-IR',
  english: 'en-US',
  nepali: 'ne-NP',
  swahili: 'sw-KE',
  dari: 'fa-IR',       // Uses Persian STT
  pashto: 'ps-AF',
  urdu: 'ur-IN',
  somali: 'so-SO',
  burmese: 'my-MM',
  uzbek: 'uz-UZ',
  amharic: 'am-ET',
  tagalog: 'fil-PH',
  // Not supported by Azure STT: kinyarwanda, twi, tigrinya
};

const MAX_AUDIO_SIZE_BYTES = 4 * 1024 * 1024; // 4MB after base64 decode

export async function speechToText(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('speech-to-text invoked');

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
  const fieldCheck = requireFields(body, ['audioBase64', 'audioFormat', 'language', 'studentCode']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { audioBase64, audioFormat, language, studentCode } = body as SpeechToTextRequest;

  // ── 3. Rate limit (STT is expensive — lower limit) ────────────
  const rateCheck = await checkRateLimit(`stt:${studentCode}`, 30);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  // ── 4. Validate language ───────────────────────────────────────
  if (!isValidLanguage(language)) {
    return error(400, 'INVALID_LANGUAGE', `Language '${language}' is not supported`);
  }
  const sttLanguageCode = STT_LANGUAGE_MAP[language];
  if (!sttLanguageCode) {
    return error(400, 'LANGUAGE_NOT_SUPPORTED', `Azure Speech-to-Text does not support '${language}'. Supported: ${Object.keys(STT_LANGUAGE_MAP).join(', ')}`);
  }

  // ── 5. Decode audio and validate size ──────────────────────────
  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(audioBase64, 'base64');
  } catch {
    return error(400, 'MISSING_FIELDS', 'audioBase64 is not valid base64');
  }
  if (audioBuffer.length === 0) {
    return error(400, 'MISSING_FIELDS', 'Decoded audio is empty');
  }
  if (audioBuffer.length > MAX_AUDIO_SIZE_BYTES) {
    return error(400, 'AUDIO_TOO_LARGE', `Audio exceeds ${MAX_AUDIO_SIZE_BYTES} bytes`);
  }

  // ── 6. Validate audio format ───────────────────────────────────
  const formatMap: Record<string, string> = {
    webm: 'audio/webm; codecs=opus',
    wav: 'audio/wav',
    mp3: 'audio/mpeg',
    ogg: 'audio/ogg; codecs=opus',
  };
  const contentType = formatMap[audioFormat];
  if (!contentType) {
    return error(400, 'MISSING_FIELDS', `audioFormat must be one of: ${Object.keys(formatMap).join(', ')}`);
  }

  // ── 7. Call Azure Speech-to-Text ──────────────────────────────
  const ttsKey = process.env.AZURE_TTS_KEY;
  const ttsRegion = process.env.AZURE_TTS_REGION ?? 'eastus';
  if (!ttsKey) {
    return error(500, 'INTERNAL_ERROR', 'Speech service not configured');
  }

  try {
    const sttUrl = `https://${ttsRegion}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1?language=${sttLanguageCode}&format=detailed`;

    const response = await axios.post(sttUrl, audioBuffer, {
      headers: {
        'Ocp-Apim-Subscription-Key': ttsKey,
        'Content-Type': contentType,
        'Accept': 'application/json',
      },
      timeout: 15_000,
      maxBodyLength: MAX_AUDIO_SIZE_BYTES,
      maxContentLength: 1024 * 1024, // 1MB response max
    });

    const data = response.data;
    if (data?.RecognitionStatus !== 'Success') {
      context.warn(`STT non-success status: ${data?.RecognitionStatus}`);
      return error(422, 'TRANSCRIPTION_FAILED', `Could not transcribe audio: ${data?.RecognitionStatus ?? 'unknown'}`);
    }

    const text = data.DisplayText ?? data.NBest?.[0]?.Display ?? '';
    const confidence = data.NBest?.[0]?.Confidence;

    const result: SpeechToTextResponse = {
      text,
      language,
      ...(typeof confidence === 'number' && { confidence }),
    };
    return { status: 200, jsonBody: result };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      context.error(`Azure STT failed — status: ${status}, message: ${err.message}`);
      return error(502, 'AZURE_SERVICE_ERROR', 'Speech service call failed');
    }
    context.error('STT unexpected error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

const error = errorResponse;
