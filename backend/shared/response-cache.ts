/**
 * Tiny per-instance cache for expensive read-only dashboard answers. Dashboard
 * queries scan raw usage events (hundreds of RU each); caching identical requests
 * for a few minutes keeps a busy dashboard from throttling the database.
 * Keys must include everything that scopes the answer (user's schools, range).
 */
const store = new Map<string, { at: number; value: unknown }>();
const MAX_ENTRIES = 500;

export async function cached<T>(key: string, ttlMs: number, compute: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await compute();
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  store.set(key, { at: Date.now(), value });
  return value;
}

/** Test hook. */
export function clearResponseCache(): void {
  store.clear();
}
