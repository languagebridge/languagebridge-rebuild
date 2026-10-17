#!/usr/bin/env node
/**
 * e2e-local — drive the whole flywheel against a LOCAL Functions host wired to an
 * isolated test database, and check every effect in that database.
 *
 *   LB_TEST_API=http://localhost:7122/api LB_API_KEY=<host key> \
 *   COSMOS_DB_ENDPOINT=… COSMOS_DB_KEY=… COSMOS_DB_DATABASE=languagebridge-flywheel-test \
 *   node flywheel/scripts/test-env/e2e-local.mjs
 *
 * Refuses to run against the production database. Seed first with seed-test-db.mjs.
 * Covers: dialect choices + enrollment, lookup merge (RBERN + bridge), machine cache
 * (never the Lexicon), echo/passage junk, flag capture (scrub, scope, school/grade,
 * dialect, recognition), junk + PII rejection, export → review gate → publish,
 * lookup serving the human fix, Dual Codex phrase override, and pilotId on events.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { parseCsv, toCsv } from '../lib/queue.mjs';
import { PROD } from '../lib/cosmos.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { CosmosClient } = createRequire(resolve(root, 'package.json'))('@azure/cosmos');
const { LB_TEST_API: API, LB_API_KEY: KEY, COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE: DB } = process.env;
if (!API || !KEY || !COSMOS_DB_KEY || !DB) { console.error('Set LB_TEST_API, LB_API_KEY, COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE'); process.exit(1); }
if (DB === PROD.database) { console.error('Refusing to run against production.'); process.exit(1); }

const db = new CosmosClient({ endpoint: COSMOS_DB_ENDPOINT, key: COSMOS_DB_KEY }).database(DB);
const q = async (c, query, parameters = []) => (await db.container(c).items.query({ query, parameters }).fetchAll()).resources;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => { cond ? pass++ : fail++; console.log(`${cond ? '✅' : '❌'} ${name}${!cond && detail ? `  — ${detail}` : ''}`); };
async function call(method, path, body) {
  const res = await fetch(`${API}/${path}`, { method, headers: { 'Content-Type': 'application/json', 'x-lb-api-key': KEY }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch { /* empty */ }
  return { status: res.status, data };
}
const now = () => new Date().toISOString();
const START = now();   // checks below only look at what this run wrote, so the script can be re-run

// ── 1. Dialects + enrollment ───────────────────────────────────────
const v = await call('GET', 'onboarding/variants?language=spanish');
check('dialect choices served for Spanish', v.status === 200 && v.data.variants.spanish.some((x) => x.tag === 'es-HN'), JSON.stringify(v.data));
const bad = await call('POST', 'onboarding/enroll', { schoolCode: 'greenbriar', gradeBand: '6-8', language: 'dari', variant: 'fa-IR' });
check('enrollment rejects a dialect from another language (Dari ≠ Persian)', bad.status === 400 && bad.data.error === 'INVALID_VARIANT');
const es = await call('POST', 'onboarding/enroll', { schoolCode: 'greenbriar', gradeBand: '6-8', language: 'spanish', variant: 'es-HN' });
const so = await call('POST', 'onboarding/enroll', { schoolCode: 'greenbriar', gradeBand: '3-5', language: 'somali' });
check('students enrolled (Honduran Spanish, Somali)', es.status === 201 && so.status === 201);
const ES = es.data.studentCode, SO = so.data.studentCode;

// ── 2. Lookup: merge, machine cache, junk ──────────────────────────
const photo = await call('POST', 'lexicon-lookup', { term: 'photosynthesis', language: 'somali', studentCode: SO });
check('lookup serves a lexicon hit', photo.status === 200 && photo.data.source === 'lexicon', JSON.stringify(photo.data));
check('lookup merges translation + "In simple English" gloss', !!photo.data.cognate && !!photo.data.bridge_anchor, `cognate=${photo.data.cognate} anchor=${photo.data.bridge_anchor}`);

