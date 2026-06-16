import { lexiconLookup } from '../../azure-functions/lexicon-lookup/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockPatch = jest.fn();
const mockUpsert = jest.fn();
const mockAnalyticsCreate = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getLexiconContainer: () => ({
    items: {
      query: () => ({ fetchAll: mockQuery }),
      upsert: mockUpsert,
    },
    item: () => ({ patch: mockPatch }),
  }),
  getAnalyticsContainer: () => ({
    items: { create: mockAnalyticsCreate },
  }),
  getRateLimitContainer: () => ({
    item: () => ({ patch: jest.fn().mockResolvedValue({ resource: { count: 1 } }) }),
    items: { create: jest.fn().mockResolvedValue({}) },
  }),
}));

jest.mock('axios');

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/lexicon-lookup',
    headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
    query: new Map(),
    params: {},
    json: async () => body,
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return {
    log: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  } as unknown as InvocationContext;
}

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockPatch.mockReturnValue({ catch: jest.fn() });
  mockUpsert.mockReturnValue({ catch: jest.fn() });
  mockAnalyticsCreate.mockReturnValue({ catch: jest.fn() });
});

describe('lexicon-lookup', () => {
  const validBody = {
    term: 'photosynthesis',
    language: 'dari',
    
    studentCode: "LB-TEST7",
  };

  it('returns bridge definition when lexicon entry exists', async () => {
    mockQuery.mockResolvedValue({
      resources: [{
        id: 'photosynthesis_dari_rbern',
        term: 'photosynthesis',
        language: 'dari',
        cognate: 'فوتوسنتز',
        bridge_definition: 'روندی که گیاهان از نور آفتاب غذا می‌سازند',
        bridge_definition_en: 'The process where plants make food from sunlight',
        audio_blob_path: null,
        audio_source: null,
        status: 'approved',
        version: 1,
        usage_count: 5,
      }],
    });

    const response = await lexiconLookup(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.source).toBe('lexicon');
    expect(body.type).toBe('bridge');
    expect(body.cognate).toBe('فوتوسنتز');
    expect(body.bridge_definition).toBe('روندی که گیاهان از نور آفتاب غذا می‌سازند');
  });

  it('returns cognate-only entry from lexicon', async () => {
    mockQuery.mockResolvedValue({
      resources: [{
        id: 'absorb_dari_rbern',
        term: 'absorb',
        language: 'dari',
        cognate: 'ندرک بذج',
        bridge_definition: null,
        bridge_definition_en: null,
        audio_blob_path: null,
        audio_source: null,
        status: 'pending_review',
        version: 1,
        usage_count: 0,
      }],
    });

    const response = await lexiconLookup(makeRequest({ ...validBody, term: 'absorb' }), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.source).toBe('lexicon');
    expect(body.cognate).toBe('ندرک بذج');
  });

  it('falls back to translator when no lexicon entry exists', async () => {
    mockQuery.mockResolvedValue({ resources: [] });

    // Mock Azure Translator
    const axios = require('axios');
    axios.post.mockResolvedValue({
      data: [{ translations: [{ text: 'ترجمه' }] }],
    });

    // Set env vars for translator
    process.env.AZURE_TRANSLATOR_KEY = 'test-key';
    process.env.AZURE_TRANSLATOR_REGION = 'eastus';

    const response = await lexiconLookup(
      makeRequest({ ...validBody, term: 'mitochondria' }),
      makeContext()
    );
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.source).toBe('translator_fallback');
    expect(body.type).toBe('cognate');
    expect(body.cognate).toBe('ترجمه');

    delete process.env.AZURE_TRANSLATOR_KEY;
    delete process.env.AZURE_TRANSLATOR_REGION;
  });

  it('increments usage_count on lexicon hit when cognate exists', async () => {
    mockQuery.mockResolvedValue({
      resources: [{
        id: 'test_dari_rbern',
        term: 'test',
        language: 'dari',
        cognate: 'آزمایش',
        bridge_definition: null,
        bridge_definition_en: null,
        audio_blob_path: null,
        audio_source: null,
        version: 1,
        usage_count: 3,
      }],
    });

    await lexiconLookup(makeRequest({ ...validBody, term: 'test' }), makeContext());
    expect(mockPatch).toHaveBeenCalledWith([
      { op: 'incr', path: '/usage_count', value: 1 },
    ]);
  });

  it('backfills cognate via translator when lexicon entry has null cognate', async () => {
    mockQuery.mockResolvedValue({
      resources: [{
        id: 'test_dari_bridge',
        term: 'photosynthesis',
        language: 'dari',
        cognate: null,
        bridge_definition: 'the way plants make food',
        bridge_definition_en: 'the way plants make food',
        audio_blob_path: null,
        audio_source: null,
        version: 1,
        usage_count: 0,
      }],
    });

    const axios = require('axios');
    axios.post.mockResolvedValue({
      data: [{ translations: [{ text: 'فتوسنتز' }] }],
    });

    process.env.AZURE_TRANSLATOR_KEY = 'test-key';
    process.env.AZURE_TRANSLATOR_REGION = 'eastus';

    const response = await lexiconLookup(makeRequest(validBody), makeContext());
    const body = response.jsonBody as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body.source).toBe('lexicon');
    expect(body.cognate).toBe('فتوسنتز');
    // Should patch both cognate and usage_count
    expect(mockPatch).toHaveBeenCalledWith([
      { op: 'set', path: '/cognate', value: 'فتوسنتز' },
      { op: 'incr', path: '/usage_count', value: 1 },
    ]);

    delete process.env.AZURE_TRANSLATOR_KEY;
    delete process.env.AZURE_TRANSLATOR_REGION;
  });

  it('rejects missing required fields', async () => {
    const response = await lexiconLookup(
      makeRequest({ term: 'hello' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('MISSING_FIELDS');
  });

  it('rejects invalid language', async () => {
    const response = await lexiconLookup(
      makeRequest({ ...validBody, language: 'klingon' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('INVALID_LANGUAGE');
  });

  it('rejects invalid JSON body', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/lexicon-lookup',
      headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
      json: async () => { throw new Error('Invalid JSON'); },
    } as unknown as HttpRequest;

    const response = await lexiconLookup(request, makeContext());
    expect(response.status).toBe(400);
  });
});
