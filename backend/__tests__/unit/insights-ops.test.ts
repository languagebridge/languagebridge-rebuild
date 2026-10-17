import { HttpRequest, InvocationContext } from '@azure/functions';
import { summary, students } from '../../azure-functions/insights/index';
import { withSuperAdmin } from '../../azure-functions/ops/index';
import { clearResponseCache } from '../../shared/response-cache';

const mockResolveAuth = jest.fn();
const queryResults: Record<string, unknown[]> = {};

jest.mock('../../shared/auth-helpers', () => ({
  resolveAuthContext: (...a: unknown[]) => mockResolveAuth(...a),
  inviteStaffUser: jest.fn(),
}));

// Every container answers a query with the rows registered for the first matching
// keyword in its SQL — enough to drive the handlers without a database.
const container = (name: string) => ({
  items: {
    query: (spec: { query: string }) => ({
      fetchAll: async () => {
        const hit = Object.keys(queryResults).find((k) => k.startsWith(`${name}:`) && spec.query.includes(k.split(':')[1]));
        return { resources: hit ? queryResults[hit] : [] };
      },
    }),
  },
  item: () => ({ read: async () => ({ resource: undefined }) }),
});
jest.mock('../../shared/cosmos-client', () => ({
  getPilotsContainer: () => container('pilots'),
  getSessionsContainer: () => container('sessions'),
  getAnalyticsContainer: () => container('analytics'),
  getEnrollmentsContainer: () => container('enrollments'),
  getFlagsContainer: () => container('flags'),
  getAdminUsersContainer: () => container('admin_users'),
  getRateLimitContainer: () => ({ item: () => ({ patch: jest.fn().mockResolvedValue({ resource: { count: 1 } }) }), items: { create: jest.fn() } }),
}));

const req = (body: unknown): HttpRequest => ({ method: 'POST', url: 'http://x', headers: new Map([['authorization', 'Bearer t']]), query: new Map(), params: {}, json: async () => body } as unknown as HttpRequest);
const ctx = () => ({ log: jest.fn(), error: jest.fn(), warn: jest.fn() }) as unknown as InvocationContext;
const user = (over: Record<string, unknown> = {}) => ({ authenticated: true, context: { userId: 'u', email: 't@school.org', permissions: ['view_dashboard'], isSuperAdmin: false, accessibleSchoolCodes: ['greenbriar'], accessiblePilotIds: [], role: 'district_admin', ...over } });
const range = { startDate: '2026-09-01T00:00:00Z', endDate: '2026-10-16T00:00:00Z' };

beforeEach(() => {
  jest.clearAllMocks();
  clearResponseCache();
  for (const k of Object.keys(queryResults)) delete queryResults[k];
});

describe('insights/summary', () => {
  it('refuses schools outside the caller’s scope', async () => {
    mockResolveAuth.mockResolvedValue(user());
    const res = await summary(req({ ...range, schoolCodes: ['other-school'] }), ctx());
    expect(res.status).toBe(403);
  });

  it('requires the dashboard permission', async () => {
    mockResolveAuth.mockResolvedValue(user({ permissions: [] }));
    expect((await summary(req(range), ctx())).status).toBe(403);
  });

  it('returns usage without costs, hides small language groups and rare words', async () => {
    mockResolveAuth.mockResolvedValue(user());
    const activity = [
      ...Array.from({ length: 12 }, (_, i) => ({ u: `LB-D${i}`, d: '2026-10-01', l: 'dari' })),
      ...Array.from({ length: 3 }, (_, i) => ({ u: `LB-P${i}`, d: '2026-10-02', l: 'pashto' })),
    ];
    queryResults['sessions:SUBSTRING'] = activity;
    queryResults['sessions:LOWER(c.term)'] = [
      ...['LB-D1', 'LB-D2', 'LB-D3'].map((u) => ({ t: 'fraction', u })),
      { t: 'jamal', u: 'LB-D1' },
    ];
    queryResults['sessions:GROUP BY c.eventType'] = [{ e: 'term_lookup', n: 40 }];
    queryResults['analytics:azure_meter'] = [{ stt_units: 1800, stt_calls: 12 }];

    const res = await summary(req(range), ctx());
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, any>;
    expect(body.students.active).toBe(15);
    expect(body.languages).toEqual([
      { language: 'dari', students: 12, suppressed: false },
      { language: 'pashto', students: null, suppressed: true },
    ]);
    expect(body.topWords).toEqual([{ word: 'fraction', students: 3 }]);   // 'jamal' (1 student) never shown
    expect(body.usage.talkToTeacherMinutes).toBe(30);
    expect(body.value.estimatedInterpreterValueUsd).toBe(22.5);           // 0.5 h × $45
    expect(JSON.stringify(body)).not.toMatch(/azureCost|margin|revenue/i);
  });
});

describe('insights/students', () => {
  it('is not available to district admins', async () => {
    mockResolveAuth.mockResolvedValue(user({ role: 'district_admin' }));
    expect((await students(req({ ...range, schoolCode: 'greenbriar' }), ctx())).status).toBe(403);
  });

  it('lists LB codes with activity for a champion teacher', async () => {
    mockResolveAuth.mockResolvedValue(user({ role: 'champion' }));
    queryResults['enrollments:c.createdAt'] = [{ id: 'LB-7K2M', gradeBand: '6-8', language: 'dari', createdAt: '2026-09-01' }];
    queryResults['sessions:MAX(c.timestamp)'] = [{ u: 'LB-7K2M', e: 'term_lookup', n: 9, last: '2026-10-10T10:00:00Z' }];
    const res = await students(req({ ...range, schoolCode: 'greenbriar' }), ctx());
    expect(res.status).toBe(200);
    const list = (res.jsonBody as Record<string, any>).students;
    expect(list).toEqual([expect.objectContaining({ studentCode: 'LB-7K2M', wordLookups: 9, lastActive: '2026-10-10T10:00:00Z' })]);
    expect(Object.keys(list[0])).not.toEqual(expect.arrayContaining(['name', 'email']));
  });
});

describe('ops gate', () => {
  it('rejects anyone who is not a super-admin', async () => {
    mockResolveAuth.mockResolvedValue(user({ role: 'district_admin' }));
    const fn = jest.fn();
    const res = await withSuperAdmin(req({}), ctx(), fn);
    expect(res.status).toBe(403);
    expect(fn).not.toHaveBeenCalled();
  });

  it('lets a super-admin through', async () => {
    mockResolveAuth.mockResolvedValue(user({ isSuperAdmin: true, role: 'super_admin' }));
    const fn = jest.fn().mockResolvedValue({ status: 200 });
    expect((await withSuperAdmin(req({}), ctx(), fn)).status).toBe(200);
  });
});
