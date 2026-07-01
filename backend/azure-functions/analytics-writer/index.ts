import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import {
  AnalyticsWriterRequest,
  AnalyticsWriterResponse,
  AnalyticsWriterErrorResponse,
  SessionUsageDoc,
  EnrollmentDoc,
} from '../../shared/types';
import { getSessionsContainer, getEnrollmentsContainer } from '../../shared/cosmos-client';
import { checkForPII, requireFields, isValidLanguage, isValidStudentCode, validateApiKey, errorResponse, checkRateLimit } from '../../shared/validators';

/**
 * analytics-writer
 *
 * Logs anonymous session events to Cosmos DB.
 * Rejects any payload containing PII before writing anything.
 * FERPA/COPPA compliance is enforced here.
 */

app.http('analytics-writer', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'analytics-writer',
  handler: analyticsWriter,
});

const VALID_EVENT_TYPES = [
  'session_start',
  'session_end',
  'term_lookup',
  'scaffold_view',
  'tts_play',
  'flag_event',
  'glossary_view',
] as const;

export async function analyticsWriter(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('analytics-writer invoked');

  // ── 0. Auth ──────────────────────────────────────────────────
  const keyCheck = validateApiKey(request);
  if (!keyCheck.valid) {
    return error(401, 'UNAUTHORIZED', keyCheck.error);
  }

  // ── 1. Parse body ──────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'MISSING_FIELDS', 'Request body must be valid JSON');
  }

  // ── 2. PII check — runs before anything else ───────────────────
  const piiResult = checkForPII(body);
  if (piiResult.hasPII) {
    context.log(`PII violation detected: ${piiResult.prohibitedFields.join(', ')}`);
    const body: AnalyticsWriterErrorResponse = {
      error: 'PII_VIOLATION',
      details: 'Payload contains prohibited fields',
      prohibitedFields: piiResult.prohibitedFields,
    };
    return { status: 400, jsonBody: body };
  }

  // ── 3. Validate required fields ────────────────────────────────
  const fieldCheck = requireFields(body, [
    'studentCode',
    'language',
    'eventType',
    'timestamp',
    'extensionVersion',
  ]);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const req = body as AnalyticsWriterRequest;

  if (!isValidStudentCode(req.studentCode)) {
    return error(400, 'INVALID_STUDENT_CODE', 'studentCode is malformed');
  }

  // ── 4. Validate language ───────────────────────────────────────
  if (!isValidLanguage(req.language)) {
    return error(400, 'MISSING_FIELDS', `Language '${req.language}' is not supported`);
  }

  // ── 5. Validate event type ─────────────────────────────────────
  if (!VALID_EVENT_TYPES.includes(req.eventType as typeof VALID_EVENT_TYPES[number])) {
    return error(400, 'INVALID_EVENT_TYPE', `Event type '${req.eventType}' is not valid`);
  }

  // ── 5b. Rate limit ──────────────────────────────────────────────
  // Higher limit — analytics is fire-and-forget, one event per interaction
  const rateCheck = await checkRateLimit(`analytics:${req.studentCode}`, 300);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  // ── 6. Look up enrollment to resolve school + grade band ───────
  let schoolCode = 'unknown';
  let gradeBand: string = 'unknown';
  try {
    const enrollments = getEnrollmentsContainer();
    const { resource } = await enrollments.item(req.studentCode, req.studentCode).read<EnrollmentDoc>();
    if (resource) {
      schoolCode = resource.schoolCode;
      gradeBand = resource.gradeBand;
    } else {
      context.warn(`Unknown studentCode: ${req.studentCode}`);
    }
  } catch {
    context.warn(`Failed to resolve enrollment for ${req.studentCode}`);
  }

  // ── 7. Write to Cosmos DB ──────────────────────────────────────
  const eventId = randomUUID();
  const serverTimestamp = new Date().toISOString();

  const doc: SessionUsageDoc = {
    id: eventId,
    studentCode: req.studentCode,
    schoolCode,
    gradeBand: gradeBand as SessionUsageDoc['gradeBand'],
    language: req.language,
    eventType: req.eventType,
    timestamp: req.timestamp,
    extensionVersion: req.extensionVersion,
    ...(req.term && { term: req.term }),
    ...(req.subject && { subject: req.subject }),
    ...(req.source && { source: req.source }),
    ...(req.difficulty && { difficulty: req.difficulty }),
  };

  try {
    const container = getSessionsContainer();
    await container.items.create(doc);
    context.log(`Event logged: ${eventId} — ${req.eventType} for ${req.studentCode}`);
  } catch (err) {
    context.log('Cosmos write failed:', err);
    return error(500, 'INTERNAL_ERROR', 'Failed to log event');
  }

  // ── 7. Return success ──────────────────────────────────────────
  const response: AnalyticsWriterResponse = {
    logged: true,
    eventId,
    timestamp: serverTimestamp,
  };
  return { status: 200, jsonBody: response };
}

// ============================================
// HELPERS
// ============================================

const error = errorResponse;
