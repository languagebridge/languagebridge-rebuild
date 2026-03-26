import { dashboard } from '../../azure-functions/dashboard/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock auth-helpers ───────────────────────────────────────────────

const mockResolveAuth = jest.fn();

jest.mock('../../shared/auth-helpers', () => ({
  resolveAuthContext: (...args: unknown[]) => mockResolveAuth(...args),
}));

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockFetchAll = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getSessionsContainer: () => ({
    items: {
      query: () => ({ fetchAll: mockFetchAll }),
    },
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(body: Record<string, unknown>, token = 'valid-token'): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/dashboard',
    headers: new Map([
      ['authorization', `Bearer ${token}`],
      ['x-lb-api-key', 'test-api-key-for-jest'],
    ]),
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

const teacherAuth = {
  authenticated: true,
  context: {
    userId: 'teacher-1',
    email: 'teacher@school.edu',
    accessiblePilotIds: ['PCSD-2026'],
    accessibleSchoolCodes: ['greenbriar'],
    isSuperAdmin: false,
    permissions: ['view_dashboard', 'manage_flags'],
  },
};

const superAdminAuth = {
  authenticated: true,
  context: {
    userId: 'admin-1',
    email: 'justin@languagebridge.app',
    accessiblePilotIds: [],
    accessibleSchoolCodes: ['greenbriar', 'riverside'],
    isSuperAdmin: true,
    permissions: ['view_dashboard', 'export_data', 'manage_flags', 'manage_users'],
  },
};

const validBody = {
  query: 'usage_by_week',
  schoolCode: 'greenbriar',
  gradeBand: 'K-2',
  startDate: '2026-03-01',
  endDate: '2026-03-31',
};

// ── Tests ───────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAll.mockResolvedValue({ resources: [{ day: '2026-03-15', eventType: 'term_lookup', language: 'dari', count: 42 }] });
});

describe('dashboard', () => {
  it('returns query results for authorized teacher', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);

    const response = await dashboard(makeRequest(validBody), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.query).toBe('usage_by_week');
    expect(body.schoolCode).toBe('greenbriar');
    expect(body.count).toBe(1);
    expect(body.results).toHaveLength(1);
  });

  it('blocks teacher from querying another school', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);

    const response = await dashboard(
      makeRequest({ ...validBody, schoolCode: 'riverside' }),
      makeContext()
    );
    expect(response.status).toBe(403);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('FORBIDDEN');
  });

  it('allows super admin to query any school', async () => {
    mockResolveAuth.mockResolvedValue(superAdminAuth);

    const response = await dashboard(
      makeRequest({ ...validBody, schoolCode: 'riverside' }),
      makeContext()
    );
    expect(response.status).toBe(200);
  });

  it('rejects unauthenticated requests', async () => {
    mockResolveAuth.mockResolvedValue({
      authenticated: false,
      status: 401,
      error: 'MISSING_TOKEN',
      details: 'Authorization header with Bearer token is required',
    });

    const response = await dashboard(makeRequest(validBody, ''), makeContext());
    expect(response.status).toBe(401);
  });

  it('rejects users without view_dashboard permission', async () => {
    mockResolveAuth.mockResolvedValue({
      authenticated: true,
      context: {
        ...teacherAuth.context,
        permissions: ['manage_flags'], // no view_dashboard
      },
    });

    const response = await dashboard(makeRequest(validBody), makeContext());
    expect(response.status).toBe(403);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('FORBIDDEN');
  });

  it('rejects invalid query name', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);

    const response = await dashboard(
      makeRequest({ ...validBody, query: 'drop_table' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('INVALID_QUERY');
  });

  it('rejects missing fields', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);

    const response = await dashboard(
      makeRequest({ query: 'usage_by_week' }), // missing schoolCode, etc.
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('MISSING_FIELDS');
  });

  it('rejects invalid grade band', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);

    const response = await dashboard(
      makeRequest({ ...validBody, gradeBand: '13-16' }),
      makeContext()
    );
    expect(response.status).toBe(400);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('INVALID_GRADE_BAND');
  });

  it('returns 500 when Cosmos query fails', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);
    mockFetchAll.mockRejectedValue(new Error('Cosmos unavailable'));

    const response = await dashboard(makeRequest(validBody), makeContext());
    expect(response.status).toBe(500);
  });

  it('supports all valid query names', async () => {
    mockResolveAuth.mockResolvedValue(teacherAuth);

    const queryNames = [
      'usage_by_week', 'active_students', 'term_retention', 'student_progress',
      'scaffold_engagement', 'audio_engagement', 'student_independence',
      'bridge_vs_fallback', 'vocabulary_breadth', 'top_flagged',
    ];

    for (const query of queryNames) {
      mockFetchAll.mockResolvedValue({ resources: [] });
      const response = await dashboard(
        makeRequest({ ...validBody, query }),
        makeContext()
      );
      expect(response.status).toBe(200);
    }
  });
});
