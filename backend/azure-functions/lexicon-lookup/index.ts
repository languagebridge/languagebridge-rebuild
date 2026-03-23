import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHash } from 'crypto';
import axios from 'axios';
import {
  LexiconLookupRequest,
  LexiconLookupResponse,
  LexiconLookupErrorResponse,
  LexiconDoc,
  SUPPORTED_LANGUAGES,
} from '../../shared/types';
import { getLexiconContainer, getAnalyticsContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, validateApiKey } from '../../shared/validators';

/**
 * lexicon-lookup
 *
 * Front door for all translation requests. Decides WHAT to say:
 *   1. Check Lexicon for bridge definition → return if found
 *   2. Fall back to Azure Translator for cognate → return + log as missing
 *
 * The tts-router decides HOW to say it (proprietary model vs Azure TTS).
 *
 * FERPA: Never logs student ID. Uses anonymized session hash only.
 */

app.http('lexicon-lookup', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'lexicon-lookup',
  handler: lexiconLookup,
});

// Azure Translator config
const TRANSLATOR_ENDPOINT = 'https://api.cognitive.microsofttranslator.com';
const TRANSLATOR_API_VERSION = '3.0';

// Language code mapping: our codes → Azure Translator codes
const LANGUAGE_TO_TRANSLATOR: Record<string, string> = {
  dari: 'fa',
  pashto: 'ps',
  persian: 'fa',
  arabic: 'ar',
  urdu: 'ur',
  somali: 'so',
  ukrainian: 'uk',
  spanish: 'es',
  english: 'en',
  french: 'fr',
  portuguese: 'pt',
  vietnamese: 'vi',
  nepali: 'ne',
  swahili: 'sw',
  burmese: 'my',
  uzbek: 'uz',
  amharic: 'am',
  tagalog: 'fil',
  kinyarwanda: 'rw',
  twi: 'ak',       // Akan (closest Azure Translator code)
  tigrinya: 'ti',
};

