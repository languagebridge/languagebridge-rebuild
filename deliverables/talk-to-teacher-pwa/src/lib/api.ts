// Talk to Teacher (PWA) — backend client.
//
// IMPORTANT — auth model differs from the extension. The Chrome extension hides
// the shared `x-lb-api-key` inside background.js. A public web PWA CANNOT embed
// that key (view-source leaks it and anyone can drain the backend). So this
// client calls a thin PROXY that injects the key server-side, exactly like the
// alpha demo's Netlify proxy. See ../proxy/lb-proxy.ts for a reference proxy.
//
// Set the proxy base URL once via configureApi(). It must expose the same three
// routes as the backend Azure Functions: /speech-to-text, /translate, /tts-router.

let PROXY_BASE = '/api/lb'; // same-origin default (no CORS). Override via configureApi().

export function configureApi(proxyBaseUrl: string): void {
  PROXY_BASE = proxyBaseUrl.replace(/\/+$/, '');
}

async function post(route: string, body: unknown, timeoutMs: number): Promise<{ ok: boolean; status: number; data: any }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PROXY_BASE}/${route}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    let data: any = null;
    try { data = await res.json(); } catch { /* non-JSON error body */ }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

// ── Speech-to-Text ──────────────────────────────────────────────────
export interface SttOk { ok: true; text: string; }
export interface SttErr { ok: false; error: string; code: string; }

export async function transcribe(wavBase64: string, language: string, studentCode: string): Promise<SttOk | SttErr> {
  if (!navigator.onLine) return { ok: false, error: 'You appear to be offline.', code: 'offline' };
  try {
    const res = await post('speech-to-text',
      { audioBase64: wavBase64, audioFormat: 'wav', language, studentCode }, 40000);

    if (!res.ok) {
      const errCode = res.data?.error || '';
      switch (errCode) {
        case 'LANGUAGE_NOT_SUPPORTED': return { ok: false, error: 'Speech input is not available for this language yet.', code: errCode };
        case 'TRANSCRIPTION_FAILED':   return { ok: false, error: "I couldn't understand that. Try speaking clearly into the mic.", code: errCode };
        case 'AUDIO_TOO_LARGE':        return { ok: false, error: 'That was a bit long. Keep it under 45 seconds.', code: errCode };
        case 'INVALID_STUDENT_CODE':   return { ok: false, error: 'Session problem. Reopen the app.', code: errCode };
        case 'RATE_LIMITED':           return { ok: false, error: 'Slow down a moment, then try again.', code: errCode };
        case 'REQUEST_TIMEOUT':        return { ok: false, error: 'That took too long. Try a shorter phrase.', code: errCode };
        default:                       return { ok: false, error: 'Speech recognition failed. Please try again.', code: errCode || 'unknown' };
      }
    }

    const text = (res.data?.text || res.data?.transcribedText || res.data?.transcript || '').trim();
    if (!text) return { ok: false, error: 'empty', code: 'empty' };
    return { ok: true, text };
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return { ok: false, error: aborted ? 'That took too long. Try a shorter phrase.' : 'Speech recognition failed. Please try again.', code: aborted ? 'timeout' : 'unknown' };
  }
}

// ── Translate ───────────────────────────────────────────────────────
export interface TranslateOk { ok: true; text: string; }
export interface TranslateErr { ok: false; error: string; }

export async function translate(text: string, fromLanguage: string, toLanguage: string, studentCode: string): Promise<TranslateOk | TranslateErr> {
  try {
    const res = await post('translate', { text, fromLanguage, toLanguage, studentCode }, 20000);
    if (!res.ok) return { ok: false, error: 'Translation failed. Try again.' };
    const out = (res.data?.translatedText || res.data?.translation || res.data?.text || '').trim();
    if (!out) return { ok: false, error: 'No translation came back. Try again.' };
    return { ok: true, text: out };
  } catch {
    return { ok: false, error: 'Translation failed. Try again.' };
  }
}

// ── Text-to-Speech (returns a playable audio URL) ───────────────────
// Dari TTS fails server-side (AZURE_SERVICE_ERROR); Persian is ~identical and
// reliable, so we transparently retry Dari as Persian — same behavior as the
// extension's lb-tts-service.
export async function synthesize(text: string, language: string, studentCode: string): Promise<string | null> {
  const call = async (lang: string): Promise<string | null> => {
    const res = await post('tts-router', { text, language: lang, studentCode }, 20000);
    if (res.ok) return res.data?.audioUrl || res.data?.audio_url || null;
    if (lang === 'dari' && res.data?.error === 'AZURE_SERVICE_ERROR') return call('persian');
    return null;
  };
  try { return await call(language); } catch { return null; }
}
