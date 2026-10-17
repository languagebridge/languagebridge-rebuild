#!/usr/bin/env node
/**
 * seed-test-db — copy a small, real slice of production into an isolated test
 * database so the flywheel can be tested end to end without touching production.
 *
 *   node flywheel/scripts/test-env/seed-test-db.mjs --target languagebridge-flywheel-test
 *
 * Reads production with the READ-ONLY key; writes only to --target, which must
 * not be the production database. Copies: pilots, and every lexicon row (RBERN,
 * bridge, approved) for a handful of terms in three languages.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROD, arg } from '../lib/cosmos.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const { CosmosClient } = createRequire(resolve(root, 'package.json'))('@azure/cosmos');

const target = arg('--target');
if (!target || target === PROD.database) {
  console.error(`--target <test database> is required and must not be ${PROD.database}`);
  process.exit(1);
}
const TERMS = (arg('--terms') ?? 'photosynthesis,table,fraction,producer,solution,function,equation,conductor,energy,map').split(',');
const LANGUAGES = (arg('--languages') ?? 'somali,dari,spanish').split(',');

const key = (type, q) => execFileSync('az', ['cosmosdb', 'keys', 'list', '-g', PROD.resourceGroup, '-n', PROD.account, '--type', type, '--query', q, '-o', 'tsv'], { encoding: 'utf8' }).trim();
const prod = new CosmosClient({ endpoint: PROD.endpoint, key: key('read-only-keys', 'primaryReadonlyMasterKey') }).database(PROD.database);
const test = new CosmosClient({ endpoint: PROD.endpoint, key: key('keys', 'primaryMasterKey') }).database(target);

// Guard: the target must exist and must be a separate database.
await test.read();
console.log(`Seeding ${target} from ${PROD.database} (read-only)`);

const strip = ({ _rid, _self, _etag, _attachments, _ts, ...doc }) => doc;

const { resources: pilots } = await prod.container('pilots').items.query('SELECT * FROM c').fetchAll();
for (const p of pilots) await test.container('pilots').items.upsert(strip(p));
console.log(`pilots: ${pilots.length}`);

let rows = 0;
for (const language of LANGUAGES) {
  const { resources } = await prod.container('lexicon').items
    .query({ query: 'SELECT * FROM l WHERE ARRAY_CONTAINS(@terms, l.term) AND l.language = @language', parameters: [{ name: '@terms', value: TERMS }, { name: '@language', value: language }] }, { partitionKey: language })
    .fetchAll();
  for (const r of resources) await test.container('lexicon').items.upsert(strip(r));
  rows += resources.length;
  console.log(`lexicon ${language}: ${resources.length} rows`);
}
console.log(`Done: ${pilots.length} pilots, ${rows} lexicon rows.`);
