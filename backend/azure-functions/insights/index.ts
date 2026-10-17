import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SchoolLicenseDoc, AdminUserDoc } from '../../shared/types';
import { getPilotsContainer, getSessionsContainer, getAnalyticsContainer, getEnrollmentsContainer, getFlagsContainer, getAdminUsersContainer } from '../../shared/cosmos-client';
import { resolveAuthContext, AuthContext } from '../../shared/auth-helpers';
import { checkRateLimit, errorResponse } from '../../shared/validators';
import { suppressSmallGroups, MIN_GROUP, toDay } from '../../shared/ops-calc';
import { loadPrices } from '../../shared/pricing';
import { cached } from '../../shared/response-cache';
import { recordAudit, AuditDoc } from '../../shared/audit';

/**
 * insights — what districts and champion teachers see on languagebridge.app.
 *
 *   POST /api/insights/summary   { schoolCodes?, startDate, endDate }  usage, seats, value — any dashboard user
 *   POST /api/insights/students  { schoolCode, startDate, endDate }    activity per LB student code — champion teachers + super-admins
 *   GET  /api/insights/audit                                          admin actions affecting the caller's districts — district admins + super-admins
 *   GET  /api/insights/data-inventory                                 what LanguageBridge holds for the caller's schools, retention, subprocessors, who has access
 *
 * Privacy rules (MASTER-DOCUMENT §7, docs/PRD-DISTRICT-ANALYTICS.md §Privacy):
 *   - Scoped to the caller's schools; a school outside their scope is a 403.
 *   - Students appear only as counts or LB codes. No names exist to return.
 *   - Any breakdown by language counts distinct students and hides groups under 10.
 *   - Top looked-up words are shown only when at least 3 distinct students looked them up.
 *   - LanguageBridge's costs and margins are never returned here.
 *   - District admins get aggregates only; the per-code list is for the teachers who work with those students.
 */

app.http('insights-summary', { methods: ['POST'], authLevel: 'anonymous', route: 'insights/summary', handler: summary });
app.http('insights-students', { methods: ['POST'], authLevel: 'anonymous', route: 'insights/students', handler: students });
app.http('insights-audit', { methods: ['GET'], authLevel: 'anonymous', route: 'insights/audit', handler: districtAudit });
app.http('insights-data-inventory', { methods: ['GET'], authLevel: 'anonymous', route: 'insights/data-inventory', handler: dataInventory });

const error = errorResponse;
const MIN_TERM_STUDENTS = 3;

type Scoped = { user: AuthContext; schoolCodes: string[]; from: Date; to: Date };

