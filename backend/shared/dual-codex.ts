import { LexiconDoc, SupportedLanguage } from './types';
import { getLexiconContainer } from './cosmos-client';
import { variantChain, variantRank } from './variants';

/**
 * Dual Codex — the Lexicon override layer for sentence translation.
 *
 * Applies human-approved Lexicon entries to /translate requests so our corrections
 * are served ahead of Azure. Layers, in order of preference (flywheel/DUAL-CODEX.md):
 *
 *   1. phrase      — the whole utterance matches an approved classroom phrase →
 *                    return the human translation, skip Azure entirely.
 *   2. fixed_term  — non-inflecting terms / proper nouns found in the sentence are
 *                    wrapped in Azure dynamic-dictionary markup so Azure keeps our
 *                    translation. Microsoft documents this as safe for compound and
 *                    proper nouns only, so it is never used for ordinary words.
 *   3. term        — single inflecting words. NOT APPLIED YET: needs stored inflected
 *                    forms plus Azure word alignment. Matches are counted only.
 *
 * Direction: entries are keyed by English source text, so overrides apply to
 * english → target only. Other directions pass through untouched.
 *
 * Approved entries are cached per language for LB_LEXICON_OVERRIDE_TTL_MS
 * (default 5 min). Retiring an entry (status → 'deprecated') takes effect within
 * one TTL, with no deploy. The whole layer is off unless LB_LEXICON_OVERRIDES=on.
 */

export type OverrideEntry = Pick<LexiconDoc, 'id' | 'term' | 'cognate' | 'entry_kind' | 'version'> & {
  variant?: string | null;
};

export type DualCodexResult =
  | { mode: 'phrase'; translatedText: string; firedEntryIds: string[] }
  | { mode: 'azure'; textForAzure: string; firedEntryIds: string[]; matchedTermIds: string[] };

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; entries: OverrideEntry[] }>();

export function isDualCodexEnabled(): boolean {
  return process.env.LB_LEXICON_OVERRIDES === 'on';
}

/** Test hook — drop the per-language cache. */
export function clearDualCodexCache(): void {
  cache.clear();
}

export async function loadOverrides(language: SupportedLanguage): Promise<OverrideEntry[]> {
  const ttl = Number(process.env.LB_LEXICON_OVERRIDE_TTL_MS) || DEFAULT_TTL_MS;
  const hit = cache.get(language);
  if (hit && Date.now() - hit.at < ttl) return hit.entries;

  const { resources } = await getLexiconContainer().items
    .query<OverrideEntry>(
      {
        query:
          "SELECT l.id, l.term, l.cognate, l.entry_kind, l.version, l.variant FROM l " +
          "WHERE l.language = @language AND l.status = 'approved' AND IS_DEFINED(l.entry_kind)",
        parameters: [{ name: '@language', value: language }],
      },
      { partitionKey: language }
    )
    .fetchAll();

  // Keep the highest version per term + kind + variant. Variant selection happens
  // per request in selectForVariant, so one cache serves every dialect.
  const best = new Map<string, OverrideEntry>();
  for (const e of resources) {
    if (!e.cognate || !e.term) continue;
    const key = `${e.entry_kind}::${normalize(e.term)}::${e.variant ?? ''}`;
    const prev = best.get(key);
    if (!prev || (e.version ?? 0) > (prev.version ?? 0)) best.set(key, e);
  }
  const entries = [...best.values()];
  cache.set(language, { at: Date.now(), entries });
  return entries;
}

/**
 * Keep, per term + kind, only the entry most specific to the requested variant
 * (exact → parent → core). Entries for other variants are dropped. Longest terms
 * come first so a longer phrase wins over a shorter one it contains.
 */
export function selectForVariant(entries: OverrideEntry[], language: string, variant: string | null): OverrideEntry[] {
  const chain = variantChain(language, variant);
  const best = new Map<string, { e: OverrideEntry; rank: number }>();
  for (const e of entries) {
    const rank = variantRank(chain, e.variant);
    if (rank === -1) continue;
    const key = `${e.entry_kind}::${normalize(e.term)}`;
    const prev = best.get(key);
    if (!prev || rank < prev.rank) best.set(key, { e, rank });
  }
  return [...best.values()].map(({ e }) => e).sort((a, b) => b.term.length - a.term.length);
}

/**
 * Pure function — decides what to send to Azure (or whether to skip it) given
 * the approved entries for the target language, already narrowed by selectForVariant.
 */
export function applyOverrides(text: string, entries: OverrideEntry[]): DualCodexResult {
  const normalizedText = normalize(text);

  // Layer 1 — whole-utterance phrase
  const phrase = entries.find((e) => e.entry_kind === 'phrase' && normalize(e.term) === normalizedText);
  if (phrase) {
    return { mode: 'phrase', translatedText: phrase.cognate!, firedEntryIds: [phrase.id] };
  }

  // Layer 2 — dynamic dictionary for fixed terms. Strip any markup the caller
  // sent so user text can never inject its own dictionary entries.
  let out = text.replace(/<\/?mstrans:dictionary[^>]*>/gi, '');
  const fired: string[] = [];
  for (const e of entries) {
    if (e.entry_kind !== 'fixed_term') continue;
    const re = new RegExp(`(?<![\\p{L}\\p{N}>])(${escapeRegex(e.term)})(?![\\p{L}\\p{N}<])`, 'iu');
    if (!re.test(out)) continue;
    const translation = e.cognate!.replace(/"/g, '&quot;');
    out = out.replace(re, `<mstrans:dictionary translation="${translation}">$1</mstrans:dictionary>`);
    fired.push(e.id);
  }

  // Layer 3 — inflecting single terms: matched and counted, not substituted.
  const matchedTermIds = entries
    .filter((e) => e.entry_kind === 'term' && new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(e.term)}(?![\\p{L}\\p{N}])`, 'iu').test(text))
    .map((e) => e.id);

  return { mode: 'azure', textForAzure: out, firedEntryIds: fired, matchedTermIds };
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, '').replace(/\s+/g, ' ').trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
