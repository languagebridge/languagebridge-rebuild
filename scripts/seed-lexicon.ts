#!/usr/bin/env npx ts-node
/**
 * seed-lexicon.ts
 *
 * Loads RBERN glossary seed data into Cosmos DB lexicon container.
 * Reads from data/lexicon-seed/<language>_lexicon_seed.json
 * Upserts each doc into the 'lexicon' container (partition key: language).
 *
 * Usage:
 *   npx ts-node scripts/seed-lexicon.ts
 *   npx ts-node scripts/seed-lexicon.ts --language dari
 *   npx ts-node scripts/seed-lexicon.ts --dry-run
 *   npx ts-node scripts/seed-lexicon.ts --batch-size 50
 */

import { CosmosClient } from '@azure/cosmos';
import * as fs from 'fs';
import * as path from 'path';

// ── Config ──────────────────────────────────────────────────────────

const SEED_DIR = path.join(__dirname, '..', 'data', 'lexicon-seed');

const BATCH_SIZE = 25; // Cosmos bulk ops per batch (stay under 429 throttle)
const DELAY_BETWEEN_BATCHES_MS = 100; // Backoff between batches

interface SeedDoc {
  id: string;
  term: string;
  language: string;
  domain: string;
  subject?: string;
  grade_band?: string;
  cognate: string | null;
  bridge_definition: string | null;
  bridge_definition_en: string | null;
  audio_blob_path: string | null;
  audio_source: string | null;
  status: string;
  version: number;
  usage_count: number;
  flag_count: number;
  created_by: string;
  source_file?: string;
  created_at: string;
  updated_at: string;
}

// ── CLI Args ────────────────────────────────────────────────────────

function parseArgs(): { language?: string; dryRun: boolean; batchSize: number } {
  const args = process.argv.slice(2);
  let language: string | undefined;
  let dryRun = false;
  let batchSize = BATCH_SIZE;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--language' || args[i] === '-l') {
      language = args[++i];
    } else if (args[i] === '--dry-run' || args[i] === '-n') {
      dryRun = true;
    } else if (args[i] === '--batch-size') {
      batchSize = parseInt(args[++i], 10);
    }
  }

  return { language, dryRun, batchSize };
}

// ── Cosmos Client ───────────────────────────────────────────────────

