import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import {
  FlagDoc,
  FlagQueueItem,
  FlagQueueAction,
  FLAG_TYPES,
} from '../../shared/types';
import { getFlagsContainer } from '../../shared/cosmos-client';
import { resolveAuthContext } from '../../shared/auth-helpers';
import { isValidLanguage, checkRateLimit, errorResponse } from '../../shared/validators';

/**
 * flag-queue — internal admin view of flag candidates (flywheel Phase 1).
 *
 *   GET  /api/flag-queue?language=&status=&flagType=&limit=
 *        Candidates, most-reported first.
 *   POST /api/flag-queue/{id}/action
 *        Body: { language, action: 'in_review'|'resolved'|'dismissed'|'reopen', note?, entryId? }
 *
 * Super-admin only: the queue spans every district. School codes are reduced
 * to a count so the view never shows which school reported what.
 * Every action is appended to resolutionHistory — nothing is overwritten.
 */

app.http('flag-queue-list', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'flag-queue',
  handler: listFlagQueue,
});

app.http('flag-queue-action', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'flag-queue/{id}/action',
  handler: actOnFlag,
});

const VALID_STATUSES: FlagDoc['status'][] = ['logged', 'review', 'bounty', 'high_priority', 'in_review', 'resolved', 'dismissed'];
const VALID_ACTIONS: FlagQueueAction[] = ['in_review', 'resolved', 'dismissed', 'reopen'];
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

async function requireSuperAdmin(request: HttpRequest, context: InvocationContext) {
  const auth = await resolveAuthContext(request, context);
  if (!auth.authenticated) return { ok: false as const, response: error(auth.status, auth.error, auth.details) };
  if (!auth.context.isSuperAdmin) {
    return { ok: false as const, response: error(403, 'FORBIDDEN', 'The flag queue is restricted to LanguageBridge super-admins') };
  }
  const rate = await checkRateLimit(`flag-queue:${auth.context.userId}`);
  if (!rate.allowed) {
    return { ok: false as const, response: error(429, 'RATE_LIMITED', `Rate limit exceeded. Retry after ${rate.retryAfterMs}ms`) };
  }
  return { ok: true as const, user: auth.context };
}

export async function listFlagQueue(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const gate = await requireSuperAdmin(request, context);
  if (!gate.ok) return gate.response;

  const language = request.query.get('language');
  const status = request.query.get('status');
  const flagType = request.query.get('flagType');
  const limit = Math.min(Number(request.query.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT);

  if (language && !isValidLanguage(language)) return error(400, 'INVALID_LANGUAGE', `Language '${language}' is not supported`);
  if (status && !VALID_STATUSES.includes(status as FlagDoc['status'])) return error(400, 'INVALID_STATUS', `Unknown status '${status}'`);
  if (flagType && !(FLAG_TYPES as readonly string[]).includes(flagType)) return error(400, 'INVALID_FLAG_TYPE', `Unknown flagType '${flagType}'`);

  const where: string[] = [];
  const parameters: Array<{ name: string; value: string | number }> = [{ name: '@limit', value: limit }];
  if (language) { where.push('c.language = @language'); parameters.push({ name: '@language', value: language }); }
  if (status) { where.push('c.status = @status'); parameters.push({ name: '@status', value: status }); }
  if (flagType) where.push(`c.${flagType}FlagCount > 0`);   // flagType is allowlisted above

  const query =
    `SELECT TOP @limit * FROM c${where.length ? ' WHERE ' + where.join(' AND ') : ''} ORDER BY c.flagCount DESC`;

  try {
    const { resources } = await getFlagsContainer().items.query<FlagDoc>({ query, parameters }).fetchAll();
    const items: FlagQueueItem[] = resources.map(({ schoolCodes, resolutionHistory: _h, ...rest }) => ({
      ...rest,
      schoolCount: new Set(schoolCodes ?? []).size,
    }));
    return { status: 200, jsonBody: { items, count: items.length } };
  } catch (err) {
    context.error('flag-queue list failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to load the flag queue');
  }
}

export async function actOnFlag(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const gate = await requireSuperAdmin(request, context);
  if (!gate.ok) return gate.response;

  const id = request.params.id;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return error(400, 'MISSING_FIELDS', 'Request body must be valid JSON');
  }

  const language = body.language;
  const action = body.action as FlagQueueAction;
  const note = typeof body.note === 'string' ? body.note.slice(0, 500) : null;
  const entryId = typeof body.entryId === 'string' ? body.entryId : null;

  if (!id || !/^[a-f0-9]{64}$/.test(id)) return error(400, 'INVALID_ID', 'id must be a flag id');
  if (!isValidLanguage(language)) return error(400, 'INVALID_LANGUAGE', 'language is required and must be supported');
  if (!VALID_ACTIONS.includes(action)) return error(400, 'INVALID_ACTION', `action must be one of: ${VALID_ACTIONS.join(', ')}`);
  if (action === 'resolved' && !entryId) return error(400, 'MISSING_FIELDS', 'Resolving a flag requires the entryId of the Lexicon entry that fixed it');

  const item = getFlagsContainer().item(id, language);
  let doc: FlagDoc | undefined;
  try {
    ({ resource: doc } = await item.read<FlagDoc>());
  } catch {
    doc = undefined;
  }
  if (!doc) return error(404, 'NOT_FOUND', 'Flag not found');

  const resolution: NonNullable<FlagDoc['resolution']> = {
    action: action === 'reopen' ? 'in_review' : action,
    note,
    entryId,
    by: gate.user.userId,
    at: new Date().toISOString(),
  };
  const newStatus: FlagDoc['status'] = action === 'reopen' ? 'review' : action;

  try {
    await item.patch([
      { op: 'set', path: '/status', value: newStatus },
      { op: 'set', path: '/requiresReview', value: newStatus === 'review' || newStatus === 'in_review' },
      { op: 'set', path: '/resolution', value: resolution },
      doc.resolutionHistory
        ? { op: 'add', path: '/resolutionHistory/-', value: resolution }
        : { op: 'set', path: '/resolutionHistory', value: [resolution] },
    ]);
  } catch (err) {
    context.error('flag-queue action failed:', (err as Error)?.message);
    return error(500, 'INTERNAL_ERROR', 'Failed to update the flag');
  }

  context.log(`Flag ${id.slice(0, 12)} → ${newStatus}`);
  return { status: 200, jsonBody: { id, status: newStatus, resolution } };
}

const error = errorResponse;
