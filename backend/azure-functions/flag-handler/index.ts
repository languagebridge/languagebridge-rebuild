import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHash } from 'crypto';
import {
  FlagEventRequest,
  FlagHandlerResponse,
  FlagHandlerErrorResponse,
  FlagDoc,
  FLAG_THRESHOLDS,
} from '../../shared/types';
import { getFlagsContainer } from '../../shared/cosmos-client';
import { requireFields, isValidLanguage, validateApiKey, errorResponse } from '../../shared/validators';

/**
 * flag-handler
 *
 * Processes pronunciation flags from students.
 * Deduplicates by (word + language) hash.
 * Escalates status at thresholds: 3 → review, 6 → bounty, 10 → high_priority.
 * Foundation for the Phase 3 interpreter marketplace.
 */

app.http('flag-handler', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'flag-handler',
  handler: flagHandler,
});

export async function flagHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('flag-handler invoked');

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

  // ── 2. Validate required fields ────────────────────────────────
  const fieldCheck = requireFields(body, ['word', 'language', 'studentCode', 'timestamp']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { word, language, studentCode, audioUrl, timestamp } = body as FlagEventRequest;

  // ── 3. Validate language ───────────────────────────────────────
  if (!isValidLanguage(language)) {
    return error(400, 'INVALID_LANGUAGE', `Language '${language}' is not supported`);
  }

  // ── 4. Generate deduplication key ─────────────────────────────
  // Same word + language = same document, regardless of who flagged it
  const flagId = createHash('sha256')
    .update(`${word.toLowerCase().trim()}::${language}`)
    .digest('hex');

  context.log(`Flag received — word: "${word}", language: ${language}, student: ${studentCode}`);

  // ── 5. Upsert flag document (atomic increment to avoid race conditions) ─
  const container = getFlagsContainer();
  let flagCount: number;
  let status: FlagDoc['status'];

  try {
    // Try atomic patch first (existing document)
    const { resource: patched } = await container.item(flagId, language).patch<FlagDoc>([
      { op: 'incr', path: '/flagCount', value: 1 },
      { op: 'set', path: '/lastFlaggedAt', value: timestamp },
    ]);
    flagCount = patched!.flagCount;
    status = escalationStatus(flagCount);

    // Update status + requiresReview based on new count
    await container.item(flagId, language).patch([
      { op: 'set', path: '/status', value: status },
      { op: 'set', path: '/requiresReview', value: flagCount >= FLAG_THRESHOLDS.REVIEW },
    ]);
  } catch {
    // Document doesn't exist — create it
    try {
      const newDoc: FlagDoc = {
        id: flagId,
        word: word.toLowerCase().trim(),
        language,
        flagCount: 1,
        status: 'logged',
        schoolCodes: [],
        audioUrl,
        createdAt: timestamp,
        lastFlaggedAt: timestamp,
        requiresReview: false,
      };
      await container.items.create(newDoc);
      flagCount = 1;
      status = 'logged';
    } catch (err) {
      context.warn('Flag upsert failed:', err);
      return error(500, 'INTERNAL_ERROR', 'Failed to process flag');
    }
  }

  context.log(`Flag ${flagId} — count: ${flagCount}, status: ${status}`);

  // ── 6. Return response ─────────────────────────────────────────
  const response: FlagHandlerResponse = {
    flagId,
    flagCount,
    status,
    requiresReview: flagCount >= FLAG_THRESHOLDS.REVIEW,
  };
  return { status: 200, jsonBody: response };
}

// ============================================
// HELPERS
// ============================================

function escalationStatus(count: number): FlagDoc['status'] {
  if (count >= FLAG_THRESHOLDS.HIGH_PRIORITY) return 'high_priority';
  if (count >= FLAG_THRESHOLDS.BOUNTY) return 'bounty';
  if (count >= FLAG_THRESHOLDS.REVIEW) return 'review';
  return 'logged';
}

const error = errorResponse;
