/**
 * Integration tests for the student-facing flow:
 *   highlight word → lexicon lookup → get bridge phrase → play audio
 *
 * These tests hit real Azure Function handlers with mocked Cosmos/Blob clients.
 * Run with: npx vitest run tests/integration
 */

import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock Azure clients before importing handlers
vi.mock('../../backend/shared/cosmos-client', () => ({
  getLexiconContainer: () => ({
    items: {
      query: () => ({
        fetchAll: () => Promise.resolve({
          resources: [{
            id: 'photosynthesis_dari_bridge',
            term: 'photosynthesis',
            language: 'dari',
            bridge_anchor: 'light-feeding',
            bridge_scaffold: 'the way green plants turn light, water, and air into food they can use',
            bridge_definition: 'the way green plants turn light, water, and air into food they can use',
            cognate: 'فوتوسنتز',
            audio_blob_path: null,
            audio_source: null,
            grammatical_forms: { noun: 'plant food-making from light', verb: null, adjective: null },
            subject: 'science',
            subjects: 'science',
            grade_band: '6-8',
            grade_bands: '6-8|9-12',
            transliteration_difficulty: 'high',
            usage_count: 5,
            flag_count: 0,
            status: 'active',
          }],
        }),
      }),
    },
    item: () => ({
      patch: () => Promise.resolve(),
    }),
  }),
  getAnalyticsContainer: () => ({
    items: { upsert: () => Promise.resolve() },
  }),
  getSessionsContainer: () => ({
    items: { upsert: () => Promise.resolve() },
  }),
  getAudioCacheMetadataContainer: () => ({
    items: {
      query: () => ({ fetchAll: () => Promise.resolve({ resources: [] }) }),
      upsert: () => Promise.resolve(),
    },
    item: () => ({ patch: () => Promise.resolve() }),
  }),
  getFlagsContainer: () => ({
    items: {
      query: () => ({ fetchAll: () => Promise.resolve({ resources: [] }) }),
      upsert: () => Promise.resolve({ resource: { id: 'test', flagCount: 1, status: 'logged', requiresReview: false } }),
      create: () => Promise.resolve({ resource: { id: 'test', word: 'photosynthesis', language: 'dari', flagCount: 1, status: 'logged', requiresReview: false, schoolCodes: [] } }),
    },
    item: () => ({
      read: () => Promise.resolve({ resource: null }),
      replace: () => Promise.resolve({ resource: null }),
      patch: () => Promise.resolve(),
    }),
  }),
}));

vi.mock('../../backend/shared/blob-client', () => ({
  getAudioCacheContainer: () => ({
    getBlockBlobClient: () => ({
      exists: () => Promise.resolve(false),
      upload: () => Promise.resolve(),
      url: 'https://mock-blob.test/audio/test.wav',
    }),
  }),
}));

vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue({
      status: 200,
      data: new ArrayBuffer(100),
      headers: { 'content-type': 'audio/wav' },
    }),
  },
}));

// Import handlers after mocks are set up
const { lexiconLookup } = await import('../../backend/azure-functions/lexicon-lookup/index');
const { flagHandler } = await import('../../backend/azure-functions/flag-handler/index');
const { analyticsWriter } = await import('../../backend/azure-functions/analytics-writer/index');

function mockRequest(body: unknown, headers: Record<string, string> = {}): any {
  return {
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => headers[name] ?? null },
  };
}

function mockContext(): any {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('Student flow: highlight → lookup → bridge phrase', () => {
  it('returns bridge phrase for known term', async () => {
    const req = mockRequest({
      term: 'photosynthesis',
      language: 'dari',
      
      studentCode: 'LB-TEST1',
    });

    const res = await lexiconLookup(req, mockContext());

    expect(res.status).toBe(200);
    const body = res.jsonBody ?? JSON.parse(res.body as string);
    expect(body.term).toBe('photosynthesis');
    expect(body.bridge_anchor).toBe('light-feeding');
    expect(body.bridge_scaffold).toContain('green plants');
    expect(body.source).toBe('lexicon');
    expect(body.cognate).toBe('فوتوسنتز');
  });

  it('returns subject and grade band metadata', async () => {
    const req = mockRequest({
      term: 'photosynthesis',
      language: 'dari',
      
      studentCode: 'LB-TEST1',
    });

    const res = await lexiconLookup(req, mockContext());
    const body = res.jsonBody ?? JSON.parse(res.body as string);

    expect(body.subject).toBe('science');
    expect(body.grade_band).toBe('6-8');
    expect(body.transliteration_difficulty).toBe('high');
  });

  it('returns grammatical forms when available', async () => {
    const req = mockRequest({
      term: 'photosynthesis',
      language: 'dari',
      
      studentCode: 'LB-TEST1',
    });

    const res = await lexiconLookup(req, mockContext());
    const body = res.jsonBody ?? JSON.parse(res.body as string);

    expect(body.grammatical_forms).toBeDefined();
    expect(body.grammatical_forms.noun).toBe('plant food-making from light');
  });
});

describe('Student flow: validation guards', () => {
  it('rejects missing required fields', async () => {
    const req = mockRequest({ term: 'hello' }); // missing language, studentCode
    const res = await lexiconLookup(req, mockContext());
    expect(res.status).toBe(400);
  });

  it('rejects invalid language', async () => {
    const req = mockRequest({
      term: 'hello',
      language: 'klingon',
      
      studentCode: 'LB-TEST1',
    });
    const res = await lexiconLookup(req, mockContext());
    expect(res.status).toBe(400);
  });

  it('rejects request with PII in analytics', async () => {
    const req = mockRequest({
      studentCode: 'LB-TEST1',
      
      language: 'dari',
      eventType: 'session_start',
      timestamp: new Date().toISOString(),
      email: 'student@school.edu', // PII violation
    });
    const res = await analyticsWriter(req, mockContext());
    expect(res.status).toBe(400);
    const body = res.jsonBody as any;
    expect(body.error).toBe('PII_VIOLATION');
  });
});

describe('Student flow: flag bad audio', () => {
  it('creates a new flag and returns count', async () => {
    const req = mockRequest({
      word: 'photosynthesis',
      language: 'dari',
      studentCode: 'LB-TEST1',
      
      timestamp: new Date().toISOString(),
    });
    const res = await flagHandler(req, mockContext());
    expect(res.status).toBe(200);
    const body = res.jsonBody as any;
    expect(body.flagId).toBeDefined();
    expect(body.flagCount).toBeGreaterThanOrEqual(1);
  });
});
