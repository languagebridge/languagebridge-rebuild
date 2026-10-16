import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHash } from 'crypto';
import axios from 'axios';
import {
  LexiconLookupRequest,
  LexiconLookupResponse,
  LexiconLookupErrorResponse,
  LexiconDoc,
  LexiconProvenance,
  SUPPORTED_LANGUAGES,
} from '../../shared/types';
import { getLexiconContainer, getAnalyticsContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, isValidStudentCode, validateApiKey, checkRateLimit } from '../../shared/validators';
import { isValidVariant, variantChain, variantRank } from '../../shared/variants';

/**
 * lexicon-lookup
 *
 * Front door for all translation requests. Decides WHAT to say:
 *   1. Check Lexicon → serve the best live entry (rankEntries) if found
 *   2. Fall back to Azure Translator for cognate → return + log as missing
 *
 * Every response carries entry_id + provenance so usage logs record which
 * Lexicon entry fired (flywheel/SPEC.md §5).
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
  dari: 'prs',   // Dari proper, not Persian ('fa')
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
  tagalog: 'fil',
  amharic: 'am',
  uzbek: 'uz',
};

export async function lexiconLookup(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('lexicon-lookup invoked');

  // ── 0. Auth ──────────────────────────────────────────────────
  const keyCheck = validateApiKey(request);
  if (!keyCheck.valid) {
    return respond(401, { error: 'UNAUTHORIZED', details: keyCheck.error } as LexiconLookupErrorResponse);
  }

  // ── 1. Parse body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return respond(400, {
      error: 'MISSING_FIELDS',
      details: 'Request body must be valid JSON',
    } as LexiconLookupErrorResponse);
  }

  // ── 2. Validate required fields ────────────────────────────────
  const fieldCheck = requireFields(body, ['term', 'language', 'studentCode']);
  if (!fieldCheck.valid) {
    return respond(400, {
      error: 'MISSING_FIELDS',
      details: `Missing required fields: ${fieldCheck.missing.join(', ')}`,
    } as LexiconLookupErrorResponse);
  }

  const { term, language, domain, context: subjectContext, studentCode, variant: requestedVariant } =
    body as unknown as LexiconLookupRequest;

  if (!isValidStudentCode(studentCode)) {
    return respond(400, {
      error: 'INVALID_STUDENT_CODE',
      details: 'studentCode is malformed',
    } as LexiconLookupErrorResponse);
  }

  if (!isValidLanguage(language)) {
    return respond(400, {
      error: 'INVALID_LANGUAGE',
      details: `Language '${language}' is not supported. Supported: ${SUPPORTED_LANGUAGES.join(', ')}`,
    } as LexiconLookupErrorResponse);
  }

  // Higher limit for lexicon lookups — legitimate glossary browsing can burst
  const rateCheck = await checkRateLimit(`lexicon:${studentCode}`, 300);
  if (!rateCheck.allowed) {
    return respond(429, {
      error: 'RATE_LIMITED',
      details: `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`,
    } as LexiconLookupErrorResponse);
  }

  const normalizedTerm = term.trim().toLowerCase();

  try {
    // ── 3. Query Lexicon ───────────────────────────────────────────
    const container = getLexiconContainer();

    // Fetch every live row for this term, then rank in code: a retired
    // ('deprecated') entry is never served, a subject match beats a general
    // entry, and human-verified beats glossary beats cached machine output.
    // The subject is a preference, not a filter — a math lookup with no
    // math-specific row still gets the general entry instead of falling to Azure.
    const query =
      'SELECT * FROM l WHERE LOWER(l.term) = @term AND l.language = @language ' +
      "AND (NOT IS_DEFINED(l.status) OR l.status != 'deprecated') " +
      'ORDER BY l.version DESC OFFSET 0 LIMIT 20';
    const parameters: Array<{ name: string; value: string }> = [
      { name: '@term', value: normalizedTerm },
      { name: '@language', value: language },
    ];

    const { resources: candidates } = await container.items
      .query<LexiconDoc>({ query, parameters })
      .fetchAll();
    const variant = isValidVariant(language, requestedVariant) ? requestedVariant : null;
    const results = rankEntries(candidates, subjectContext ?? null, variant);

    // ── 4a. Bridge definition found ────────────────────────────────
    if (results.length > 0) {
      const entry = results[0];

      // Backfill cognate via Azure Translator if missing
      let cognate: string | null = entry.cognate ?? null;
      if (!cognate) {
        const translated = await translateWithAzure(entry.term, language, context);
        const isEcho = !!translated && translated.trim().toLowerCase() === entry.term.trim().toLowerCase();
        if (translated && !isEcho) {
          cognate = translated;
          // Persist ONLY a real translation so future lookups skip Azure — never
          // persist an English echo / failed translation.
          container.item(entry.id, entry.language).patch([
            { op: 'set', path: '/cognate', value: translated },
            { op: 'incr', path: '/usage_count', value: 1 },
          ]).catch((err: unknown) => { context.warn('Non-critical write failed:', err); });
        } else {
          container.item(entry.id, entry.language).patch([
            { op: 'incr', path: '/usage_count', value: 1 },
          ]).catch((err: unknown) => { context.warn('Non-critical write failed:', err); });
        }
      } else {
        // Increment usage_count (fire-and-forget — don't block response)
        container.item(entry.id, entry.language).patch([
          { op: 'incr', path: '/usage_count', value: 1 },
        ]).catch((err: unknown) => { context.warn('Non-critical write failed:', err); });
      }

      // Log analytics (anonymized)
      logAnalytics(context, {
        type: 'lexicon_hit',
        term: normalizedTerm,
        language,
        source: 'lexicon',
        entry_id: entry.id,
        provenance: provenanceOf(entry),
        studentCode,
      });

      const audioUrl = entry.audio_blob_path
        ? `https://${process.env.AZURE_STORAGE_ACCOUNT ?? 'lb-storage'}.blob.core.windows.net/${entry.audio_blob_path}`
        : null;

      // Determine type based on whether the entry has actual bridge content
      const hasBridge = !!(entry.bridge_anchor || entry.bridge_scaffold || entry.bridge_definition);
      const entryType = hasBridge ? 'bridge' : 'cognate';

      return respond(200, {
        term: entry.term,
        language: entry.language,
        type: entryType,
        cognate,
        bridge_anchor: entry.bridge_anchor ?? null,
        bridge_scaffold: entry.bridge_scaffold ?? null,
        bridge_definition: entry.bridge_definition,
        bridge_definition_en: entry.bridge_definition_en,
        grammatical_forms: entry.grammatical_forms ?? null,
        audio_url: audioUrl,
        audio_source: entry.audio_source,
        tts_backend: entry.tts_backend ?? null,
        subject: entry.subject ?? null,
        grade_band: entry.grade_band ?? null,
        transliteration_difficulty: entry.transliteration_difficulty ?? null,
        source: 'lexicon',
        entry_id: entry.id,
        provenance: provenanceOf(entry),
        variant: entry.variant ?? null,
      } as LexiconLookupResponse);
    }

    // ── 4b. No bridge definition — fall back to Azure Translator ───
    const cognate = await translateWithAzure(term, language, context);

    // Cache the auto-generated cognate ONLY if we got a real translation —
    // never persist an echo of the input (would poison future lookups). Azure
    // returns the input unchanged for words it does not recognize as English
    // (e.g. a French "les" looked up as Somali); we still return it, since some
    // words are genuinely identical across languages, but we do not keep it.
    const isEcho = !!cognate && cognate.trim().toLowerCase() === normalizedTerm;
    if (cognate && !isEcho) {
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
    }

    // Log as missing bridge for future curation
    logAnalytics(context, {
      type: 'lexicon_miss',
      term: normalizedTerm,
      language,
      source: 'translator_fallback',
      studentCode,
    });

    return respond(200, {
      term,
      language,
      type: 'cognate',
      cognate,
      bridge_definition: null,
      bridge_definition_en: null,
      audio_url: null,
      audio_source: null,
      source: 'translator_fallback',
      entry_id: null,
      provenance: 'machine',
      variant: null,
    } as LexiconLookupResponse);

  } catch (err) {
    context.error('lexicon-lookup error:', err);
    return respond(500, {
      error: 'INTERNAL_ERROR',
      details: 'An unexpected error occurred',
    } as LexiconLookupErrorResponse);
  }
}

// ── Helpers ────────────────────────────────────────────────────────

export function provenanceOf(entry: Pick<LexiconDoc, 'status' | 'created_by'>): LexiconProvenance {
  if (entry.status === 'approved') return 'human_verified';
  if (entry.status === 'auto_generated' || entry.created_by === 'system' || entry.created_by === 'translator_fallback') {
    return 'machine';
  }
  return 'glossary';
}

const PROVENANCE_RANK: Record<LexiconProvenance, number> = { human_verified: 0, glossary: 1, machine: 2 };

/**
 * Order candidate rows best-first. Stable, so ties keep version DESC from the query.
 *   1. sense   — subject match (a wrong meaning is worse than a non-local word)
 *   2. dialect — exact variant, then its parents, then core; other variants are dropped
 *   3. provenance — human_verified, glossary, machine
 */
