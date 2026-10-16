import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHash } from 'crypto';
import {
  FlagEventRequest,
  FlagHandlerResponse,
  FlagDoc,
  FlagType,
  FlagContextSample,
  FlagSurface,
  SeatRole,
  GradeBand,
  FLAG_TYPES,
  FLAG_THRESHOLDS,
  FLAG_CONTEXT_SAMPLE_CAP,
  FLAG_MAX_TERM_WORDS,
} from '../../shared/types';
import { getFlagsContainer } from '../../shared/cosmos-client';
import { findEnrollment } from '../../shared/enrollments';
import { isValidVariant } from '../../shared/variants';
import {
  requireFields, isValidLanguage, isValidStudentCode, validateApiKey, checkRateLimit, errorResponse,
  checkForPII, redactPII, scrubFlagContext,
} from '../../shared/validators';

/**
 * flag-handler
 *
 * Capture step of the Lexicon flywheel (flywheel/SPEC.md §3). Each report of a
 * wrong meaning, wrong sound, or misheard word increments one CANDIDATE document,
 * keyed by (text + language + subject + variant). Up to FLAG_CONTEXT_SAMPLE_CAP scrubbed
 * context samples are kept per candidate so a reviewer can tell senses apart.
 *
 * Escalation by count: 3 → review, 6 → bounty, 10 → high_priority. Statuses set
 * by the admin flag queue (in_review, resolved, dismissed) are not overwritten,
 * except that a resolved candidate re-opens to 'review' when flagged again.
 *
 * PRIVACY (MASTER-DOCUMENT §7):
 *   - No identity is stored. School and grade band come from the enrollment, not the client.
 *   - flaggedText with an email / phone / SSN is rejected. Context and misheard
 *     transcripts are redacted (redactPII) and trimmed before storage.
 *   - No audio is accepted or stored. Recognition flags carry the misheard TEXT only.
 *   - Flag text is never written to function logs.
 */

app.http('flag-handler', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'flag-handler',
  handler: flagHandler,
});

const MAX_FLAGGED_TEXT = 500;
const MAX_RECOGNITION_TEXT = 200;
const VALID_SUBJECTS = ['math', 'science', 'ela', 'social_studies'];
const VALID_SURFACES: FlagSurface[] = ['lookup', 'passage', 'talk_to_teacher', 'audio'];
const ADMIN_HELD_STATUSES: FlagDoc['status'][] = ['in_review', 'dismissed'];

