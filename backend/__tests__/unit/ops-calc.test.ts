import { healthBanners, accruedRevenue, meteredCostUsd, suppressSmallGroups, overlapDays, HealthInputs } from '../../shared/ops-calc';
import { DEFAULT_PRICES, FREE_TIER, percentileFromBuckets, bucketKey } from '../../shared/azure-quotas';
import { wavSeconds } from '../../shared/metering';
import { SchoolLicenseDoc } from '../../shared/types';

const base = (over: Partial<HealthInputs> = {}): HealthInputs => ({
  now: new Date('2026-10-16T12:00:00Z'),
  translator: { monthToDate: 0, source: 'metered', sku: 'F0' },
  tts: { monthToDate: 0, source: 'metered', sku: 'F0' },
  stt: { monthToDate: 0, source: 'metered', sku: 'F0' },
  cosmos: null,
  functions: null,
  monitoringAvailable: true,
  ...over,
});
const ids = (h: HealthInputs) => healthBanners(h).map((b) => `${b.id}:${b.severity}`);

describe('health banners — free tiers', () => {
  it('is quiet when usage is low and monitoring works', () => {
    expect(healthBanners(base())).toEqual([]);
  });

  it('warns at 70% and goes critical at 90% of a free quota', () => {
    expect(ids(base({ translator: { monthToDate: FREE_TIER.translatorCharsPerMonth * 0.75, source: 'azure_monitor', sku: 'F0' } }))).toContain('quota.translator:warning');
    expect(ids(base({ tts: { monthToDate: FREE_TIER.ttsCharsPerMonth * 0.95, source: 'azure_monitor', sku: 'F0' } }))).toContain('quota.tts:critical');
  });

  it('warns when on pace to exceed even below 70%', () => {
    // Day 16 of 31 at 60% → projects to ~116%
    expect(ids(base({ stt: { monthToDate: FREE_TIER.sttSecondsPerMonth * 0.6, source: 'metered', sku: 'F0' } }))).toContain('quota.stt.projected:warning');
  });

  it('stops quota banners once the service is on a paid tier', () => {
    expect(ids(base({ translator: { monthToDate: FREE_TIER.translatorCharsPerMonth * 2, source: 'azure_monitor', sku: 'S1' } }))).not.toContain('quota.translator:critical');
  });

  it('flags blocked calls as critical', () => {
    expect(ids(base({ tts: { monthToDate: 10, source: 'azure_monitor', sku: 'F0', blocked24h: 3 } }))).toContain('azure.tts.blocked:critical');
  });

  it('flags Azure error rate and slow latency once there is enough traffic', () => {
    const b = ids(base({ translator: { monthToDate: 1000, source: 'metered', sku: 'F0', callsToday: 100, failuresToday: 15, latencyBuckets: { lt250: 10, over: 90 } } }));
    expect(b).toContain('azure.translator.errors:critical');
    expect(b).toContain('azure.translator.latency:warning');
    // too few calls → no rate/latency banners
    expect(ids(base({ translator: { monthToDate: 0, source: 'metered', sku: 'F0', callsToday: 5, failuresToday: 5 } }))).not.toContain('azure.translator.errors:critical');
  });
});

describe('health banners — database, API, plan', () => {
  it('reports Cosmos throttling, load, storage, free-tier RU and availability', () => {
    const b = ids(base({ cosmos: { throttled1h: 60, maxNormalizedRuPct: 95, storageGb: 21, provisionedRu: 1100, availabilityPct: 98.5 } }));
    expect(b).toEqual(expect.arrayContaining(['cosmos.throttling:critical', 'cosmos.load:warning', 'cosmos.storage:warning', 'cosmos.freetier:warning', 'cosmos.availability:critical']));
  });

  it('reports API failure rate', () => {
    expect(ids(base({ functions: { requests24h: 200, failed24h: 10 } }))).toContain('api.failures:warning');
  });

  it('counts down to the January 2027 paid-tier switch, then turns critical if still free', () => {
    expect(ids(base({ now: new Date('2026-12-10T00:00:00Z') }))).toContain('plan.paid-tiers:info');
    expect(ids(base({ now: new Date('2026-12-25T00:00:00Z') }))).toContain('plan.paid-tiers:warning');
    expect(ids(base({ now: new Date('2027-01-05T00:00:00Z') }))).toContain('plan.paid-tiers:critical');
    const paid = { monthToDate: 0, source: 'metered' as const, sku: 'S1' };
    expect(ids(base({ now: new Date('2027-01-05T00:00:00Z'), translator: paid, tts: { ...paid, sku: 'S0' }, stt: { ...paid, sku: 'S0' } }))).not.toContain('plan.paid-tiers:critical');
  });

  it('says so when Azure monitoring is not connected, and sorts critical first', () => {
    const banners = healthBanners(base({ monitoringAvailable: false, tts: { monthToDate: 1, source: 'metered', sku: 'F0', blocked24h: 1 } }));
    expect(banners[0].severity).toBe('critical');
    expect(banners.map((b) => b.id)).toContain('monitoring.unavailable');
  });
});