async function scope(request: HttpRequest, context: InvocationContext, requested: (body: Record<string, unknown>) => string[] | undefined): Promise<Scoped | HttpResponseInit> {
  const auth = await resolveAuthContext(request, context);
  if (!auth.authenticated) return error(auth.status, auth.error, auth.details);
  const user = auth.context;
  if (!user.permissions.includes('view_dashboard')) return error(403, 'FORBIDDEN', 'You do not have permission to view the dashboard');
  const rate = await checkRateLimit(`insights:${user.userId}`);
  if (!rate.allowed) return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rate.retryAfterMs}ms`);

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return error(400, 'INVALID_REQUEST', 'Body must be JSON');
  const from = new Date(String(body.startDate ?? ''));
  const to = new Date(String(body.endDate ?? ''));
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to || to.getTime() - from.getTime() > 400 * 86_400_000) {
    return error(400, 'INVALID_RANGE', 'startDate/endDate must be ISO dates, start before end, at most 400 days apart');
  }
  const asked = requested(body);
  const schoolCodes = asked && asked.length ? asked : user.accessibleSchoolCodes;
  const outside = schoolCodes.filter((s) => !user.accessibleSchoolCodes.includes(s));
  if (outside.length || schoolCodes.length === 0) return error(403, 'FORBIDDEN', 'You do not have access to one or more of these schools');
  return { user, schoolCodes, from, to };
}

const isResponse = (x: unknown): x is HttpResponseInit => typeof x === 'object' && x !== null && 'status' in x && !('schoolCodes' in x);

export async function summary(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const s = await scope(request, context, (b) => (Array.isArray(b.schoolCodes) ? b.schoolCodes.map(String) : undefined));
  if (isResponse(s)) return s;
  const { schoolCodes, from, to } = s;
  const p = [{ name: '@schools', value: schoolCodes }, { name: '@f', value: from.toISOString() }, { name: '@t', value: to.toISOString() }];

  const minuteFloor = (d: Date) => Math.floor(d.getTime() / 300_000);   // 5-minute buckets so "now" ranges share a cache entry
  const key = `summary:${[...schoolCodes].sort().join(',')}:${minuteFloor(from)}:${minuteFloor(to)}`;
  try {
    return await cached(key, 5 * 60_000, async () => {
    const [licenses, enrolled, activity, events, terms, meters, flagRows, prices] = await Promise.all([
      getPilotsContainer().items.query<SchoolLicenseDoc>({ query: 'SELECT * FROM c WHERE ARRAY_CONTAINS(@schools, c.schoolCode)', parameters: [p[0]] }).fetchAll().then((r) => r.resources),
      getEnrollmentsContainer().items.query<{ s: string; n: number }>({ query: 'SELECT c.schoolCode AS s, COUNT(1) AS n FROM c WHERE ARRAY_CONTAINS(@schools, c.schoolCode) GROUP BY c.schoolCode', parameters: [p[0]] }).fetchAll().then((r) => r.resources),
      getSessionsContainer().items.query<{ u: string; d: string; l: string }>({ query: 'SELECT DISTINCT c.studentCode AS u, SUBSTRING(c.timestamp, 0, 10) AS d, c.language AS l FROM c WHERE ARRAY_CONTAINS(@schools, c.schoolCode) AND c.timestamp >= @f AND c.timestamp <= @t', parameters: p }).fetchAll().then((r) => r.resources),
      getSessionsContainer().items.query<{ e: string; n: number }>({ query: 'SELECT c.eventType AS e, COUNT(1) AS n FROM c WHERE ARRAY_CONTAINS(@schools, c.schoolCode) AND c.timestamp >= @f AND c.timestamp <= @t GROUP BY c.eventType', parameters: p }).fetchAll().then((r) => r.resources),
      getSessionsContainer().items.query<{ t: string; u: string }>({ query: "SELECT DISTINCT LOWER(c.term) AS t, c.studentCode AS u FROM c WHERE ARRAY_CONTAINS(@schools, c.schoolCode) AND c.eventType = 'term_lookup' AND IS_DEFINED(c.term) AND c.timestamp >= @f AND c.timestamp <= @t", parameters: p }).fetchAll().then((r) => r.resources),
      getAnalyticsContainer().items.query<{ stt_units?: number; stt_calls?: number }>({ query: "SELECT c.stt_units, c.stt_calls FROM c WHERE c.type = 'azure_meter' AND ARRAY_CONTAINS(@schools, c.schoolCode) AND c.day >= @fd AND c.day <= @td", parameters: [p[0], { name: '@fd', value: toDay(from) }, { name: '@td', value: toDay(to) }] }).fetchAll().then((r) => r.resources),
      getFlagsContainer().items.query<{ status: string; n: number }>({ query: 'SELECT c.status, COUNT(1) AS n FROM c WHERE EXISTS(SELECT VALUE s FROM s IN c.schoolCodes WHERE ARRAY_CONTAINS(@schools, s)) AND c.lastFlaggedAt >= @f GROUP BY c.status', parameters: [p[0], p[1]] }).fetchAll().then((r) => r.resources),
      loadPrices(),
    ]);

    const activeStudents = new Set(activity.map((a) => a.u)).size;
    const byWeek = new Map<string, Set<string>>();
    for (const a of activity) {
      const d = new Date(`${a.d}T00:00:00Z`);
      const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
      const k = toDay(monday);
      if (!byWeek.has(k)) byWeek.set(k, new Set());
      byWeek.get(k)!.add(a.u);
    }
    const byLanguage = new Map<string, Set<string>>();
    for (const a of activity) {
      if (!byLanguage.has(a.l)) byLanguage.set(a.l, new Set());
      byLanguage.get(a.l)!.add(a.u);
    }
    const termStudents = new Map<string, Set<string>>();
    for (const t of terms) {
      if (!termStudents.has(t.t)) termStudents.set(t.t, new Set());
      termStudents.get(t.t)!.add(t.u);
    }
    const ev = Object.fromEntries(events.map((e) => [e.e, e.n]));
    const tttMinutes = meters.reduce((sum, m) => sum + (m.stt_units ?? 0), 0) / 60;
    const tttTurns = meters.reduce((sum, m) => sum + (m.stt_calls ?? 0), 0);
    const seatsPurchased = licenses.reduce((sum, l) => sum + (l.seats ?? 0), 0);
    const seatsUsed = enrolled.reduce((sum, e) => sum + e.n, 0);
    const flagged = flagRows.reduce((sum, f) => sum + f.n, 0);
    const fixed = flagRows.filter((f) => f.status === 'resolved').reduce((sum, f) => sum + f.n, 0);

    return {
      status: 200,
      jsonBody: {
        range: { from: from.toISOString(), to: to.toISOString() },
        schools: licenses.map((l) => ({ schoolCode: l.schoolCode, schoolName: l.schoolName, seatsPurchased: l.seats ?? null, seatsUsed: enrolled.find((e) => e.s === l.schoolCode)?.n ?? 0, termEnd: l.termEnd ?? null, status: l.status ?? null })),
        seats: { purchased: seatsPurchased || null, used: seatsUsed, overSeat: seatsPurchased > 0 && seatsUsed > seatsPurchased },
        students: { enrolled: seatsUsed, active: activeStudents },
        weeklyActive: [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([weekOf, set]) => ({ weekOf, students: set.size })),
        languages: suppressSmallGroups([...byLanguage.entries()].map(([language, set]) => ({ language, students: set.size }))).sort((a, b) => (b.students ?? 0) - (a.students ?? 0)),
        usage: {
          wordLookups: ev.term_lookup ?? 0,
          audioPlays: ev.tts_play ?? 0,
          glossaryViews: ev.glossary_view ?? 0,
          simpleEnglishViews: ev.scaffold_view ?? 0,
          talkToTeacherTurns: tttTurns,
          talkToTeacherMinutes: Math.round(tttMinutes * 10) / 10,
          problemsReported: flagged,
          problemsFixed: fixed,
        },
        topWords: [...termStudents.entries()].filter(([, set]) => set.size >= MIN_TERM_STUDENTS).map(([word, set]) => ({ word, students: set.size })).sort((a, b) => b.students - a.students).slice(0, 20),
        value: {
          interpreterMinutesEquivalent: Math.round(tttMinutes * 10) / 10,
          interpreterUsdPerHour: prices.interpreterUsdPerHour,
          estimatedInterpreterValueUsd: Math.round((tttMinutes / 60) * prices.interpreterUsdPerHour * 100) / 100,
          note: 'Estimate: Talk to Teacher minutes valued at a typical interpreter hourly rate. Not a measured saving.',
        },
        privacy: { minGroupSize: MIN_GROUP, minStudentsPerWord: MIN_TERM_STUDENTS, studentIdentity: 'LanguageBridge codes only — no names are collected' },
      },
    };
    });
  } catch (err) {
    context.error('insights summary failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to load insights');
  }
}

export async function students(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const s = await scope(request, context, (b) => (typeof b.schoolCode === 'string' ? [b.schoolCode] : undefined));
  if (isResponse(s)) return s;
  const { user, schoolCodes, from, to } = s;
  if (!(user.isSuperAdmin || user.role === 'champion')) {
    return error(403, 'FORBIDDEN', 'Per-student activity is available to champion teachers, not district-level accounts');
  }
  if (schoolCodes.length !== 1) return error(400, 'MISSING_FIELDS', 'schoolCode is required');
  const p = [{ name: '@s', value: schoolCodes[0] }, { name: '@f', value: from.toISOString() }, { name: '@t', value: to.toISOString() }];

  try {
    const [enrolled, rows] = await Promise.all([
      getEnrollmentsContainer().items.query<{ id: string; gradeBand: string; language: string; variant?: string; createdAt: string }>({ query: 'SELECT c.id, c.gradeBand, c.language, c.variant, c.createdAt FROM c WHERE c.schoolCode = @s', parameters: [p[0]] }, { partitionKey: schoolCodes[0] }).fetchAll().then((r) => r.resources),
      getSessionsContainer().items.query<{ u: string; e: string; n: number; last: string }>({ query: 'SELECT c.studentCode AS u, c.eventType AS e, COUNT(1) AS n, MAX(c.timestamp) AS last FROM c WHERE c.schoolCode = @s AND c.timestamp >= @f AND c.timestamp <= @t GROUP BY c.studentCode, c.eventType', parameters: p }).fetchAll().then((r) => r.resources),
    ]);
    const list = enrolled.map((e) => {
      const mine = rows.filter((r) => r.u === e.id);
      const count = (t: string) => mine.find((r) => r.e === t)?.n ?? 0;
      return {
        studentCode: e.id,
        gradeBand: e.gradeBand,
        language: e.language,
        variant: e.variant ?? null,
        enrolledAt: e.createdAt,
        lastActive: mine.reduce<string | null>((m, r) => (!m || r.last > m ? r.last : m), null),
        wordLookups: count('term_lookup'),
        audioPlays: count('tts_play'),
        glossaryViews: count('glossary_view'),
        problemsReported: count('flag_event'),
      };
    }).sort((a, b) => (b.lastActive ?? '').localeCompare(a.lastActive ?? ''));
    const { resources: lic } = await getPilotsContainer().items.query<{ pilotId: string }>({ query: 'SELECT c.pilotId FROM c WHERE c.schoolCode = @s', parameters: [p[0]] }).fetchAll();
    await recordAudit(context, { action: 'data.view_student_list', actorEmail: user.email, actorRole: user.role ?? 'unknown', pilotId: lic[0]?.pilotId ?? null, target: schoolCodes[0],
      details: { students: list.length, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) } });
    return { status: 200, jsonBody: { schoolCode: schoolCodes[0], range: { from: from.toISOString(), to: to.toISOString() }, students: list, note: 'Students are identified only by their LanguageBridge code. Nicknames you keep stay on your own device.' } };
  } catch (err) {
    context.error('insights students failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to load students');
  }
}

// ── Audit log & data inventory (DPA clause 14) ──────────────────────

/** Auth + permission + rate limit for GET endpoints scoped to the caller's schools. */
async function staffScope(request: HttpRequest, context: InvocationContext): Promise<{ user: AuthContext; schoolCodes: string[]; pilotIds: string[] } | HttpResponseInit> {
  const auth = await resolveAuthContext(request, context);
  if (!auth.authenticated) return error(auth.status, auth.error, auth.details);
  const user = auth.context;
  if (!user.permissions.includes('view_dashboard')) return error(403, 'FORBIDDEN', 'You do not have permission to view the dashboard');
  const rate = await checkRateLimit(`insights:${user.userId}`);
  if (!rate.allowed) return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rate.retryAfterMs}ms`);
  const schoolCodes = user.accessibleSchoolCodes;
  const { resources } = await getPilotsContainer().items.query<{ pilotId: string }>({ query: 'SELECT DISTINCT c.pilotId FROM c WHERE ARRAY_CONTAINS(@s, c.schoolCode)', parameters: [{ name: '@s', value: schoolCodes }] }).fetchAll();
  return { user, schoolCodes, pilotIds: resources.map((r) => r.pilotId) };
}

