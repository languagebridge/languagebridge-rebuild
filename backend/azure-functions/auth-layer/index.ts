import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { resolveAuthContext } from '../../shared/auth-helpers';
import { errorResponse } from '../../shared/validators';

/**
 * auth-layer
 *
 * Validates Supabase JWTs from teachers and admins.
 * Returns user context and pilot-level permissions.
 * Students never call this — they use anonymous session tokens.
 *
 * This is a thin wrapper over the shared `resolveAuthContext` so that
 * auth-layer and dashboard share ONE authorization implementation. Do not
 * reintroduce a second copy of token/permission logic here.
 */

app.http('auth-layer', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  route: 'auth-layer',
  handler: authLayer,
});

export async function authLayer(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('auth-layer invoked');

  const auth = await resolveAuthContext(request, context);
  if (!auth.authenticated) {
    return error(auth.status, auth.error, auth.details);
  }

  context.log(
    `Auth success — user: ${auth.context.email}, superAdmin: ${auth.context.isSuperAdmin}, ` +
      `pilots: ${auth.context.accessiblePilotIds.join(', ')}`
  );

  return { status: 200, jsonBody: auth.context };
}

// ============================================
// HELPERS
// ============================================

const error = errorResponse;
