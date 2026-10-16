#!/usr/bin/env node
/**
 * export-flag-queue — step 1 of the manual flywheel loop. READ-ONLY.
 *
 * Exports open flag candidates to a CSV that linguists and reviewers fill in,
 * with what the Lexicon currently serves for each one. Then run
 * publish-approved.mjs on the filled CSV.
 *
 *   node flywheel/scripts/export-flag-queue.mjs --az
 *   node flywheel/scripts/export-flag-queue.mjs --az --language dari --min-reports 2
 *
 * Credentials (no silent defaults):
 *   --az    use the production account's READ-ONLY key via the Azure CLI
 *           (account languagebridge-cosmos, RG languagebridge-rg, db languagebridge-prod)
 *   or set COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE.
 *
 * Output: flywheel/backlog/flag-queue-<date>.csv (gitignored — it contains
 * scrubbed student-flagged text). School codes are never exported.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect, arg } from './lib/cosmos.mjs';
import { toCsv, summarizeServed, scopeOf } from './lib/queue.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OPEN = ['logged', 'review', 'bounty', 'high_priority', 'in_review'];

const language = arg('--language');
const minReports = Number(arg('--min-reports') ?? 1);
const out = resolve(root, arg('--out') ?? `flywheel/backlog/flag-queue-${new Date().toISOString().slice(0, 10)}.csv`);

const db = await connect({ readOnly: true });
const flags = db.container('flags');
const lexicon = db.container('lexicon');
const machineCache = db.container('lexicon_machine_cache');   // may not exist before the split phase

const where = [`ARRAY_CONTAINS(@open, c.status)`, 'c.flagCount >= @min'];
const parameters = [{ name: '@open', value: OPEN }, { name: '@min', value: minReports }];
if (language) { where.push('c.language = @language'); parameters.push({ name: '@language', value: language }); }

const { resources: candidates } = await flags.items
  .query({ query: `SELECT * FROM c WHERE ${where.join(' AND ')} ORDER BY c.flagCount DESC`, parameters })
  .fetchAll();

const rows = [];
for (const f of candidates) {
  const { resources: served } = await lexicon.items
    .query(
      { query: 'SELECT * FROM l WHERE LOWER(l.term) = @term AND l.language = @language', parameters: [{ name: '@term', value: f.flaggedText }, { name: '@language', value: f.language }] },
      { partitionKey: f.language }
    )
    .fetchAll();
  let cached = null;
  try {
    const id = `${f.flaggedText.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_')}_${f.language}`;
    ({ resource: cached } = await machineCache.item(id, f.language).read());
  } catch { /* no cache container or no entry */ }
  rows.push({
    flag_id: f.id,
    language: f.language,
    variant: f.variant ?? '',
    subject: f.subject ?? '',
    scope: scopeOf(f.flaggedText),
    flagged_text: f.flaggedText,
    total_reports: f.flagCount,
    translation_reports: f.translationFlagCount ?? 0,
    pronunciation_reports: f.pronunciationFlagCount ?? 0,
    recognition_reports: f.recognitionFlagCount ?? 0,
    status: f.status,
    contexts: (f.contexts ?? []).map((c) => c.text || c.intendedText).filter(Boolean).join(' | '),
    currently_served: summarizeServed(served) || (cached?.cognate ? `${cached.cognate} [machine cache]` : '(nothing stored — live Azure)'),
  });
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, toCsv(rows));
const byLang = rows.reduce((m, r) => ((m[r.language] = (m[r.language] || 0) + 1), m), {});
console.log(`Exported ${rows.length} open candidates → ${out}`, byLang);
console.log('Next: fill action / fix_text / author / reviewer columns, then run publish-approved.mjs on the file.');
