import { AzurePrices, FREE_TIER, THRESHOLDS, PAID_TIER_SWITCH_DATE, percentileFromBuckets } from './azure-quotas';
import { HealthBanner, SchoolLicenseDoc, DistrictDoc } from './types';

/**
 * Pure calculations behind /api/ops/* and /api/insights/* — no I/O, unit-tested
 * in __tests__/unit/ops-calc.test.ts.
 */

// ── Dates ───────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;
export const toDay = (d: Date) => d.toISOString().slice(0, 10);

export function monthProgress(now: Date): { monthStart: Date; dayOfMonth: number; daysInMonth: number; nextReset: string } {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const daysInMonth = Math.round((next.getTime() - monthStart.getTime()) / DAY_MS);
  const dayOfMonth = (now.getTime() - monthStart.getTime()) / DAY_MS;
  return { monthStart, dayOfMonth: Math.max(dayOfMonth, 1 / 24), daysInMonth, nextReset: toDay(next) };
}

// ── Revenue ─────────────────────────────────────────────────────────

/** Days of [from, to) that fall inside the license term. */
export function overlapDays(from: Date, to: Date, termStart?: string, termEnd?: string): number {
  const s = Math.max(from.getTime(), termStart ? Date.parse(termStart) : -Infinity);
  const e = Math.min(to.getTime(), termEnd ? Date.parse(termEnd) + DAY_MS : Infinity);
  return Math.max(0, (e - s) / DAY_MS);
}

/**
 * Revenue earned in [from, to): the annual price spread evenly over the term.
 * A district contract (contractAnnualUsd) replaces the sum of its schools.
 */
export function accruedRevenue(from: Date, to: Date, schools: SchoolLicenseDoc[], district?: DistrictDoc | null): number {
  if (district?.contractAnnualUsd) {
    const starts = schools.map((s) => s.termStart).filter(Boolean).sort();
    const ends = schools.map((s) => s.termEnd).filter(Boolean).sort();
    return (district.contractAnnualUsd * overlapDays(from, to, starts[0], ends[ends.length - 1])) / 365;
  }
  return schools.reduce((sum, s) => {
    if (!s.annualPriceUsd || s.status === 'suspended' || s.pricingModel === 'free_pilot') return sum;
    return sum + (s.annualPriceUsd * overlapDays(from, to, s.termStart, s.termEnd)) / 365;
  }, 0);
}

// ── Azure cost from metered units ───────────────────────────────────

export type MeteredUnits = { translator_units?: number; tts_units?: number; stt_units?: number };

export function meteredCostUsd(u: MeteredUnits, prices: AzurePrices): { translator: number; tts: number; stt: number; total: number } {
  const translator = ((u.translator_units ?? 0) / 1_000_000) * prices.translatorPerMillionChars;
  const tts = ((u.tts_units ?? 0) / 1_000_000) * prices.ttsPerMillionChars;
  const stt = ((u.stt_units ?? 0) / 3600) * prices.sttPerAudioHour;
  return { translator, tts, stt, total: translator + tts + stt };
}

// ── Privacy: small-group suppression ────────────────────────────────

export const MIN_GROUP = 10;

/** Replace counts of distinct students below MIN_GROUP with null ("fewer than 10"). */
export function suppressSmallGroups<T extends { students: number }>(rows: T[]): Array<Omit<T, 'students'> & { students: number | null; suppressed: boolean }> {
  return rows.map((r) => ({ ...r, students: r.students < MIN_GROUP ? null : r.students, suppressed: r.students < MIN_GROUP }));
}

// ── Health banners ──────────────────────────────────────────────────

export type ServiceUsage = {
  monthToDate: number;          // units this month (chars or seconds)
  source: 'azure_monitor' | 'metered';
  blocked24h?: number;          // Azure BlockedCalls (F0 quota / rate)
  callsToday?: number;
  failuresToday?: number;
  latencyBuckets?: Record<string, number>;
  sku?: string | null;          // e.g. 'F0', 'S1' (when readable)
};

export type HealthInputs = {
  now: Date;
  translator: ServiceUsage;
  tts: ServiceUsage;
  stt: ServiceUsage;
  cosmos?: { maxNormalizedRuPct?: number; throttled1h?: number; storageGb?: number; provisionedRu?: number; availabilityPct?: number } | null;
  functions?: { requests24h?: number; failed24h?: number; executionsMonthToDate?: number } | null;
  monitoringAvailable: boolean;
};

const LIMITS: Record<'translator' | 'tts' | 'stt', { limit: number; label: string; unit: (n: number) => string }> = {
  translator: { limit: FREE_TIER.translatorCharsPerMonth, label: 'Translator', unit: (n) => `${Math.round(n).toLocaleString('en-US')} characters` },
  tts: { limit: FREE_TIER.ttsCharsPerMonth, label: 'Text-to-speech', unit: (n) => `${Math.round(n).toLocaleString('en-US')} characters` },
  stt: { limit: FREE_TIER.sttSecondsPerMonth, label: 'Speech recognition', unit: (n) => `${(n / 3600).toFixed(1)} hours` },
};

