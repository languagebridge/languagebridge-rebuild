import { flagHandler } from '../../azure-functions/flag-handler/index';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { FLAG_THRESHOLDS } from '../../shared/types';

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockRead = jest.fn();
const mockReplace = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getFlagsContainer: () => ({
    item: () => ({
      read: mockRead,
      replace: mockReplace,
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
    headers: new Map(),
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
    sessionToken: 'test-session-123',
    pilotId: 'PCSD-2026',
    timestamp: '2026-03-18T12:00:00Z',
  };

  it('creates a new flag document when none exists', async () => {
    mockRead.mockResolvedValue({ resource: null });
    mockCreate.mockResolvedValue({
      resource: {
        id: 'test-hash',
        word: 'photosynthesis',
        language: 'dari',
        flagCount: 1,
        status: 'logged',
        requiresReview: false,
        pilotIds: ['PCSD-2026'],
        createdAt: '2026-03-18T12:00:00Z',
        lastFlaggedAt: '2026-03-18T12:00:00Z',
      },
    });

    const response = await flagHandler(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.flagCount).toBe(1);
    expect(body.status).toBe('logged');
    expect(body.requiresReview).toBe(false);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('increments existing flag and escalates to review at threshold', async () => {
    mockRead.mockResolvedValue({
      resource: {
        id: 'test-hash',
        word: 'photosynthesis',
        language: 'dari',
        flagCount: 2, // Will become 3 → review threshold
        status: 'logged',
        requiresReview: false,
        pilotIds: ['PCSD-2026'],
        audioUrl: undefined,
        createdAt: '2026-03-18T10:00:00Z',
        lastFlaggedAt: '2026-03-18T11:00:00Z',
      },
    });
    mockReplace.mockResolvedValue({
      resource: {
        id: 'test-hash',
        word: 'photosynthesis',
        language: 'dari',
        flagCount: 3,
        status: 'review',
        requiresReview: true,
        pilotIds: ['PCSD-2026'],
        createdAt: '2026-03-18T10:00:00Z',
        lastFlaggedAt: '2026-03-18T12:00:00Z',
      },
    });

    const response = await flagHandler(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.flagCount).toBe(3);
    expect(body.status).toBe('review');
    expect(body.requiresReview).toBe(true);
  });

  it('escalates to high_priority at threshold', async () => {
    mockRead.mockResolvedValue({
      resource: {
        id: 'test-hash',
        word: 'photosynthesis',
        language: 'dari',
        flagCount: FLAG_THRESHOLDS.HIGH_PRIORITY - 1,
        status: 'bounty',
        requiresReview: true,
        pilotIds: ['PCSD-2026'],
        audioUrl: undefined,
        createdAt: '2026-03-18T10:00:00Z',
        lastFlaggedAt: '2026-03-18T11:00:00Z',
      },
    });
    mockReplace.mockResolvedValue({
      resource: {
        id: 'test-hash',
        word: 'photosynthesis',
        language: 'dari',
        flagCount: FLAG_THRESHOLDS.HIGH_PRIORITY,
        status: 'high_priority',
        requiresReview: true,
        pilotIds: ['PCSD-2026'],
        createdAt: '2026-03-18T10:00:00Z',
        lastFlaggedAt: '2026-03-18T12:00:00Z',
      },
    });

    const response = await flagHandler(makeRequest(validBody), makeContext());
    const body = response.jsonBody as Record<string, unknown>;
    expect(body.status).toBe('high_priority');
  });

  it('rejects missing required fields', async () => {
    const response = await flagHandler(
      makeRequest({ word: 'test' }), // missing language, sessionToken, etc.
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
      headers: new Map(),
      query: new Map(),
      params: {},
      json: async () => { throw new Error('Invalid JSON'); },
    } as unknown as HttpRequest;

    const response = await flagHandler(request, makeContext());
    expect(response.status).toBe(400);
  });
});
