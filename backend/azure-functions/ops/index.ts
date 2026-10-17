import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { SchoolLicenseDoc, DistrictDoc, AdminUserDoc, GradeBand, HealthBanner } from '../../shared/types';
import { getPilotsContainer, getAnalyticsContainer, getSessionsContainer, getEnrollmentsContainer, getAdminUsersContainer } from '../../shared/cosmos-client';
import { resolveAuthContext, AuthContext, inviteStaffUser, banStaffUser } from '../../shared/auth-helpers';
import { recordAudit, AuditDoc, AUDIT_GLOBAL } from '../../shared/audit';
import { checkRateLimit, errorResponse } from '../../shared/validators';
import { AzurePrices, FREE_TIER, THRESHOLDS } from '../../shared/azure-quotas';
import { loadPrices, PRICES_ID } from '../../shared/pricing';
import { cached } from '../../shared/response-cache';
import { OPS_PARTITION } from '../../shared/metering';
import { readMetrics, readActualCost, readSku, managementConfigured } from '../../shared/azure-management';
import { healthBanners, accruedRevenue, meteredCostUsd, monthProgress, toDay, ServiceUsage } from '../../shared/ops-calc';

/**
 * ops — LanguageBridge-internal operations. Super-admin only
 * (LB_SUPERADMIN_EMAILS — today admin@languagebridge.app).
 *
 *   GET  /api/ops/health                  banners + free-tier usage + Azure/Cosmos/API health
 *   GET  /api/ops/overview?from=&to=      per district/school: revenue, Azure cost, margin, seats, usage
 *   GET  /api/ops/pricing                 Azure unit prices used for cost attribution
 *   PUT  /api/ops/pricing                 override them (no deploy needed)
 *   GET  /api/ops/districts               districts + school license records + staff
 *   PUT  /api/ops/districts               create/update a district and its schools
 *   POST /api/ops/invite                  invite a district admin or champion teacher by email
 *   POST /api/ops/revoke                  remove a staff member's access (some schools, a district, or all)
 *   GET  /api/ops/audit                   admin-action audit log (all districts)
 *
 * Every change made here is written to the audit log (shared/audit.ts).
 *
 * Privacy: nothing here returns a student name or identity — students exist only
 * as counts or pseudonymous LB codes. Costs and margin never leave this function.
 * (Routes can't start with "admin": Azure Functions reserves that prefix.)
 */

const ROUTES: Array<[string, 'GET' | 'PUT' | 'POST', (r: HttpRequest, c: InvocationContext, u: AuthContext) => Promise<HttpResponseInit>]> = [
  ['ops/health', 'GET', health],
  ['ops/overview', 'GET', overview],
  ['ops/pricing', 'GET', getPricing],
  ['ops/pricing', 'PUT', putPricing],
  ['ops/districts', 'GET', listDistricts],
  ['ops/districts', 'PUT', upsertDistrict],
  ['ops/invite', 'POST', invite],
  ['ops/revoke', 'POST', revoke],
  ['ops/audit', 'GET', auditLog],
];

for (const [route, method, fn] of ROUTES) {
  app.http(`ops-${route.split('/')[1]}-${method.toLowerCase()}`, {
    methods: [method],
    authLevel: 'anonymous',
    route,
    handler: (req, ctx) => withSuperAdmin(req, ctx, fn),
  });
}

const error = errorResponse;