export async function districtAudit(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const s = await staffScope(request, context);
  if (isResponse(s)) return s;
  if (!(s.user.isSuperAdmin || s.user.role === 'district_admin')) return error(403, 'FORBIDDEN', 'The audit log is available to district administrators');
  try {
    const { resources } = await getAnalyticsContainer().items.query<AuditDoc>({
      query: "SELECT TOP 500 c.at, c.action, c.actorEmail, c.actorRole, c.pilotId, c.target, c.details FROM c WHERE c.type = 'audit' AND ARRAY_CONTAINS(@p, c.pilotId) ORDER BY c.at DESC",
      parameters: [{ name: '@p', value: s.pilotIds }],
    }).fetchAll();
    return { status: 200, jsonBody: { districts: s.pilotIds, entries: resources, retention: 'Kept 7 years (DPA clause 4).' } };
  } catch (err) {
    context.error('insights audit failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to load the audit log');
  }
}

/**
 * What LanguageBridge holds about the caller's schools. Counts are live; the
 * descriptions and retention terms restate the DPA. Keep SUBPROCESSORS in step
 * with company/00-CANONICAL-FACTS.md §5.
 */
const SUBPROCESSORS = [
  { name: 'Microsoft Azure', purpose: 'Hosting, database (Cosmos DB), file storage, monitoring' },
  { name: 'Microsoft Azure AI services', purpose: 'Translation, text-to-speech, speech-to-text' },
  { name: 'Supabase', purpose: 'Staff sign-in, and relaying dashboard requests (LanguageBridge codes and totals; no student names exist)' },
];

