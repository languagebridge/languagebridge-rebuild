/**
 * Read-only access to Azure Monitor metrics and Cost Management from inside the
 * Function App, using its system-assigned managed identity. No SDK dependency:
 * the App Service identity endpoint issues the token, then plain REST.
 *
 * Needs (one-time, see docs/PRD-DISTRICT-ANALYTICS.md §Setup):
 *   - system-assigned identity on the Function App
 *   - "Monitoring Reader" on the Cosmos, Translator, Speech and App Insights resources
 *   - "Cost Management Reader" on the subscription
 *   - env: LB_COSMOS_RESOURCE_ID, LB_TRANSLATOR_RESOURCE_ID, LB_SPEECH_RESOURCE_ID,
 *          LB_APPINSIGHTS_RESOURCE_ID, LB_SUBSCRIPTION_ID
 *
 * Every function returns null when the identity or an id is missing, so callers
 * show "monitoring unavailable" instead of failing.
 */
import axios from 'axios';

const ARM = 'https://management.azure.com';
let cached: { token: string; expiresAt: number } | null = null;

export function managementConfigured(): boolean {
  return !!(process.env.IDENTITY_ENDPOINT && process.env.IDENTITY_HEADER);
}

async function token(): Promise<string | null> {
  if (!managementConfigured()) return null;
  if (cached && cached.expiresAt - 60_000 > Date.now()) return cached.token;
  try {
    const { data } = await axios.get(process.env.IDENTITY_ENDPOINT!, {
      params: { resource: `${ARM}/`, 'api-version': '2019-08-01' },
      headers: { 'X-IDENTITY-HEADER': process.env.IDENTITY_HEADER! },
      timeout: 5000,
    });
    cached = { token: data.access_token, expiresAt: Number(data.expires_on) * 1000 };
    return cached.token;
  } catch {
    return null;
  }
}

export type MetricSeries = Record<string, { total: number; max: number; average: number | null; points: number }>;

/**
 * Sum / max / average for each metric over `timespan` (ISO 8601 duration, e.g. 'PT1H', 'P30D'
 * is not allowed — use `from` / `to`). Returns null if unavailable.
 */
export async function readMetrics(
  resourceId: string | undefined,
  metricNames: string[],
  opts: { from: Date; to: Date; interval?: string; aggregation?: string; filter?: string }
): Promise<MetricSeries | null> {
  const t = await token();
  if (!t || !resourceId) return null;
  try {
    const { data } = await axios.get(`${ARM}${resourceId}/providers/Microsoft.Insights/metrics`, {
      params: {
        'api-version': '2018-01-01',
        metricnames: metricNames.join(','),
        timespan: `${opts.from.toISOString()}/${opts.to.toISOString()}`,
        interval: opts.interval ?? 'PT1H',
        aggregation: opts.aggregation ?? 'Total,Maximum,Average',
        ...(opts.filter && { $filter: opts.filter }),
      },
      headers: { Authorization: `Bearer ${t}` },
      timeout: 10_000,
    });
    const out: MetricSeries = {};
    for (const m of data.value ?? []) {
      const points = (m.timeseries ?? []).flatMap((ts: { data: Array<Record<string, number>> }) => ts.data ?? []);
      const totals = points.map((p: Record<string, number>) => p.total ?? 0);
      const maxes = points.map((p: Record<string, number>) => p.maximum ?? p.total ?? 0);
      const avgs = points.map((p: Record<string, number>) => p.average).filter((v: number | undefined) => v !== undefined) as number[];
      out[m.name.value] = {
        total: totals.reduce((s: number, v: number) => s + v, 0),
        max: maxes.length ? Math.max(...maxes) : 0,
        average: avgs.length ? avgs.reduce((s, v) => s + v, 0) / avgs.length : null,
        points: points.length,
      };
    }
    return out;
  } catch {
    return null;
  }
}

export type CostRow = { service: string; costUsd: number };

/** Actual Azure cost for the subscription between two dates, grouped by service. */
export async function readActualCost(from: Date, to: Date): Promise<{ totalUsd: number; byService: CostRow[] } | null> {
  const t = await token();
  const sub = process.env.LB_SUBSCRIPTION_ID;
  if (!t || !sub) return null;
  try {
    const { data } = await axios.post(
      `${ARM}/subscriptions/${sub}/providers/Microsoft.CostManagement/query`,
      {
        type: 'ActualCost',
        timeframe: 'Custom',
        timePeriod: { from: from.toISOString(), to: to.toISOString() },
        dataset: {
          granularity: 'None',
          aggregation: { totalCost: { name: 'CostUSD', function: 'Sum' } },
          grouping: [{ type: 'Dimension', name: 'ServiceName' }],
        },
      },
      { params: { 'api-version': '2023-11-01' }, headers: { Authorization: `Bearer ${t}` }, timeout: 15_000 }
    );
    const cols: string[] = data.properties.columns.map((c: { name: string }) => c.name);
    const ci = cols.indexOf('CostUSD'), si = cols.indexOf('ServiceName');
    const byService = (data.properties.rows as unknown[][]).map((r) => ({ service: String(r[si]), costUsd: Number(r[ci]) }));
    return { totalUsd: byService.reduce((s, r) => s + r.costUsd, 0), byService };
  } catch {
    return null;
  }
}

/** Pricing tier of an Azure AI resource (e.g. 'F0', 'S0', 'S1'), or null if unreadable. */
export async function readSku(resourceId: string | undefined): Promise<string | null> {
  const t = await token();
  if (!t || !resourceId) return null;
  try {
    const { data } = await axios.get(`${ARM}${resourceId}`, {
      params: { 'api-version': '2023-05-01' },
      headers: { Authorization: `Bearer ${t}` },
      timeout: 5000,
    });
    return data?.sku?.name ?? null;
  } catch {
    return null;
  }
}