export function rankEntries(entries: LexiconDoc[], subject: string | null, variant: string | null = null): LexiconDoc[] {
  const chain = variantChain(entries[0]?.language ?? '', variant);
  const matchesSubject = (e: LexiconDoc) =>
    !!subject && (e.subject === subject || (e.subjects ?? '').split('|').includes(subject));
  return entries
    .map((e, i) => ({ e, i, v: variantRank(chain, e.variant) }))
    .filter(({ v }) => v !== -1)
    .sort((a, b) =>
      (Number(matchesSubject(b.e)) - Number(matchesSubject(a.e))) ||
      (a.v - b.v) ||
      (PROVENANCE_RANK[provenanceOf(a.e)] - PROVENANCE_RANK[provenanceOf(b.e)]) ||
      (a.i - b.i))
    .map(({ e }) => e);
}

async function translateWithAzure(
  text: string,
  language: string,
  context: InvocationContext
): Promise<string | null> {
  const key = process.env.AZURE_TRANSLATOR_KEY;
  const region = process.env.AZURE_TRANSLATOR_REGION;

  if (!key || !region) {
    context.warn('Azure Translator credentials not set — no translation available');
    return null;
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

    return response.data?.[0]?.translations?.[0]?.text ?? null;
  } catch (err) {
    context.error('Azure Translator error:', err);
    return null; // No translation rather than echoing English back to the student
  }
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

function respond(status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body };
}