export async function dataInventory(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const s = await staffScope(request, context);
  if (isResponse(s)) return s;
  const p = [{ name: '@s', value: s.schoolCodes }];
  try {
    const [enrolled, events, flags, staff] = await Promise.all([
      getEnrollmentsContainer().items.query<number>({ query: 'SELECT VALUE COUNT(1) FROM c WHERE ARRAY_CONTAINS(@s, c.schoolCode)', parameters: p }).fetchAll().then((r) => r.resources[0] ?? 0),
      getSessionsContainer().items.query<{ first: string; last: string; n: number }>({ query: 'SELECT MIN(c.timestamp) AS first, MAX(c.timestamp) AS last, COUNT(1) AS n FROM c WHERE ARRAY_CONTAINS(@s, c.schoolCode)', parameters: p }).fetchAll().then((r) => r.resources[0] ?? { first: null, last: null, n: 0 }),
      getFlagsContainer().items.query<number>({ query: 'SELECT VALUE COUNT(1) FROM c WHERE EXISTS(SELECT VALUE x FROM x IN c.schoolCodes WHERE ARRAY_CONTAINS(@s, x))', parameters: p }).fetchAll().then((r) => r.resources[0] ?? 0),
      getAdminUsersContainer().items.query<AdminUserDoc>('SELECT c.email, c.role, c.pilotIds, c.districtIds, c.permissions, c.invitedAt FROM c').fetchAll().then((r) => r.resources),
    ]);
    const { resources: schoolDocs } = await getPilotsContainer().items.query<{ id: string }>({ query: 'SELECT c.id FROM c WHERE ARRAY_CONTAINS(@s, c.schoolCode)', parameters: p }).fetchAll();
    const schoolIds = new Set(schoolDocs.map((d) => d.id));
    const withAccess = staff
      .filter((u) => (u.permissions ?? []).length > 0)
      .filter((u) => (u.pilotIds ?? []).some((id) => schoolIds.has(id)) || (u.districtIds ?? []).some((d) => s.pilotIds.includes(d)))
      .map((u) => ({ email: u.email, role: u.role ?? 'staff', invitedAt: u.invitedAt ?? null }));

    return {
      status: 200,
      jsonBody: {
        schools: s.schoolCodes,
        studentIdentity: 'Students are identified only by a random LanguageBridge code (e.g. LB-7K2M). No names, emails, student IDs, birthdates, addresses, photos or device IDs are collected.',
        categories: [
          { name: 'Enrollments', count: enrolled, holds: 'LanguageBridge code, school, grade band, home language, optional dialect, date enrolled', retention: 'Subscription term + 90 days, then deleted' },
          { name: 'Usage events', count: events.n, firstAt: events.first ?? null, lastAt: events.last ?? null, holds: 'LanguageBridge code, event type (lookup, audio, glossary, report), the academic word looked up, language, time', retention: 'Subscription term + 90 days, then deleted' },
          { name: 'Problem reports (flags)', count: flags, holds: 'The word or short passage reported, language, subject, a short surrounding sentence with names and numbers removed', retention: 'Subscription term + 90 days for school-linked data; corrected dictionary entries are kept' },
          { name: 'Talk to Teacher audio and text', count: null, holds: 'Not retained — processed for transcription and translation, then discarded', retention: 'Not stored' },
          { name: 'Staff accounts', count: withAccess.length, holds: 'Email, role, schools they can see, invite date', retention: 'Until access is removed' },
          { name: 'Admin-action audit log', count: null, holds: 'Who invited or removed staff, changed licenses, or viewed the per-student list, and when', retention: '7 years' },
        ],
        staffWithAccess: withAccess,
        languageBridgeAccess: 'LanguageBridge super-administrators (admin@languagebridge.app) can see all districts to provide support. Every change they make is in the audit log.',
        subprocessors: SUBPROCESSORS,
        requests: { contact: 'justin@languagebridge.app', parentalAccess: 'Through the district, within 30 days, as a usage report keyed to the student code', deletion: 'All student-linked data deleted within 90 days of contract end, or sooner on the district\u2019s written request' },
      },
    };
  } catch (err) {
    context.error('data inventory failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to load the data inventory');
  }
}
