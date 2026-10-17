import { InvocationContext } from '@azure/functions';
import { getAnalyticsContainer } from './cosmos-client';
import { resolveStudentScope } from './enrollments';
import { bucketKey } from './azure-quotas';

/**
 * Azure usage metering — the source for (1) per-district Azure cost and
 * (2) free-tier / responsiveness banners.
 *
 * Every call to Azure Translator or Speech records, off the response path:
 *   - a per-school daily meter   (analytics, partition = the school's pilotId)
 *       id  meter:<day>:<schoolCode>   units + calls per service
 *   - a system-wide daily health doc (analytics, partition '__ops__')
 *       id  health:<day>               calls, failures, throttles, latency buckets, units
 *
 * Only counts are stored — never the text, the audio, or the student code.
 * Calls that fail still count (they consume quota and tell us Azure is unwell).
 */

export type AzureService = 'translator' | 'tts' | 'stt';
export const OPS_PARTITION = '__ops__';

export type AzureCall = {
  service: AzureService;
  units: number;          // translator/tts: characters sent; stt: audio seconds
  durationMs: number;
  status: number;         // HTTP status from Azure; 0 for network error / timeout
  studentCode?: string;
};

export const dayOf = (d = new Date()) => d.toISOString().slice(0, 10);

/** Fire-and-forget. Never throws, never delays the caller. */
export function recordAzureCall(context: InvocationContext, call: AzureCall): void {
  void (async () => {
    try {
      const day = dayOf();
      const ok = call.status >= 200 && call.status < 300;
      const throttled = call.status === 429 || call.status === 403;   // F0 quota exhaustion shows as 403/429
      const s = call.service;

      await incrementDoc(OPS_PARTITION, `health:${day}`, { type: 'ops_health', day }, {
        [`${s}_calls`]: 1,
        [`${s}_units`]: call.units,
        [`${s}_failures`]: ok ? 0 : 1,
        [`${s}_throttled`]: throttled ? 1 : 0,
        [`${s}_ms_total`]: Math.round(call.durationMs),
        [`${s}_lat_${bucketKey(call.durationMs)}`]: 1,
      });

      const scope = call.studentCode ? await resolveStudentScope(call.studentCode) : { schoolCode: 'unknown', pilotId: 'unknown' };
      await incrementDoc(scope.pilotId, `meter:${day}:${scope.schoolCode}`, {
        type: 'azure_meter', day, schoolCode: scope.schoolCode,
      }, {
        [`${s}_units`]: call.units,
        [`${s}_calls`]: 1,
      });
    } catch (err) {
      context.warn('Metering write failed — non-critical:', (err as Error)?.message);
    }
  })();
}

/**
 * Increment counters on a document, creating it on first use. Cosmos patch
 * `incr` creates a missing field, so only the document itself needs creating.
 */
async function incrementDoc(pilotId: string, id: string, base: Record<string, unknown>, counters: Record<string, number>): Promise<void> {
  const container = getAnalyticsContainer();
  const ops = Object.entries(counters)
    .filter(([, v]) => v !== 0)
    .map(([k, v]) => ({ op: 'incr' as const, path: `/${k}`, value: v }))
    .slice(0, 10);   // Cosmos allows 10 operations per patch
  try {
    await container.item(id, pilotId).patch(ops);
  } catch (err) {
    if ((err as { code?: number }).code !== 404) throw err;
    try {
      await container.items.create({ id, pilotId, ...base, ...counters, timestamp: new Date().toISOString() });
    } catch (createErr) {
      if ((createErr as { code?: number }).code !== 409) throw createErr;
      await container.item(id, pilotId).patch(ops);   // another instance created it first
    }
  }
}

/** Seconds of audio in a 16-bit mono PCM WAV buffer (falls back to 16 kHz when the header is unreadable). */
export function wavSeconds(buf: Buffer): number {
  try {
    if (buf.length > 44 && buf.toString('ascii', 0, 4) === 'RIFF') {
      const byteRate = buf.readUInt32LE(28);
      if (byteRate > 0) return (buf.length - 44) / byteRate;
    }
  } catch { /* fall through */ }
  return buf.length / 32_000;
}