function createCosmosContainer() {
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const database = process.env.COSMOS_DB_DATABASE ?? 'languagebridge-prod';

  if (!endpoint || !key) {
    console.error('Error: COSMOS_DB_ENDPOINT and COSMOS_DB_KEY must be set.');
    console.error('Run: source backend/local.settings.json or export the variables manually.');
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  return client.database(database).container('lexicon');
}

// ── Batch Upsert ────────────────────────────────────────────────────

async function upsertBatch(
  container: ReturnType<typeof createCosmosContainer>,
  docs: SeedDoc[],
): Promise<{ succeeded: number; failed: number; errors: string[] }> {
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  const operations = docs.map((doc) => ({
    operationType: 'Upsert' as const,
    resourceBody: doc,
    partitionKey: doc.language,
  }));

  try {
    const response = await container.items.bulk(operations as any);

    for (let i = 0; i < response.length; i++) {
      const result = response[i];
      if (result.statusCode >= 200 && result.statusCode < 300) {
        succeeded++;
      } else if (result.statusCode === 429) {
        // Throttled — retry individually
        try {
          await container.items.upsert(docs[i]);
          succeeded++;
        } catch (retryErr: unknown) {
          failed++;
          const msg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          errors.push(`${docs[i].id}: retry failed — ${msg}`);
        }
      } else {
        failed++;
        errors.push(`${docs[i].id}: status ${result.statusCode}`);
      }
    }
  } catch (err: unknown) {
    // Bulk not supported or total failure — fall back to individual upserts
    for (const doc of docs) {
      try {
        await container.items.upsert(doc);
        succeeded++;
      } catch (upsertErr: unknown) {
        failed++;
        const msg = upsertErr instanceof Error ? upsertErr.message : String(upsertErr);
        errors.push(`${doc.id}: ${msg}`);
      }
    }
  }

  return { succeeded, failed, errors };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const { language, dryRun, batchSize } = parseArgs();

  // Discover seed files
  if (!fs.existsSync(SEED_DIR)) {
    console.error(`Error: seed directory not found at ${SEED_DIR}`);
    process.exit(1);
  }

  let seedFiles = fs.readdirSync(SEED_DIR)
    .filter((f) => f.endsWith('_lexicon_seed.json'))
    .sort();

  if (language) {
    seedFiles = seedFiles.filter((f) => f.startsWith(`${language}_`));
    if (seedFiles.length === 0) {
      console.error(`No seed file found for language: ${language}`);
      process.exit(1);
    }
  }

  // Load all docs
  const allDocs: Map<string, SeedDoc[]> = new Map();
  let totalDocs = 0;

  for (const file of seedFiles) {
    const lang = file.replace('_lexicon_seed.json', '');
    const filePath = path.join(SEED_DIR, file);
    const docs: SeedDoc[] = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Deduplicate by id within the file (same term+language)
    const deduped = new Map<string, SeedDoc>();
    for (const doc of docs) {
      // Keep the one with more specific metadata (has subject)
      const existing = deduped.get(doc.id);
      if (!existing || (doc.subject && doc.subject !== 'general' && (!existing.subject || existing.subject === 'general'))) {
        deduped.set(doc.id, doc);
      }
    }

    const dedupedDocs = Array.from(deduped.values());
    allDocs.set(lang, dedupedDocs);
    totalDocs += dedupedDocs.length;

    const dupeCount = docs.length - dedupedDocs.length;
    console.log(`  ${lang}: ${dedupedDocs.length} terms${dupeCount > 0 ? ` (${dupeCount} duplicates removed)` : ''}`);
  }

  console.log(`\nTotal: ${totalDocs} terms across ${allDocs.size} languages`);

  if (dryRun) {
    console.log('\n[DRY RUN] No data written to Cosmos DB.');
    return;
  }

  // Connect to Cosmos
  const container = createCosmosContainer();

  // Verify connection
  try {
    await container.read();
    console.log('\nConnected to Cosmos DB lexicon container.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\nFailed to connect to Cosmos DB: ${msg}`);
    console.error('Make sure COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, and COSMOS_DB_DATABASE are set.');
    process.exit(1);
  }

  // Upsert language by language
  let totalSucceeded = 0;
  let totalFailed = 0;
  const allErrors: string[] = [];

  for (const [lang, docs] of allDocs) {
    console.log(`\nSeeding ${lang} (${docs.length} terms)...`);

    let langSucceeded = 0;
    let langFailed = 0;

    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = docs.slice(i, i + batchSize);
      const { succeeded, failed, errors } = await upsertBatch(container, batch);

      langSucceeded += succeeded;
      langFailed += failed;
      allErrors.push(...errors);

      // Progress indicator
      const progress = Math.min(i + batchSize, docs.length);
      process.stdout.write(`\r  ${progress}/${docs.length} (${succeeded} ok, ${failed} err)`);

      if (i + batchSize < docs.length) {
        await sleep(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    console.log(`\n  ✓ ${lang}: ${langSucceeded} succeeded, ${langFailed} failed`);
    totalSucceeded += langSucceeded;
    totalFailed += langFailed;
  }

  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`SEED COMPLETE`);
  console.log(`${'='.repeat(50)}`);
  console.log(`  Succeeded: ${totalSucceeded}`);
  console.log(`  Failed:    ${totalFailed}`);

  if (allErrors.length > 0) {
    console.log(`\nFirst 20 errors:`);
    for (const err of allErrors.slice(0, 20)) {
      console.log(`  - ${err}`);
    }
    if (allErrors.length > 20) {
      console.log(`  ... and ${allErrors.length - 20} more`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
