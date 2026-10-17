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

/**
 * Super-admin allowlist — comma-separated emails in LB_SUPERADMIN_EMAILS.
 * This is the ONLY way to bootstrap the first super-admin. An email *domain*
 * (e.g. @languagebridge.app) never confers admin on its own. Once seeded, an
 * allowlisted admin can grant others via admin_users records (manage_users).
 */
function isAllowlistedSuperAdmin(email: string): boolean {
  const allow = (process.env.LB_SUPERADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allow.length > 0 && allow.includes(email.trim().toLowerCase());
}

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
  // Super-admin is granted ONLY by the explicit allowlist (bootstrap) or a
  // Cosmos admin_users record with isSuperAdmin:true. Email domain confers
  // NOTHING — matching a domain is never sufficient for any access.
  const allowlisted = isAllowlistedSuperAdmin(email);
  let isSuperAdmin = allowlisted;
  let accessiblePilotIds: string[] = [];
  let accessibleDistrictIds: string[] = [];
  let permissions: AuthResponse['permissions'] = [];
  let role: AuthResponse['role'];

  try {
    const container = getAdminUsersContainer();
    const { resources } = await container.items
      .query({
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email }],
      })
      .fetchAll();

    if (resources.length > 0) {
      isSuperAdmin = resources[0].isSuperAdmin === true || allowlisted;
      accessiblePilotIds = resources[0].pilotIds ?? [];
      accessibleDistrictIds = resources[0].districtIds ?? [];
      permissions = resources[0].permissions ?? [];
      role = resources[0].role;
    }

    // Allowlisted bootstrap admins always get full permissions, even before
    // (or without) an admin_users record existing for them.
    if (allowlisted) {
      isSuperAdmin = true;
      permissions = ['view_dashboard', 'export_data', 'manage_flags', 'manage_users'];
    }
  } catch (err) {
    context.warn('Admin user lookup failed:', err);
    // Fail closed: never grant access when permissions cannot be verified.
    return { authenticated: false, status: 500, error: 'INTERNAL_ERROR', details: 'Failed to load user permissions' };
  }

  // ── 4. Resolve pilotIds → schoolCodes ────────────────────────
  let accessibleSchoolCodes: string[] = [];

  if (isSuperAdmin) {
    // Super admins can access all schools
    try {
      const pilots = getPilotsContainer();
      const { resources } = await pilots.items
        .query<{ schoolCode: string }>('SELECT c.schoolCode FROM c WHERE IS_DEFINED(c.schoolCode)')
        .fetchAll();
      accessibleSchoolCodes = resources.map(r => r.schoolCode);
    } catch (err) {
      context.warn('Failed to load all school codes for super admin:', err);
    }
  } else if (accessiblePilotIds.length > 0 || accessibleDistrictIds.length > 0) {
    try {
      const pilots = getPilotsContainer();
      // School records the user was given directly (champions), plus every school
      // in the districts they administer (district admins) — including schools
      // added to the district after they were invited.
      const parameters = [
        { name: '@ids', value: accessiblePilotIds },
        { name: '@districts', value: accessibleDistrictIds },
      ];
      const { resources } = await pilots.items
        .query<{ schoolCode: string }>({
          query: 'SELECT c.schoolCode FROM c WHERE IS_DEFINED(c.schoolCode) AND (ARRAY_CONTAINS(@ids, c.id) OR ARRAY_CONTAINS(@districts, c.pilotId))',
          parameters,
        })
        .fetchAll();
      accessibleSchoolCodes = [...new Set(resources.map(r => r.schoolCode))];
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
      role: isSuperAdmin ? 'super_admin' : role,
    },
  };
}

/**
 * Block a staff account from signing in (used when ALL of their access is revoked).
 * Their admin_users record is already stripped of permissions, which is what the
 * API checks on every request; the ban also stops them reaching the sign-in screen.
 */
export async function banStaffUser(userId: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;
  const { error } = await supabase.auth.admin.updateUserById(userId, { ban_duration: '876000h' });
  return !error;
}

/**
 * Invite a staff member (district admin or champion teacher) by email.
 * Supabase sends the invitation; the person sets their own password. Returns the
 * Supabase user id, or the existing user's id if they already have an account.
 * Staff emails are adult accounts — allowed under MASTER-DOCUMENT §7.1 rule 7.
 */
export async function inviteStaffUser(email: string, meta: Record<string, string>): Promise<{ userId: string; alreadyExisted: boolean } | { error: string }> {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: 'Auth service not configured' };
  const redirectTo = process.env.LB_DASHBOARD_URL;   // e.g. https://languagebridge.app/dashboard — Supabase site URL is used if unset
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, { data: meta, ...(redirectTo && { redirectTo }) });
  if (data?.user) return { userId: data.user.id, alreadyExisted: false };
  if (error && /already|registered|exists/i.test(error.message)) {
    // Already has an account: find it (first page is enough at our scale) and just update access.
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((u) => (u.email ?? '').toLowerCase() === email.toLowerCase());
    if (existing) return { userId: existing.id, alreadyExisted: true };
  }
  return { error: error?.message ?? 'Invite failed' };
}
