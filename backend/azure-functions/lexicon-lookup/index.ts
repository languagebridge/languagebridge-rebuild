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
import { getLexiconContainer, getAnalyticsContainer, getLexiconMachineCacheContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, isValidStudentCode, validateApiKey, checkRateLimit } from '../../shared/validators';
import { isValidVariant, variantChain, variantRank } from '../../shared/variants';
import { resolveStudentScope } from '../../shared/enrollments';

/**
 * lexicon-lookup
 *
 * Front door for all translation requests. Decides WHAT to say:
 *   1. Check Lexicon → serve the best live entry (rankEntries), merging the
 *      translation row and the bridge-gloss row for the same term
 *   2. Otherwise the machine cache, then Azure Translator → return + log as missing
 *
 * The Lexicon holds only our data. Azure answers live in lexicon_machine_cache
 * and are never written into Lexicon rows.
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

  const { term, language, context: subjectContext, studentCode, variant: requestedVariant } =
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

    // ── 4a. Lexicon hit ────────────────────────────────────────────
    // One term's translation and its English bridge gloss can live in two rows
    // (an RBERN row with the translation, a bridge row with the gloss). Serve
    // both halves: the best-ranked row that has a translation, and the
    // best-ranked row that has a gloss. Only when no row has a translation do
    // we use the machine cache or Azure — and Azure's answer is never written
    // into the Lexicon (TRAINING-DATA-POLICY: machine output is not ours).
    if (results.length > 0) {
      const entry = results[0];
      const withCognate = results.find((r) => r.cognate);
      const withBridge = results.find((r) => r.bridge_anchor || r.bridge_scaffold || r.bridge_definition) ?? entry;
      const withAudio = results.find((r) => r.audio_blob_path);
      const primary = withCognate ?? entry;

      let cognate: string | null = withCognate?.cognate ?? null;
      let provenance: LexiconProvenance = withCognate ? provenanceOf(withCognate) : 'machine';
      if (!cognate) {
        cognate = await machineTranslation(entry.term, language, context);
        provenance = 'machine';
      }

      // Usage count on the row that supplied the translation (fire-and-forget)
      container.item(primary.id, primary.language).patch([
        { op: 'incr', path: '/usage_count', value: 1 },
      ]).catch((err: unknown) => { context.warn('Non-critical write failed:', (err as Error)?.message); });

      logAnalytics(context, {
        type: 'lexicon_hit',
        term: normalizedTerm,
        language,
        source: 'lexicon',
        entry_id: primary.id,
        provenance,
        studentCode,
      });

      const audioUrl = withAudio?.audio_blob_path
        ? `https://${process.env.AZURE_STORAGE_ACCOUNT ?? 'lb-storage'}.blob.core.windows.net/${withAudio.audio_blob_path}`
        : null;
      const hasBridge = !!(withBridge.bridge_anchor || withBridge.bridge_scaffold || withBridge.bridge_definition);

      return respond(200, {
        term: entry.term,
        language: entry.language,
        type: hasBridge ? 'bridge' : 'cognate',
        cognate,
        bridge_anchor: withBridge.bridge_anchor ?? null,
        bridge_scaffold: withBridge.bridge_scaffold ?? null,
        bridge_definition: withBridge.bridge_definition ?? null,
        bridge_definition_en: withBridge.bridge_definition_en ?? null,
        grammatical_forms: withBridge.grammatical_forms ?? null,
        audio_url: audioUrl,
        audio_source: withAudio?.audio_source ?? null,
        tts_backend: withAudio?.tts_backend ?? null,
        subject: entry.subject ?? null,
        grade_band: entry.grade_band ?? null,
        transliteration_difficulty: withBridge.transliteration_difficulty ?? null,
        source: 'lexicon',
        entry_id: primary.id,
        provenance,
        variant: primary.variant ?? null,
      } as LexiconLookupResponse);
    }

    // ── 4b. Not in the Lexicon — machine cache, then Azure ─────────
    const cognate = await machineTranslation(term, language, context);

    // Log as missing for future curation (stream 2 of the production loop)
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

const MAX_CACHE_WORDS = 6;
const MAX_CACHE_CHARS = 60;

/**
 * Whether an Azure answer is worth caching. Rejects the junk the Oct 2026 audit
 * found in production: echoes of the input (a French "les" "translated" to
 * Somali as "les"), whole passages stored as terms, text with no letters, and
 * English-to-English lookups.
 */
export function isCacheableTranslation(term: string, language: string, translation: string | null): translation is string {
  if (!translation || language === 'english') return false;
  const t = term.trim().toLowerCase();
  if (!/\p{L}/u.test(t) || t.length > MAX_CACHE_CHARS) return false;
  if (t.split(/\s+/).length > MAX_CACHE_WORDS) return false;
  return translation.trim().toLowerCase() !== t;
}

function machineCacheId(term: string, language: string): string {
  return `${term.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_')}_${language}`;
}

/**
 * Translation that is NOT ours: the machine cache first (lexicon_machine_cache),
 * then Azure Translator. Azure answers are cached only in the machine cache,
 * never in the Lexicon. An echo of the input is returned as null — never shown
 * to a student as a translation, never stored.
 */
async function machineTranslation(term: string, language: string, context: InvocationContext): Promise<string | null> {
  const id = machineCacheId(term, language);
  const cache = getLexiconMachineCacheContainer();
  try {
    const { resource } = await cache.item(id, language).read<{ cognate: string }>();
    if (resource?.cognate) return resource.cognate;
  } catch {
    // Missing doc or missing container — treat as a cache miss.
  }

  const translated = await translateWithAzure(term, language, context);
  if (!translated || translated.trim().toLowerCase() === term.trim().toLowerCase()) return null;

  if (isCacheableTranslation(term, language, translated)) {
    cache.items.upsert({
      id,
      term: term.trim().toLowerCase(),
      language,
      cognate: translated,
      source: 'azure_translator',
      cached_at: new Date().toISOString(),
    }).catch((err: unknown) => { context.warn('Machine cache write failed:', (err as Error)?.message); });
  }
  return translated;
}

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
  // Fire-and-forget analytics write — never block the response. The pilot is
  // resolved here (cached) because `analytics` is partitioned by /pilotId.
  void (async () => {
    try {
      const { pilotId } = await resolveStudentScope(String(event.studentCode ?? ''));
      await getAnalyticsContainer().items.create({
        id: createHash('sha256')
          .update(`${event.term}_${event.language}_${Date.now()}`)
          .digest('hex'),
        ...event,
        pilotId,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      context.warn('Analytics write failed — non-critical:', (err as Error)?.message);
    }
  })();
}

function respond(status: number, body: unknown): HttpResponseInit {
  return { status, jsonBody: body };
}
