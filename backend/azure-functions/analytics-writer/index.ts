import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import {
  AnalyticsWriterRequest,
  AnalyticsWriterResponse,
  AnalyticsWriterErrorResponse,
  SessionUsageDoc,
} from '../../shared/types';
import { getSessionsContainer } from '../../shared/cosmos-client';
import { checkForPII, requireFields, isValidLanguage } from '../../shared/validators';

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
  'tts_request',
  'flag_event',
  'session_end',
  'glossary_view',
] as const;

export async function analyticsWriter(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('analytics-writer invoked');

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
    'sessionToken',
    'pilotId',
    'language',
    'eventType',
    'timestamp',
    'extensionVersion',
  ]);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { sessionToken, pilotId, language, eventType, timestamp, extensionVersion } =
    body as AnalyticsWriterRequest;

  // ── 4. Validate language ───────────────────────────────────────
  if (!isValidLanguage(language)) {
    return error(400, 'MISSING_FIELDS', `Language '${language}' is not supported`);
  }

  // ── 5. Validate event type ─────────────────────────────────────
  if (!VALID_EVENT_TYPES.includes(eventType as typeof VALID_EVENT_TYPES[number])) {
    return error(400, 'INVALID_EVENT_TYPE', `Event type '${eventType}' is not valid`);
  }

  // ── 6. Write to Cosmos DB ──────────────────────────────────────
  const eventId = randomUUID();
  const serverTimestamp = new Date().toISOString();

  const doc: SessionUsageDoc = {
    id: eventId,
    sessionToken,
    pilotId,
    language,
    eventType,
    timestamp,
    extensionVersion,
  };

  try {
    const container = getSessionsContainer();
    await container.items.create(doc);
    context.log(`Event logged: ${eventId} — ${eventType} for pilot ${pilotId}`);
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

function error(
  status: number,
  code: AnalyticsWriterErrorResponse['error'],
  details: string
): HttpResponseInit {
  const body: AnalyticsWriterErrorResponse = { error: code, details };
  return { status, jsonBody: body };
}