// A word Azure really translates into Somali. (For many Somali science words —
// "mitochondria", "photosynthesis", "cell" — Azure returns the English unchanged;
// lookup correctly treats that echo as "no translation" and stores nothing.)
const miss = await call('POST', 'lexicon-lookup', { term: 'water', language: 'somali', studentCode: SO });
check('unknown term falls back to Azure', miss.status === 200 && miss.data.provenance === 'machine' && !!miss.data.cognate, JSON.stringify(miss.data));
await sleep(1500);
check('Azure answer stored in machine cache', (await q('lexicon_machine_cache', "SELECT * FROM c WHERE c.term = 'water'")).length === 1);
check('Azure answer NOT stored in the Lexicon', (await q('lexicon', "SELECT * FROM c WHERE c.term = 'water'")).length === 0);
const echo = await call('POST', 'lexicon-lookup', { term: 'mitochondria', language: 'somali', studentCode: SO });
check('English echo from Azure is shown as "no translation", never as a translation', echo.status === 200 && echo.data.cognate === null);

await call('POST', 'lexicon-lookup', { term: 'les', language: 'somali', studentCode: SO });
await call('POST', 'lexicon-lookup', { term: 'what document established the first national government of the united states', language: 'somali', studentCode: SO });
await sleep(1500);
check('echo ("les") never cached', (await q('lexicon_machine_cache', "SELECT * FROM c WHERE c.term = 'les'")).length === 0);
check('passage never cached', (await q('lexicon_machine_cache', "SELECT * FROM c WHERE STARTSWITH(c.term, 'what document')")).length === 0);

// ── 3. Flags ───────────────────────────────────────────────────────
const flag = (body) => call('POST', 'flag-handler', { studentCode: SO, language: 'somali', timestamp: now(), flagType: 'translation', ...body });
const f1 = await flag({ flaggedText: 'table', subject: 'math', surface: 'lookup', context: 'Ask Jamal to copy the numbers from the table into row 1204 of the chart.' });
check('flag accepted', f1.status === 200, JSON.stringify(f1.data));
const [fd] = await q('flags', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: f1.data.flagId }]);
check('flag has school + grade from the enrollment', fd?.schoolCodes?.[0] === 'greenbriar' && fd?.gradeBands?.[0] === '3-5', JSON.stringify(fd?.schoolCodes));
check('flag context scrubbed (name and number redacted)', !!fd?.contexts?.[0]?.text && !/Jamal|1204/.test(fd.contexts[0].text) && fd.contexts[0].text.includes('table'), fd?.contexts?.[0]?.text);
check('flag tagged as a term, keyed by subject', fd?.scope === 'term' && fd?.subject === 'math');

const junk = await flag({ flaggedText: '...' });
check('junk flag rejected (no letters)', junk.status === 400 && junk.data.error === 'INVALID_TEXT');
const pii = await flag({ flaggedText: 'kid@example.com' });
check('PII flag rejected', pii.status === 400 && pii.data.error === 'PII_VIOLATION');
const passage = await flag({ flaggedText: 'the articles of confederation established the first national government' });
const [pd] = await q('flags', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: passage.data.flagId }]);
check('passage flag tagged scope=passage', pd?.scope === 'passage');
const rec = await call('POST', 'flag-handler', { studentCode: SO, language: 'english', timestamp: now(), flagType: 'recognition', surface: 'talk_to_teacher', flaggedText: 'can I go see Mr Okafor' });
const [rd] = await q('flags', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: rec.data?.flagId ?? '' }]);
check('Talk to Teacher "misheard" flag stored redacted', rec.status === 200 && rd?.recognitionFlagCount >= 1 && !/okafor/i.test(rd.flaggedText), rd?.flaggedText);
const esFlag = await call('POST', 'flag-handler', { studentCode: ES, language: 'spanish', timestamp: now(), flagType: 'translation', flaggedText: 'bus' });
const [ed] = await q('flags', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: esFlag.data?.flagId ?? '' }]);
check('Spanish flag inherits the student’s dialect (es-HN)', ed?.variant === 'es-HN', ed?.variant);