export async function withSuperAdmin(
  request: HttpRequest,
  context: InvocationContext,
  fn: (r: HttpRequest, c: InvocationContext, u: AuthContext) => Promise<HttpResponseInit>
): Promise<HttpResponseInit> {
  const auth = await resolveAuthContext(request, context);
  if (!auth.authenticated) return error(auth.status, auth.error, auth.details);
  if (!auth.context.isSuperAdmin) return error(403, 'FORBIDDEN', 'LanguageBridge operations are restricted to super-admins');
  const rate = await checkRateLimit(`ops:${auth.context.userId}`, 60);
  if (!rate.allowed) return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rate.retryAfterMs}ms`);
  try {
    return await fn(request, context, auth.context);
  } catch (err) {
    context.error('ops error:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  }
}

// ── Pricing ─────────────────────────────────────────────────────────

async function getPricing(): Promise<HttpResponseInit> {
  return { status: 200, jsonBody: { prices: await loadPrices(), freeTier: FREE_TIER } };
}

async function putPricing(request: HttpRequest, _c: InvocationContext, user: AuthContext): Promise<HttpResponseInit> {
  const body = (await request.json().catch(() => null)) as Partial<AzurePrices> | null;
  if (!body) return error(400, 'MISSING_FIELDS', 'Body must be JSON');
  const numeric: Array<keyof AzurePrices> = ['translatorPerMillionChars', 'ttsPerMillionChars', 'sttPerAudioHour', 'cosmosPer100RuHour', 'cosmosPerGbMonth', 'interpreterUsdPerHour'];
  const current = await loadPrices();
  const next: AzurePrices = { ...current };
  for (const k of numeric) {
    if (body[k] === undefined) continue;
    const v = Number(body[k]);
    if (!Number.isFinite(v) || v < 0 || v > 1000) return error(400, 'INVALID_PRICE', `${k} must be a number between 0 and 1000`);
    (next as Record<string, unknown>)[k] = v;
  }
  next.source = typeof body.source === 'string' ? body.source.slice(0, 200) : `Set by ${user.email}`;
  next.updatedAt = new Date().toISOString();
  await getPilotsContainer().items.upsert({ id: PRICES_ID, ...next });
  await recordAudit(_c, { action: 'pricing.update', actorEmail: user.email, actorRole: 'super_admin', pilotId: null, target: 'azure_prices',
    details: Object.fromEntries(numeric.filter((k) => body[k] !== undefined).map((k) => [k, Number(body[k])])) });
  return { status: 200, jsonBody: { prices: next } };
}

// ── Districts & schools ─────────────────────────────────────────────

async function loadSchools(): Promise<SchoolLicenseDoc[]> {
  const { resources } = await getPilotsContainer().items.query<SchoolLicenseDoc>('SELECT * FROM c WHERE IS_DEFINED(c.schoolCode)').fetchAll();
  return resources;
}

async function loadDistricts(): Promise<DistrictDoc[]> {
  const { resources } = await getPilotsContainer().items.query<DistrictDoc>("SELECT * FROM c WHERE c.type = 'district'").fetchAll();
  return resources;
}

async function listDistricts(): Promise<HttpResponseInit> {
  const [schools, districts, staff] = await Promise.all([
    loadSchools(),
    loadDistricts(),
    getAdminUsersContainer().items.query<AdminUserDoc>('SELECT c.id, c.email, c.role, c.pilotIds, c.districtIds, c.displayName, c.invitedAt FROM c').fetchAll().then((r) => r.resources),
  ]);
  const pilotIds = [...new Set([...schools.map((s) => s.pilotId), ...districts.map((d) => d.pilotId)])];
  const out = pilotIds.map((pilotId) => {
    const district = districts.find((d) => d.pilotId === pilotId) ?? null;
    const dSchools = schools.filter((s) => s.pilotId === pilotId);
    const schoolIds = new Set(dSchools.map((s) => s.id));
    return {
      pilotId,
      district,
      schools: dSchools,
      staff: staff.filter((u) => (u.districtIds ?? []).includes(pilotId) || (u.pilotIds ?? []).some((id) => schoolIds.has(id))),
    };
  });
  return { status: 200, jsonBody: { districts: out } };
}

const GRADE_BANDS: GradeBand[] = ['K-2', '3-5', '6-8', '9-12'];
const SCHOOL_CODE_RE = /^[A-Za-z0-9-]{2,40}$/;

async function upsertDistrict(request: HttpRequest, context: InvocationContext, user: AuthContext): Promise<HttpResponseInit> {
  const body = (await request.json().catch(() => null)) as { district?: Partial<DistrictDoc>; schools?: Array<Partial<SchoolLicenseDoc>> } | null;
  const d = body?.district;
  if (!d?.pilotId || !d.name) return error(400, 'MISSING_FIELDS', 'district.pilotId and district.name are required');
  if (!SCHOOL_CODE_RE.test(d.pilotId)) return error(400, 'INVALID_ID', 'pilotId may contain letters, digits and dashes only');

  const now = new Date().toISOString();
  const pilots = getPilotsContainer();
  const id = `district:${d.pilotId}`;
  const { resource: existing } = await pilots.item(id, id).read<DistrictDoc>().catch(() => ({ resource: undefined }));
  const district: DistrictDoc = {
    id, type: 'district', pilotId: d.pilotId, name: String(d.name).slice(0, 120),
    state: d.state ?? existing?.state ?? null,
    contractAnnualUsd: d.contractAnnualUsd ?? existing?.contractAnnualUsd ?? null,
    isDemo: d.isDemo ?? existing?.isDemo ?? false,
    notes: d.notes ?? existing?.notes ?? null,
    createdAt: existing?.createdAt ?? now, updatedAt: now,
  };
  await pilots.items.upsert(district);
  await recordAudit(context, { action: 'district.upsert', actorEmail: user.email, actorRole: 'super_admin', pilotId: d.pilotId, target: d.pilotId,
    details: { name: district.name, contractAnnualUsd: district.contractAnnualUsd ?? null, created: !existing } });

  const saved: SchoolLicenseDoc[] = [];
  for (const s of body?.schools ?? []) {
    if (!s.schoolCode || !s.schoolName) return error(400, 'MISSING_FIELDS', 'Each school needs schoolCode and schoolName');
    if (!SCHOOL_CODE_RE.test(s.schoolCode)) return error(400, 'INVALID_ID', `Invalid schoolCode '${s.schoolCode}'`);
    const sid = s.id ?? s.schoolCode.toLowerCase();
    const { resource: prev } = await pilots.item(sid, sid).read<SchoolLicenseDoc>().catch(() => ({ resource: undefined }));
    const bands = (s.gradeBands ?? prev?.gradeBands ?? GRADE_BANDS).filter((b): b is GradeBand => GRADE_BANDS.includes(b as GradeBand));
    const doc: SchoolLicenseDoc = {
      ...(prev ?? {}),
      id: sid, type: 'school', schoolCode: s.schoolCode, schoolName: String(s.schoolName).slice(0, 120),
      pilotId: d.pilotId, gradeBands: bands,
      isActive: s.isActive ?? prev?.isActive ?? true,
      isDemo: s.isDemo ?? prev?.isDemo ?? district.isDemo ?? false,
      seats: s.seats ?? prev?.seats,
      tier: s.tier ?? prev?.tier,
      pricingModel: s.pricingModel ?? prev?.pricingModel,
      annualPriceUsd: s.annualPriceUsd ?? prev?.annualPriceUsd,
      termStart: s.termStart ?? prev?.termStart,
      termEnd: s.termEnd ?? prev?.termEnd,
      status: s.status ?? prev?.status ?? 'trial',
      dpaRef: s.dpaRef ?? prev?.dpaRef ?? null,
      updatedAt: now,
    };
    await pilots.items.upsert(doc);
    await recordAudit(context, { action: 'school.upsert', actorEmail: user.email, actorRole: 'super_admin', pilotId: d.pilotId, target: doc.schoolCode,
      details: { seats: doc.seats ?? null, status: doc.status ?? null, annualPriceUsd: doc.annualPriceUsd ?? null, created: !prev } });
    saved.push(doc);
  }
  return { status: 200, jsonBody: { district, schools: saved } };
}

// ── Invites ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function invite(request: HttpRequest, context: InvocationContext, user: AuthContext): Promise<HttpResponseInit> {
  const body = (await request.json().catch(() => null)) as { email?: string; role?: string; districtId?: string; schoolIds?: string[]; displayName?: string } | null;
  const email = (body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return error(400, 'INVALID_EMAIL', 'A valid email is required');
  if (body?.role !== 'district_admin' && body?.role !== 'champion') return error(400, 'INVALID_ROLE', "role must be 'district_admin' or 'champion'");

  const schools = await loadSchools();
  let pilotIds: string[] = [];
  let districtIds: string[] = [];
  if (body.role === 'district_admin') {
    if (!body.districtId || !schools.some((s) => s.pilotId === body.districtId)) return error(400, 'INVALID_DISTRICT', 'districtId must be an existing district with at least one school');
    districtIds = [body.districtId];
  } else {
    pilotIds = (body.schoolIds ?? []).filter((id) => schools.some((s) => s.id === id));
    if (pilotIds.length === 0) return error(400, 'INVALID_SCHOOL', 'A champion needs at least one existing school (schoolIds)');
  }

  const invited = await inviteStaffUser(email, { role: body.role, invitedBy: user.email });
  if ('error' in invited) return error(502, 'INVITE_FAILED', invited.error);

  const container = getAdminUsersContainer();
  const { resources: existing } = await container.items.query<AdminUserDoc>({ query: 'SELECT * FROM c WHERE c.email = @e', parameters: [{ name: '@e', value: email }] }).fetchAll();
  const prev = existing[0];
  const doc: AdminUserDoc = {
    id: prev?.id ?? invited.userId,
    email,
    pilotIds: [...new Set([...(prev?.pilotIds ?? []), ...pilotIds])],
    districtIds: [...new Set([...(prev?.districtIds ?? []), ...districtIds])],
    permissions: body.role === 'district_admin' ? ['view_dashboard', 'export_data'] : ['view_dashboard'],
    isSuperAdmin: prev?.isSuperAdmin ?? false,
    role: prev?.role === 'district_admin' ? 'district_admin' : body.role,
    displayName: body.displayName?.slice(0, 80) ?? prev?.displayName ?? null,
    invitedBy: user.email,
    invitedAt: new Date().toISOString(),
    createdAt: prev?.createdAt ?? new Date().toISOString(),
  };
  await container.items.upsert(doc);
  const affected = body.role === 'district_admin' ? [body.districtId!] : [...new Set(schools.filter((s) => pilotIds.includes(s.id)).map((s) => s.pilotId))];
  for (const pilotId of affected) {
    await recordAudit(context, { action: 'staff.invite', actorEmail: user.email, actorRole: 'super_admin', pilotId, target: email,
      details: { role: body.role, schools: pilotIds.join(',') || null, alreadyHadAccount: invited.alreadyExisted } });
  }
  return { status: 200, jsonBody: { invited: email, role: doc.role, alreadyHadAccount: invited.alreadyExisted, schools: doc.pilotIds, districts: doc.districtIds } };
}

// ── Revoke ──────────────────────────────────────────────────────────

/**
 * Remove access. Body: { email, schoolIds?: string[], districtIds?: string[], all?: true }.
 * `all` (or removing the last school/district) strips every permission and bans
 * the Supabase account, so a teacher who leaves the district loses access at once.
 * Super-admin access (the LB_SUPERADMIN_EMAILS allowlist) can't be revoked here.
 */
export async function revoke(request: HttpRequest, context: InvocationContext, user: AuthContext): Promise<HttpResponseInit> {
  const body = (await request.json().catch(() => null)) as { email?: string; schoolIds?: string[]; districtIds?: string[]; all?: boolean } | null;
  const email = (body?.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return error(400, 'INVALID_EMAIL', 'A valid email is required');
  if (!body?.all && !body?.schoolIds?.length && !body?.districtIds?.length) return error(400, 'MISSING_FIELDS', 'Give schoolIds, districtIds, or all: true');

  const container = getAdminUsersContainer();
  const { resources } = await container.items.query<AdminUserDoc>({ query: 'SELECT * FROM c WHERE c.email = @e', parameters: [{ name: '@e', value: email }] }).fetchAll();
  const prev = resources[0];
  if (!prev) return error(404, 'NOT_FOUND', 'No staff account with that email');
  if (prev.isSuperAdmin) return error(400, 'IS_SUPER_ADMIN', 'Super-admin access is managed by LB_SUPERADMIN_EMAILS, not here');

  const schools = await loadSchools();
  const removeSchools = body.all ? prev.pilotIds ?? [] : body.schoolIds ?? [];
  const removeDistricts = body.all ? prev.districtIds ?? [] : body.districtIds ?? [];
  const pilotIds = (prev.pilotIds ?? []).filter((id) => !removeSchools.includes(id));
  const districtIds = (prev.districtIds ?? []).filter((id) => !removeDistricts.includes(id));
  const nothingLeft = pilotIds.length === 0 && districtIds.length === 0;

  await container.items.upsert({ ...prev, pilotIds, districtIds, permissions: nothingLeft ? [] : prev.permissions, revokedAt: nothingLeft ? new Date().toISOString() : undefined });
  const banned = nothingLeft ? await banStaffUser(prev.id) : false;

  const affected = new Set<string>([
    ...removeDistricts,
    ...schools.filter((s) => removeSchools.includes(s.id)).map((s) => s.pilotId),
  ]);
  for (const pilotId of affected.size ? affected : new Set([AUDIT_GLOBAL])) {
    await recordAudit(context, { action: 'staff.revoke', actorEmail: user.email, actorRole: 'super_admin', pilotId: pilotId === AUDIT_GLOBAL ? null : pilotId, target: email,
      details: { schools: removeSchools.join(',') || null, districts: removeDistricts.join(',') || null, allAccessRemoved: nothingLeft, signInBlocked: banned } });
  }
  return { status: 200, jsonBody: { email, remainingSchools: pilotIds, remainingDistricts: districtIds, allAccessRemoved: nothingLeft, signInBlocked: banned } };
}

// ── Audit log ───────────────────────────────────────────────────────

export async function auditLog(request: HttpRequest): Promise<HttpResponseInit> {
  const pilotId = request.query.get('pilotId');
  const action = request.query.get('action');
  const limit = Math.min(Number(request.query.get('limit')) || 200, 1000);
  const where = ["c.type = 'audit'"];
  const parameters: Array<{ name: string; value: string | number }> = [{ name: '@limit', value: limit }];
  if (pilotId) { where.push('c.pilotId = @p'); parameters.push({ name: '@p', value: pilotId }); }
  if (action) { where.push('c.action = @a'); parameters.push({ name: '@a', value: action }); }
  const { resources } = await getAnalyticsContainer().items.query<AuditDoc>({ query: `SELECT TOP @limit c.id, c.at, c.action, c.actorEmail, c.actorRole, c.pilotId, c.target, c.details FROM c WHERE ${where.join(' AND ')} ORDER BY c.at DESC`, parameters }).fetchAll();
  return { status: 200, jsonBody: { entries: resources, count: resources.length } };
}

// ── Overview: revenue vs Azure cost ─────────────────────────────────

function parseRange(request: HttpRequest): { from: Date; to: Date } | null {
  const now = new Date();
  const from = request.query.get('from') ? new Date(request.query.get('from')!) : monthProgress(now).monthStart;
  const to = request.query.get('to') ? new Date(request.query.get('to')!) : now;
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) return null;
  if (to.getTime() - from.getTime() > 400 * 86_400_000) return null;
  return { from, to };
}

type Meter = { schoolCode: string; pilotId: string; translator_units?: number; tts_units?: number; stt_units?: number; translator_calls?: number; tts_calls?: number; stt_calls?: number };

async function overview(request: HttpRequest): Promise<HttpResponseInit> {
  const range = parseRange(request);
  if (!range) return error(400, 'INVALID_RANGE', 'from/to must be ISO dates, from < to, at most 400 days apart');
  const { from, to } = range;
  const bucket = (d: Date) => Math.floor(d.getTime() / 300_000);
  return cached(`overview:${bucket(from)}:${bucket(to)}`, 5 * 60_000, () => computeOverview(from, to));
}

async function computeOverview(from: Date, to: Date): Promise<HttpResponseInit> {
  const fromDay = toDay(from), toDayStr = toDay(to);

  const [schools, districts, prices, meters, enrollRows, activeRows, eventRows, lookupRows, actual] = await Promise.all([
    loadSchools(),
    loadDistricts(),
    loadPrices(),
    getAnalyticsContainer().items.query<Meter>({ query: "SELECT c.schoolCode, c.pilotId, c.translator_units, c.tts_units, c.stt_units, c.translator_calls, c.tts_calls, c.stt_calls FROM c WHERE c.type = 'azure_meter' AND c.day >= @f AND c.day <= @t", parameters: [{ name: '@f', value: fromDay }, { name: '@t', value: toDayStr }] }).fetchAll().then((r) => r.resources),
    getEnrollmentsContainer().items.query<{ schoolCode: string; n: number }>('SELECT c.schoolCode, COUNT(1) AS n FROM c GROUP BY c.schoolCode').fetchAll().then((r) => r.resources),
    getSessionsContainer().items.query<{ s: string; u: string }>({ query: 'SELECT DISTINCT c.schoolCode AS s, c.studentCode AS u FROM c WHERE c.timestamp >= @f AND c.timestamp <= @t', parameters: [{ name: '@f', value: from.toISOString() }, { name: '@t', value: to.toISOString() }] }).fetchAll().then((r) => r.resources),
    getSessionsContainer().items.query<{ s: string; e: string; n: number }>({ query: 'SELECT c.schoolCode AS s, c.eventType AS e, COUNT(1) AS n FROM c WHERE c.timestamp >= @f AND c.timestamp <= @t GROUP BY c.schoolCode, c.eventType', parameters: [{ name: '@f', value: from.toISOString() }, { name: '@t', value: to.toISOString() }] }).fetchAll().then((r) => r.resources),
    getAnalyticsContainer().items.query<{ p: string; t: string; n: number }>({ query: "SELECT c.pilotId AS p, c.type AS t, COUNT(1) AS n FROM c WHERE (c.type = 'lexicon_hit' OR c.type = 'lexicon_miss') AND c.timestamp >= @f AND c.timestamp <= @t GROUP BY c.pilotId, c.type", parameters: [{ name: '@f', value: from.toISOString() }, { name: '@t', value: to.toISOString() }] }).fetchAll().then((r) => r.resources),
    readActualCost(from, to),
  ]);

  const units = new Map<string, Meter>();
  for (const m of meters) {
    const u = units.get(m.schoolCode) ?? { schoolCode: m.schoolCode, pilotId: m.pilotId };
    for (const k of ['translator_units', 'tts_units', 'stt_units', 'translator_calls', 'tts_calls', 'stt_calls'] as const) u[k] = (u[k] ?? 0) + (m[k] ?? 0);
    units.set(m.schoolCode, u);
  }
  const active = new Map<string, number>();
  for (const r of activeRows) active.set(r.s, (active.get(r.s) ?? 0) + 1);

  const pilotIds = [...new Set([...schools.map((s) => s.pilotId), ...districts.map((d) => d.pilotId)])];
  const rows = pilotIds.map((pilotId) => {
    const district = districts.find((d) => d.pilotId === pilotId) ?? null;
    const dSchools = schools.filter((s) => s.pilotId === pilotId);
    const schoolRows = dSchools.map((s) => {
      const u = units.get(s.schoolCode) ?? { schoolCode: s.schoolCode, pilotId };
      const cost = meteredCostUsd(u, prices);
      const events = Object.fromEntries(eventRows.filter((e) => e.s === s.schoolCode).map((e) => [e.e, e.n]));
      const seatsUsed = enrollRows.find((e) => e.schoolCode === s.schoolCode)?.n ?? 0;
      return {
        schoolCode: s.schoolCode, schoolName: s.schoolName, isDemo: !!s.isDemo, status: s.status ?? null, tier: s.tier ?? null,
        seatsPurchased: s.seats ?? null, seatsUsed, overSeat: s.seats != null && seatsUsed > s.seats,
        activeStudents: active.get(s.schoolCode) ?? 0,
        revenueUsd: round2(district?.contractAnnualUsd ? 0 : accruedRevenue(from, to, [s])),
        azureCostUsd: round4(cost.total), azureCost: { translator: round4(cost.translator), tts: round4(cost.tts), stt: round4(cost.stt) },
        usage: {
          lookups: events.term_lookup ?? 0, audioPlays: events.tts_play ?? 0, glossaryViews: events.glossary_view ?? 0, flags: events.flag_event ?? 0,
          translatorChars: u.translator_units ?? 0, ttsChars: u.tts_units ?? 0, talkToTeacherMinutes: round2((u.stt_units ?? 0) / 60),
        },
      };
    });
    const revenueUsd = round2(accruedRevenue(from, to, dSchools, district));
    const azureCostUsd = round4(schoolRows.reduce((s, r) => s + r.azureCostUsd, 0));
    const hits = lookupRows.filter((r) => r.p === pilotId && r.t === 'lexicon_hit').reduce((s, r) => s + r.n, 0);
    const misses = lookupRows.filter((r) => r.p === pilotId && r.t === 'lexicon_miss').reduce((s, r) => s + r.n, 0);
    return {
      pilotId, name: district?.name ?? pilotId, isDemo: !!district?.isDemo || (dSchools.length > 0 && dSchools.every((s) => s.isDemo)),
      revenueUsd, azureCostUsd, marginUsd: round2(revenueUsd - azureCostUsd),
      marginPct: revenueUsd > 0 ? round2(((revenueUsd - azureCostUsd) / revenueUsd) * 100) : null,
      seatsPurchased: dSchools.reduce((s, x) => s + (x.seats ?? 0), 0), seatsUsed: schoolRows.reduce((s, r) => s + r.seatsUsed, 0),
      activeStudents: schoolRows.reduce((s, r) => s + r.activeStudents, 0),
      azureDependencyPct: hits + misses > 0 ? round2((misses / (hits + misses)) * 100) : null,
      schools: schoolRows,
    };
  });

  const real = rows.filter((r) => !r.isDemo);
  const unattributed = units.get('unknown');
  const totals = {
    revenueUsd: round2(real.reduce((s, r) => s + r.revenueUsd, 0)),
    meteredAzureCostUsd: round4(real.reduce((s, r) => s + r.azureCostUsd, 0)),
    unattributedAzureCostUsd: round4(unattributed ? meteredCostUsd(unattributed, prices).total : 0),
    activeStudents: real.reduce((s, r) => s + r.activeStudents, 0),
    actualAzureBillUsd: actual ? round2(actual.totalUsd) : null,
  };
  return {
    status: 200,
    jsonBody: {
      range: { from: from.toISOString(), to: to.toISOString() },
      totals,
      actualAzureBill: actual ?? null,
      notes: [
        'Metered Azure cost = metered units × list prices (GET /api/ops/pricing). While Translator and Speech are on free tiers the actual bill is ~$0; metered cost shows what the same usage will cost on paid tiers.',
        'Demo districts are listed but excluded from totals.',
        actual ? 'Actual bill from Azure Cost Management (subscription-wide).' : 'Actual Azure bill unavailable — managed identity not configured.',
      ],
      districts: rows,
    },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

// ── Health ──────────────────────────────────────────────────────────

type HealthDoc = Record<string, number | string>;

async function health(): Promise<HttpResponseInit> {
  const now = new Date();
  const { monthStart } = monthProgress(now);
  const today = toDay(now);
  const dayAgo = new Date(now.getTime() - 86_400_000);
  const hourAgo = new Date(now.getTime() - 3_600_000);

  const { resources: days } = await getAnalyticsContainer().items.query<HealthDoc>(
    { query: "SELECT * FROM c WHERE c.type = 'ops_health' AND c.day >= @m", parameters: [{ name: '@m', value: toDay(monthStart) }] },
    { partitionKey: OPS_PARTITION }
  ).fetchAll();
  const sum = (k: string) => days.reduce((s, d) => s + (Number(d[k]) || 0), 0);
  const todayDoc = days.find((d) => d.day === today) ?? {};
  const latency = (svc: string) => Object.fromEntries(Object.entries(todayDoc).filter(([k]) => k.startsWith(`${svc}_lat_`)).map(([k, v]) => [k.replace(`${svc}_lat_`, ''), Number(v)]));

  const env = process.env;
  const [tr, sp, cosmos, cosmos429, ai, fnExec] = await Promise.all([
    readMetrics(env.LB_TRANSLATOR_RESOURCE_ID, ['TextCharactersTranslated', 'BlockedCalls', 'TotalCalls', 'TotalErrors'], { from: monthStart, to: now, interval: 'P1D', aggregation: 'Total' }),
    readMetrics(env.LB_SPEECH_RESOURCE_ID, ['SynthesizedCharacters', 'AudioSecondsTranscribed', 'BlockedCalls'], { from: monthStart, to: now, interval: 'P1D', aggregation: 'Total' }),
    readMetrics(env.LB_COSMOS_RESOURCE_ID, ['NormalizedRUConsumption', 'DataUsage', 'ProvisionedThroughput', 'ServiceAvailability'], { from: hourAgo, to: now, interval: 'PT5M', aggregation: 'Maximum,Average,Total' }),
    readMetrics(env.LB_COSMOS_RESOURCE_ID, ['TotalRequests'], { from: hourAgo, to: now, interval: 'PT5M', aggregation: 'Count', filter: "StatusCode eq '429'" }),
    readMetrics(env.LB_APPINSIGHTS_RESOURCE_ID, ['requests/count', 'requests/failed'], { from: dayAgo, to: now, interval: 'PT1H', aggregation: 'Count' }),
    readMetrics(env.LB_FUNCTIONAPP_RESOURCE_ID, ['FunctionExecutionCount'], { from: monthStart, to: now, interval: 'P1D', aggregation: 'Total' }),
  ]);
  const blocked24h = async (id: string | undefined) => (await readMetrics(id, ['BlockedCalls'], { from: dayAgo, to: now, interval: 'PT1H', aggregation: 'Total' }))?.BlockedCalls?.total;
  const [trBlocked, spBlocked, trSku, spSku] = await Promise.all([
    blocked24h(env.LB_TRANSLATOR_RESOURCE_ID), blocked24h(env.LB_SPEECH_RESOURCE_ID),
    readSku(env.LB_TRANSLATOR_RESOURCE_ID), readSku(env.LB_SPEECH_RESOURCE_ID),
  ]);

  const svc = (name: 'translator' | 'tts' | 'stt', monitor: number | undefined, blocked: number | undefined, sku: string | null): ServiceUsage => ({
    monthToDate: monitor ?? sum(`${name}_units`),
    source: monitor !== undefined ? 'azure_monitor' : 'metered',
    blocked24h: blocked,
    callsToday: Number(todayDoc[`${name}_calls`]) || 0,
    failuresToday: Number(todayDoc[`${name}_failures`]) || 0,
    latencyBuckets: latency(name),
    sku,
  });

  const inputs = {
    now,
    translator: svc('translator', tr?.TextCharactersTranslated?.total, trBlocked, trSku),
    tts: svc('tts', sp?.SynthesizedCharacters?.total, spBlocked, spSku),
    stt: svc('stt', sp?.AudioSecondsTranscribed?.total, spBlocked, spSku),
    cosmos: cosmos ? {
      maxNormalizedRuPct: cosmos.NormalizedRUConsumption?.max,
      storageGb: (cosmos.DataUsage?.max ?? 0) / 1e9,
      provisionedRu: cosmos.ProvisionedThroughput?.max,
      availabilityPct: cosmos.ServiceAvailability?.average ?? undefined,
      throttled1h: cosmos429?.TotalRequests?.total ?? 0,
    } : null,
    functions: ai || fnExec ? {
      requests24h: ai?.['requests/count']?.total,
      failed24h: ai?.['requests/failed']?.total,
      executionsMonthToDate: fnExec?.FunctionExecutionCount?.total,
    } : null,
    monitoringAvailable: managementConfigured() && !!(cosmos || tr),
  };
  const banners: HealthBanner[] = healthBanners(inputs);

  return {
    status: 200,
    jsonBody: {
      generatedAt: now.toISOString(),
      banners,
      freeTier: {
        translatorChars: { used: inputs.translator.monthToDate, limit: FREE_TIER.translatorCharsPerMonth, source: inputs.translator.source },
        ttsChars: { used: inputs.tts.monthToDate, limit: FREE_TIER.ttsCharsPerMonth, source: inputs.tts.source },
        sttSeconds: { used: inputs.stt.monthToDate, limit: FREE_TIER.sttSecondsPerMonth, source: inputs.stt.source },
        resetsOn: monthProgress(now).nextReset,
      },
      dependencies: Object.fromEntries((['translator', 'tts', 'stt'] as const).map((s) => [s, {
        callsToday: inputs[s].callsToday, failuresToday: inputs[s].failuresToday, latencyBucketsToday: inputs[s].latencyBuckets,
        blocked24h: inputs[s].blocked24h ?? null,
      }])),
      cosmos: inputs.cosmos,
      api: inputs.functions,
      thresholds: THRESHOLDS,
      monitoringAvailable: inputs.monitoringAvailable,
      tiers: { translator: trSku, speech: spSku },
    },
  };
}
