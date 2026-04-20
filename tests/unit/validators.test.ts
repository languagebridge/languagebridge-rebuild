import { describe, it, expect } from 'vitest';
import {
  requireFields,
  isValidLanguage,
  isValidStudentCode,
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

// ── isValidStudentCode ───────────────────────────────────

describe('isValidStudentCode', () => {
  it('accepts valid codes', () => {
    expect(isValidStudentCode('LB-7K2M')).toBe(true);
    expect(isValidStudentCode('LB-ABCD')).toBe(true);
    expect(isValidStudentCode('LB-3P9X2W')).toBe(true);
  });

  it('rejects invalid codes', () => {
    expect(isValidStudentCode('XX-7K2M')).toBe(false);
    expect(isValidStudentCode('')).toBe(false);
    expect(isValidStudentCode('LB-AB')).toBe(false);
    expect(isValidStudentCode(null)).toBe(false);
    expect(isValidStudentCode(12345678)).toBe(false);
  });
});

// ── validateApiKey ────────────────────────────────────────

describe('validateApiKey', () => {
  const makeRequest = (key: string | null) => ({
    headers: { get: (name: string) => key },
  });

  it('allows requests in dev mode when no key configured', () => {
    delete process.env.LB_API_KEY;
    process.env.NODE_ENV = 'development';
    expect(validateApiKey(makeRequest(null)).valid).toBe(true);
    delete process.env.NODE_ENV;
  });

  it('rejects requests in production when no key configured', () => {
    delete process.env.LB_API_KEY;
    process.env.NODE_ENV = 'production';
    expect(validateApiKey(makeRequest(null)).valid).toBe(false);
    delete process.env.NODE_ENV;
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
  it('allows requests under limit', async () => {
    const result = await checkRateLimit('test-fresh-key-' + Date.now());
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);
  });

  it('blocks after 100 requests', async () => {
    const key = 'test-flood-key-' + Date.now();
    for (let i = 0; i < 100; i++) {
      await checkRateLimit(key);
    }
    const result = await checkRateLimit(key);
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
