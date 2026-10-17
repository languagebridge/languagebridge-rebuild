// Supabase Edge Function: lb-dashboard
//
// The ONLY path from languagebridge.app's dashboard to the LanguageBridge Azure
// backend. It forwards the signed-in user's Supabase access token; the backend
// verifies it and decides what that user may see. This proxy holds NO API key and
// makes NO access decisions — it only whitelists routes and passes the token on.
//
// Host it ONLY here (Supabase is already a LanguageBridge subprocessor). Hosting this
// proxy anywhere else — e.g. on Lovable's servers — would add a new subprocessor,
// which the district DPA requires announcing 30 days in advance.
//
// Deploy: supabase functions deploy lb-dashboard
// Secrets: supabase secrets set LB_API_BASE=https://languagebridge-api.azurewebsites.net/api
//          supabase secrets set LB_DASHBOARD_ORIGIN=https://languagebridge.app
//
// Frontend calls:  POST|GET|PUT  <SUPABASE_URL>/functions/v1/lb-dashboard/<route>
//   with header   Authorization: Bearer <supabase session access_token>
//   e.g.          GET  …/lb-dashboard/ops/health
//                 POST …/lb-dashboard/insights/summary   { startDate, endDate, schoolCodes? }

const LB_API_BASE = Deno.env.get('LB_API_BASE') ?? '';
const ORIGIN = Deno.env.get('LB_DASHBOARD_ORIGIN') ?? 'https://languagebridge.app';

// Route → allowed methods. Nothing else reaches the backend.
const ALLOWED: Record<string, string[]> = {
  'auth-layer': ['GET'],
  'insights/summary': ['POST'],
  'insights/students': ['POST'],
  'insights/audit': ['GET'],
  'insights/data-inventory': ['GET'],
  'dashboard': ['POST'],
  'flag-queue': ['GET'],
  'ops/health': ['GET'],
  'ops/overview': ['GET'],
  'ops/pricing': ['GET', 'PUT'],
  'ops/districts': ['GET', 'PUT'],
  'ops/invite': ['POST'],
  'ops/revoke': ['POST'],
  'ops/audit': ['GET'],
};
const FLAG_ACTION = /^flag-queue\/[a-f0-9]{64}\/action$/;   // POST

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
    'Content-Type': 'application/json',
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors() });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (!LB_API_BASE) return json(500, { error: 'PROXY_MISCONFIGURED', details: 'LB_API_BASE not set' });

  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/lb-dashboard\/?/, '');
  const allowed = ALLOWED[route] ?? (FLAG_ACTION.test(route) ? ['POST'] : null);
  if (!allowed) return json(404, { error: 'UNKNOWN_ROUTE' });
  if (!allowed.includes(req.method)) return json(405, { error: 'METHOD_NOT_ALLOWED' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'MISSING_TOKEN' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(`${LB_API_BASE}/${route}${url.search}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: req.method === 'GET' ? undefined : await req.text(),
      signal: controller.signal,
    });
    return new Response(await upstream.text(), { status: upstream.status, headers: cors() });
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return json(aborted ? 504 : 502, { error: aborted ? 'REQUEST_TIMEOUT' : 'PROXY_UPSTREAM_ERROR' });
  } finally {
    clearTimeout(timer);
  }
});
