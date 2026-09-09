// Reference proxy for the Talk to Teacher PWA.
//
// WHY THIS EXISTS: the browser client must NOT hold the shared `x-lb-api-key`.
// This tiny server-side function is the only place the key lives. It forwards
// three whitelisted routes to the LanguageBridge Azure Functions, injecting the
// key. Same pattern as the alpha demo's Netlify proxy.
//
// This file is framework-neutral pseudocode-ish TS. Pick the adapter for your
// host at the bottom (Vercel / Netlify / Supabase Edge). Deploy it so the PWA can
// reach it same-origin at /api/lb/* (best — no CORS), or set CORS to your origin.
//
// Required env:
//   LB_API_KEY   — the backend shared key (same value background.js uses)
//   LB_API_BASE  — https://languagebridge-api.azurewebsites.net/api

const LB_API_BASE = process.env.LB_API_BASE || 'https://languagebridge-api.azurewebsites.net/api';
const LB_API_KEY = process.env.LB_API_KEY || '';

// Only these routes may be proxied. Nothing else reaches the backend.
const ALLOWED = new Set(['speech-to-text', 'translate', 'tts-router']);

// The only origin allowed to call this proxy (tighten in production).
const ALLOW_ORIGIN = process.env.LB_PWA_ORIGIN || 'https://languagebridge.app';

export interface ProxyResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

/** Core handler: `route` is the trailing path segment, `rawBody` the JSON string. */
export async function handleProxy(method: string, route: string, rawBody: string): Promise<ProxyResult> {
  if (method === 'OPTIONS') return { status: 204, headers: cors(), body: '' };
  if (method !== 'POST') return { status: 405, headers: cors(), body: JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }) };
  if (!ALLOWED.has(route)) return { status: 404, headers: cors(), body: JSON.stringify({ error: 'UNKNOWN_ROUTE' }) };
  if (!LB_API_KEY) return { status: 500, headers: cors(), body: JSON.stringify({ error: 'PROXY_MISCONFIGURED', details: 'LB_API_KEY not set' }) };

  // STT bodies are large (base64 audio) — allow up to ~45s of 16kHz WAV.
  const timeout = route === 'speech-to-text' ? 40000 : 20000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const upstream = await fetch(`${LB_API_BASE}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-lb-api-key': LB_API_KEY },
      body: rawBody,
      signal: controller.signal,
    });
    const text = await upstream.text();
    return { status: upstream.status, headers: cors(), body: text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return { status: aborted ? 504 : 502, headers: cors(), body: JSON.stringify({ error: aborted ? 'REQUEST_TIMEOUT' : 'PROXY_UPSTREAM_ERROR' }) };
  } finally {
    clearTimeout(timer);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Adapters — keep ONE, delete the rest.
// ─────────────────────────────────────────────────────────────────────

// Vercel / Next.js API route:  /api/lb/[route].ts
//   export default async function handler(req, res) {
//     const route = (req.query.route as string) || '';
//     const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
//     const r = await handleProxy(req.method || 'POST', route, raw);
//     Object.entries(r.headers).forEach(([k, v]) => res.setHeader(k, v));
//     res.status(r.status).send(r.body);
//   }

// Netlify function:  netlify/functions/lb.ts  (route via redirect /api/lb/:route → /.netlify/functions/lb?route=:route)
//   export const handler = async (event) => {
//     const route = event.queryStringParameters?.route || '';
//     const r = await handleProxy(event.httpMethod, route, event.body || '{}');
//     return { statusCode: r.status, headers: r.headers, body: r.body };
//   };

// Supabase Edge Function (Deno) — read env with Deno.env.get(...) instead of process.env:
//   Deno.serve(async (req) => {
//     const route = new URL(req.url).pathname.split('/').pop() || '';
//     const r = await handleProxy(req.method, route, await req.text());
//     return new Response(r.body, { status: r.status, headers: r.headers });
//   });