const TYPE_COUNT_PATH: Record<FlagType, string> = {
  translation: '/translationFlagCount',
  pronunciation: '/pronunciationFlagCount',
  recognition: '/recognitionFlagCount',
};

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
  const fieldCheck = requireFields(body, ['flaggedText', 'language', 'studentCode', 'timestamp', 'flagType']);
  if (!fieldCheck.valid) {
    return error(400, 'MISSING_FIELDS', `Missing required fields: ${fieldCheck.missing.join(', ')}`);
  }

  const req = body as FlagEventRequest;
  const { language, studentCode, timestamp, flagType } = req;

  if (!isValidStudentCode(studentCode)) {
    return error(400, 'INVALID_STUDENT_CODE', 'studentCode is malformed');
  }

  if (!(FLAG_TYPES as readonly string[]).includes(flagType)) {
    return error(400, 'INVALID_FLAG_TYPE', `flagType must be one of: ${FLAG_TYPES.join(', ')}`);
  }

  if (typeof req.flaggedText !== 'string' || req.flaggedText.length > MAX_FLAGGED_TEXT) {
    return error(400, 'TEXT_TOO_LONG', `Flagged text must be ${MAX_FLAGGED_TEXT} characters or fewer`);
  }

  // ── 3. PII ─────────────────────────────────────────────────────
  // A highlighted term is what gets corrected, so it cannot be redacted — reject
  // it instead. Speech (a misheard transcript, anything from Talk to Teacher) is
  // free conversation, so redact it and keep it short.
  let flaggedText: string;
  if (flagType === 'recognition' || req.surface === 'talk_to_teacher') {
    flaggedText = redactPII(req.flaggedText).slice(0, MAX_RECOGNITION_TEXT).toLowerCase().trim();
  } else {
    const pii = checkForPII({ flaggedText: req.flaggedText });
    if (pii.hasPII) {
      return error(400, 'PII_VIOLATION', 'Flagged text looks like personal information and was not saved');
    }
    flaggedText = req.flaggedText.toLowerCase().trim();
  }
  // Junk guard: the Oct 2026 audit found empty flags in production. A flag must
  // contain at least one letter in any script.
  flaggedText = flaggedText.replace(/\s+/g, ' ');
  if (!/\p{L}/u.test(flaggedText)) {
    return error(400, 'INVALID_TEXT', 'Flagged text must contain words');
  }
  const scope: FlagDoc['scope'] = flaggedText.split(' ').length > FLAG_MAX_TERM_WORDS ? 'passage' : 'term';

  // ── 4. Rate limit ──────────────────────────────────────────────
  const rateCheck = await checkRateLimit(`flag:${studentCode}`);
  if (!rateCheck.allowed) {
    return error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rateCheck.retryAfterMs}ms`);
  }

  if (!isValidLanguage(language)) {
    return error(400, 'INVALID_LANGUAGE', `Language '${language}' is not supported`);
  }

  // ── 5. Optional context ────────────────────────────────────────
  const subject = typeof req.subject === 'string' && VALID_SUBJECTS.includes(req.subject) ? req.subject : null;
  const seatRole: SeatRole = req.seatRole === 'teacher' ? 'teacher' : 'student';
  const surface = VALID_SURFACES.includes(req.surface as FlagSurface) ? (req.surface as FlagSurface) : null;
  const enrollment = await resolveEnrollment(studentCode, context);
  const { schoolCode, gradeBand } = enrollment;
  // The client's variant wins; otherwise use the student's own variant, but only
  // when the flag is in the student's language (a Talk to Teacher flag in English
  // must not inherit "es-HN").
  const variant = isValidVariant(language, req.variant)
    ? req.variant
    : enrollment.language === language && isValidVariant(language, enrollment.variant) ? enrollment.variant : null;

  const contextText = scrubFlagContext(req.context, flaggedText);
  const intendedText = flagType === 'recognition' && typeof req.intendedText === 'string'
    ? redactPII(req.intendedText).slice(0, MAX_RECOGNITION_TEXT) || null
    : null;
  const sample: FlagContextSample | null = contextText || intendedText
    ? { text: contextText ?? '', flagType, intendedText, gradeBand, seatRole, surface, at: timestamp }
    : null;

  // ── 6. Candidate key ───────────────────────────────────────────
  // Without a subject the key is identical to the pre-Phase-1 key, so flags from
  // older extension builds keep landing on the same documents.
  const flagId = createHash('sha256')
    .update(`${flaggedText}::${language}${subject ? `::${subject}` : ''}${variant ? `::${variant}` : ''}`)
    .digest('hex');

  // ── 7. Upsert candidate ────────────────────────────────────────
  const container = getFlagsContainer();
  const incrementOps = [
    { op: 'incr' as const, path: '/flagCount', value: 1 },
    { op: 'incr' as const, path: TYPE_COUNT_PATH[flagType], value: 1 },
    { op: 'set' as const, path: '/lastFlaggedAt', value: timestamp },
  ];

  let flagCount: number;
  let status: FlagDoc['status'];

  const applyToExisting = async (): Promise<void> => {
    const { resource: patched } = await container.item(flagId, language).patch<FlagDoc>(incrementOps);
    flagCount = patched!.flagCount;
    status = nextStatus(patched!.status, flagCount);
    await container.item(flagId, language).patch(followUpOps(patched!, status, flagCount, {
      schoolCode, gradeBand, seatRole, surface, sample,
    }));
  };

  try {
    await applyToExisting();
  } catch {
    // Document doesn't exist — create it
    try {
      const newDoc: FlagDoc = {
        id: flagId,
        flaggedText,
        language,
        subject,
        variant,
        scope,
        flagCount: 1,
        pronunciationFlagCount: flagType === 'pronunciation' ? 1 : 0,
        translationFlagCount: flagType === 'translation' ? 1 : 0,
        recognitionFlagCount: flagType === 'recognition' ? 1 : 0,
        status: 'logged',
        schoolCodes: schoolCode ? [schoolCode] : [],
        gradeBands: gradeBand ? [gradeBand] : [],
        seatRoles: [seatRole],
        surfaces: surface ? [surface] : [],
        contexts: sample ? [sample] : [],
        contentSource: flagType === 'recognition' || surface === 'talk_to_teacher' ? 'speech_recognition' : 'student_input',
        createdAt: timestamp,
        lastFlaggedAt: timestamp,
        requiresReview: false,
      };
      await container.items.create(newDoc);
      flagCount = 1;
      status = 'logged';
    } catch (createErr: unknown) {
      // 409 conflict — another instance created the doc between our patch and create
      const code = (createErr as { code?: number })?.code;
      if (code !== 409) {
        context.warn('Flag upsert failed:', (createErr as Error)?.message);
        return error(500, 'INTERNAL_ERROR', 'Failed to process flag');
      }
      try {
        await applyToExisting();
      } catch (retryErr) {
        context.warn('Flag conflict retry failed:', (retryErr as Error)?.message);
        return error(500, 'INTERNAL_ERROR', 'Failed to process flag');
      }
    }
  }

  // Hash prefix + type only — never the flagged text or the student code.
  context.log(`Flag ${flagId.slice(0, 12)} — type: ${flagType}, language: ${language}, count: ${flagCount!}, status: ${status!}`);

  // ── 8. Return response ─────────────────────────────────────────
  const response: FlagHandlerResponse = {
    flagId,
    flagCount: flagCount!,
    status: status!,
    requiresReview: flagCount! >= FLAG_THRESHOLDS.REVIEW,
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

/**
 * Admin-held statuses stay put. A resolved candidate that is flagged again
 * re-enters the pipeline (spec §3): it goes back to at least 'review'.
 */
function nextStatus(current: FlagDoc['status'] | undefined, count: number): FlagDoc['status'] {
  if (current && ADMIN_HELD_STATUSES.includes(current)) return current;
  if (current === 'resolved') {
    const byCount = escalationStatus(count);
    return byCount === 'logged' ? 'review' : byCount;
  }
  return escalationStatus(count);
}

type FollowUp = {
  schoolCode: string | null;
  gradeBand: GradeBand | null;
  seatRole: SeatRole;
  surface: FlagSurface | null;
  sample: FlagContextSample | null;
};

/**
 * Second patch: derived status plus set-like appends. Cosmos patch has no
 * "add if absent", so membership is checked against the doc returned by the
 * increment. Two concurrent first-time reporters can rarely add a duplicate —
 * readers treat these arrays as sets.
 */
function followUpOps(doc: FlagDoc, status: FlagDoc['status'], count: number, f: FollowUp) {
  const ops: Array<{ op: 'set' | 'add'; path: string; value: unknown }> = [
    { op: 'set', path: '/status', value: status },
    { op: 'set', path: '/requiresReview', value: status === 'review' || count >= FLAG_THRESHOLDS.REVIEW },
  ];
  const appendUnique = (field: 'schoolCodes' | 'gradeBands' | 'seatRoles' | 'surfaces', value: string | null) => {
    if (!value) return;
    const existing = doc[field] as string[] | undefined;
    if (!existing) ops.push({ op: 'set', path: `/${field}`, value: [value] });
    else if (!existing.includes(value)) ops.push({ op: 'add', path: `/${field}/-`, value });
  };
  appendUnique('schoolCodes', f.schoolCode);
  appendUnique('gradeBands', f.gradeBand);
  appendUnique('seatRoles', f.seatRole);
  appendUnique('surfaces', f.surface);
  if (f.sample) {
    if (!doc.contexts) ops.push({ op: 'set', path: '/contexts', value: [f.sample] });
    else if (doc.contexts.length < FLAG_CONTEXT_SAMPLE_CAP) ops.push({ op: 'add', path: '/contexts/-', value: f.sample });
  }
  // Cosmos allows at most 10 operations per patch; we emit at most 7.
  return ops;
}

async function resolveEnrollment(
  studentCode: string,
  context: InvocationContext
): Promise<{ schoolCode: string | null; gradeBand: GradeBand | null; language: string | null; variant: string | null }> {
  try {
    const resource = await findEnrollment(studentCode);
    return {
      schoolCode: resource?.schoolCode ?? null,
      gradeBand: resource?.gradeBand ?? null,
      language: resource?.language ?? null,
      variant: resource?.variant ?? null,
    };
  } catch {
    context.warn('Flag: enrollment lookup failed — storing without school/grade');
    return { schoolCode: null, gradeBand: null, language: null, variant: null };
  }
}

const error = errorResponse;
