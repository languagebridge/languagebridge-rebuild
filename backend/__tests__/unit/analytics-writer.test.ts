import { analyticsWriter } from '../../azure-functions/analytics-writer/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockCreate = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getSessionsContainer: () => ({
    items: { create: mockCreate },
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/analytics-writer',
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
  mockCreate.mockResolvedValue({});
});

describe('analytics-writer', () => {
  const validBody = {
    studentCode: "LB-TEST1",
    
    language: 'dari',
    eventType: 'session_start',
    timestamp: '2026-03-18T12:00:00Z',
    extensionVersion: '2.0.0',
  };

  it('logs a valid event and returns eventId', async () => {
    const response = await analyticsWriter(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.logged).toBe(true);
    expect(body.eventId).toBeDefined();
    expect(body.timestamp).toBeDefined();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it('rejects payloads with PII — runs before any other check', async () => {
    const response = await analyticsWriter(
      makeRequest({ ...validBody, email: 'student@school.edu' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('PII_VIOLATION');
    expect(mockCreate).not.toHaveBeenCalled(); // Never reached Cosmos
  });

  it('rejects multiple PII fields and lists them', async () => {
    const response = await analyticsWriter(
      makeRequest({ ...validBody, firstName: 'John', ssn: '123-45-6789' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('PII_VIOLATION');
    expect(body.prohibitedFields).toEqual(expect.arrayContaining(['firstName', 'ssn']));
  });

  it('rejects invalid event type', async () => {
    const response = await analyticsWriter(
      makeRequest({ ...validBody, eventType: 'invalid_event' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('INVALID_EVENT_TYPE');
  });

  it('accepts all valid event types', async () => {
    const eventTypes = ['session_start', 'tts_request', 'flag_event', 'session_end', 'glossary_view'];
    for (const eventType of eventTypes) {
      mockCreate.mockResolvedValue({});
      const response = await analyticsWriter(
        makeRequest({ ...validBody, eventType }),
        makeContext()
      );
      expect(response.status).toBe(200);
    }
  });

  it('rejects missing required fields', async () => {
    const response = await analyticsWriter(
      makeRequest({ studentCode: "LB-TEST1" }),
      makeContext()
    );
    expect(response.status).toBe(400);
  });

  it('rejects invalid language', async () => {
    const response = await analyticsWriter(
      makeRequest({ ...validBody, language: 'klingon' }),
      makeContext()
    );
    expect(response.status).toBe(400);
  });

  it('returns 500 when Cosmos write fails', async () => {
    mockCreate.mockRejectedValue(new Error('Cosmos error'));

    const response = await analyticsWriter(makeRequest(validBody), makeContext());
    expect(response.status).toBe(500);
  });
});
