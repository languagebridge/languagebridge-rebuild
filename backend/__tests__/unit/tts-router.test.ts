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

  it('generates audio via Azure TTS on cache miss and uploads to blob', async () => {
    // Cache miss
    mockBlobExists.mockResolvedValue(false);
    mockUpload.mockResolvedValue({});
    mockUpsert.mockResolvedValue({});

    // Mock Azure TTS response
    const axios = require('axios');
    const fakeAudio = Buffer.from('fake-audio-data');
    axios.post.mockResolvedValue({
      data: fakeAudio,
      headers: {},
    });

    process.env.AZURE_TTS_KEY = 'test-tts-key';
    process.env.AZURE_TTS_REGION = 'eastus';

    const response = await ttsRouter(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.source).toBe('azure_live');
    expect(body.cached).toBe(false);
    expect(body.audioUrl).toBe(mockBlobUrl);

    // Verify blob upload was called
    expect(mockUpload).toHaveBeenCalledTimes(1);
    // Verify metadata was written to Cosmos
    expect(mockUpsert).toHaveBeenCalledTimes(1);

    delete process.env.AZURE_TTS_KEY;
    delete process.env.AZURE_TTS_REGION;
  });

  it('returns 500 when TTS key is not configured on cache miss', async () => {
    mockBlobExists.mockResolvedValue(false);
    delete process.env.AZURE_TTS_KEY;
    delete process.env.LB_TTS_SERVICE_URL;

    const response = await ttsRouter(makeRequest(validBody), makeContext());
    expect(response.status).toBe(500);
  });

  it('falls back to Azure TTS when proprietary service fails', async () => {
    mockBlobExists.mockResolvedValue(false);
    mockUpload.mockResolvedValue({});
    mockUpsert.mockResolvedValue({});

    const axios = require('axios');
    const fakeAudio = Buffer.from('azure-audio');

    // First call = proprietary (fails), second call = Azure TTS (succeeds)
    process.env.LB_TTS_SERVICE_URL = 'http://fake-tts.local';
    process.env.AZURE_TTS_KEY = 'test-tts-key';
    process.env.AZURE_TTS_REGION = 'eastus';

    axios.post
      .mockRejectedValueOnce(new Error('Proprietary service down'))
      .mockResolvedValueOnce({ data: fakeAudio, headers: {} });

    // Need axios.isAxiosError to return false for the generic Error
    axios.isAxiosError = jest.fn().mockReturnValue(false);

    const response = await ttsRouter(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.source).toBe('azure_live');
    expect(mockUpload).toHaveBeenCalledTimes(1);

    delete process.env.LB_TTS_SERVICE_URL;
    delete process.env.AZURE_TTS_KEY;
    delete process.env.AZURE_TTS_REGION;
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
