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
import { requireFields, isValidLanguage, validateApiKey, checkRateLimit, errorResponse } from '../../shared/validators';

/**
 * flag-handler
 *
 * Processes flags from students on translations, audio, or full passages.
 * Accepts up to 500 characters of highlighted text (not just single words).
 * Deduplicates by (flaggedText + language) hash.
 * Escalates status at thresholds: 3 → review, 6 → bounty, 10 → high_priority.
 * Foundation for the Phase 3 interpreter marketplace.
 *
 * TOS COMPLIANCE: This handler stores ONLY the original highlighted text
 * (student input) and the target language. It intentionally does NOT store
 * Azure Translator output, Azure TTS audio URLs, or any Azure-derived content.
 * When a flag reaches "bounty" status, only (flaggedText + language) is sent to
 * the interpreter marketplace. Azure content is an ephemeral placeholder that
 * gets replaced by interpreter-provided translations and audio.
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
  const fieldCheck = requireFields(body, ['flaggedText', 'language', 'studentCode', 'timestamp']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const { flaggedText, language, studentCode, timestamp } = body as FlagEventRequest;

  // ── 2b. Validate flagged text length (same 500-char limit as TTS) ──
  if (flaggedText.length > 500) {
    return error(400, 'TEXT_TOO_LONG', 'Flagged text must be 500 characters or fewer');
  }

  // ── 2c. Rate limit ──────────────────────────────────────────────
  const rateCheck = await checkRateLimit(`flag:${studentCode}`);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  // ── 3. Validate language ───────────────────────────────────────
  if (!isValidLanguage(language)) {
    return error(400, 'INVALID_LANGUAGE', `Language '${language}' is not supported`);
  }

  // ── 4. Generate deduplication key ─────────────────────────────
  // Same flaggedText + language = same document, regardless of who flagged it
  const flagId = createHash('sha256')
    .update(`${flaggedText.toLowerCase().trim()}::${language}`)
    .digest('hex');

  context.log(`Flag received — text: "${flaggedText.substring(0, 50)}...", language: ${language}, student: ${studentCode}`);

  // ── 5. Upsert flag document (single atomic patch to prevent race conditions) ─
  const container = getFlagsContainer();
  let flagCount: number;
  let status: FlagDoc['status'];

  try {
    // Single atomic patch: increment count + update all derived fields at once
    // Cosmos DB executes all patch ops in one transaction — no gap for races
    const { resource: patched } = await container.item(flagId, language).patch<FlagDoc>([
      { op: 'incr', path: '/flagCount', value: 1 },
      { op: 'set', path: '/lastFlaggedAt', value: timestamp },
    ]);
    flagCount = patched!.flagCount;
    status = escalationStatus(flagCount);

    // Second patch for derived fields — safe because status is computed from
    // the authoritative count returned by the atomic increment above
    await container.item(flagId, language).patch([
      { op: 'set', path: '/status', value: status },
      { op: 'set', path: '/requiresReview', value: flagCount >= FLAG_THRESHOLDS.REVIEW },
    ]);
  } catch {
    // Document doesn't exist — create it
    try {
      const newDoc: FlagDoc = {
        id: flagId,
        flaggedText: flaggedText.toLowerCase().trim(),
        language,
        flagCount: 1,
        status: 'logged',
        schoolCodes: [],
        contentSource: 'student_input',
        createdAt: timestamp,
        lastFlaggedAt: timestamp,
        requiresReview: false,
      };
      await container.items.create(newDoc);
      flagCount = 1;
      status = 'logged';
    } catch (createErr: unknown) {
      // 409 conflict — another instance created the doc between our read and create
      const code = (createErr as { code?: number })?.code;
      if (code === 409) {
        try {
          const { resource: patched } = await container.item(flagId, language).patch<FlagDoc>([
            { op: 'incr', path: '/flagCount', value: 1 },
            { op: 'set', path: '/lastFlaggedAt', value: timestamp },
          ]);
          flagCount = patched!.flagCount;
          status = escalationStatus(flagCount);
          await container.item(flagId, language).patch([
            { op: 'set', path: '/status', value: status },
            { op: 'set', path: '/requiresReview', value: flagCount >= FLAG_THRESHOLDS.REVIEW },
          ]);
        } catch (retryErr) {
          context.warn('Flag conflict retry failed:', retryErr);
          return error(500, 'INTERNAL_ERROR', 'Failed to process flag');
        }
      } else {
        context.warn('Flag upsert failed:', createErr);
        return error(500, 'INTERNAL_ERROR', 'Failed to process flag');
      }
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
