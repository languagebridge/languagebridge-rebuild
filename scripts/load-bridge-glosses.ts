/**
 * load-bridge-glosses.ts
 *
 * Loads the 1,080 bridge glosses from the standards pipeline into Cosmos DB.
 * Creates one LexiconDoc per term for EACH supported language.
 *
 * The bridge phrases are language-agnostic English glosses — they apply to
 * every language because they describe the concept, not the translation.
 * The cognate field is left null — it gets filled when a student looks up
 * the term and the translator fallback fires.
 *
 * Usage:
 *   npx tsx scripts/load-bridge-glosses.ts
 *   npx tsx scripts/load-bridge-glosses.ts --dry-run
 *   npx tsx scripts/load-bridge-glosses.ts --language dari
 *
 * Requires: COSMOS_DB_ENDPOINT, COSMOS_DB_KEY, COSMOS_DB_DATABASE env vars
 */

import { CosmosClient } from '@azure/cosmos';
import { readFileSync } from 'fs';
import { join } from 'path';
import { SUPPORTED_LANGUAGES, type LexiconDoc, type SupportedLanguage } from '../backend/shared/types';

const BRIDGES_PATH = join(__dirname, '../data/standards-pipeline/bridges/ohio_bridge_phrases.json');

interface BridgeEntry {
  id: string;
  term: string;
  term_normalized: string;
  domain: string;
  subjects: string;
  grade_bands: string;
  bridge_anchor: string;
  bridge_scaffold: string;
  grammatical_forms: {
    noun: string | null;
    verb: string | null;
    adjective: string | null;
  };
  transliteration_difficulty: string;
  is_latin_derived: boolean;
  is_greek_derived: boolean;
  etymology_evidence: string | null;
  awl_match: boolean;
  frequency: number;
  pos: string;
  is_multi_word: boolean;
  status: string;
  version: number;
  created_by: string;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const langFilter = args.find(a => a.startsWith('--language='))?.split('=')[1]
    || (args.includes('--language') ? args[args.indexOf('--language') + 1] : null);

  // Load bridge data
  const raw = readFileSync(BRIDGES_PATH, 'utf-8');
  const bridges: BridgeEntry[] = JSON.parse(raw);
  console.log(`Loaded ${bridges.length} bridge glosses`);

  // Determine which languages to load
  const languages: SupportedLanguage[] = langFilter
    ? [langFilter as SupportedLanguage]
    : [...SUPPORTED_LANGUAGES].filter(l => l !== 'english'); // Skip English — bridges ARE English

  console.log(`Target languages: ${languages.length}`);
  console.log(`Total docs to upsert: ${bridges.length * languages.length}`);

  if (dryRun) {
    console.log('\n--- DRY RUN — no writes ---');
    console.log('Sample doc:');
    const sample = toBridgeDoc(bridges[0], 'dari');
    console.log(JSON.stringify(sample, null, 2));
    return;
  }

  // Connect to Cosmos
  const endpoint = process.env.COSMOS_DB_ENDPOINT;
  const key = process.env.COSMOS_DB_KEY;
  const dbName = process.env.COSMOS_DB_DATABASE ?? 'languagebridge-prod';

  if (!endpoint || !key) {
    console.error('ERROR: Set COSMOS_DB_ENDPOINT and COSMOS_DB_KEY');
    process.exit(1);
  }

  const client = new CosmosClient({ endpoint, key });
  const container = client.database(dbName).container('lexicon');

  // Upsert in batches
  let upserted = 0;
  let errors = 0;
  const now = new Date().toISOString();

  for (const lang of languages) {
    console.log(`\n  Loading ${lang}...`);
    let langCount = 0;

    for (const bridge of bridges) {
      const doc = toBridgeDoc(bridge, lang, now);

      try {
        await container.items.upsert(doc);
        langCount++;
        upserted++;

        if (langCount % 100 === 0) {
          process.stdout.write(`    ${langCount}/${bridges.length}\r`);
        }
      } catch (err: any) {
        errors++;
        if (errors <= 3) {
          console.error(`    ERROR on ${doc.id}: ${err.message}`);
        }
      }
    }
    console.log(`    ${langCount} docs upserted for ${lang}`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`  Upserted: ${upserted}`);
  console.log(`  Errors:   ${errors}`);
  console.log(`${'='.repeat(50)}`);
}

function toBridgeDoc(bridge: BridgeEntry, language: SupportedLanguage, now?: string): LexiconDoc {
  const timestamp = now ?? new Date().toISOString();
  const term = bridge.term_normalized;

  return {
    id: `${term.replace(/\s+/g, '_')}_${language}_bridge`,
    term: bridge.term,
    language,
    domain: 'k12_academic',
    subject: bridge.subjects?.split('|')[0],  // Primary subject
    subjects: bridge.subjects,
    grade_band: bridge.grade_bands?.split('|')[0],
    grade_bands: bridge.grade_bands,
    ohio_standard: undefined,
    cognate: null,  // Filled on first translator lookup per language

    bridge_anchor: bridge.bridge_anchor,
    bridge_scaffold: bridge.bridge_scaffold,
    bridge_definition: bridge.bridge_scaffold,  // Backwards compat
    bridge_definition_en: bridge.bridge_scaffold,

    grammatical_forms: bridge.grammatical_forms,

    awl_match: bridge.awl_match,
    is_latin_derived: bridge.is_latin_derived,
    is_greek_derived: bridge.is_greek_derived,
    etymology_evidence: bridge.etymology_evidence,
    transliteration_difficulty: bridge.transliteration_difficulty as 'high' | 'medium' | 'low',

    audio_blob_path: null,
    audio_source: null,
    audio_model: undefined,
    tts_backend: undefined,
    voice_pack: undefined,

    status: 'pending_review',
    version: 1,
    usage_count: 0,
    flag_count: 0,
    frequency: bridge.frequency,
    is_bridge_priority: true,

    created_by: 'bridge_pipeline_v1',
    created_at: timestamp,
    updated_at: timestamp,
  };
}

main().catch(console.error);
