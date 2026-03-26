import { HttpRequest, InvocationContext } from '@azure/functions';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthResponse } from './types';
import { getAdminUsersContainer, getPilotsContainer } from './cosmos-client';

/**
 * Shared auth helpers — used by auth-layer and dashboard.
 *
 * Resolves a Bearer token into a full user context:
 *   userId, email, permissions, accessible pilotIds, and accessible schoolCodes.
 */

// Lazy-init Supabase client
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

export type AuthContext = AuthResponse & {
  accessibleSchoolCodes: string[];
};

export type AuthResult =
  | { authenticated: true; context: AuthContext }
  | { authenticated: false; status: number; error: string; details: string };

/**
 * Resolve a Bearer token into a full auth context.
 * Returns pilotIds AND the schoolCodes those pilots map to.
 */
export async function resolveAuthContext(
  request: HttpRequest,
  context: InvocationContext
): Promise<AuthResult> {
  // ── 1. Extract token ─────────────────────────────────────────
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, status: 401, error: 'MISSING_TOKEN', details: 'Authorization header with Bearer token is required' };
  }

  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return { authenticated: false, status: 401, error: 'MISSING_TOKEN', details: 'Token is empty' };
  }

  // ── 2. Verify with Supabase ──────────────────────────────────
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { authenticated: false, status: 500, error: 'INTERNAL_ERROR', details: 'Auth service not configured' };
  }

  let userId: string;
  let email: string;

  try {
    const { data, error: supabaseError } = await supabase.auth.getUser(token);
    if (supabaseError || !data.user) {
      return { authenticated: false, status: 401, error: 'INVALID_TOKEN', details: 'Token is invalid or expired' };
    }
    userId = data.user.id;
    email = data.user.email ?? '';
  } catch {
    return { authenticated: false, status: 500, error: 'INTERNAL_ERROR', details: 'Auth service unavailable' };
  }

  // ── 3. Look up permissions ───────────────────────────────────
  const isSuperAdmin = email.endsWith('@languagebridge.app');
  let accessiblePilotIds: string[] = [];
  let permissions: AuthResponse['permissions'] = [];

  try {
    const container = getAdminUsersContainer();
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email }],
      })
      .fetchAll();

    if (resources.length > 0) {
      accessiblePilotIds = resources[0].pilotIds ?? [];
      permissions = resources[0].permissions ?? [];
    } else if (isSuperAdmin) {
      permissions = ['view_dashboard', 'export_data', 'manage_flags', 'manage_users'];
    }
  } catch (err) {
    context.warn('Admin user lookup failed:', err);
    if (!isSuperAdmin) {
      return { authenticated: false, status: 500, error: 'INTERNAL_ERROR', details: 'Failed to load user permissions' };
    }
  }

  // ── 4. Resolve pilotIds → schoolCodes ────────────────────────
  let accessibleSchoolCodes: string[] = [];

  if (isSuperAdmin) {
    // Super admins can access all schools
    try {
      const pilots = getPilotsContainer();
      const { resources } = await pilots.items
        .query<{ schoolCode: string }>('SELECT c.schoolCode FROM c')
        .fetchAll();
      accessibleSchoolCodes = resources.map(r => r.schoolCode);
    } catch (err) {
      context.warn('Failed to load all school codes for super admin:', err);
    }
  } else if (accessiblePilotIds.length > 0) {
    try {
      const pilots = getPilotsContainer();
      // Look up schoolCodes for each pilotId
      const placeholders = accessiblePilotIds.map((_, i) => `@p${i}`).join(', ');
      const parameters = accessiblePilotIds.map((id, i) => ({ name: `@p${i}`, value: id }));
      const { resources } = await pilots.items
        .query<{ schoolCode: string }>({
          query: `SELECT c.schoolCode FROM c WHERE c.id IN (${placeholders})`,
          parameters,
        })
        .fetchAll();
      accessibleSchoolCodes = resources.map(r => r.schoolCode);
    } catch (err) {
      context.warn('Failed to resolve pilotIds to schoolCodes:', err);
    }
  }

  return {
    authenticated: true,
    context: {
      userId,
      email,
      accessiblePilotIds,
      accessibleSchoolCodes,
      isSuperAdmin,
      permissions,
    },
  };
}