export async function lexiconLookup(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('lexicon-lookup invoked');

  // ── 0. Auth ──────────────────────────────────────────────────
  const keyCheck = validateApiKey(request);
  if (!keyCheck.valid) {
    return jsonResponse(401, { error: 'UNAUTHORIZED', details: keyCheck.error } as LexiconLookupErrorResponse);
  }

  // ── 1. Parse body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonResponse(400, {
      error: 'MISSING_FIELDS',
      details: 'Request body must be valid JSON',
    } as LexiconLookupErrorResponse);
  }

  // ── 2. Validate required fields ────────────────────────────────
  const fieldCheck = requireFields(body, ['term', 'language', 'pilotId', 'sessionToken']);
  if (!fieldCheck.valid) {
    return jsonResponse(400, {
      error: 'MISSING_FIELDS',
      details: `Missing required fields: ${fieldCheck.missing.join(', ')}`,
    } as LexiconLookupErrorResponse);
  }

  const { term, language, domain, context: subjectContext, pilotId, sessionToken } =
    body as unknown as LexiconLookupRequest;

  if (!isValidLanguage(language)) {
    return jsonResponse(400, {
      error: 'INVALID_LANGUAGE',
      details: `Language '${language}' is not supported. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
    } as LexiconLookupErrorResponse);
  }

  const normalizedTerm = term.trim().toLowerCase();

  try {
    // ── 3. Query Lexicon ───────────────────────────────────────────
    const container = getLexiconContainer();

    // Build query with optional context filtering
    let query = 'SELECT * FROM l WHERE LOWER(l.term) = @term AND l.language = @language';
    const parameters: Array<{ name: string; value: string }> = [
      { name: '@term', value: normalizedTerm },
      { name: '@language', value: language },
    ];

    if (subjectContext) {
      query += ' AND l.subject = @subject';
      parameters.push({ name: '@subject', value: subjectContext });
    }

    query += ' ORDER BY l.version DESC OFFSET 0 LIMIT 1';

    const { resources: results } = await container.items
      .query<LexiconDoc>({ query, parameters })
      .fetchAll();

    // ── 4a. Bridge definition found ────────────────────────────────
    if (results.length > 0) {
      const entry = results[0];

      // Increment usage_count (fire-and-forget — don't block response)
      container.item(entry.id, entry.language).patch([
        { op: 'incr', path: '/usage_count', value: 1 },
      ]).catch((err: unknown) => { context.warn('Non-critical write failed:', err); });

      // Log analytics (anonymized)
      logAnalytics(context, {
        type: 'lexicon_hit',
        term: normalizedTerm,
        language,
        source: 'lexicon',
        pilotId,
        sessionHash: hashSession(sessionToken),
      });

      const audioUrl = entry.audio_blob_path
        ? `https://${process.env.AZURE_STORAGE_ACCOUNT ?? 'lb-storage'}.blob.core.windows.net/${entry.audio_blob_path}`
        : null;

      return jsonResponse(200, {
        term: entry.term,
        language: entry.language,
        type: 'bridge',
        cognate: entry.cognate,
        bridge_definition: entry.bridge_definition,
        bridge_definition_en: entry.bridge_definition_en,
        audio_url: audioUrl,
        audio_source: entry.audio_source,
        source: 'lexicon',
      } as LexiconLookupResponse);
    }

    // ── 4b. No bridge definition — fall back to Azure Translator ───
    const cognate = await translateWithAzure(term, language, context);

    // Cache the auto-generated cognate in Lexicon for future lookups
    const autoId = `${normalizedTerm.replace(/\s+/g, '_')}_${language}_auto`;
    container.items.upsert({
      id: autoId,
      term: normalizedTerm,
      language,
      domain: domain ?? 'k12_academic',
      subject: subjectContext ?? null,
      cognate,
      bridge_definition: null,
      bridge_definition_en: null,
      audio_blob_path: null,
      audio_source: null,
      status: 'auto_generated',
      version: 1,
      usage_count: 1,
      flag_count: 0,
      created_by: 'system',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as LexiconDoc).catch((err: unknown) => { context.warn('Non-critical write failed:', err); });

    // Log as missing bridge for future curation
    logAnalytics(context, {
      type: 'lexicon_miss',
      term: normalizedTerm,
      language,
      source: 'translator_fallback',
      pilotId,
      sessionHash: hashSession(sessionToken),
    });

    return jsonResponse(200, {
      term,
      language,
      type: 'cognate',
      cognate,
      bridge_definition: null,
      bridge_definition_en: null,
      audio_url: null,
      audio_source: null,
      source: 'translator_fallback',
    } as LexiconLookupResponse);

  } catch (err) {
    context.error('lexicon-lookup error:', err);
    return jsonResponse(500, {
      error: 'INTERNAL_ERROR',
      details: 'An unexpected error occurred',
    } as LexiconLookupErrorResponse);
  }
}

// ── Helpers ────────────────────────────────────────────────────────

async function translateWithAzure(
  text: string,
  language: string,
  context: InvocationContext
): Promise<string> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key || !region) {
    context.warn('Azure Translator credentials not set — returning original text');
    return text;
  }

  const targetLang = LANGUAGE_TO_TRANSLATOR[language] ?? language;

  try {
    const response = await axios.post(
      `${TRANSLATOR_ENDPOINT}/translate?api-version=${TRANSLATOR_API_VERSION}&from=en&to=${targetLang}`,
      [{ text }],
      {
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Ocp-Apim-Subscription-Region': region,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      }
    );

    return response.data?.[0]?.translations?.[0]?.text ?? text;
  } catch (err) {
    context.error('Azure Translator error:', err);
    return text; // Return original on failure — better than nothing
  }
}

function hashSession(sessionToken: string): string {
  return createHash('sha256').update(sessionToken).digest('hex').slice(0, 16);
}

function logAnalytics(
  context: InvocationContext,
  event: Record<string, unknown>
): void {
  // Fire-and-forget analytics write — never block the response
  try {
    const container = getAnalyticsContainer();
    container.items.create({
      id: createHash('sha256')
        .update(`${event.term}_${event.language}_${Date.now()}`)
        .digest('hex'),
      ...event,
      timestamp: new Date().toISOString(),
    }).catch((err: unknown) => { context.warn('Non-critical write failed:', err); });
  } catch {
    context.warn('Analytics write failed — non-critical');
  }
}

function jsonResponse(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
