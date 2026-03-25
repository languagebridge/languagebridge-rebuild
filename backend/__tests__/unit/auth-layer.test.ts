import { authLayer } from '../../azure-functions/auth-layer/index';
import { HttpRequest, InvocationContext } from '@azure/functions';

// ── Mock Supabase ───────────────────────────────────────────────────

const mockGetUser = jest.fn();

jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
  }),
  SupabaseClient: class {},
}));

// ── Mock Cosmos DB ──────────────────────────────────────────────────

const mockQuery = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getAdminUsersContainer: () => ({
    items: {
      query: () => ({ fetchAll: mockQuery }),
    },
  }),
}));

// ── Helpers ─────────────────────────────────────────────────────────

function makeRequest(token?: string): HttpRequest {
  const headers = new Map<string, string>();
  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  }

  return {
    method: 'POST',
    url: 'http://localhost/api/auth-layer',
    headers,
    query: new Map(),
    params: {},
    json: async () => ({}),
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
  // Set env vars so Supabase client initializes
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

afterEach(() => {
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

describe('auth-layer', () => {
  it('returns 401 when no Authorization header', async () => {
    const response = await authLayer(makeRequest(), makeContext());
    expect(response.status).toBe(401);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('MISSING_TOKEN');
  });

  it('returns 401 when token is invalid', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'Invalid token' },
    });

    const response = await authLayer(makeRequest('bad-token'), makeContext());
    expect(response.status).toBe(401);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.error).toBe('INVALID_TOKEN');
  });

  it('returns user context for valid admin', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-123', email: 'teacher@school.edu' } },
      error: null,
    });
    mockQuery.mockResolvedValue({
      resources: [{
        email: 'teacher@school.edu',
        schoolCodes: [],
        permissions: ['view_dashboard', 'manage_flags'],
      }],
    });

    const response = await authLayer(makeRequest('valid-token'), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.userId).toBe('user-123');
    expect(body.email).toBe('teacher@school.edu');
    expect(body.isSuperAdmin).toBe(false);
    expect(body.accessiblePilotIds).toEqual(['PCSD-2026']);
    expect(body.permissions).toEqual(['view_dashboard', 'manage_flags']);
  });

  it('grants super admin for @languagebridge.app emails', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'admin-1', email: 'justin@languagebridge.app' } },
      error: null,
    });
    mockQuery.mockResolvedValue({ resources: [] }); // Not in admin_users yet

    const response = await authLayer(makeRequest('valid-token'), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.isSuperAdmin).toBe(true);
    expect(body.permissions).toEqual(
      expect.arrayContaining(['view_dashboard', 'export_data', 'manage_flags', 'manage_users'])
    );
  });

  it('returns empty permissions for unknown non-super users', async () => {
    mockGetUser.mockResolvedValue({
      data: { user: { id: 'user-456', email: 'random@gmail.com' } },
      error: null,
    });
    mockQuery.mockResolvedValue({ resources: [] });

    const response = await authLayer(makeRequest('valid-token'), makeContext());
    expect(response.status).toBe(200);

    const body = response.jsonBody as Record<string, unknown>;
    expect(body.isSuperAdmin).toBe(false);
    expect(body.permissions).toEqual([]);
    expect(body.accessiblePilotIds).toEqual([]);
  });
});
