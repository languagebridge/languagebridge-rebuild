import { EnrollmentDoc } from './types';
import { getEnrollmentsContainer, getPilotsContainer } from './cosmos-client';

/**
 * Enrollment lookup by student code.
 *
 * The live `enrollments` container is partitioned by `/schoolCode` (verified with
 * `az cosmosdb sql container list`, 16 Oct 2026), but student endpoints only know
 * the student code. A point read `item(code, code)` therefore always 404s — which
 * is why analytics recorded every event with schoolCode 'unknown'. This queries
 * by id across partitions instead (~3 RU on a container this size).
 *
 * Hits are cached per function instance: enrollments never change school or
 * grade after creation, and analytics calls this on every event. Misses are not
 * cached, so a brand-new enrollment is found on the next call.
 */

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 10_000;
const cache = new Map<string, { at: number; doc: EnrollmentDoc }>();

export async function findEnrollment(studentCode: string): Promise<EnrollmentDoc | null> {
  const hit = cache.get(studentCode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.doc;

  const { resources } = await getEnrollmentsContainer().items
    .query<EnrollmentDoc>({
      query: 'SELECT * FROM c WHERE c.id = @id',
      parameters: [{ name: '@id', value: studentCode }],
    })
    .fetchAll();
  const doc = resources.find((r) => r.id === studentCode) ?? null;

  if (doc) {
    if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
    cache.set(studentCode, { at: Date.now(), doc });
  }
  return doc;
}

// ── School → pilot ──────────────────────────────────────────────────
// `sessions` and `analytics` are partitioned by /pilotId. Events written without
// one all land in a single partition, so every event now carries the pilot of the
// student's school ('unknown' when it cannot be resolved — explicit, not missing).

const pilotCache = new Map<string, { at: number; pilotId: string }>();

export async function findPilotId(schoolCode: string): Promise<string | null> {
  const hit = pilotCache.get(schoolCode);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.pilotId;
  const { resources } = await getPilotsContainer().items
    .query<{ pilotId?: string }>({
      query: 'SELECT c.pilotId FROM c WHERE c.schoolCode = @sc',
      parameters: [{ name: '@sc', value: schoolCode }],
    })
    .fetchAll();
  const pilotId = resources[0]?.pilotId ?? null;
  if (pilotId) pilotCache.set(schoolCode, { at: Date.now(), pilotId });
  return pilotId;
}

export type StudentScope = { schoolCode: string; gradeBand: string; pilotId: string };

/** School, grade band and pilot for a student code; 'unknown' for anything unresolved. Never throws. */
export async function resolveStudentScope(studentCode: string): Promise<StudentScope> {
  const scope: StudentScope = { schoolCode: 'unknown', gradeBand: 'unknown', pilotId: 'unknown' };
  try {
    const enrollment = await findEnrollment(studentCode);
    if (!enrollment) return scope;
    scope.schoolCode = enrollment.schoolCode;
    scope.gradeBand = enrollment.gradeBand;
    scope.pilotId = (await findPilotId(enrollment.schoolCode)) ?? 'unknown';
  } catch {
    // Lookup failure must never block the caller — the event is still written.
  }
  return scope;
}

/** Test hook. */
export function clearEnrollmentCache(): void {
  cache.clear();
  pilotCache.clear();
}
