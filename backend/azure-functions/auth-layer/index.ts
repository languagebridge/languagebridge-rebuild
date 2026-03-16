import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createClient } from '@supabase/supabase-js';
import { AuthResponse, AuthErrorResponse } from '../../shared/types';
import { getAdminUsersContainer } from '../../shared/cosmos-client';

/**
 * auth-layer
 *
 * Validates Supabase JWTs from teachers and admins.
 * Returns user context and pilot-level permissions.
 * Students never call this — they use anonymous session tokens.
 */

app.http('auth-layer', {
  methods: ['POST', 'GET'],
  authLevel: 'anonymous',
  route: 'auth-layer',
  handler: authLayer,
});

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function authLayer(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  context.log('auth-layer invoked');

  // ── 1. Extract token from Authorization header ─────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return error(401, 'MISSING_TOKEN', 'Authorization header with Bearer token is required');
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return error(401, 'MISSING_TOKEN', 'Token is empty');
  }

  // ── 2. Validate Supabase credentials are configured ────────────
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    context.log('Supabase environment variables not configured');
    return error(500, 'INTERNAL_ERROR', 'Auth service not configured');
  }

  // ── 3. Verify token with Supabase ─────────────────────────────
  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let userId: string;
  let email: string;

  try {
    const { data, error: supabaseError } = await supabase.auth.getUser(token);

    if (supabaseError || !data.user) {
      context.log('Supabase token validation failed:', supabaseError?.message);
      return error(401, 'INVALID_TOKEN', 'Token is invalid or expired');
    }

    userId = data.user.id;
    email = data.user.email ?? '';
  } catch (err) {
    context.log('Supabase auth call failed:', err);
    return error(500, 'INTERNAL_ERROR', 'Auth service unavailable');
  }

  // ── 4. Look up user permissions in Cosmos DB ───────────────────
  const isSuperAdmin = email.endsWith('@languagebridge.app');
  let accessiblePilotIds: string[] = [];
  let permissions: AuthResponse['permissions'] = [];

  try {
    const container = getAdminUsersContainer();
    const query = {
      query: 'SELECT * FROM c WHERE c.email = @email',
      parameters: [{ name: '@email', value: email }],
    };
    const { resources } = await container.items.query(query).fetchAll();

    if (resources.length > 0) {
      const adminUser = resources[0];
      accessiblePilotIds = adminUser.pilotIds ?? [];
      permissions = adminUser.permissions ?? [];
    } else if (isSuperAdmin) {
      // Super admins have access to everything even if not in DB yet
      permissions = ['view_dashboard', 'export_data', 'manage_flags', 'manage_users'];
    }
  } catch (err) {
    context.log('Cosmos admin user lookup failed:', err);
    // Non-fatal for super admins, fatal for regular users
    if (!isSuperAdmin) {
      return error(500, 'INTERNAL_ERROR', 'Failed to load user permissions');
    }
  }

  context.log(`Auth success — user: ${email}, superAdmin: ${isSuperAdmin}, pilots: ${accessiblePilotIds.join(', ')}`);

  // ── 5. Return user context ─────────────────────────────────────
  const response: AuthResponse = {
    userId,
    email,
    accessiblePilotIds,
    isSuperAdmin,
    permissions,
  };
  return { status: 200, jsonBody: response };
}

// ============================================
// HELPERS
// ============================================

function error(
  status: number,
  code: AuthErrorResponse['error'],
  details: string
): HttpResponseInit {
  const body: AuthErrorResponse = { error: code, details };
  return { status, jsonBody: body };
}
