import { timingSafeEqual } from 'crypto';
import { SUPPORTED_LANGUAGES, SupportedLanguage } from './types';

/**
 * Input Validators
 *
 * Centralized validation for all Azure Functions.
 * PII protection is enforced here — never in the functions themselves.
 */

// ============================================
// PII PROTECTION
// Fields that must NEVER appear in analytics payloads
// ============================================

const PROHIBITED_PII_FIELDS = [
  'email',
  'name',
  'firstName',
  'lastName',
  'studentId',
  'schoolId',
  'teacherId',
  'userId',
  'phone',
  'address',
  'dob',
  'dateOfBirth',
  'ssn',
  'ipAddress',
  'deviceId',
] as const;

export type PIICheckResult =
  | { hasPII: false }
  | { hasPII: true; prohibitedFields: string[] };

// Heuristic PII patterns scanned against free-text *values* (not just keys).
// These are high-signal formats; they are defense-in-depth, not a guarantee.
// Phone requires a separator to avoid matching ordinary digit runs.
const PII_VALUE_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'email', re: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i },
  { name: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { name: 'phone', re: /(?:\+?1[-.\s])?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/ },
];

export function checkForPII(payload: Record<string, unknown>): PIICheckResult {
  const found = new Set<string>();
  scanForPII(payload, found);
  if (found.size > 0) {
    return { hasPII: true, prohibitedFields: Array.from(found) };
  }
  return { hasPII: false };
}

function scanForPII(obj: unknown, found: Set<string>, depth = 0): void {
  if (depth > 5 || obj === null || obj === undefined || typeof obj !== 'object') return;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    // Reject by prohibited field name…
    if (PROHIBITED_PII_FIELDS.includes(key as typeof PROHIBITED_PII_FIELDS[number])) {
      found.add(key);
    }
    // …and by PII patterns inside free-text string values (the primary vector:
    // a student typing an email/SSN/phone into `term`, `flaggedText`, `text`).
    if (typeof value === 'string') {
      for (const { name, re } of PII_VALUE_PATTERNS) {
        if (re.test(value)) {
          found.add(`${key}:${name}`);
        }
      }
    } else if (typeof value === 'object' && value !== null) {
      scanForPII(value, found, depth + 1);
    }
  }
}

// ============================================
// FLAG CONTEXT SCRUBBING (flywheel Phase 1)
// Free text that we DO store (the sentence around a flagged term, a misheard
// transcript) is redacted and trimmed here before it is written. Like the scan
// above, this is defense-in-depth: it removes common identifiers, not all of them.
// ============================================

const MAX_CONTEXT_CHARS = 200;
const CONTEXT_WINDOW_WORDS = 8;

/**
 * Redact identifiers from free text:
 *   emails, phones, SSNs                → [redacted]
 *   any run of 3+ digits (ids, streets) → [number]
 *   capitalized words mid-sentence      → [name]   (Latin script only; keeps `keep`)
 */
export function redactPII(text: string, keep: string[] = []): string {
  const keepSet = new Set(keep.map((k) => k.toLowerCase()));
  let out = text.replace(/\s+/g, ' ').trim();
  for (const { re } of PII_VALUE_PATTERNS) {
    out = out.replace(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g'), '[redacted]');
  }
  out = out.replace(/\d{3,}/g, '[number]');

  // A capitalized word that does not start a sentence is most likely a name.
  // Classroom proper nouns ("Ohio") are lost too — acceptable; the sense is in the
  // surrounding words, and a missed name is the worse failure.
  const tokens = out.split(' ');
  let sentenceStart = true;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const bare = tok.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
    if (bare && !sentenceStart && /^\p{Lu}/u.test(bare) && bare !== 'I' && !keepSet.has(bare.toLowerCase())) {
      tokens[i] = tok.replace(bare, '[name]');
    }
    if (bare) sentenceStart = /[.!?]["')\]]*$/.test(tok);
  }
  return tokens.join(' ');
}

/**
 * Scrub the sentence around a flagged term for storage: redact, then keep only
 * CONTEXT_WINDOW_WORDS either side of the term, capped at MAX_CONTEXT_CHARS.
 * Returns null when nothing useful is left.
 */
export function scrubFlagContext(context: unknown, term: string): string | null {
  if (typeof context !== 'string' || context.trim().length === 0) return null;
  const termWords = term.toLowerCase().split(/\s+/).filter(Boolean);
  const words = redactPII(context, termWords).split(' ');

  const lower = words.map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}'-]/gu, ''));
  let hit = -1;
  for (let i = 0; i + termWords.length <= lower.length; i++) {
    if (termWords.every((t, j) => lower[i + j] === t)) { hit = i; break; }
  }

  const window = hit === -1
    ? words.slice(0, CONTEXT_WINDOW_WORDS * 2 + termWords.length)
    : words.slice(Math.max(0, hit - CONTEXT_WINDOW_WORDS), hit + termWords.length + CONTEXT_WINDOW_WORDS);
  let out = window.join(' ');
  if (out.length > MAX_CONTEXT_CHARS) out = out.slice(0, MAX_CONTEXT_CHARS).replace(/\s+\S*$/, '');
  return out.length > 0 ? out : null;
}

// ============================================
// LANGUAGE VALIDATION
// ============================================

export function isValidLanguage(language: unknown): language is SupportedLanguage {
  return typeof language === 'string' && (SUPPORTED_LANGUAGES as readonly string[]).includes(language);
}

// ============================================
// FIELD PRESENCE VALIDATION
// ============================================

