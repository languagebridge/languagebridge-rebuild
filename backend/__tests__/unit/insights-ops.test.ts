import { HttpRequest, InvocationContext } from '@azure/functions';
import { summary, students, districtAudit, dataInventory } from '../../azure-functions/insights/index';
import { withSuperAdmin, revoke } from '../../azure-functions/ops/index';
import { clearResponseCache } from '../../shared/response-cache';

const mockResolveAuth = jest.fn();
const mockBan = jest.fn().mockResolvedValue(true);
const created: Array<{ container: string; doc: Record<string, unknown> }> = [];
const upserted: Array<{ container: string; doc: Record<string, unknown> }> = [];
const queryResults: Record<string, unknown[]> = {};

jest.mock('../../shared/auth-helpers', () => ({
  resolveAuthContext: (...a: unknown[]) => mockResolveAuth(...a),
  inviteStaffUser: jest.fn(),
  banStaffUser: (...a: unknown[]) => mockBan(...a),
}));

// Every container answers a query with the rows registered for the first matching
// keyword in its SQL — enough to drive the handlers without a database.
const container = (name: string) => ({
  items: {
    query: (spec: { query: string } | string) => ({
      fetchAll: async () => {
        const sql = typeof spec === 'string' ? spec : spec.query;
        const hit = Object.keys(queryResults).find((k) => k.startsWith(`${name}:`) && sql.includes(k.slice(name.length + 1)));
        return { resources: hit ? queryResults[hit] : [] };
      },
    }),
    create: async (doc: Record<string, unknown>) => { created.push({ container: name, doc }); return { resource: doc }; },
    upsert: async (doc: Record<string, unknown>) => { upserted.push({ container: name, doc }); return { resource: doc }; },
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
  created.length = 0;
  upserted.length = 0;
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

describe('audit trail and access removal', () => {
  const audits = () => created.filter((c) => c.container === 'analytics' && c.doc.type === 'audit').map((c) => c.doc);

  it('records when a champion views the per-student list (the event, not the data)', async () => {
    mockResolveAuth.mockResolvedValue(user({ role: 'champion' }));
    queryResults['pilots:c.pilotId FROM c WHERE c.schoolCode'] = [{ pilotId: 'PCSD-2026' }];
    await students(req({ ...range, schoolCode: 'greenbriar' }), ctx());
    expect(audits()).toEqual([expect.objectContaining({ action: 'data.view_student_list', actorEmail: 't@school.org', pilotId: 'PCSD-2026', target: 'greenbriar' })]);
    expect(JSON.stringify(audits())).not.toMatch(/LB-/);
  });

  it('revoking all access strips permissions, blocks sign-in and is audited', async () => {
    queryResults['admin_users:c.email = @e'] = [{ id: 'sb-1', email: 'leaver@district.org', role: 'champion', pilotIds: ['greenbriar'], districtIds: [], permissions: ['view_dashboard'], isSuperAdmin: false }];
    queryResults['pilots:IS_DEFINED(c.schoolCode)'] = [{ id: 'greenbriar', schoolCode: 'greenbriar', pilotId: 'PCSD-2026' }];
    const res = await revoke(req({ email: 'leaver@district.org', all: true }), ctx(), { email: 'admin@languagebridge.app' } as never);
    expect(res.status).toBe(200);
    expect(res.jsonBody).toMatchObject({ allAccessRemoved: true, signInBlocked: true, remainingSchools: [] });
    expect(upserted[0].doc).toMatchObject({ permissions: [], pilotIds: [] });
    expect(mockBan).toHaveBeenCalledWith('sb-1');
    expect(audits()).toEqual([expect.objectContaining({ action: 'staff.revoke', target: 'leaver@district.org', pilotId: 'PCSD-2026' })]);
  });

  it('cannot revoke a super-admin here', async () => {
    queryResults['admin_users:c.email = @e'] = [{ id: 'x', email: 'admin@languagebridge.app', isSuperAdmin: true }];
    const res = await revoke(req({ email: 'admin@languagebridge.app', all: true }), ctx(), { email: 'admin@languagebridge.app' } as never);
    expect(res.status).toBe(400);
  });

  it('shows the district audit log to district admins only', async () => {
    mockResolveAuth.mockResolvedValue(user({ role: 'champion' }));
    expect((await districtAudit(req(undefined), ctx())).status).toBe(403);
    mockResolveAuth.mockResolvedValue(user({ role: 'district_admin' }));
    queryResults["analytics:c.type = 'audit'"] = [{ action: 'staff.invite', actorEmail: 'admin@languagebridge.app' }];
    const res = await districtAudit(req(undefined), ctx());
    expect(res.status).toBe(200);
    expect((res.jsonBody as Record<string, any>).entries).toHaveLength(1);
  });

  it('data inventory states identity, retention and subprocessors, never costs', async () => {
    mockResolveAuth.mockResolvedValue(user());
    const res = await dataInventory(req(undefined), ctx());
    expect(res.status).toBe(200);
    const body = res.jsonBody as Record<string, any>;
    expect(body.studentIdentity).toMatch(/No names/);
    expect(body.categories.map((c: { name: string }) => c.name)).toEqual(expect.arrayContaining(['Enrollments', 'Usage events', 'Talk to Teacher audio and text', 'Admin-action audit log']));
    expect(body.subprocessors.map((x: { name: string }) => x.name)).toEqual(['Microsoft Azure', 'Microsoft Azure AI services', 'Supabase']);
    expect(JSON.stringify(body)).not.toMatch(/azureCost|margin|revenue|Usd/);
  });
});
