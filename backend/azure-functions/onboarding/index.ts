import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomBytes } from 'crypto';
import {
  OnboardingSchoolsResponse,
  OnboardingEnrollRequest,
  OnboardingEnrollResponse,
  EnrollmentDoc,
  PilotSchool,
  GradeBand,
} from '../../shared/types';
import { getEnrollmentsContainer, getPilotsContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, validateApiKey, checkRateLimit, errorResponse } from '../../shared/validators';

/**
 * onboarding
 *
 * Two routes:
 *   GET  /onboarding/schools  — returns list of pilot schools + grade bands
 *   POST /onboarding/enroll   — creates a student code and enrollment record
 *
 * Called once per student at first install.
 */

app.http('onboarding-schools', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'onboarding/schools',
  handler: getSchools,
});

app.http('onboarding-enroll', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'onboarding/enroll',
  handler: enroll,
});

function generateStudentCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1 to avoid confusion
  const bytes = randomBytes(6); // 32^6 = ~1 billion possible codes
  const code = Array.from(bytes).map(b => chars[b % chars.length]).join('');
  return `LB-${code}`;
}

const error = errorResponse;

export async function getSchools(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const keyCheck = validateApiKey(request);
  if (!keyCheck.valid) {
    return error(401, 'UNAUTHORIZED', keyCheck.error);
  }

  // Rate limit by IP-like key (no studentCode available for GET)
  const clientIp = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateCheck = await checkRateLimit(`schools:${clientIp}`);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  try {
    const container = getPilotsContainer();
    const { resources } = await container.items
      .query<PilotSchool>('SELECT c.schoolCode, c.schoolName, c.gradeBands FROM c')
      .fetchAll();

    const response: OnboardingSchoolsResponse = {
      schools: resources.map(s => ({
        schoolCode: s.schoolCode,
        schoolName: s.schoolName,
        gradeBands: s.gradeBands,
      })),
    };
    return { status: 200, jsonBody: response };
  } catch (err) {
    context.warn('Failed to fetch schools:', err);
    return error(500, 'INTERNAL_ERROR', 'Failed to load schools');
  }
}

export async function enroll(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  const keyCheck = validateApiKey(request);
  if (!keyCheck.valid) {
    return error(401, 'UNAUTHORIZED', keyCheck.error);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'MISSING_FIELDS', 'Request body must be valid JSON');
  }

  const fieldCheck = requireFields(body, ['schoolCode', 'gradeBand', 'language']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const req = body as OnboardingEnrollRequest;

  if (!isValidLanguage(req.language)) {
    return error(400, 'INVALID_LANGUAGE', `Language '${req.language}' is not supported`);
  }

  // Rate limit enrollment by IP
  const clientIp = request.headers.get('x-forwarded-for') ?? 'unknown';
  const rateCheck = await checkRateLimit(`enroll:${clientIp}`);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  const VALID_GRADE_BANDS = ['K-2', '3-5', '6-8', '9-12'];
  if (!VALID_GRADE_BANDS.includes(req.gradeBand)) {
    return error(400, 'INVALID_GRADE_BAND', `Grade band '${req.gradeBand}' is not valid`);
  }

  // Verify school exists
  try {
    const pilots = getPilotsContainer();
    const { resources } = await pilots.items
      .query({ query: 'SELECT c.id FROM c WHERE c.schoolCode = @sc', parameters: [{ name: '@sc', value: req.schoolCode }] })
      .fetchAll();
    if (resources.length === 0) {
      return error(400, 'INVALID_SCHOOL', `School '${req.schoolCode}' not found`);
    }
  } catch (err) {
    context.warn('School validation failed:', err);
  }

  // Generate code with collision retry
  const container = getEnrollmentsContainer();
  let studentCode = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    studentCode = generateStudentCode();
    const doc: EnrollmentDoc = {
      id: studentCode,
      schoolCode: req.schoolCode,
      gradeBand: req.gradeBand as GradeBand,
      language: req.language,
      createdAt: new Date().toISOString(),
    };
    try {
      await container.items.create(doc);
      context.log(`Enrolled ${studentCode} at ${req.schoolCode} (${req.gradeBand})`);
      break;
    } catch (err: unknown) {
      const status = (err as { code?: number })?.code;
      if (status === 409 && attempt < 2) {
        context.warn(`Code collision on ${studentCode}, retrying`);
        continue;
      }
      context.warn('Enrollment write failed:', err);
      return error(500, 'INTERNAL_ERROR', 'Failed to create enrollment');
    }
  }

  const response: OnboardingEnrollResponse = {
    studentCode,
    schoolCode: req.schoolCode,
    gradeBand: req.gradeBand as GradeBand,
    language: req.language,
  };
  return { status: 201, jsonBody: response };
}
