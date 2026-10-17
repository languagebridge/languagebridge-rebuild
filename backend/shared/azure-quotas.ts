/**
 * Free-tier limits, list prices and alert thresholds — the numbers behind the
 * ops health banners and the Azure-vs-revenue view (flywheel/… and
 * docs/PRD-DISTRICT-ANALYTICS.md).
 *
 * Verified 16 Oct 2026: Translator `microtran` = F0, Speech `microspee` = F0,
 * Cosmos `languagebridge-cosmos` has free tier enabled, Functions on Consumption.
 * Decision (Justin, 16 Oct 2026): stay on free tiers until PAID_TIER_SWITCH_DATE.
 *
 * Quotas and prices are Microsoft's published figures as of Oct 2026 — check
 * them when switching tiers. Prices can be overridden at runtime by a super-admin
 * (PUT /api/ops/pricing), so a price change never needs a deploy.
 */

export const PAID_TIER_SWITCH_DATE = '2027-01-01';

/** Monthly free-tier allowances. Exceeding the F0 AI quotas blocks calls; it does not bill. */
export const FREE_TIER = {
  translatorCharsPerMonth: 2_000_000,      // Translator F0
  ttsCharsPerMonth: 500_000,               // Speech F0 — neural voices
  sttSecondsPerMonth: 5 * 3600,            // Speech F0 — real-time speech-to-text
  cosmosRuPerSecond: 1000,                 // Cosmos free tier (sum of provisioned/autoscale-min RU/s)
  cosmosStorageGb: 25,
  functionExecutionsPerMonth: 1_000_000,   // Consumption plan grant
} as const;

/** Pay-as-you-go list prices (USD), used for per-district cost attribution. */
export type AzurePrices = {
  translatorPerMillionChars: number;   // Translator S1
  ttsPerMillionChars: number;          // Neural TTS, standard
  sttPerAudioHour: number;             // Real-time STT, standard
  cosmosPer100RuHour: number;          // Autoscale, per 100 RU/s per hour
  cosmosPerGbMonth: number;
  /** Value assumption shown to districts (estimate): what an interpreter hour costs a school. */
  interpreterUsdPerHour: number;
  source: string;
  updatedAt: string;
};

export const DEFAULT_PRICES: AzurePrices = {
  translatorPerMillionChars: 10,
  ttsPerMillionChars: 15,
  sttPerAudioHour: 1,
  cosmosPer100RuHour: 0.012,
  cosmosPerGbMonth: 0.25,
  interpreterUsdPerHour: 45,
  source: 'Azure list prices, East US, Oct 2026 — verify before relying on them',
  updatedAt: '2026-10-16',
};

/** Banner thresholds. Fractions are of the monthly free allowance. */
export const THRESHOLDS = {
  quotaWarn: 0.7,
  quotaCritical: 0.9,
  projectedOverrun: 1.0,           // projected month-end usage ≥ 100% → warning
  dependencyErrorWarn: 0.02,       // share of Azure calls failing today
  dependencyErrorCritical: 0.1,
  latencyP95WarnMs: { translator: 2000, tts: 3000, stt: 5000 } as Record<string, number>,
  cosmosNormalizedRuWarn: 80,      // percent, max over the last hour
  cosmosThrottledWarn: 1,          // any 429 in the last hour
  cosmosThrottledCritical: 50,
  cosmosStorageWarnGb: 20,
  functionFailureRateWarn: 0.02,
  switchReminderDays: 45,          // start reminding this long before PAID_TIER_SWITCH_DATE
} as const;

/** Latency histogram buckets (ms) for Azure dependency calls. */
export const LATENCY_BUCKETS = [250, 500, 1000, 2000, 5000] as const;

export function bucketKey(ms: number): string {
  const b = LATENCY_BUCKETS.find((limit) => ms < limit);
  return b === undefined ? 'over' : `lt${b}`;
}

/** Estimate a percentile from bucket counts (returns the bucket's upper bound). */
export function percentileFromBuckets(buckets: Record<string, number>, p: number): number | null {
  const order = [...LATENCY_BUCKETS.map((b) => `lt${b}`), 'over'];
  const total = order.reduce((s, k) => s + (buckets[k] ?? 0), 0);
  if (total === 0) return null;
  let seen = 0;
  for (let i = 0; i < order.length; i++) {
    seen += buckets[order[i]] ?? 0;
    if (seen / total >= p) return i < LATENCY_BUCKETS.length ? LATENCY_BUCKETS[i] : 5000;
  }
  return 5000;
}
