#!/usr/bin/env node
/**
 * publish-approved — step 2 of the manual flywheel loop.
 *
 * Reads a CSV from export-flag-queue.mjs after linguists and reviewers filled it,
 * enforces the review gate, and (only with --write) publishes approved fixes:
 *   - creates a NEW Lexicon entry (status 'approved', version + 1, authorship trail).
 *     Older rows are kept; lookup ranks the approved row first.
 *   - marks the flag 'resolved' with the new entry id (same fields the flag-queue
 *     endpoint writes), or 'dismissed' for action=dismiss.
 *
 *   node flywheel/scripts/publish-approved.mjs <filled.csv> --by C-001 --az            # dry run (read-only key)
 *   node flywheel/scripts/publish-approved.mjs <filled.csv> --by C-001 --az --write    # publish
 *
 * Gate (lib/queue.mjs planRow): two "approve" decisions from two different
 * reviewers, neither the author; contributor IDs only. Rows that fail are
 * listed and never written. Sound / misheard fixes are Phase 3 and are skipped.
 */
import { readFileSync } from 'node:fs';
import { connect, arg, hasFlag } from './lib/cosmos.mjs';
import { parseCsv, planRow, buildEntry, flagResolutionOps, loadContract, labelOf } from './lib/queue.mjs';

const file = process.argv[2];
const by = arg('--by');
const write = hasFlag('--write');
if (!file || file.startsWith('--') || !by) {
  console.error('Usage: publish-approved.mjs <filled.csv> --by <your contributor/admin ID> [--az] [--write]');
  process.exit(1);
}

const contract = loadContract();
const plans = parseCsv(readFileSync(file, 'utf8')).map((row) => ({ row, plan: planRow(row, contract) }));
const db = await connect({ readOnly: !write });
const flags = db.container('flags');
const lexicon = db.container('lexicon');

const results = { published: [], dismissed: [], rejected: [], skipped: [], failed: [] };

for (const { row, plan } of plans) {
  const label = labelOf(row);
  if (plan.kind === 'skip') { if (plan.reason !== 'no action') results.skipped.push(`${label}: ${plan.reason}`); continue; }
  if (plan.kind === 'reject') { results.rejected.push(`${label}: ${plan.reason}`); continue; }

  let flag;
  try { ({ resource: flag } = await flags.item(plan.flagId, plan.language).read()); } catch { flag = undefined; }
  if (!flag) { results.failed.push(`${label}: flag not found`); continue; }
  if (flag.status === 'resolved' || flag.status === 'dismissed') { results.skipped.push(`${label}: already ${flag.status}`); continue; }

  if (plan.kind === 'dismiss') {
    if (write) {
      try { await flags.item(plan.flagId, plan.language).patch(flagResolutionOps(flag, { action: 'dismissed', note: plan.note, by })); }
      catch (e) { results.failed.push(`${label}: dismiss failed (${e.code ?? e.message})`); continue; }
    }
    results.dismissed.push(label);
    continue;
  }

  // publish
  const { resources: existing } = await lexicon.items
    .query(
      { query: 'SELECT * FROM l WHERE LOWER(l.term) = @term AND l.language = @language', parameters: [{ name: '@term', value: plan.term }, { name: '@language', value: plan.language }] },
      { partitionKey: plan.language }
    )
    .fetchAll();
  const entry = buildEntry(plan, existing);
  const summary = `${label} → "${entry.cognate}" as ${entry.id} (${entry.sense_key}${entry.variant ? ', ' + entry.variant : ''}; by ${entry.authored_by}, reviewed ${entry.reviewed_by.join(' + ')})`;

  if (write) {
    try { await lexicon.items.create(entry); }
    catch (e) { results.failed.push(`${label}: Lexicon write failed (${e.code ?? e.message})`); continue; }
    try { await flags.item(plan.flagId, plan.language).patch(flagResolutionOps(flag, { action: 'resolved', entryId: entry.id, note: plan.note, by })); }
    catch (e) {
      // Entry is live; only the flag bookkeeping failed. Re-running skips the entry (id exists) — resolve by hand.
      results.failed.push(`${label}: entry ${entry.id} PUBLISHED but flag not resolved (${e.code ?? e.message}) — resolve via POST /api/flag-queue/${plan.flagId}/action`);
      continue;
    }
  }
  results.published.push(summary);
}

const show = (title, list) => { if (list.length) console.log(`\n${title} (${list.length})\n  ` + list.join('\n  ')); };
console.log(write ? '\n=== PUBLISHED ===' : '\n=== DRY RUN — nothing written. Re-run with --write to publish. ===');
show(write ? 'Published' : 'Would publish', results.published);
show(write ? 'Dismissed' : 'Would dismiss', results.dismissed);
show('Rejected by a reviewer — send back to the contributor', results.rejected);
show('Skipped', results.skipped);
show('Failed', results.failed);
if (results.failed.length) process.exit(2);
