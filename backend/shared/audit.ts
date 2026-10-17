import { InvocationContext } from '@azure/functions';
import { randomUUID } from 'crypto';
import { getAnalyticsContainer } from './cosmos-client';

/**
 * Admin-action audit log — DPA clause 14 ("an admin-action audit log") and
 * clause 4 (audit logs kept 7 years).
 *
 * Stored in `analytics` (type 'audit'), partitioned by the affected district's
 * pilotId so a district admin can read their own district's log; system-wide
 * actions (pricing) use partition '__audit__'. A separate container would push
 * Cosmos past its free-tier throughput, so this shares an existing one.
 *
 * Records WHO (staff email — an adult account), WHAT, and WHICH district/school.
 * Never student names (none exist) and never per-student data — viewing the
 * per-student list is logged as an event, not its contents.
 */

export const AUDIT_GLOBAL = '__audit__';

export type AuditAction =
  | 'district.upsert'
  | 'school.upsert'
  | 'staff.invite'
  | 'staff.revoke'
  | 'pricing.update'
  | 'flag.action'
  | 'data.view_student_list';

export type AuditEntry = {
  action: AuditAction;
  actorEmail: string;
  actorRole: string;
  pilotId: string | null;           // affected district, or null for system-wide
  target: string;                   // e.g. school code, staff email, flag id prefix
  details?: Record<string, string | number | boolean | null>;
};

export type AuditDoc = AuditEntry & { id: string; type: 'audit'; pilotId: string; at: string };

/**
 * Write one audit record. Awaited by callers so the record exists before they
 * respond; a failure is logged loudly but does not undo the action that already
 * happened (the action's own data remains the source of truth).
 */
export async function recordAudit(context: InvocationContext, entry: AuditEntry): Promise<void> {
  const doc: AuditDoc = {
    ...entry,
    id: randomUUID(),
    type: 'audit',
    pilotId: entry.pilotId ?? AUDIT_GLOBAL,
    at: new Date().toISOString(),
  };
  try {
    await getAnalyticsContainer().items.create(doc);
  } catch (err) {
    context.error(`AUDIT WRITE FAILED for ${entry.action} on ${entry.target}:`, (err as Error)?.message);
  }
}
