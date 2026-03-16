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