export function requireFields(
  body: Record<string, unknown>,
  fields: string[]
): { valid: true } | { valid: false; missing: string[] } {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length > 0) {
    return { valid: false, missing };
  }
  return { valid: true };
}

// ============================================
// TEXT VALIDATION (for TTS requests)
// ============================================

const MAX_TTS_TEXT_LENGTH = 500;

export function validateTTSText(text: unknown): { valid: true } | { valid: false; reason: string } {
  if (typeof text !== 'string' || text.trim().length === 0) {
    return { valid: false, reason: 'text must be a non-empty string' };
  }
  if (text.length > MAX_TTS_TEXT_LENGTH) {
    return { valid: false, reason: `text exceeds maximum length of ${MAX_TTS_TEXT_LENGTH} characters` };
  }
  return { valid: true };
}

// ============================================
// SESSION TOKEN VALIDATION
// ============================================

const STUDENT_CODE_REGEX = /^LB-[A-HJ-NP-Z2-9]{4,8}$/;

export function isValidStudentCode(code: unknown): boolean {
  return typeof code === 'string' && STUDENT_CODE_REGEX.test(code);
}

// ============================================
// API KEY VALIDATION
// ============================================

const API_KEY_HEADER = 'x-lb-api-key';

export function validateApiKey(request: { headers: { get(name: string): string | null } }): { valid: true } | { valid: false; status: number; error: string } {
  const expectedKey = process.env.LB_API_KEY;

  if (!expectedKey) {
    // Auth is bypassed ONLY with an explicit, deliberate opt-in — never just
    // because NODE_ENV happens to be 'development' (which can leak into deployed
    // or preview environments and silently open every student endpoint).
    if (process.env.LB_ALLOW_INSECURE_DEV === 'true') {
      return { valid: true };
    }
    return { valid: false, status: 500, error: 'API key not configured on server' };
  }

  const apiKey = request.headers.get(API_KEY_HEADER);
  if (!apiKey) {
    return { valid: false, status: 401, error: 'Invalid or missing API key' };
  }

  // Timing-safe comparison to prevent key length leakage
  const expected = Buffer.from(expectedKey, 'utf8');
  const provided = Buffer.from(apiKey, 'utf8');
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { valid: false, status: 401, error: 'Invalid or missing API key' };
  }

  return { valid: true };
}

// ============================================
// RATE LIMITING (Cosmos DB distributed counter)
// ============================================
//
// Each rate limit key gets a Cosmos DB document with a counter and window start.
// This works correctly across multiple Azure Functions instances (distributed).
// Falls back to in-memory if Cosmos is unavailable (graceful degradation).
//
// NOTE: this is a FIXED window aligned to the minute boundary, not a sliding
// window — a client can burst up to `limit` at the end of one window and
// `limit` again at the start of the next. Acceptable for abuse prevention here;
// switch to a sliding window if exact smoothing is ever required.

import { getRateLimitContainer } from './cosmos-client';

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_DEFAULT = 100;      // Default ceiling when caller doesn't specify

// In-memory fallback for when Cosmos is unavailable
const _fallbackMap = new Map<string, number[]>();

export async function checkRateLimit(key: string, limit: number = RATE_LIMIT_DEFAULT): Promise<{ allowed: boolean; remaining: number; retryAfterMs?: number }> {
  const RATE_LIMIT_MAX = limit;
  const now = Date.now();
  const windowStart = now - (now % RATE_LIMIT_WINDOW_MS); // Align to minute boundary
  const docId = `${key}::${windowStart}`;

  try {
    const container = getRateLimitContainer();

    // Atomic increment via upsert with conditional check
    let count: number;
    try {
      const { resource } = await container.item(docId, key).patch([
        { op: 'incr', path: '/count', value: 1 },
      ]);
      count = resource!.count;
    } catch {
      // Document doesn't exist — create it with TTL for auto-cleanup
      try {
        await container.items.create({
          id: docId,
          partitionKey: key,
          count: 1,
          windowStart,
          ttl: 120, // Auto-delete after 2 minutes (Cosmos DB TTL)
        });
        count = 1;
      } catch (createErr: unknown) {
        // 409 conflict — another instance created it first, retry patch
        if ((createErr as { code?: number })?.code === 409) {
          const { resource } = await container.item(docId, key).patch([
            { op: 'incr', path: '/count', value: 1 },
          ]);
          count = resource!.count;
        } else {
          throw createErr;
        }
      }
    }

    if (count > RATE_LIMIT_MAX) {
      const retryAfterMs = windowStart + RATE_LIMIT_WINDOW_MS - now;
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    return { allowed: true, remaining: RATE_LIMIT_MAX - count };
  } catch {
    // Cosmos unavailable — fall back to in-memory (best-effort, per-instance)
    return checkRateLimitFallback(key, now, RATE_LIMIT_MAX);
  }
}

function checkRateLimitFallback(key: string, now: number, limit: number): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  // Evict stale entries periodically
  if (_fallbackMap.size > 5_000) {
    for (const [k, timestamps] of _fallbackMap) {
      if (timestamps.every(t => t < cutoff)) _fallbackMap.delete(k);
    }
  }

  const timestamps = (_fallbackMap.get(key) ?? []).filter(t => t > cutoff);
  timestamps.push(now);
  _fallbackMap.set(key, timestamps);

  if (timestamps.length > limit) {
    const retryAfterMs = timestamps[0] + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  return { allowed: true, remaining: limit - timestamps.length };
}

// ============================================
// ERROR RESPONSE FACTORY
// ============================================

export function errorResponse(status: number, error: string, details: string): { status: number; jsonBody: { error: string; details: string } } {
  return { status, jsonBody: { error, details } };
}
