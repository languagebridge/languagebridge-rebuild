#!/usr/bin/env node
/**
 * backfill-session-scope — repair `sessions` events recorded with schoolCode
 * 'unknown'. Dry run unless --write.
 *
 *   node backend/scripts/backfill-session-scope.mjs --az            # report (read-only key)
 *   node backend/scripts/backfill-session-scope.mjs --az --write    # apply
 *
 * Why: the live `enrollments` container is partitioned by /schoolCode, so
 * analytics-writer's point read by student code always 404'd and every event
 * was stored with schoolCode/gradeBand 'unknown'. Every dashboard query filters
 * by schoolCode, so district reports came back empty. The code is fixed on
 * feat/lexicon-flywheel (shared/enrollments.ts); this repairs the history.
 *
 * What it changes: schoolCode and gradeBand, taken from the student's enrollment,
 * plus `scope_backfilled_at`. It cannot add pilotId to old events — pilotId is the
 * partition key and cannot change in place — so old events stay in the
 * "no pilot" partition; dashboard queries are cross-partition and still find them.
 *
 * Before writing, the old values are backed up to
 * flywheel/backlog/cleanup-backup-sessions-<timestamp>.json (gitignored).
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { connect, hasFlag } from '../../flywheel/scripts/lib/cosmos.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'package.json'));
const { PartitionKeyBuilder } = require('@azure/cosmos');
const NO_PILOT = new PartitionKeyBuilder().addNoneValue().build();

const write = hasFlag('--write');
const db = await connect({ readOnly: !write });
const all = async (container, query) => (await db.container(container).items.query({ query }).fetchAll()).resources;

const enrollments = new Map((await all('enrollments', 'SELECT c.id, c.schoolCode, c.gradeBand FROM c')).map((e) => [e.id, e]));
const events = await all('sessions', "SELECT c.id, c.studentCode, c.schoolCode, c.gradeBand, c.pilotId FROM c WHERE NOT IS_DEFINED(c.schoolCode) OR c.schoolCode = 'unknown'");

const plan = [];
const unresolved = new Map();
for (const ev of events) {
  const enr = enrollments.get(ev.studentCode);
  if (!enr) { unresolved.set(ev.studentCode ?? '(none)', (unresolved.get(ev.studentCode ?? '(none)') ?? 0) + 1); continue; }
  plan.push({ ev, schoolCode: enr.schoolCode, gradeBand: enr.gradeBand });
}

const bySchool = plan.reduce((m, p) => ((m[p.schoolCode] = (m[p.schoolCode] || 0) + 1), m), {});
console.log(`\n${write ? 'WRITING' : 'DRY RUN (nothing written; add --write)'}`);
console.log(`Events with unknown school: ${events.length}`);
console.log(`  repairable from enrollments: ${plan.length}`, JSON.stringify(bySchool));
console.log(`  not repairable (student code has no enrollment — test or deleted codes): ${events.length - plan.length} across ${unresolved.size} codes`);

// Prove we can address these documents (no pilotId = the "none" partition) before any write.
const keyFor = (ev) => (ev.pilotId === undefined ? NO_PILOT : ev.pilotId);
if (plan.length) {
  const probe = plan[0].ev;
  const { resource } = await db.container('sessions').item(probe.id, keyFor(probe)).read();
  if (!resource) { console.error('Could not read a planned document by its partition key — aborting.'); process.exit(1); }
  console.log('  partition addressing check: OK');
}
if (!write || plan.length === 0) process.exit(0);

const backupDir = resolve(root, 'flywheel/backlog');
mkdirSync(backupDir, { recursive: true });
const backup = resolve(backupDir, `cleanup-backup-sessions-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
writeFileSync(backup, JSON.stringify(plan.map(({ ev }) => ev)));
console.log(`Backed up ${plan.length} old values → ${backup}`);

const sessions = db.container('sessions');
const now = new Date().toISOString();
let ok = 0; const failed = [];
for (let i = 0; i < plan.length; i += 20) {
  await Promise.all(plan.slice(i, i + 20).map(async ({ ev, schoolCode, gradeBand }) => {
    try {
      await sessions.item(ev.id, keyFor(ev)).patch([
        { op: 'set', path: '/schoolCode', value: schoolCode },
        { op: 'set', path: '/gradeBand', value: gradeBand },
        { op: 'set', path: '/scope_backfilled_at', value: now },
      ]);
      ok++;
    } catch (e) { failed.push(`${ev.id}: ${e.code ?? e.message}`); }
  }));
}
console.log(`Done: ${ok} repaired, ${failed.length} failed.`);
if (failed.length) { console.log(failed.slice(0, 10).join('\n')); process.exit(2); }
