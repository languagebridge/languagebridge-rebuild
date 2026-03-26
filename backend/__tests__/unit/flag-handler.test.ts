import { flagHandler } from '../../azure-functions/flag-handler/index';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { FLAG_THRESHOLDS } from '../../shared/types';

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockPatch = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getFlagsContainer: () => ({
    item: () => ({
      patch: mockPatch,
    }),
    items: {
      create: mockCreate,
    },
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/flag-handler',
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
});

describe('flag-handler', () => {
  const validBody = {
    word: 'photosynthesis',
    language: 'dari',
    studentCode: "LB-TEST1",
    
    timestamp: '2026-03-18T12:00:00Z',
  };

  it('creates a new flag document when none exists', async () => {
    // Patch fails (doc doesn't exist), then create succeeds
    mockPatch.mockRejectedValue(new Error('Not found'));
    mockCreate.mockResolvedValue({ resource: {} });

    const response = await flagHandler(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.flagCount).toBe(1);
    expect(body.status).toBe('logged');
    expect(body.requiresReview).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('increments existing flag and escalates to review at threshold', async () => {
    // First patch (incr) succeeds, returning count of 3
    mockPatch
      .mockResolvedValueOnce({ resource: { flagCount: 3 } })
      // Second patch (set status) succeeds
      .mockResolvedValueOnce({});

    const response = await flagHandler(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.flagCount).toBe(3);
    expect(body.status).toBe('review');
    expect(body.requiresReview).toBe(true);
  });

  it('escalates to high_priority at threshold', async () => {
    mockPatch
      .mockResolvedValueOnce({ resource: { flagCount: FLAG_THRESHOLDS.HIGH_PRIORITY } })
      .mockResolvedValueOnce({});

    const response = await flagHandler(makeRequest(validBody), makeContext());
    const body = response.jsonBody as Record<string, unknown>;
    expect(body.status).toBe('high_priority');
  });

  it('rejects missing required fields', async () => {
    const response = await flagHandler(
      makeRequest({ word: 'test' }), // missing language, studentCode, etc.
      makeContext()
    );
    expect(response.status).toBe(400);
  });

  it('rejects invalid language', async () => {
    const response = await flagHandler(
      makeRequest({ ...validBody, language: 'klingon' }),
      makeContext()
    );
    expect(response.status).toBe(400);
  });

  it('rejects invalid JSON body', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/flag-handler',
      headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
      query: new Map(),
      params: {},
      json: async () => { throw new Error('Invalid JSON'); },
    } as unknown as HttpRequest;

    const response = await flagHandler(request, makeContext());
    expect(response.status).toBe(400);
  });
});
