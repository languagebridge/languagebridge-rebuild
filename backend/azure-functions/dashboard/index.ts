import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { GradeBand } from '../../shared/types';
import { getSessionsContainer } from '../../shared/cosmos-client';
import { resolveAuthContext } from '../../shared/auth-helpers';
import { errorResponse, checkRateLimit } from '../../shared/validators';
import * as queries from '../../shared/reporting-queries';

/**
 * dashboard
 *
 * Authenticated endpoint for teacher/admin analytics.
 * Enforces school-level access control: a teacher can ONLY query
 * schoolCodes that belong to their assigned pilotIds.
 *
 * POST /dashboard
 * Body: { query, schoolCode, gradeBand, startDate, endDate }
 * Auth: Bearer <supabase-jwt>
 */

app.http('dashboard', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'dashboard',
  handler: dashboard,
});

const VALID_QUERIES: Record<string, string> = {
  usage_by_week: queries.USAGE_BY_WEEK,
  active_students: queries.ACTIVE_STUDENTS_RAW,
  term_retention: queries.TERM_RETENTION_RAW,
  student_progress: queries.STUDENT_PROGRESS,
  scaffold_engagement: queries.SCAFFOLD_ENGAGEMENT,
  audio_engagement: queries.AUDIO_ENGAGEMENT,
  student_independence: queries.STUDENT_INDEPENDENCE,
  bridge_vs_fallback: queries.BRIDGE_VS_FALLBACK,
  vocabulary_breadth: queries.VOCABULARY_BREADTH_RAW,
  top_flagged: queries.TOP_FLAGGED_RAW,
};

const VALID_GRADE_BANDS: GradeBand[] = ['K-2', '3-5', '6-8', '9-12'];

export async function dashboard(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('dashboard invoked');

  // ── 1. Authenticate ──────────────────────────────────────────
  const auth = await resolveAuthContext(request, context);
  if (!auth.authenticated) {
    return error(auth.status, auth.error, auth.details);
  }

  const user = auth.context;

  // ── 2. Check permission ──────────────────────────────────────
  if (!user.permissions.includes('view_dashboard')) {
    return error(403, 'FORBIDDEN', 'You do not have permission to view the dashboard');
  }

  // ── 3. Rate limit per user ───────────────────────────────────
  const rateCheck = await checkRateLimit(`dashboard:${user.userId}`);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  // ── 4. Parse body ────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'INVALID_REQUEST', 'Request body must be valid JSON');
  }

  const queryName = body.query as string;
  const schoolCode = body.schoolCode as string;
  const gradeBand = body.gradeBand as string;
  const startDate = body.startDate as string;
  const endDate = body.endDate as string;

  // ── 5. Validate fields ───────────────────────────────────────
  if (!queryName || !schoolCode || !gradeBand || !startDate || !endDate) {
    return error(400, 'MISSING_FIELDS', 'Required: query, schoolCode, gradeBand, startDate, endDate');
  }

  if (!VALID_QUERIES[queryName]) {
    return error(400, 'INVALID_QUERY', `Unknown query: '${queryName}'. Valid: ${Object.keys(VALID_QUERIES).join(', ')}`);
  }

  if (!VALID_GRADE_BANDS.includes(gradeBand as GradeBand)) {
    return error(400, 'INVALID_GRADE_BAND', `Grade band '${gradeBand}' is not valid`);
  }

  // Validate date formats and logical ordering
  const startMs = Date.parse(startDate);
  const endMs = Date.parse(endDate);
  if (isNaN(startMs) || isNaN(endMs)) {
    return error(400, 'INVALID_DATE', 'startDate and endDate must be valid ISO 8601 dates');
  }
  if (startMs > endMs) {
    return error(400, 'INVALID_DATE', 'startDate must be before endDate');
  }

  // ── 6. ENFORCE SCHOOL ACCESS ─────────────────────────────────
  // This is the critical multi-tenancy check.
  // A teacher can only query schools their pilotIds map to.
  if (!user.isSuperAdmin && !user.accessibleSchoolCodes.includes(schoolCode)) {
    context.warn(`Access denied: ${user.email} tried to query schoolCode '${schoolCode}' (accessible: ${user.accessibleSchoolCodes.join(', ')})`);
    return error(403, 'FORBIDDEN', 'You do not have access to this school');
  }

  // ── 7. Execute query ─────────────────────────────────────────
  const sql = VALID_QUERIES[queryName];
  const MAX_RESULTS = 5_000; // Cap results to prevent DoS via unbounded queries

  try {
    const container = getSessionsContainer();
    const { resources } = await container.items
      .query({
        query: sql,
        parameters: [
          { name: '@schoolCode', value: schoolCode },
          { name: '@gradeBand', value: gradeBand },
          { name: '@startDate', value: startDate },
          { name: '@endDate', value: endDate },
        ],
      }, { maxItemCount: MAX_RESULTS })
      .fetchAll();

    const truncated = resources.length >= MAX_RESULTS;
    if (truncated) {
      context.warn(`Dashboard query '${queryName}' hit ${MAX_RESULTS} row limit for ${schoolCode}/${gradeBand}`);
    }
    context.log(`Dashboard query '${queryName}' — ${resources.length} results for ${schoolCode}/${gradeBand}`);

    return {
      status: 200,
      jsonBody: {
        query: queryName,
        schoolCode,
        gradeBand,
        startDate,
        endDate,
        results: resources.slice(0, MAX_RESULTS),
        count: resources.length,
        truncated,
      },
    };
  } catch (err) {
    context.error('Dashboard query failed:', err);
    return error(500, 'INTERNAL_ERROR', 'Failed to execute query');
  }
}

const error = errorResponse;
