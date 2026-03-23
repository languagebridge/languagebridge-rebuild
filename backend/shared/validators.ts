import { SUPPORTED_LANGUAGES, SupportedLanguage } from './types';

/**
 * Input Validators
 *
 * Centralized validation for all four Azure Functions.
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

export function checkForPII(payload: Record<string, unknown>): PIICheckResult {
  const found = PROHIBITED_PII_FIELDS.filter((field) => field in payload);
  if (found.length > 0) {
    return { hasPII: true, prohibitedFields: found };
  }
  return { hasPII: false };
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
  const missing = fields.filter((f) => !body[f]);
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

const SESSION_TOKEN_REGEX = /^[a-zA-Z0-9\-]{8,64}$/;

export function isValidSessionToken(token: unknown): boolean {
  return typeof token === 'string' && SESSION_TOKEN_REGEX.test(token);
}

// ============================================
// API KEY VALIDATION
// ============================================

const API_KEY_HEADER = 'x-lb-api-key';

export function validateApiKey(request: { headers: { get(name: string): string | null } }): { valid: true } | { valid: false; status: number; error: string } {
  const expectedKey = process.env.LB_API_KEY;

  // If no key configured, allow (dev mode)
  if (!expectedKey) {
    return { valid: true };
  }

  const apiKey = request.headers.get(API_KEY_HEADER);
  if (!apiKey || apiKey !== expectedKey) {
    return { valid: false, status: 401, error: 'Invalid or missing API key' };
  }

  return { valid: true };
}

// ============================================
// RATE LIMITING (in-memory sliding window)
// ============================================

const rateLimitWindows = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 100;          // 100 requests per minute per key
const MAX_MAP_SIZE = 10_000;

export function checkRateLimit(key: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  // Evict stale entries if map is too large
  if (rateLimitWindows.size > MAX_MAP_SIZE) {
    for (const [k, timestamps] of rateLimitWindows) {
      if (timestamps.every(t => t < cutoff)) {
        rateLimitWindows.delete(k);
      }
    }
  }

  let timestamps = rateLimitWindows.get(key);
  if (!timestamps) {
    timestamps = [];
    rateLimitWindows.set(key, timestamps);
  }

  // Prune old timestamps
  const valid = timestamps.filter(t => t > cutoff);
  rateLimitWindows.set(key, valid);

  if (valid.length >= RATE_LIMIT_MAX) {
    const oldestInWindow = valid[0];
    const retryAfterMs = oldestInWindow + RATE_LIMIT_WINDOW_MS - now;
    return { allowed: false, remaining: 0, retryAfterMs };
  }

  valid.push(now);
  return { allowed: true, remaining: RATE_LIMIT_MAX - valid.length };
}
