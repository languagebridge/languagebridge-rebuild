/**
 * Provision Pilot Schools (+ licenses)
 *
 * Run once per school to add/update it in the `pilots` container in Cosmos DB.
 * This is the interim provisioning tool until the admin terminal ships
 * (see docs/PRD-ADMIN-DATABASE.md). The license block is the accountability
 * record — see company/PROVISIONING-AND-LICENSING.md.
 *
 * Usage:
 *   export COSMOS_DB_ENDPOINT="https://<account>.documents.azure.com:443/"
 *   export COSMOS_DB_KEY="your-key"
 *   export COSMOS_DB_DATABASE="languagebridge-prod"
 *   npx tsx scripts/seed-pilot-schools.ts
 *   # (locally you can instead: node --env-file=.env ... once compiled, or use tsx with .env sourced)
 *
 * To add a school, add it to the SCHOOLS array and re-run. Existing schools are
 * UPSERTED (updated if present, created if new). Fill the license block with the
 * REAL purchased seats, term, and signed-DPA reference before running for a
 * paying school — those numbers drive seat accountability in the dashboard.
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
type LicenseStatus = 'trial' | 'active' | 'expired' | 'suspended';

type License = {
  seats: number;          // EL-student seats purchased — the billable unit
  status: LicenseStatus;
  startDate: string;      // ISO date
  endDate: string;        // ISO date
  tier: string;           // pricing tier (Starter / Growth / District / Pilot / demo)
  dpaRef: string;         // reference to the signed DPA (accountability + audit)
};

type PilotSchoolDoc = {
  id: string;
  schoolCode: string;     // stable id + analytics scope key
  schoolName: string;
  district: string;
  pilotId: string;        // partition key
  gradeBands: GradeBand[];
  enrollCode?: string;    // human-friendly join code, case-insensitive on entry (no I/O/0/1)
  license: License;
  isDemo?: boolean;       // true only for the sandbox school (never billed, hidden from picker)
  teachers: Array<{ name: string; gradeBands: GradeBand[] }>;
  createdAt: string;
};

const now = new Date().toISOString();

// ─── ADD / EDIT SCHOOLS HERE ─────────────────────────────────────

const SCHOOLS: PilotSchoolDoc[] = [
  {
    id: 'greenbriar',
    schoolCode: 'greenbriar',
    schoolName: 'Greenbriar Middle School',
    district: 'Parma City Schools',
    pilotId: 'PCSD-2026',
    gradeBands: ['3-5', '6-8'],
    enrollCode: 'PARMA-GB',
    license: {
      seats: 100,
      status: 'expired',          // Parma MVP pilot has ended
      startDate: '2026-03-03',
      endDate: '2026-06-30',
      tier: 'Pilot',
      dpaRef: 'Parma MVP DPA 2026-03-03',
    },
    teachers: [
      { name: 'D. Vanek', gradeBands: ['3-5'] },
      { name: 'J. Bernard', gradeBands: ['6-8'] },
    ],
    createdAt: now,
  },

  // ── Demo sandbox — never billed, excluded from the picker, seat-checks skipped ──
  {
    id: 'lb-demo',
    schoolCode: 'LB-DEMO',
    schoolName: 'Demo (Sandbox)',
    district: 'LanguageBridge',
    pilotId: 'DEMO',
    gradeBands: ['K-2', '3-5', '6-8', '9-12'],
    enrollCode: 'DEMO',
    license: {
      seats: 999999,
      status: 'active',
      startDate: now,
      endDate: '2099-12-31',
      tier: 'demo',
      dpaRef: 'n/a',
    },
    isDemo: true,
    teachers: [],
    createdAt: now,
  },

  // Add more schools here (copy a block above and fill the license):
];

// ─── SEED ────────────────────────────────────────────────────────

async function seed() {
  const client = new CosmosClient({ endpoint, key });
  const database = client.database(databaseId);

  await database.containers.createIfNotExists({ id: 'pilots', partitionKey: { paths: ['/pilotId'] } });
  await database.containers.createIfNotExists({ id: 'enrollments', partitionKey: { paths: ['/schoolCode'] } });

  const container = database.container('pilots');
  let count = 0;

  for (const school of SCHOOLS) {
    try {
      await container.items.upsert(school);
      const l = school.license;
      const tag = school.isDemo ? '[demo]' : `${l.status}, ${l.seats} seats, ends ${l.endDate.slice(0, 10)}`;
      console.log(`  ${school.schoolName} (${school.schoolCode}) — ${school.gradeBands.join(', ')} — ${tag}`);
      count++;
    } catch (err) {
      console.error(`  FAILED: ${school.schoolCode}`, err);
    }
  }

  console.log(`\nDone: ${count} schools provisioned.`);
}

seed().catch(console.error);
