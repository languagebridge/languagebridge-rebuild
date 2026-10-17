import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SchoolLicenseDoc } from '../../shared/types';
import { getPilotsContainer, getSessionsContainer, getAnalyticsContainer, getEnrollmentsContainer, getFlagsContainer } from '../../shared/cosmos-client';
import { resolveAuthContext, AuthContext } from '../../shared/auth-helpers';
import { checkRateLimit, errorResponse } from '../../shared/validators';
import { suppressSmallGroups, MIN_GROUP, toDay } from '../../shared/ops-calc';
import { loadPrices } from '../../shared/pricing';
import { cached } from '../../shared/response-cache';

/**
 * insights — what districts and champion teachers see on languagebridge.app.
 *
 *   POST /api/insights/summary   { schoolCodes?, startDate, endDate }  usage, seats, value — any dashboard user
 *   POST /api/insights/students  { schoolCode, startDate, endDate }    activity per LB student code — champion teachers + super-admins
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
    return { status: 200, jsonBody: { schoolCode: schoolCodes[0], range: { from: from.toISOString(), to: to.toISOString() }, students: list, note: 'Students are identified only by their LanguageBridge code. Nicknames you keep stay on your own device.' } };
  } catch (err) {
    context.error('insights students failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to load students');
  }
}