export function healthBanners(h: HealthInputs): HealthBanner[] {
  const out: HealthBanner[] = [];
  const { dayOfMonth, daysInMonth, nextReset } = monthProgress(h.now);

  for (const svc of ['translator', 'tts', 'stt'] as const) {
    const u = h[svc];
    const { limit, label, unit } = LIMITS[svc];
    const onFree = u.sku == null || u.sku === 'F0';
    const pct = u.monthToDate / limit;
    const projected = (u.monthToDate / dayOfMonth) * daysInMonth;

    if (onFree) {
      if (pct >= THRESHOLDS.quotaCritical) {
        out.push({ id: `quota.${svc}`, severity: 'critical', title: `${label} free tier ${Math.round(pct * 100)}% used`, detail: `${unit(u.monthToDate)} of ${unit(limit)} this month. At 100% Azure blocks calls until ${nextReset} — students get no ${svc === 'stt' ? 'Talk to Teacher' : svc === 'tts' ? 'audio' : 'translations'}.`, metric: `${svc}.monthToDate`, value: u.monthToDate, threshold: limit, action: 'Move this service to the paid tier now, or reduce load.' });
      } else if (pct >= THRESHOLDS.quotaWarn) {
        out.push({ id: `quota.${svc}`, severity: 'warning', title: `${label} free tier ${Math.round(pct * 100)}% used`, detail: `${unit(u.monthToDate)} of ${unit(limit)} this month (resets ${nextReset}).`, metric: `${svc}.monthToDate`, value: u.monthToDate, threshold: limit });
      } else if (projected >= limit * THRESHOLDS.projectedOverrun && u.monthToDate > 0) {
        out.push({ id: `quota.${svc}.projected`, severity: 'warning', title: `${label} on pace to exceed its free tier`, detail: `Projected ${unit(projected)} by month end against ${unit(limit)}.`, metric: `${svc}.projected`, value: projected, threshold: limit });
      }
    }

    if ((u.blocked24h ?? 0) > 0) {
      out.push({ id: `azure.${svc}.blocked`, severity: 'critical', title: `Azure blocked ${u.blocked24h} ${label} calls in the last 24 hours`, detail: 'Blocked calls mean the free-tier quota or its rate limit was hit; students saw failures.', metric: `${svc}.blocked24h`, value: u.blocked24h, threshold: 0, action: 'Check the quota banner; consider moving to the paid tier.' });
    }

    const calls = u.callsToday ?? 0;
    if (calls >= 20) {
      const rate = (u.failuresToday ?? 0) / calls;
      if (rate >= THRESHOLDS.dependencyErrorWarn) {
        out.push({ id: `azure.${svc}.errors`, severity: rate >= THRESHOLDS.dependencyErrorCritical ? 'critical' : 'warning', title: `${label}: ${(rate * 100).toFixed(1)}% of Azure calls failing today`, detail: `${u.failuresToday} of ${calls} calls failed.`, metric: `${svc}.errorRate`, value: rate, threshold: THRESHOLDS.dependencyErrorWarn });
      }
    }
    const p95 = u.latencyBuckets ? percentileFromBuckets(u.latencyBuckets, 0.95) : null;
    const latLimit = THRESHOLDS.latencyP95WarnMs[svc];
    if (p95 !== null && calls >= 20 && p95 > latLimit) {
      out.push({ id: `azure.${svc}.latency`, severity: 'warning', title: `${label} is slow: 95% of calls under ${p95 >= 5000 ? '5,000+' : p95.toLocaleString('en-US')} ms`, detail: `Target is under ${latLimit.toLocaleString('en-US')} ms.`, metric: `${svc}.p95ms`, value: p95, threshold: latLimit });
    }
  }

  const c = h.cosmos;
  if (c) {
    if ((c.throttled1h ?? 0) >= THRESHOLDS.cosmosThrottledWarn) {
      out.push({ id: 'cosmos.throttling', severity: (c.throttled1h ?? 0) >= THRESHOLDS.cosmosThrottledCritical ? 'critical' : 'warning', title: `Database throttled ${c.throttled1h} requests in the last hour`, detail: 'A container hit its RU/s ceiling. The SDK retries, but students may see slow or failed requests.', metric: 'cosmos.throttled1h', value: c.throttled1h, threshold: THRESHOLDS.cosmosThrottledWarn, action: 'Raise the busy container’s autoscale max, or stop the bulk job.' });
    }
    if ((c.maxNormalizedRuPct ?? 0) >= THRESHOLDS.cosmosNormalizedRuWarn) {
      out.push({ id: 'cosmos.load', severity: 'warning', title: `Database load peaked at ${Math.round(c.maxNormalizedRuPct!)}% of capacity in the last hour`, detail: 'Sustained load near 100% leads to throttling.', metric: 'cosmos.maxNormalizedRuPct', value: c.maxNormalizedRuPct, threshold: THRESHOLDS.cosmosNormalizedRuWarn });
    }
    if ((c.storageGb ?? 0) >= THRESHOLDS.cosmosStorageWarnGb) {
      out.push({ id: 'cosmos.storage', severity: 'warning', title: `Database storage ${c.storageGb!.toFixed(1)} GB of the ${FREE_TIER.cosmosStorageGb} GB free tier`, detail: 'Storage above 25 GB is billed.', metric: 'cosmos.storageGb', value: c.storageGb, threshold: FREE_TIER.cosmosStorageGb });
    }
    if ((c.provisionedRu ?? 0) > FREE_TIER.cosmosRuPerSecond) {
      out.push({ id: 'cosmos.freetier', severity: 'warning', title: `Database is provisioned at ${c.provisionedRu} RU/s — above the ${FREE_TIER.cosmosRuPerSecond} RU/s free tier`, detail: 'Every RU/s above the free tier is billed hourly.', metric: 'cosmos.provisionedRu', value: c.provisionedRu, threshold: FREE_TIER.cosmosRuPerSecond });
    }
    if (c.availabilityPct !== undefined && c.availabilityPct < 99.9) {
      out.push({ id: 'cosmos.availability', severity: c.availabilityPct < 99 ? 'critical' : 'warning', title: `Database availability ${c.availabilityPct.toFixed(2)}% in the last hour`, detail: 'Azure reported failed requests on the Cosmos account.', metric: 'cosmos.availabilityPct', value: c.availabilityPct, threshold: 99.9 });
    }
  }

  const f = h.functions;
  if (f) {
    if ((f.requests24h ?? 0) >= 50) {
      const rate = (f.failed24h ?? 0) / f.requests24h!;
      if (rate >= THRESHOLDS.functionFailureRateWarn) {
        out.push({ id: 'api.failures', severity: rate >= 0.1 ? 'critical' : 'warning', title: `${(rate * 100).toFixed(1)}% of API requests failed in the last 24 hours`, detail: `${f.failed24h} of ${f.requests24h} requests.`, metric: 'api.failureRate', value: rate, threshold: THRESHOLDS.functionFailureRateWarn });
      }
    }
    const execPct = (f.executionsMonthToDate ?? 0) / FREE_TIER.functionExecutionsPerMonth;
    if (execPct >= THRESHOLDS.quotaWarn) {
      out.push({ id: 'quota.functions', severity: execPct >= THRESHOLDS.quotaCritical ? 'critical' : 'warning', title: `Function executions ${Math.round(execPct * 100)}% of the monthly free grant`, detail: 'Executions above the grant are billed (they are not blocked).', metric: 'functions.executionsMonthToDate', value: f.executionsMonthToDate, threshold: FREE_TIER.functionExecutionsPerMonth });
    }
  }

  // Paid-tier switch (decided: January 2027)
  const switchAt = Date.parse(PAID_TIER_SWITCH_DATE);
  const daysLeft = Math.ceil((switchAt - h.now.getTime()) / DAY_MS);
  const stillFree = [h.translator.sku, h.tts.sku].some((s) => s == null || s === 'F0');
  if (stillFree && daysLeft <= THRESHOLDS.switchReminderDays) {
    out.push(daysLeft > 0
      ? { id: 'plan.paid-tiers', severity: daysLeft <= 14 ? 'warning' : 'info', title: `${daysLeft} days until the planned move to paid Azure tiers`, detail: `Translator and Speech are scheduled to leave the free tier on ${PAID_TIER_SWITCH_DATE}.`, action: 'Upgrade Translator to S1 and Speech to S0 in the Azure portal.' }
      : { id: 'plan.paid-tiers', severity: 'critical', title: 'Translator or Speech is still on the free tier after the planned switch date', detail: `The plan was to move to paid tiers on ${PAID_TIER_SWITCH_DATE}.`, action: 'Upgrade Translator to S1 and Speech to S0 in the Azure portal.' });
  }

  if (!h.monitoringAvailable) {
    out.push({ id: 'monitoring.unavailable', severity: 'info', title: 'Azure monitoring not connected', detail: 'Database health, blocked calls and the Azure bill need the API’s managed identity. Free-tier usage below comes from LanguageBridge’s own metering only.', action: 'See docs/PRD-DISTRICT-ANALYTICS.md §Setup.' });
  }

  const rank = { critical: 0, warning: 1, info: 2 } as const;
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
