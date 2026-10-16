import { lexiconLookup } from '../../azure-functions/lexicon-lookup/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockPatch = jest.fn();
const mockUpsert = jest.fn();
const mockAnalyticsCreate = jest.fn();
const mockCacheRead = jest.fn();
const mockCacheUpsert = jest.fn();

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
  getLexiconMachineCacheContainer: () => ({
    item: () => ({ read: mockCacheRead }),
    items: { upsert: mockCacheUpsert },
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
  mockCacheRead.mockResolvedValue({ resource: undefined });
  mockCacheUpsert.mockReturnValue({ catch: jest.fn() });
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

  it('never caches a translator echo of the input (e.g. French "les" looked up as Somali)', async () => {
    mockQuery.mockResolvedValue({ resources: [] });
    const axios = require('axios');
    axios.post.mockResolvedValue({ data: [{ translations: [{ text: 'les' }] }] });
    process.env.AZURE_TRANSLATOR_KEY = 'test-key';
    process.env.AZURE_TRANSLATOR_REGION = 'eastus';

    const response = await lexiconLookup(makeRequest({ ...validBody, term: 'Les', language: 'somali' }), makeContext());
    expect(response.status).toBe(200);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockCacheUpsert).not.toHaveBeenCalled();
    expect((response.jsonBody as Record<string, unknown>).cognate).toBeNull();

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

  it('fills a missing cognate from Azure WITHOUT writing it into the Lexicon row', async () => {
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
    expect(body.provenance).toBe('machine');
    // Lexicon row only gets its usage count; the Azure answer goes to the machine cache
    expect(mockPatch).toHaveBeenCalledWith([{ op: 'incr', path: '/usage_count', value: 1 }]);
    expect(mockCacheUpsert).toHaveBeenCalledWith(expect.objectContaining({ cognate: 'فتوسنتز', language: 'dari', source: 'azure_translator' }));

    delete process.env.AZURE_TRANSLATOR_KEY;
    delete process.env.AZURE_TRANSLATOR_REGION;
  });

  it('merges the RBERN translation and the bridge gloss for the same term — no Azure call', async () => {
    mockQuery.mockResolvedValue({
      resources: [
        { id: 'p_dari_bridge', term: 'photosynthesis', language: 'dari', cognate: null, bridge_anchor: 'light-feeding', bridge_scaffold: 'how plants make food', status: 'pending_review', created_by: 'bridge_pipeline_v1', version: 1 },
        { id: 'p_dari_rbern', term: 'photosynthesis', language: 'dari', cognate: 'فتوسنتز', bridge_anchor: null, status: 'pending_review', created_by: 'rbern_glossary', version: 1 },
      ],
    });
    const axios = require('axios');
    axios.post.mockClear();

    const response = await lexiconLookup(makeRequest(validBody), makeContext());
    const body = response.jsonBody as Record<string, unknown>;
    expect(body).toMatchObject({ cognate: 'فتوسنتز', bridge_anchor: 'light-feeding', type: 'bridge', provenance: 'glossary', entry_id: 'p_dari_rbern' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('serves a cached machine translation without calling Azure', async () => {
    mockQuery.mockResolvedValue({ resources: [] });
    mockCacheRead.mockResolvedValue({ resource: { cognate: 'ترجمه' } });
    const axios = require('axios');
    axios.post.mockClear();

    const response = await lexiconLookup(makeRequest({ ...validBody, term: 'mitochondria' }), makeContext());
    expect((response.jsonBody as Record<string, unknown>).cognate).toBe('ترجمه');
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('never caches a whole passage as a term', async () => {
    mockQuery.mockResolvedValue({ resources: [] });
    const axios = require('axios');
    axios.post.mockResolvedValue({ data: [{ translations: [{ text: 'متن طولانی' }] }] });
    process.env.AZURE_TRANSLATOR_KEY = 'test-key';
    process.env.AZURE_TRANSLATOR_REGION = 'eastus';

    await lexiconLookup(makeRequest({ ...validBody, term: 'what document established the first national government of the united states' }), makeContext());
    expect(mockCacheUpsert).not.toHaveBeenCalled();
    expect(mockUpsert).not.toHaveBeenCalled();

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
