import { describe, it, expect } from 'vitest';
import {
  requireFields,
  isValidLanguage,
  isValidSessionToken,
  validateApiKey,
  checkRateLimit,
  checkForPII,
  validateTTSText,
} from '../../backend/shared/validators';

// ── requireFields ─────────────────────────────────────────

describe('requireFields', () => {
  it('passes when all fields present', () => {
    const result = requireFields({ a: '1', b: '2' }, ['a', 'b']);
    expect(result.valid).toBe(true);
  });

  it('fails when fields missing', () => {
    const result = requireFields({ a: '1' }, ['a', 'b']);
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.missing).toContain('b');
  });

  it('fails on null values', () => {
    const result = requireFields({ a: null }, ['a']);
    expect(result.valid).toBe(false);
  });
});

// ── isValidLanguage ───────────────────────────────────────

describe('isValidLanguage', () => {
  it('accepts all 21 supported languages', () => {
    const langs = [
      'arabic', 'french', 'portuguese', 'ukrainian', 'vietnamese',
      'spanish', 'persian', 'english', 'nepali', 'swahili',
      'dari', 'pashto', 'urdu', 'burmese', 'uzbek', 'amharic',
      'somali', 'tagalog', 'kinyarwanda', 'twi', 'tigrinya',
    ];
    for (const lang of langs) {
      expect(isValidLanguage(lang)).toBe(true);
    }
  });

  it('rejects invalid languages', () => {
    expect(isValidLanguage('klingon')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
    expect(isValidLanguage(123)).toBe(false);
    expect(isValidLanguage(null)).toBe(false);
  });
});

// ── isValidSessionToken ───────────────────────────────────

describe('isValidSessionToken', () => {
  it('accepts valid UUIDs', () => {
    expect(isValidSessionToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidSessionToken('abcdef12')).toBe(true);
  });

  it('rejects invalid tokens', () => {
    expect(isValidSessionToken('short')).toBe(false);
    expect(isValidSessionToken('')).toBe(false);
    expect(isValidSessionToken('has spaces in it')).toBe(false);
    expect(isValidSessionToken(null)).toBe(false);
    expect(isValidSessionToken(12345678)).toBe(false);
  });
});

// ── validateApiKey ────────────────────────────────────────

describe('validateApiKey', () => {
  const makeRequest = (key: string | null) => ({
    headers: { get: (name: string) => key },
  });

  it('allows all requests when no key configured', () => {
    delete process.env.LB_API_KEY;
    expect(validateApiKey(makeRequest(null)).valid).toBe(true);
  });

  it('rejects missing key when configured', () => {
    process.env.LB_API_KEY = 'test-key-123';
    const result = validateApiKey(makeRequest(null));
    expect(result.valid).toBe(false);
    delete process.env.LB_API_KEY;
  });

  it('rejects wrong key', () => {
    process.env.LB_API_KEY = 'test-key-123';
    const result = validateApiKey(makeRequest('wrong-key'));
    expect(result.valid).toBe(false);
    delete process.env.LB_API_KEY;
  });

  it('accepts correct key', () => {
    process.env.LB_API_KEY = 'test-key-123';
    const result = validateApiKey(makeRequest('test-key-123'));
    expect(result.valid).toBe(true);
    delete process.env.LB_API_KEY;
  });
});

// ── checkRateLimit ────────────────────────────────────────

describe('checkRateLimit', () => {
  it('allows requests under limit', () => {
    const result = checkRateLimit('test-fresh-key');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('blocks after 100 requests', () => {
    const key = 'test-flood-key-' + Date.now();
    for (let i = 0; i < 100; i++) {
      checkRateLimit(key);
    }
    const result = checkRateLimit(key);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

// ── checkForPII ───────────────────────────────────────────

describe('checkForPII', () => {
  it('passes clean payloads', () => {
    const result = checkForPII({ term: 'hello', language: 'dari' });
    expect(result.hasPII).toBe(false);
  });

  it('catches email field', () => {
    const result = checkForPII({ email: 'test@test.com', term: 'hello' });
    expect(result.hasPII).toBe(true);
    expect(result.prohibitedFields).toContain('email');
  });

  it('catches name field', () => {
    const result = checkForPII({ name: 'John', term: 'hello' });
    expect(result.hasPII).toBe(true);
  });

  it('catches studentId field', () => {
    const result = checkForPII({ studentId: '12345', term: 'hello' });
    expect(result.hasPII).toBe(true);
  });
});

// ── validateTTSText ───────────────────────────────────────

describe('validateTTSText', () => {
  it('accepts valid text', () => {
    const result = validateTTSText('Hello world');
    expect(result.valid).toBe(true);
  });

  it('rejects empty text', () => {
    const result = validateTTSText('');
    expect(result.valid).toBe(false);
  });

  it('rejects non-string', () => {
    const result = validateTTSText(123);
    expect(result.valid).toBe(false);
  });

  it('rejects text over 500 chars', () => {
    const result = validateTTSText('a'.repeat(501));
    expect(result.valid).toBe(false);
  });
});
