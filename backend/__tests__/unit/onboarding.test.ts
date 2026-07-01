import { getSchools, enroll } from '../../azure-functions/onboarding/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockFetchAll = jest.fn();
const mockCreate = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getPilotsContainer: () => ({
    items: {
      query: () => ({ fetchAll: mockFetchAll }),
    },
  }),
  getEnrollmentsContainer: () => ({
    items: {
      create: mockCreate,
    },
  }),
  getRateLimitContainer: () => ({
    item: () => ({ patch: jest.fn().mockResolvedValue({ resource: { count: 1 } }) }),
    items: { create: jest.fn().mockResolvedValue({}) },
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeGetRequest(): HttpRequest {
  return {
    method: 'GET',
    url: 'http://localhost/api/onboarding/schools',
    headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
    query: new Map(),
    params: {},
  } as unknown as HttpRequest;
}

function makePostRequest(body: Record<string, unknown>): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/onboarding/enroll',
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

describe('onboarding — getSchools', () => {
  it('returns list of pilot schools', async () => {
    mockFetchAll.mockResolvedValue({
      resources: [
        { schoolCode: 'greenbriar', schoolName: 'Greenbriar Elementary', gradeBands: ['K-2', '3-5'] },
        { schoolCode: 'riverside', schoolName: 'Riverside Middle', gradeBands: ['6-8'] },
      ],
    });

    const response = await getSchools(makeGetRequest(), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as { schools: Array<{ schoolCode: string }> };
    expect(body.schools).toHaveLength(2);
    expect(body.schools[0].schoolCode).toBe('greenbriar');
  });

  it('returns 500 when Cosmos DB fails', async () => {
    mockFetchAll.mockRejectedValue(new Error('Cosmos unavailable'));

    const response = await getSchools(makeGetRequest(), makeContext());
    expect(response.status).toBe(500);
  });
});

describe('onboarding — enroll', () => {
  const validBody = {
    schoolCode: 'greenbriar',
    gradeBand: 'K-2',
    language: 'dari',
  };

  it('creates enrollment and returns student code', async () => {
    // School validation
    mockFetchAll.mockResolvedValue({ resources: [{ id: 'greenbriar' }] });
    // Enrollment create
    mockCreate.mockResolvedValue({ resource: {} });

    const response = await enroll(makePostRequest(validBody), makeContext());
    expect(response.status).toBe(201);

    const body = response.jsonBody as { studentCode: string; schoolCode: string };
    expect(body.studentCode).toMatch(/^LB-[A-HJ-NP-Z2-9]{6}$/);
    expect(body.schoolCode).toBe('greenbriar');
  });

  it('rejects missing required fields', async () => {
    const response = await enroll(
      makePostRequest({ schoolCode: 'greenbriar' }), // missing gradeBand, language
      makeContext()
    );
    expect(response.status).toBe(400);
    const body = response.jsonBody as { error: string };
    expect(body.error).toBe('MISSING_FIELDS');
  });

  it('rejects invalid language', async () => {
    const response = await enroll(
      makePostRequest({ ...validBody, language: 'klingon' }),
      makeContext()
    );
    expect(response.status).toBe(400);
    const body = response.jsonBody as { error: string };
    expect(body.error).toBe('INVALID_LANGUAGE');
  });

  it('rejects invalid grade band', async () => {
    const response = await enroll(
      makePostRequest({ ...validBody, gradeBand: '13-16' }),
      makeContext()
    );
    expect(response.status).toBe(400);
    const body = response.jsonBody as { error: string };
    expect(body.error).toBe('INVALID_GRADE_BAND');
  });

  it('rejects invalid school code', async () => {
    mockFetchAll.mockResolvedValue({ resources: [] }); // school not found

    const response = await enroll(
      makePostRequest({ ...validBody, schoolCode: 'nonexistent' }),
      makeContext()
    );
    expect(response.status).toBe(400);
    const body = response.jsonBody as { error: string };
    expect(body.error).toBe('INVALID_SCHOOL');
  });

  it('retries on student code collision (409)', async () => {
    mockFetchAll.mockResolvedValue({ resources: [{ id: 'greenbriar' }] });
    // First create fails with 409, second succeeds
    mockCreate
      .mockRejectedValueOnce({ code: 409 })
      .mockResolvedValueOnce({ resource: {} });

    const response = await enroll(makePostRequest(validBody), makeContext());
    expect(response.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it('returns 500 after all collision retries exhausted', async () => {
    mockFetchAll.mockResolvedValue({ resources: [{ id: 'greenbriar' }] });
    mockCreate
      .mockRejectedValueOnce({ code: 409 })
      .mockRejectedValueOnce({ code: 409 })
      .mockRejectedValueOnce({ code: 409 });

    const response = await enroll(makePostRequest(validBody), makeContext());
    expect(response.status).toBe(500);
  });

  it('rejects invalid JSON body', async () => {
    const request = {
      method: 'POST',
      url: 'http://localhost/api/onboarding/enroll',
      headers: new Map([['x-lb-api-key', 'test-api-key-for-jest']]),
      query: new Map(),
      params: {},
      json: async () => { throw new Error('Invalid JSON'); },
    } as unknown as HttpRequest;

    const response = await enroll(request, makeContext());
    expect(response.status).toBe(400);
  });
});
