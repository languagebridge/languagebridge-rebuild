import { ttsRouter } from '../../azure-functions/tts-router/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock Cosmos DB & Blob Storage ───────────────────────────────────

const mockBlobExists = jest.fn();
const mockBlobUrl = 'https://storage.blob.core.windows.net/tts-audio-cache/dari/abc.mp3';
const mockUpload = jest.fn();
const mockPatch = jest.fn();
const mockUpsert = jest.fn();

jest.mock('../../shared/blob-client', () => ({
  getAudioCacheContainer: () => ({
    getBlobClient: () => ({
      exists: mockBlobExists,
      url: mockBlobUrl,
    }),
    getBlockBlobClient: () => ({
      upload: mockUpload,
      url: mockBlobUrl,
    }),
  }),
  generateSasUrl: () => mockBlobUrl,
}));

jest.mock('../../shared/cosmos-client', () => ({
  getAudioCacheMetadataContainer: () => ({
    item: () => ({ patch: mockPatch }),
    items: { upsert: mockUpsert },
  }),
}));

jest.mock('axios');

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/tts-router',
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
  mockPatch.mockResolvedValue({});
  mockUpsert.mockResolvedValue({});
});

describe('tts-router', () => {
  const validBody = {
    text: 'photosynthesis',
    language: 'dari',
    
    studentCode: "LB-TEST1",
  };

  it('returns cached audio on blob hit', async () => {
    mockBlobExists.mockResolvedValue(true);

    const response = await ttsRouter(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.source).toBe('azure_cache');
    expect(body.cached).toBe(true);
    expect(body.audioUrl).toBe(mockBlobUrl);
  });

  it('increments cache hit count atomically on cache hit', async () => {
    mockBlobExists.mockResolvedValue(true);

    await ttsRouter(makeRequest(validBody), makeContext());
    expect(mockPatch).toHaveBeenCalledWith([
      { op: 'incr', path: '/hitCount', value: 1 },
    ]);
  });

  it('rejects missing fields', async () => {
    const response = await ttsRouter(
      makeRequest({ text: 'hello' }),
      makeContext()
    );
    expect(response.status).toBe(400);
  });

  it('rejects text over 500 characters', async () => {
    const response = await ttsRouter(
      makeRequest({ ...validBody, text: 'a'.repeat(501) }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('TEXT_TOO_LONG');
  });

  it('rejects invalid language', async () => {
    const response = await ttsRouter(
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
      url: 'http://localhost/api/tts-router',
      headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
      json: async () => { throw new Error('Invalid JSON'); },
    } as unknown as HttpRequest;

    const response = await ttsRouter(request, makeContext());
    expect(response.status).toBe(400);
  });
});
