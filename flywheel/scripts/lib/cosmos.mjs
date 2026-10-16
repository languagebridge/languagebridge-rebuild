/**
 * Cosmos connection for flywheel scripts. No silent defaults (MASTER-DOCUMENT §7.1 rule 6):
 * either pass --az (production account via the Azure CLI) or set the three env vars.
 *
 *   readOnly: true  → with --az, fetches the READ-ONLY key; the script cannot write.
 *   readOnly: false → with --az, fetches the primary (write) key. Only publish --write asks for this.
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const require = createRequire(resolve(root, 'package.json'));

export const PROD = {
  account: 'languagebridge-cosmos',
  resourceGroup: 'languagebridge-rg',
  endpoint: 'https://languagebridge-cosmos.documents.azure.com:443/',
  database: 'languagebridge-prod',
};

export function arg(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : undefined;
}

export function hasFlag(name) {
  return process.argv.includes(name);
}

export async function connect({ readOnly }) {
  const { CosmosClient } = require('@azure/cosmos');
  let endpoint, key, database;
  if (hasFlag('--az')) {
    const query = readOnly ? 'primaryReadonlyMasterKey' : 'primaryMasterKey';
    key = execFileSync('az', [
      'cosmosdb', 'keys', 'list', '-g', PROD.resourceGroup, '-n', PROD.account,
      '--type', readOnly ? 'read-only-keys' : 'keys', '--query', query, '-o', 'tsv',
    ], { encoding: 'utf8' }).trim();
    ({ endpoint, database } = PROD);
  } else {
    ({ COSMOS_DB_ENDPOINT: endpoint, COSMOS_DB_KEY: key, COSMOS_DB_DATABASE: database } = process.env);
    if (!endpoint || !key || !database) {
      console.error('Pass --az, or set COSMOS_DB_ENDPOINT, COSMOS_DB_KEY and COSMOS_DB_DATABASE.');
      process.exit(1);
    }
  }
  console.log(`Cosmos: ${database} (${readOnly ? 'read-only' : 'READ-WRITE'})`);
  return new CosmosClient({ endpoint, key }).database(database);
}
