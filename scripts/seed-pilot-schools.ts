/**
 * Seed Pilot Schools
 *
 * Run once per school to add them to the pilots container in Cosmos DB.
 * Students can then pick their school during onboarding.
 *
 * Usage:
 *   export COSMOS_DB_ENDPOINT="https://languagebridge-cosmos.documents.azure.com:443/"
 *   export COSMOS_DB_KEY="your-key"
 *   export COSMOS_DB_DATABASE="languagebridge-prod"
 *   npx tsx scripts/seed-pilot-schools.ts
 *
 * To add a new school, add it to the SCHOOLS array below and re-run.
 * Existing schools are upserted (updated if they exist, created if new).
 */

import { CosmosClient } from '@azure/cosmos';

const endpoint = process.env.COSMOS_DB_ENDPOINT;
const key = process.env.COSMOS_DB_KEY;
const databaseId = process.env.COSMOS_DB_DATABASE ?? 'languagebridge-prod';

if (!endpoint || !key) {
  console.error('Set COSMOS_DB_ENDPOINT and COSMOS_DB_KEY');
  process.exit(1);
}

type GradeBand = 'K-2' | '3-5' | '6-8' | '9-12';

type PilotSchoolDoc = {
  id: string;
  schoolCode: string;
  schoolName: string;
  pilotId: string;
  gradeBands: GradeBand[];
  teachers: Array<{
    name: string;
    gradeBands: GradeBand[];
  }>;
  createdAt: string;
};

// ─── ADD YOUR SCHOOLS HERE ───────────────────────────────────────

const SCHOOLS: PilotSchoolDoc[] = [
  {
    id: 'greenbriar',
    schoolCode: 'greenbriar',
    schoolName: 'Greenbriar Middle School',
    pilotId: 'PCSD-2026',
    gradeBands: ['3-5', '6-8'],
    teachers: [
      { name: 'D. Vanek', gradeBands: ['3-5'] },
      { name: 'J. Bernard', gradeBands: ['6-8'] },
    ],
    createdAt: new Date().toISOString(),
  },
  // Add more schools here:
  // {
  //   id: 'example-elementary',
  //   schoolCode: 'example-elementary',
  //   schoolName: 'Example Elementary',
  //   pilotId: 'PCSD-2026',
  //   gradeBands: ['K-2', '3-5'],
  //   teachers: [
  //     { name: 'Teacher Name', gradeBands: ['K-2', '3-5'] },
  //   ],
  //   createdAt: new Date().toISOString(),
  // },
];

// ─── SEED ────────────────────────────────────────────────────────

async function seed() {
  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);

  // Ensure container exists
  await database.containers.createIfNotExists({
    id: 'pilots',
    partitionKey: { paths: ['/pilotId'] },
  });

  // Also ensure enrollments container exists
  await database.containers.createIfNotExists({
    id: 'enrollments',
    partitionKey: { paths: ['/schoolCode'] },
  });

  const container = database.container('pilots');

  let created = 0;
  let updated = 0;

  for (const school of SCHOOLS) {
    try {
      await container.items.upsert(school);
      console.log(`  ${school.schoolName} (${school.schoolCode}) — ${school.gradeBands.join(', ')}`);
      for (const t of school.teachers) {
        console.log(`    ${t.name} → ${t.gradeBands.join(', ')}`);
      }
      created++;
    } catch (err) {
      console.error(`  FAILED: ${school.schoolCode}`, err);
    }
  }

  console.log(`\nDone: ${created} schools seeded.`);
  console.log('Students can now pick their school during onboarding.');
}

seed().catch(console.error);
