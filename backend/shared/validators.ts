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
    if (PROHIBITED_PII_FIELDS.includes(key as typeof PROHIBITED_PII_FIELDS[number])) {
      found.add(key);
    }
    if (typeof value === 'object' && value !== null) {
      scanForPII(value, found, depth + 1);
    }
  }
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
    if (process.env.NODE_ENV === 'development') {
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
