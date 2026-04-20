/**
 * Integration Test: Full Student Journey
 *
 * Tests the complete flow a student goes through:
 *   1. GET /onboarding/schools → pick a school
 *   2. POST /onboarding/enroll → get a studentCode
 *   3. POST /lexicon-lookup → look up a term
 *   4. POST /tts-router → generate audio
 *   5. POST /flag-handler → flag bad content
 *   6. POST /analytics-writer → log events
 *
 * These tests call the actual exported handler functions with mocked
 * Cosmos DB and Blob Storage — verifying that data flows correctly
 * between functions without hitting real infrastructure.
 */

import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Shared in-memory stores simulating Cosmos DB ──────────────────

const cosmosStore: Record<string, Map<string, Record<string, unknown>>> = {
  pilots: new Map(),
  enrollments: new Map(),
  lexicon: new Map(),
  sessions: new Map(),
  flags: new Map(),
  audio_cache_metadata: new Map(),
  rate_limits: new Map(),
  analytics: new Map(),
};

// Populate pilot school
cosmosStore.pilots.set('greenbriar', {
  id: 'greenbriar',
  schoolCode: 'greenbriar',
  schoolName: 'Greenbriar Middle School',
  pilotId: 'PCSD-2026',
  gradeBands: ['K-2', '3-5', '6-8', '9-12'],
  isActive: true,
});

