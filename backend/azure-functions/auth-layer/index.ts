import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthResponse, AuthErrorResponse } from '../../shared/types';
import { getAdminUsersContainer } from '../../shared/cosmos-client';
import { errorResponse } from '../../shared/validators';

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

// Lazy-init Supabase client — created once, reused across invocations
let _supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient | null {
  if (!_supabaseClient) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    _supabaseClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _supabaseClient;
}

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
  const supabase = getSupabaseClient();
  if (!supabase) {
    context.log('Supabase environment variables not configured');
    return error(500, 'INTERNAL_ERROR', 'Auth service not configured');
  }

  // ── 3. Verify token with Supabase ─────────────────────────────
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
  // Cosmos DB admin_users table is the source of truth for permissions.
  // Email domain (@languagebridge.app) is used ONLY as a bootstrap hint
  // for first-time setup — the DB record always takes precedence.
  let isSuperAdmin = false;
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
      isSuperAdmin = adminUser.isSuperAdmin === true;
      accessiblePilotIds = adminUser.pilotIds ?? [];
      permissions = adminUser.permissions ?? [];
    } else if (email.endsWith('@languagebridge.app')) {
      // Bootstrap: first-time login for a @languagebridge.app email
      // Auto-provision with full permissions and persist to DB
      isSuperAdmin = true;
      permissions = ['view_dashboard', 'export_data', 'manage_flags', 'manage_users'];
      container.items.create({
        id: userId,
        email,
        pilotIds: [],
        permissions,
        isSuperAdmin: true,
        createdAt: new Date().toISOString(),
      }).catch((err: unknown) => context.warn('Auto-provision admin write failed:', err));
    }
  } catch (err) {
    context.warn('Cosmos admin user lookup failed:', err);
    // Fatal for all users — we can't grant permissions without the DB
    return error(500, 'INTERNAL_ERROR', 'Failed to load user permissions');
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

const error = errorResponse;