// ── 4. Manual loop: export → fill → review gate → publish ──────────
const env = { ...process.env };
const csv = resolve(root, 'flywheel/backlog/flag-queue-e2e.csv');
execFileSync('node', [resolve(root, 'flywheel/scripts/export-flag-queue.mjs'), '--language', 'somali', '--out', 'flywheel/backlog/flag-queue-e2e.csv'], { env, stdio: 'pipe' });
const rows = parseCsv(readFileSync(csv, 'utf8'));
const row = rows.find((r) => r.flag_id === f1.data.flagId);
check('export includes the flag with what is currently served', !!row && !!row.currently_served, row?.currently_served);
Object.assign(row, { action: 'fix', fix_text: 'E2E-TEST-shaxda', sense_tag: 'math', sense_gloss: 'rows and columns of numbers', author: 'C-901', reviewer_1: 'C-902', reviewer_1_decision: 'approve', reviewer_2: 'C-902', reviewer_2_decision: 'approve' });
writeFileSync(csv, toCsv(rows));
const gate = execFileSync('node', [resolve(root, 'flywheel/scripts/publish-approved.mjs'), csv, '--by', 'C-900', '--write'], { env, encoding: 'utf8' });
check('review gate blocks two approvals from the same reviewer', /different people/.test(gate) && !/Published \(1\)/.test(gate));
Object.assign(row, { reviewer_2: 'C-903' });
writeFileSync(csv, toCsv(rows));
const pub = execFileSync('node', [resolve(root, 'flywheel/scripts/publish-approved.mjs'), csv, '--by', 'C-900', '--write'], { env, encoding: 'utf8' });
check('publish writes the approved fix', /Published \(1\)/.test(pub), pub.split('\n').filter((l) => /Published|Failed|Skipped/.test(l)).join(' / '));
const [resolved] = await q('flags', 'SELECT * FROM c WHERE c.id = @id', [{ name: '@id', value: f1.data.flagId }]);
check('flag resolved with the new entry id', resolved?.status === 'resolved' && !!resolved?.resolution?.entryId);
const [entry] = await q('lexicon', "SELECT * FROM c WHERE c.status = 'approved' AND c.term = 'table' AND c.approved_at >= @start", [{ name: '@start', value: START }]);
check('approved entry carries the authorship trail', entry?.authored_by === 'C-901' && entry?.reviewed_by?.length === 2 && entry?.source_flag_id === f1.data.flagId);

// ── 5. Lookup serves the human fix ─────────────────────────────────
const fixed = await call('POST', 'lexicon-lookup', { term: 'table', language: 'somali', context: 'math', studentCode: SO });
check('lookup now serves the human-verified fix', fixed.data?.cognate === 'E2E-TEST-shaxda' && fixed.data?.provenance === 'human_verified', JSON.stringify({ c: fixed.data?.cognate, p: fixed.data?.provenance }));

// ── 6. Dual Codex phrase override ──────────────────────────────────
await db.container('lexicon').items.upsert({ id: 'e2e_line_up_for_lunch_somali_v1', term: 'line up for lunch', language: 'somali', cognate: 'E2E-TEST-safka-qadada', entry_kind: 'phrase', status: 'approved', version: 1, created_by: 'flywheel_publish', authored_by: 'C-901', reviewed_by: ['C-902', 'C-903'] });
await sleep(1500);
const tr = await call('POST', 'translate', { text: 'Line up for lunch!', fromLanguage: 'english', toLanguage: 'somali', studentCode: SO });
check('Dual Codex serves the human phrase instead of Azure', tr.data?.translatedText === 'E2E-TEST-safka-qadada', tr.data?.translatedText);

// ── 7. Usage events carry pilotId ──────────────────────────────────
await call('POST', 'analytics-writer', { studentCode: SO, language: 'somali', eventType: 'term_lookup', timestamp: now(), extensionVersion: 'e2e', term: 'table' });
await sleep(2000);
const [ev] = await q('sessions', "SELECT * FROM c WHERE c.extensionVersion = 'e2e' AND c.timestamp >= @start", [{ name: '@start', value: START }]);
check('session event has pilot, school and grade', ev?.pilotId === 'PCSD-2026' && ev?.schoolCode === 'greenbriar', JSON.stringify({ p: ev?.pilotId, s: ev?.schoolCode }));
const lookups = await q('analytics', "SELECT c.pilotId, c.provenance FROM c WHERE c.type = 'lexicon_hit' AND c.timestamp >= @start", [{ name: '@start', value: START }]);
check('lookup events have pilot + provenance', lookups.length > 0 && lookups.every((l) => l.pilotId === 'PCSD-2026' && !!l.provenance), JSON.stringify(lookups.slice(0, 2)));
const fired = await q('analytics', "SELECT * FROM c WHERE c.type = 'lexicon_override_fired' AND c.timestamp >= @start", [{ name: '@start', value: START }]);
check('Dual Codex hit logged with entry id, no text', fired.length === 1 && fired[0].entry_ids[0] === 'e2e_line_up_for_lunch_somali_v1' && !('text' in fired[0]));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
