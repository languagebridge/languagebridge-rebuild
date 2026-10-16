#!/usr/bin/env node
/**
 * clean-lexicon — keep the Lexicon holding only our data, and no junk.
 * Dry run unless --write. Every document a write touches is backed up first to
 * flywheel/backlog/cleanup-backup-<phase>-<timestamp>.json (gitignored).
 *
 *   node flywheel/scripts/clean-lexicon.mjs --phase junk  --az            # report
 *   node flywheel/scripts/clean-lexicon.mjs --phase junk  --az --write    # apply
 *   node flywheel/scripts/clean-lexicon.mjs --phase split --az --write    # AFTER the new backend is deployed
 *
 * Phase "junk" (safe any time)
 *   - deletes machine-cached rows (status auto_generated) that are junk:
 *     echoes of the input, whole passages stored as terms, text with no letters,
 *     English-to-English rows, Dari rows cached before the Dari fix (they were
 *     Persian), and rows for languages we no longer support
 *   - re-syncs bridge glosses that drifted from data/standards-pipeline/bridges
 *     (e.g. "producer" still served as "food-maker")
 *
 * Phase "split" (run once the lexicon_machine_cache code is deployed; running it
 * earlier only makes the old code write the same rows back)
 *   - creates the lexicon_machine_cache container if missing (/language, 90-day TTL)
 *   - moves every remaining auto_generated row into it and deletes it from lexicon
 *   - moves Azure-backfilled translations out of bridge rows (bridge rows were
 *     loaded with cognate null, so any cognate on them came from Azure) into the
 *     cache, and sets the bridge row's cognate back to null
 *
 * Glossary rows for removed languages (Kinyarwanda, Twi, Tigrinya) are kept on
 * purpose: they are reference data for when those languages return.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { connect, arg, hasFlag, PROD } from './lib/cosmos.mjs';
import { loadContract } from './lib/queue.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const phase = arg('--phase');
const write = hasFlag('--write');
if (!['junk', 'split'].includes(phase)) {
  console.error('Usage: clean-lexicon.mjs --phase junk|split [--az] [--write]');
  process.exit(1);
}

const DARI_FIX = '2026-10-10';
const CACHE = 'lexicon_machine_cache';
const CACHE_TTL_SECONDS = 90 * 24 * 3600;
const { languages: SUPPORTED } = loadContract();

const db = await connect({ readOnly: !write });
const lexicon = db.container('lexicon');
const all = async (query, parameters = []) => (await lexicon.items.query({ query, parameters }).fetchAll()).resources;

// ── Classification (exported logic is mirrored in lexicon-lookup isCacheableTranslation) ──
const words = (t) => (t || '').trim().split(/\s+/).filter(Boolean).length;
function junkReason(row) {
  const term = (row.term || '').trim().toLowerCase();
  if (!SUPPORTED.includes(row.language)) return 'unsupported language';
  if (row.language === 'english') return 'english-to-english';
  if (!/\p{L}/u.test(term)) return 'no letters';
  if (words(term) > 6 || term.length > 60) return 'passage stored as a term';
  if (row.cognate && row.cognate.trim().toLowerCase() === term) return 'echo of the input';
  if (row.language === 'dari' && (row.created_at || '') < DARI_FIX) return 'Dari cached before the Dari fix (Persian)';
  return null;
}

const plan = { deletes: [], patches: [], moves: [] };

if (phase === 'junk') {
  const auto = await all("SELECT * FROM l WHERE l.status = 'auto_generated'");
  for (const row of auto) {
    const reason = junkReason(row);
    if (reason) plan.deletes.push({ row, reason });
  }

  // Bridge gloss drift vs the source file
  const source = JSON.parse(readFileSync(resolve(root, 'data/standards-pipeline/bridges/ohio_bridge_phrases.json'), 'utf8'));
  const byTerm = new Map(source.map((b) => [b.term_normalized || b.term, b]));
  const bridges = await all("SELECT * FROM l WHERE l.created_by = 'bridge_pipeline_v1'");
  for (const row of bridges) {
    const src = byTerm.get(row.term);
    if (!src) continue;
    const ops = [];
    if ((row.bridge_anchor ?? null) !== (src.bridge_anchor ?? null)) ops.push({ op: 'set', path: '/bridge_anchor', value: src.bridge_anchor });
    if ((row.bridge_scaffold ?? null) !== (src.bridge_scaffold ?? null)) {
      ops.push({ op: 'set', path: '/bridge_scaffold', value: src.bridge_scaffold });
      ops.push({ op: 'set', path: '/bridge_definition', value: src.bridge_scaffold });
      ops.push({ op: 'set', path: '/bridge_definition_en', value: src.bridge_scaffold });
    }
    if (JSON.stringify(row.grammatical_forms ?? null) !== JSON.stringify(src.grammatical_forms ?? null)) ops.push({ op: 'set', path: '/grammatical_forms', value: src.grammatical_forms });
    if (ops.length) {
      ops.push({ op: 'set', path: '/updated_at', value: new Date().toISOString() });
      plan.patches.push({ row, ops, reason: 'bridge gloss drifted from source', change: `${row.term}: ${row.bridge_anchor} → ${src.bridge_anchor}` });
    }
  }
}

if (phase === 'split') {
  const auto = await all("SELECT * FROM l WHERE l.status = 'auto_generated'");
  for (const row of auto) {
    const reason = junkReason(row);
    if (reason) plan.deletes.push({ row, reason: `${reason} (run --phase junk first)` });
    else plan.moves.push({ row, cognate: row.cognate, removeRow: true, reason: 'machine translation → cache' });
  }
  const backfilled = await all("SELECT * FROM l WHERE l.created_by = 'bridge_pipeline_v1' AND IS_DEFINED(l.cognate) AND NOT IS_NULL(l.cognate)");
  for (const row of backfilled) plan.moves.push({ row, cognate: row.cognate, removeRow: false, reason: 'Azure translation inside a bridge row → cache' });
}

// ── Report ──
const tally = (list) => list.reduce((m, x) => ((m[x.reason] = (m[x.reason] || 0) + 1), m), {});
console.log(`\nPhase: ${phase} — ${write ? 'WRITING' : 'DRY RUN (nothing written; add --write)'}`);
console.log('Delete:', plan.deletes.length, JSON.stringify(tally(plan.deletes)));
console.log('Patch :', plan.patches.length, JSON.stringify(tally(plan.patches)));
const changes = [...new Set(plan.patches.map((p) => p.change))];
if (changes.length) console.log(`  distinct gloss changes (${changes.length}):`, changes.slice(0, 10).join(' | '));
console.log('Move  :', plan.moves.length, JSON.stringify(tally(plan.moves)));
if (!write) process.exit(0);

// ── Backup, then apply ──
const touched = [...plan.deletes, ...plan.patches, ...plan.moves].map((x) => x.row);
if (touched.length === 0) { console.log('Nothing to do.'); process.exit(0); }
const backupDir = resolve(root, 'flywheel/backlog');
mkdirSync(backupDir, { recursive: true });
const backup = resolve(backupDir, `cleanup-backup-${phase}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(backup, JSON.stringify(touched, null, 1));
console.log(`Backed up ${touched.length} documents → ${backup}`);

if (phase === 'split') {
  const exists = execFileSync('az', ['cosmosdb', 'sql', 'container', 'list', '-g', PROD.resourceGroup, '-a', PROD.account, '-d', PROD.database, '--query', `[?name=='${CACHE}'].name`, '-o', 'tsv'], { encoding: 'utf8' }).trim();
  if (!exists) {
    console.log(`Creating ${CACHE} (/language, TTL ${CACHE_TTL_SECONDS}s, autoscale max 1000 RU/s)…`);
    execFileSync('az', ['cosmosdb', 'sql', 'container', 'create', '-g', PROD.resourceGroup, '-a', PROD.account, '-d', PROD.database,
      '-n', CACHE, '-p', '/language', '--ttl', String(CACHE_TTL_SECONDS), '--max-throughput', '1000'], { stdio: 'inherit' });
  }
}
const cache = db.container(CACHE);
const cacheId = (term, language) => `${term.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_')}_${language}`;

let ok = 0; const failed = [];
async function run(list, fn) {
  for (let i = 0; i < list.length; i += 10) {
    await Promise.all(list.slice(i, i + 10).map(async (x) => {
      try { await fn(x); ok++; } catch (e) { failed.push(`${x.row.id}: ${e.code ?? e.message}`); }
    }));
  }
}
await run(plan.deletes, ({ row }) => lexicon.item(row.id, row.language).delete());
await run(plan.patches, ({ row, ops }) => lexicon.item(row.id, row.language).patch(ops.slice(0, 10)));
await run(plan.moves, async ({ row, cognate, removeRow }) => {
  await cache.items.upsert({ id: cacheId(row.term, row.language), term: row.term, language: row.language, cognate, source: 'azure_translator', cached_at: row.updated_at || row.created_at || new Date().toISOString(), migrated_from: row.id });
  if (removeRow) await lexicon.item(row.id, row.language).delete();
  else await lexicon.item(row.id, row.language).patch([{ op: 'set', path: '/cognate', value: null }, { op: 'set', path: '/updated_at', value: new Date().toISOString() }]);
});
console.log(`Done: ${ok} applied, ${failed.length} failed.`);
if (failed.length) { console.log(failed.slice(0, 20).join('\n')); process.exit(2); }