describe('revenue and cost', () => {
  const school = (over: Partial<SchoolLicenseDoc>): SchoolLicenseDoc => ({ id: 's', schoolCode: 's', schoolName: 'S', pilotId: 'D', gradeBands: ['6-8'], isActive: true, ...over });

  it('spreads the annual price over the term', () => {
    const r = accruedRevenue(new Date('2026-10-01'), new Date('2026-11-01'), [school({ annualPriceUsd: 3650, termStart: '2026-08-01', termEnd: '2027-07-31', status: 'active' })]);
    expect(r).toBeCloseTo(310, 0);   // 31 days × $10/day
  });

  it('earns nothing outside the term, for free pilots, or when suspended', () => {
    expect(accruedRevenue(new Date('2026-01-01'), new Date('2026-02-01'), [school({ annualPriceUsd: 3650, termStart: '2026-08-01' })])).toBe(0);
    expect(accruedRevenue(new Date('2026-10-01'), new Date('2026-11-01'), [school({ annualPriceUsd: 3650, pricingModel: 'free_pilot' })])).toBe(0);
    expect(accruedRevenue(new Date('2026-10-01'), new Date('2026-11-01'), [school({ annualPriceUsd: 3650, status: 'suspended' })])).toBe(0);
  });

  it('uses a district contract instead of summing schools', () => {
    const r = accruedRevenue(new Date('2026-10-01'), new Date('2026-11-01'),
      [school({ annualPriceUsd: 99999, termStart: '2026-08-01', termEnd: '2027-07-31' })],
      { id: 'district:D', type: 'district', pilotId: 'D', name: 'D', contractAnnualUsd: 36500, createdAt: '', updatedAt: '' });
    expect(r).toBeCloseTo(3100, 0);
  });

  it('prices metered units', () => {
    const c = meteredCostUsd({ translator_units: 2_000_000, tts_units: 1_000_000, stt_units: 7200 }, DEFAULT_PRICES);
    expect(c).toMatchObject({ translator: 20, tts: 15, stt: 2, total: 37 });
  });

  it('counts overlap days correctly at the edges', () => {
    expect(overlapDays(new Date('2026-10-01'), new Date('2026-10-11'), '2026-10-05', '2026-10-06')).toBe(2);
  });
});

describe('privacy and helpers', () => {
  it('hides groups under 10 students', () => {
    const out = suppressSmallGroups([{ language: 'dari', students: 12 }, { language: 'pashto', students: 3 }]);
    expect(out).toEqual([{ language: 'dari', students: 12, suppressed: false }, { language: 'pashto', students: null, suppressed: true }]);
  });

  it('estimates p95 from latency buckets', () => {
    expect(bucketKey(100)).toBe('lt250');
    expect(bucketKey(9000)).toBe('over');
    expect(percentileFromBuckets({ lt250: 90, lt1000: 10 }, 0.95)).toBe(1000);
    expect(percentileFromBuckets({}, 0.95)).toBeNull();
  });

  it('measures WAV duration from the header', () => {
    const header = Buffer.alloc(44);
    header.write('RIFF', 0, 'ascii');
    header.writeUInt32LE(32_000, 28);   // 16 kHz × 16-bit mono
    expect(wavSeconds(Buffer.concat([header, Buffer.alloc(64_000)]))).toBe(2);
  });
});