// Populate one lexicon entry with bridge content
cosmosStore.lexicon.set('photosynthesis_dari_bridge', {
  id: 'photosynthesis_dari_bridge',
  term: 'photosynthesis',
  language: 'dari',
  cognate: null, // Will be backfilled
  bridge_anchor: 'light-feeding',
  bridge_scaffold: 'the way green plants turn light into food',
  bridge_definition: 'the way green plants turn light into food',
  bridge_definition_en: 'the way green plants turn light into food',
  grammatical_forms: { noun: 'plant food-making', verb: null, adjective: null },
  audio_blob_path: null,
  audio_source: null,
  status: 'pending_review',
  version: 1,
  usage_count: 0,
  flag_count: 0,
  subject: 'science',
  grade_band: '6-8',
  transliteration_difficulty: 'high',
  created_by: 'bridge_pipeline_v1',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

// ── Mock factory for Cosmos containers ──────────────────────────

function mockContainer(storeName: string) {
  const store = cosmosStore[storeName];
  return {
    items: {
      query: (q: unknown) => ({
        fetchAll: jest.fn().mockImplementation(async () => {
          // Simple: return all items (real filtering would need SQL parsing)
          return { resources: Array.from(store.values()) };
        }),
      }),
      create: jest.fn().mockImplementation(async (doc: Record<string, unknown>) => {
        const id = doc.id as string;
        if (store.has(id)) {
          const err = new Error('Conflict');
          (err as unknown as { code: number }).code = 409;
          throw err;
        }
        store.set(id, doc);
        return { resource: doc };
      }),
      upsert: jest.fn().mockImplementation(async (doc: Record<string, unknown>) => {
        store.set(doc.id as string, doc);
        return { resource: doc };
      }),
    },
    item: (id: string) => ({
      read: jest.fn().mockImplementation(async () => {
        const doc = store.get(id);
        return { resource: doc ?? null };
      }),
      patch: jest.fn().mockImplementation(async (ops: Array<{ op: string; path: string; value: unknown }>) => {
        const doc = store.get(id);
        if (!doc) throw new Error('Not found');
        for (const op of ops) {
          const field = op.path.replace('/', '');
          if (op.op === 'incr') {
            (doc as Record<string, number>)[field] = ((doc as Record<string, number>)[field] ?? 0) + (op.value as number);
          } else if (op.op === 'set') {
            (doc as Record<string, unknown>)[field] = op.value;
          }
        }
        store.set(id, doc);
        return { resource: doc };
      }),
    }),
  };
}

// ── Mock all shared modules ───────────────────────────────────

jest.mock('../../shared/cosmos-client', () => ({
  getPilotsContainer: () => mockContainer('pilots'),
  getEnrollmentsContainer: () => mockContainer('enrollments'),
  getLexiconContainer: () => mockContainer('lexicon'),
  getSessionsContainer: () => mockContainer('sessions'),
  getFlagsContainer: () => mockContainer('flags'),
  getAudioCacheMetadataContainer: () => mockContainer('audio_cache_metadata'),
  getAnalyticsContainer: () => mockContainer('analytics'),
  getRateLimitContainer: () => mockContainer('rate_limits'),
}));

const mockBlobUrl = 'https://storage.blob.core.windows.net/tts-audio-cache/dari/test.mp3?sas=token';
jest.mock('../../shared/blob-client', () => ({
  getAudioCacheContainer: () => ({
    getBlobClient: () => ({ exists: jest.fn().mockResolvedValue(false), url: mockBlobUrl }),
    getBlockBlobClient: () => ({ upload: jest.fn().mockResolvedValue({}), url: mockBlobUrl }),
  }),
  generateSasUrl: () => mockBlobUrl,
}));

jest.mock('axios', () => ({
  post: jest.fn().mockResolvedValue({
    data: Buffer.from('fake-audio'),
    headers: {},
  }),
  isAxiosError: jest.fn().mockReturnValue(false),
}));

// ── Import handlers AFTER mocks ───────────────────────────────

import { getSchools, enroll } from '../../azure-functions/onboarding/index';
import { lexiconLookup } from '../../azure-functions/lexicon-lookup/index';
import { ttsRouter } from '../../azure-functions/tts-router/index';
import { flagHandler } from '../../azure-functions/flag-handler/index';
import { analyticsWriter } from '../../azure-functions/analytics-writer/index';

// ── Helpers ───────────────────────────────────────────────────

function makeRequest(method: string, body?: Record<string, unknown>): HttpRequest {
  return {
    method,
    url: `http://localhost/api/test`,
    headers: new Map([['x-lb-api-key', 'test-api-key-for-jest'], ['x-forwarded-for', '127.0.0.1']]),
    query: new Map(),
    params: {},
    json: body ? async () => body : async () => { throw new Error('No body'); },
  } as unknown as HttpRequest;
}

function ctx(): InvocationContext {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as InvocationContext;
}

// ── Tests ─────────────────────────────────────────────────────

describe('Student Journey Integration', () => {
  let studentCode: string;

  beforeAll(() => {
    process.env.AZURE_TTS_KEY = 'test-key';
    process.env.AZURE_TTS_REGION = 'eastus';
    process.env.AZURE_TRANSLATOR_KEY = 'test-key';
    process.env.AZURE_TRANSLATOR_REGION = 'eastus';
  });

  afterAll(() => {
    delete process.env.AZURE_TTS_KEY;
    delete process.env.AZURE_TTS_REGION;
    delete process.env.AZURE_TRANSLATOR_KEY;
    delete process.env.AZURE_TRANSLATOR_REGION;
  });

  it('Step 1: GET /onboarding/schools returns school list', async () => {
    const res = await getSchools(makeRequest('GET'), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as { schools: Array<{ schoolCode: string }> };
    expect(body.schools.length).toBeGreaterThan(0);
    expect(body.schools[0].schoolCode).toBe('greenbriar');
  });

  it('Step 2: POST /onboarding/enroll creates a student code', async () => {
    const res = await enroll(makeRequest('POST', {
      schoolCode: 'greenbriar',
      gradeBand: '6-8',
      language: 'dari',
    }), ctx());
    expect([200, 201]).toContain(res.status);

    const body = res.jsonBody as { studentCode: string };
    expect(body.studentCode).toMatch(/^LB-[A-HJ-NP-Z2-9]{4,8}$/);
    studentCode = body.studentCode;

    // Verify enrollment was persisted
    expect(cosmosStore.enrollments.has(studentCode)).toBe(true);
  });

  it('Step 3: POST /lexicon-lookup returns bridge definition with backfilled cognate', async () => {
    const res = await lexiconLookup(makeRequest('POST', {
      term: 'photosynthesis',
      language: 'dari',
      studentCode,
    }), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.type).toBe('bridge');
    expect(body.bridge_anchor).toBe('light-feeding');
    expect(body.source).toBe('lexicon');
    // Cognate should be backfilled from translator mock
    expect(body.cognate).toBeTruthy();
  });

  it('Step 4: POST /tts-router generates audio', async () => {
    const res = await ttsRouter(makeRequest('POST', {
      text: 'فتوسنتز',
      language: 'dari',
      studentCode,
    }), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.audioUrl).toBeTruthy();
    expect(body.cached).toBe(false);
  });

  it('Step 5: POST /flag-handler flags content', async () => {
    const res = await flagHandler(makeRequest('POST', {
      flaggedText: 'The pronunciation of فتوسنتز sounds incorrect',
      language: 'dari',
      studentCode,
      timestamp: new Date().toISOString(),
      flagType: 'pronunciation',
    }), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.flagCount).toBe(1);
    expect(body.status).toBe('logged');
  });

  it('Step 6: POST /analytics-writer logs a term_lookup event', async () => {
    const res = await analyticsWriter(makeRequest('POST', {
      studentCode,
      language: 'dari',
      eventType: 'term_lookup',
      timestamp: new Date().toISOString(),
      extensionVersion: '2.0.0',
      term: 'photosynthesis',
      subject: 'science',
      source: 'lexicon',
    }), ctx());
    expect(res.status).toBe(200);

    const body = res.jsonBody as Record<string, unknown>;
    expect(body.logged).toBe(true);
    expect(body.eventId).toBeTruthy();
  });

  it('Step 7: Flag escalation across multiple requests reaches bounty', async () => {
    // Flag the same text 5 more times to reach bounty threshold (6)
    for (let i = 0; i < 5; i++) {
      const res = await flagHandler(makeRequest('POST', {
        flaggedText: 'The pronunciation of فتوسنتز sounds incorrect',
        language: 'dari',
        studentCode,
        timestamp: new Date().toISOString(),
        flagType: 'pronunciation',
      }), ctx());
      expect(res.status).toBe(200);
    }

    // 6th flag — should be 'bounty'
    const finalRes = await flagHandler(makeRequest('POST', {
      flaggedText: 'The pronunciation of فتوسنتز sounds incorrect',
      language: 'dari',
      studentCode,
      timestamp: new Date().toISOString(),
      flagType: 'pronunciation',
    }), ctx());
    expect(finalRes.status).toBe(200);

    const body = finalRes.jsonBody as Record<string, unknown>;
    expect(body.status).toBe('bounty');
    expect(body.requiresReview).toBe(true);
  });
});
