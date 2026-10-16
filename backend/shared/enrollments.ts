import { EnrollmentDoc } from './types';
import { getEnrollmentsContainer } from './cosmos-client';

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

/** Test hook. */
export function clearEnrollmentCache(): void {
  cache.clear();
}
