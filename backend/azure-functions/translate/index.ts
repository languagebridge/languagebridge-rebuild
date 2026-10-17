import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import axios from 'axios';
import {
  TranslateRequest,
  TranslateResponse,
} from '../../shared/types';
import { requireFields, isValidLanguage, isValidStudentCode, validateApiKey, checkRateLimit, errorResponse } from '../../shared/validators';
import { isDualCodexEnabled, loadOverrides, applyOverrides, selectForVariant } from '../../shared/dual-codex';
import { isValidVariant } from '../../shared/variants';
import { getAnalyticsContainer } from '../../shared/cosmos-client';
import { resolveStudentScope } from '../../shared/enrollments';
import { recordAzureCall } from '../../shared/metering';
import { randomUUID } from 'crypto';

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
 * LEXICON OVERRIDES: when LB_LEXICON_OVERRIDES=on, approved Lexicon entries are
 * applied first through the Dual Codex layer (shared/dual-codex.ts). If loading
 * them fails, the request falls through to plain Azure — overrides never block.
 *
 * PRIVACY: Neither input nor output is persisted. Pure pass-through to Azure
 * Translator. When an override fires we record only the entry ids — never text. Conversations between students and teachers can contain anything
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

// Azure Translator language codes — one per supported language
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
  dari: 'prs',      // Azure Translator has Dari as its own language
  pashto: 'ps',
  urdu: 'ur',
  somali: 'so',
  burmese: 'my',
  tagalog: 'fil',
  amharic: 'am',
  uzbek: 'uz',
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

  const { text, fromLanguage, toLanguage, studentCode, toVariant } = body as TranslateRequest;

  if (!isValidStudentCode(studentCode)) {
    return error(400, 'INVALID_STUDENT_CODE', 'studentCode is malformed');
  }

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
    // Short-circuit: source and target are the same language
    return { status: 200, jsonBody: { translatedText: text, fromLanguage, toLanguage } as TranslateResponse };
  }

  // ── 6. Dual Codex — serve approved Lexicon entries ahead of Azure ──
  let textForAzure = text;
  let firedEntryIds: string[] = [];
  let matchedTermIds: string[] = [];
  if (isDualCodexEnabled() && fromLanguage === 'english') {
    try {
      const variant = isValidVariant(toLanguage, toVariant) ? toVariant : null;
      const overrides = applyOverrides(text, selectForVariant(await loadOverrides(toLanguage), toLanguage, variant));
      if (overrides.mode === 'phrase') {
        logOverridesFired(context, studentCode, toLanguage, 'phrase', overrides.firedEntryIds, []);
        return { status: 200, jsonBody: { translatedText: overrides.translatedText, fromLanguage, toLanguage } as TranslateResponse };
      }
      textForAzure = overrides.textForAzure;
      firedEntryIds = overrides.firedEntryIds;
      matchedTermIds = overrides.matchedTermIds;
    } catch (err) {
      context.warn('Dual Codex unavailable — translating without overrides:', (err as Error)?.message);
    }
  }

  // ── 7. Call Azure Translator ──────────────────────────────────
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;
  if (!key || !region) {
    return error(500, 'INTERNAL_ERROR', 'Translator service not configured');
  }

  const started = Date.now();
  try {
    const response = await axios.post(
      `${TRANSLATOR_ENDPOINT}/translate?api-version=${TRANSLATOR_API_VERSION}&from=${fromCode}&to=${toCode}`,
      [{ text: textForAzure }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );

    recordAzureCall(context, { service: 'translator', units: textForAzure.length, durationMs: Date.now() - started, status: response.status, studentCode });
    const translatedText = response.data?.[0]?.translations?.[0]?.text;
    if (!translatedText) {
      context.warn('Azure Translator returned no translation');
      return error(502, 'TRANSLATION_FAILED', 'Translator returned empty result');
    }

    if (firedEntryIds.length || matchedTermIds.length) {
      logOverridesFired(context, studentCode, toLanguage, 'fixed_term', firedEntryIds, matchedTermIds);
    }

    const result: TranslateResponse = {
      translatedText,
      fromLanguage,
      toLanguage,
    };
    return { status: 200, jsonBody: result };
  } catch (err) {
    recordAzureCall(context, { service: 'translator', units: textForAzure.length, durationMs: Date.now() - started, status: axios.isAxiosError(err) ? err.response?.status ?? 0 : 0, studentCode });
    if (axios.isAxiosError(err)) {
      const status = err.response?.status;
      context.error(`Azure Translator failed — status: ${status}, message: ${err.message}`);
      return error(502, 'AZURE_SERVICE_ERROR', 'Translator service call failed');
    }
    context.error('Translate unexpected error:', err);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// Usage count for the flywheel: which entries fired, never the text translated.
// Only the pilot is recorded (the partition key) — never the student code or text.
function logOverridesFired(
  context: InvocationContext,
  studentCode: string,
  language: string,
  layer: 'phrase' | 'fixed_term',
  entryIds: string[],
  matchedTermIds: string[]
): void {
  void (async () => {
    try {
      const { pilotId } = await resolveStudentScope(studentCode);
      await getAnalyticsContainer().items.create({
        id: randomUUID(),
        type: 'lexicon_override_fired',
        pilotId,
        language,
        layer,
        entry_ids: entryIds,
        matched_term_ids: matchedTermIds,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      context.warn('Override usage log failed — non-critical:', (err as Error)?.message);
    }
  })();
}

const error = errorResponse;
