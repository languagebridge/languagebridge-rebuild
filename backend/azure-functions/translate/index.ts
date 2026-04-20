import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import axios from 'axios';
import {
  TranslateRequest,
  TranslateResponse,
} from '../../shared/types';
import { requireFields, isValidLanguage, validateApiKey, checkRateLimit, errorResponse } from '../../shared/validators';

/**
 * translate
 *
 * Translates arbitrary text between any two supported languages.
 * Used by the "Talk to Teacher" feature for conversational exchange.
 *
 * Distinct from /lexicon-lookup:
 *   - /lexicon-lookup is for single academic terms, returns bridge definitions
 *   - /translate is for arbitrary sentences/paragraphs, raw machine translation
 *
 * PRIVACY: Neither input nor output is persisted. Pure pass-through to Azure
 * Translator. Conversations between students and teachers can contain anything
 * (including sensitive personal content), so we never store them.
 *
 * TOS: Standard Azure Translator API usage. The translation is displayed once
 * and not redistributed or used to train models.
 */

app.http('translate', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'translate',
  handler: translate,
});

const TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const TRANSLATOR_API_VERSION = '3.0';
const MAX_TEXT_LENGTH = 2000;

// Azure Translator language codes — all 21 languages supported
const TRANSLATOR_LANGUAGE_MAP: Record<string, string> = {
  arabic: 'ar',
  french: 'fr',
  portuguese: 'pt',
  ukrainian: 'uk',
  vietnamese: 'vi',
  spanish: 'es',
  persian: 'fa',
  english: 'en',
  nepali: 'ne',
  swahili: 'sw',
  dari: 'fa',       // Uses Persian (Dari is mutually intelligible)
  pashto: 'ps',
  urdu: 'ur',
  somali: 'so',
  burmese: 'my',
  uzbek: 'uz',
  amharic: 'am',
  tagalog: 'fil',
  kinyarwanda: 'rw',
  twi: 'ak',        // Akan family
  tigrinya: 'ti',
};

export async function translate(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('translate invoked');

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
  const fieldCheck = requireFields(body, ['text', 'fromLanguage', 'toLanguage', 'studentCode']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { text, fromLanguage, toLanguage, studentCode } = body as TranslateRequest;

  // ── 3. Validate text length ────────────────────────────────────
  if (typeof text !== 'string' || text.trim().length === 0) {
    return error(400, 'MISSING_FIELDS', 'text must be a non-empty string');
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return error(400, 'TEXT_TOO_LONG', `text exceeds maximum length of ${MAX_TEXT_LENGTH} characters`);
  }

  // ── 4. Rate limit ──────────────────────────────────────────────
  const rateCheck = await checkRateLimit(`translate:${studentCode}`, 100);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  // ── 5. Validate languages ──────────────────────────────────────
  if (!isValidLanguage(fromLanguage) || !isValidLanguage(toLanguage)) {
    return error(400, 'INVALID_LANGUAGE', `fromLanguage/toLanguage must be supported`);
  }
  const fromCode = TRANSLATOR_LANGUAGE_MAP[fromLanguage];
  const toCode = TRANSLATOR_LANGUAGE_MAP[toLanguage];
  if (!fromCode || !toCode) {
    return error(400, 'INVALID_LANGUAGE', `Translator mapping missing for language`);
  }
  if (fromCode === toCode) {
    // Short-circuit: same language (e.g. dari→persian both map to 'fa')
    return { status: 200, jsonBody: { translatedText: text, fromLanguage, toLanguage } as TranslateResponse };
  }

  // ── 6. Call Azure Translator ──────────────────────────────────
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (!key || !region) {
    return error(500, 'INTERNAL_ERROR', 'Translator service not configured');
  }

  try {
    const response = await axios.post(
      `${TRANSLATOR_ENDPOINT}/translate?api-version=${TRANSLATOR_API_VERSION}&from=${fromCode}&to=${toCode}`,
      [{ text }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );

    const translatedText = response.data?.[0]?.translations?.[0]?.text;
    if (!translatedText) {
      context.warn('Azure Translator returned no translation');
      return error(502, 'TRANSLATION_FAILED', 'Translator returned empty result');
    }

    const result: TranslateResponse = {
      translatedText,
      fromLanguage,
      toLanguage,
    };
    return { status: 200, jsonBody: result };
  } catch (err) {
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      context.error(`Azure Translator failed — status: ${status}, message: ${err.message}`);
      return error(502, 'AZURE_SERVICE_ERROR', 'Translator service call failed');
    }
    context.error('Translate unexpected error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

const error = errorResponse;
