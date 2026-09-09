#!/usr/bin/env node
// backend/scripts/analytics-check.mjs
//
// Read-only analytics snapshot straight from the Cosmos `sessions` container —
// no dashboard UI, no login, no superadmin gate. Pulls anonymous session events
// for a time window and aggregates them in JS: usage by event type, active
// students, top languages/terms, audio engagement, daily activity. Prints a
// summary and writes analytics-report.json next to this file.
//
// Uses the Cosmos DB REST API signed with the master key (built-in crypto only),
// so there is nothing to npm install.
//
// Run from the repo root so --env-file finds .env:
//   node --env-file=.env backend/scripts/analytics-check.mjs [days]
// Default window is 30 days. Example: ... analytics-check.mjs 7

import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DAYS = Number(process.argv[2]) || 30;
const ENDPOINT = (process.env.COSMOS_DB_ENDPOINT || '').replace(/\/+$/, '');
const KEY = process.env.COSMOS_DB_KEY || '';
const DB = process.env.COSMOS_DB_DATABASE || '';
const CONTAINER = 'sessions';
const API_VERSION = '2018-12-31';

if (!ENDPOINT || !KEY || !DB) {
  console.error('Missing COSMOS_DB_ENDPOINT / COSMOS_DB_KEY / COSMOS_DB_DATABASE.');
  console.error('Run from the repo root:  node --env-file=.env backend/scripts/analytics-check.mjs');
  process.exit(2);
}

const c = {
  b: (s) => `\x1b[1m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
};

// Build the Cosmos master-key authorization token for a request.
function authToken(verb, resourceType, resourceId, date) {
  const text =
    `${verb.toLowerCase()}\n${resourceType.toLowerCase()}\n${resourceId}\n${date.toLowerCase()}\n\n`;
  const sig = createHmac('sha256', Buffer.from(KEY, 'base64')).update(text, 'utf8').digest('base64');
  return encodeURIComponent(`type=master&ver=1.0&sig=${sig}`);
}

// Run a cross-partition SQL query, following continuation tokens.
async function query(sql, parameters = [], cap = 200000) {
  const resourceId = `dbs/${DB}/colls/${CONTAINER}`;
  const url = `${ENDPOINT}/${resourceId}/docs`;
  const out = [];
  let continuation = null;

  do {
    const date = new Date().toUTCString();
    const headers = {
      'Authorization': authToken('post', 'docs', resourceId, date),
      'x-ms-date': date,
      'x-ms-version': API_VERSION,
      'Content-Type': 'application/query+json',
      'x-ms-documentdb-isquery': 'True',
      'x-ms-documentdb-query-enablecrosspartition': 'True',
      'x-ms-max-item-count': '1000',
    };
    if (continuation) headers['x-ms-continuation'] = continuation;

    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ query: sql, parameters }) });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cosmos query failed ${res.status}: ${body.slice(0, 300)}`);
    }
    const json = await res.json();
    out.push(...(json.Documents || []));
    continuation = res.headers.get('x-ms-continuation');
  } while (continuation && out.length < cap);

  return { docs: out, capped: !!continuation };
}

function topN(map, n) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}
function bar(count, max, width = 24) {
  const filled = max > 0 ? Math.round((count / max) * width) : 0;
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

async function main() {
  const startIso = new Date(Date.now() - DAYS * 86400000).toISOString();
  console.log(c.b(`\nLanguageBridge analytics — sessions container`));
  console.log(c.dim(`window: last ${DAYS} days (since ${startIso.slice(0, 10)})  db=${DB}\n`));

  // Pull the minimal fields we aggregate on, for the window.
  const { docs, capped } = await query(
    `SELECT c.eventType, c.studentCode, c.language, c.term, c.timestamp, c.schoolCode
     FROM c WHERE c.timestamp >= @start`,
    [{ name: '@start', value: startIso }],
  );

  if (capped) console.log(c.yellow(`⚠ result cap hit — numbers below are a partial (very high volume). Narrow the window.\n`));
  if (!docs.length) {
    console.log(c.yellow('No events in this window. Either no usage yet, or analytics logging is off (ENABLE_ANALYTICS_LOGGING).'));
    return;
  }

  const byType = new Map();
  const byLang = new Map();
  const byTerm = new Map();
  const byDay = new Map();
  const bySchool = new Map();
  const students = new Set();

  for (const d of docs) {
    byType.set(d.eventType, (byType.get(d.eventType) || 0) + 1);
    if (d.studentCode) students.add(d.studentCode);
    if (d.language) byLang.set(d.language, (byLang.get(d.language) || 0) + 1);
    if (d.eventType === 'term_lookup' && d.term) byTerm.set(d.term, (byTerm.get(d.term) || 0) + 1);
    if (d.schoolCode) bySchool.set(d.schoolCode, (bySchool.get(d.schoolCode) || 0) + 1);
    const day = (d.timestamp || '').slice(0, 10);
    if (day) byDay.set(day, (byDay.get(day) || 0) + 1);
  }

  const total = docs.length;
  const g = (t) => byType.get(t) || 0;

  console.log(c.b('Headline'));
  console.log(`  Total events:      ${total}`);
  console.log(`  Active students:   ${students.size}   ${c.dim('(distinct studentCodes)')}`);
  console.log(`  Term lookups:      ${g('term_lookup')}`);
  console.log(`  Audio plays:       ${g('tts_play')}`);
  console.log(`  Glossary views:    ${g('glossary_view')}`);
  console.log(`  Scaffold views:    ${g('scaffold_view')}`);
  console.log(`  Flags submitted:   ${g('flag_event')}`);
  console.log(`  Sessions started:  ${g('session_start')}`);

  console.log(c.b('\nEvents by type'));
  const maxType = Math.max(...byType.values());
  for (const [t, n] of topN(byType, 20)) console.log(`  ${t.padEnd(16)} ${bar(n, maxType)} ${n}`);

  console.log(c.b('\nTop languages'));
  const maxLang = Math.max(...byLang.values(), 1);
  for (const [l, n] of topN(byLang, 12)) console.log(`  ${l.padEnd(16)} ${bar(n, maxLang)} ${n}`);

  console.log(c.b('\nTop looked-up terms'));
  for (const [t, n] of topN(byTerm, 15)) console.log(`  ${String(n).padStart(5)}  ${t}`);

  if (bySchool.size > 1) {
    console.log(c.b('\nBy school'));
    for (const [s, n] of topN(bySchool, 20)) console.log(`  ${String(s).padEnd(20)} ${n}`);
  }

  console.log(c.b('\nDaily activity'));
  const maxDay = Math.max(...byDay.values(), 1);
  for (const [day, n] of [...byDay.entries()].sort()) console.log(`  ${day}  ${bar(n, maxDay)} ${n}`);

  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'analytics-report.json');
  writeFileSync(outPath, JSON.stringify({
    windowDays: DAYS, since: startIso, capped, totalEvents: total,
    activeStudents: students.size,
    byType: Object.fromEntries(byType),
    byLanguage: Object.fromEntries(byLang),
    topTerms: topN(byTerm, 50),
    byDay: Object.fromEntries([...byDay.entries()].sort()),
    bySchool: Object.fromEntries(bySchool),
  }, null, 2));
  console.log(c.dim(`\nJSON report → ${outPath}\n`));
}

main().catch((e) => { console.error(`\nanalytics-check failed: ${e.message}\n`); process.exit(1); });
