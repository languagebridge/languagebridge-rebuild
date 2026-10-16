#!/usr/bin/env node
/**
 * bootstrap-candidates — build the Phase 1/2 backlog from bad data we already
 * know about, so the review pipeline can run before any pilot produces flags.
 *
 *   node flywheel/scripts/bootstrap-candidates.mjs           # offline: bridge glosses only
 *   node flywheel/scripts/bootstrap-candidates.mjs --live    # + read-only Cosmos query for Dari-as-Persian
 *
 * Writes flywheel/backlog/candidates.json and .csv. NEVER writes to Cosmos.
 * Review the output with Justin before anything enters the flag queue.
 *
 * Sources:
 *   1. Science-only bridge glosses (data/standards-pipeline/bridges/ohio_bridge_phrases.json)
 *      — common words that inherited a narrow science sense (producer → "food-maker").
 *   2. --live: Dari lexicon rows auto-generated before 2026-10-10, which were
 *      machine-translated as Persian (MASTER-DOCUMENT §6.3).
 *      Needs COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE in the environment.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const outDir = resolve(root, 'flywheel/backlog');
const live = process.argv.includes('--live');
const DARI_FIX_DATE = '2026-10-10T00:00:00Z';

const candidates = [];

// ── 1. Science-only bridge glosses ─────────────────────────────────
const bridges = JSON.parse(readFileSync(resolve(root, 'data/standards-pipeline/bridges/ohio_bridge_phrases.json'), 'utf8'));
for (const b of bridges) {
  const subjects = (b.subjects || '').split('|').filter(Boolean);
  if (subjects.length !== 1 || subjects[0] !== 'science') continue;
  candidates.push({
    source: 'bridge_science_only',
    term: b.term_normalized || b.term,
    language: 'all',
    subject: 'science',
    current: b.bridge_anchor,
    current_detail: b.bridge_scaffold,
    question: 'Is this anchor right for the everyday sense, or only the science sense?',
    frequency: b.frequency ?? null,
  });
}

// ── 2. Dari rows translated as Persian (read-only) ─────────────────
if (live) {
  const { CosmosClient } = await import('@azure/cosmos');
  const { COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE } = process.env;
  if (!COSMOS_DB_ENDPOINT || !COSMOS_DB_KEY || !COSMOS_DB_DATABASE) {
    console.error('--live needs COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE');
    process.exit(1);
  }
  const container = new CosmosClient({ endpoint: COSMOS_DB_ENDPOINT, key: COSMOS_DB_KEY })
    .database(COSMOS_DB_DATABASE).container('lexicon');
  const { resources } = await container.items.query({
    query: "SELECT l.id, l.term, l.cognate, l.created_at, l.usage_count FROM l " +
      "WHERE l.language = 'dari' AND l.status = 'auto_generated' AND l.created_at < @fix",
    parameters: [{ name: '@fix', value: DARI_FIX_DATE }],
  }, { partitionKey: 'dari' }).fetchAll();
  for (const r of resources) {
    candidates.push({
      source: 'dari_as_persian',
      term: r.term,
      language: 'dari',
      subject: null,
      current: r.cognate,
      current_detail: `lexicon id ${r.id}`,
      question: 'Is this Dari, or Persian (Farsi) wording?',
      frequency: r.usage_count ?? null,
    });
  }
}

candidates.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0));

// ── Write ──────────────────────────────────────────────────────────
mkdirSync(outDir, { recursive: true });
writeFileSync(resolve(outDir, 'candidates.json'), JSON.stringify(candidates, null, 2) + '\n');
const cols = ['source', 'term', 'language', 'subject', 'current', 'current_detail', 'frequency', 'question'];
const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
writeFileSync(
  resolve(outDir, 'candidates.csv'),
  [cols.join(','), ...candidates.map((c) => cols.map((k) => esc(c[k])).join(','))].join('\n') + '\n'
);

const bySource = candidates.reduce((m, c) => ((m[c.source] = (m[c.source] || 0) + 1), m), {});
console.log(`Wrote ${candidates.length} candidates to flywheel/backlog/`, bySource);
if (!live) console.log('Dari-as-Persian rows skipped (offline). Re-run with --live to include them.');
