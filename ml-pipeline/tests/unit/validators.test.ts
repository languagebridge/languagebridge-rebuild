import { describe, it, expect } from 'vitest';
import { requireFields, isValidLanguage, isValidSessionToken, validateApiKey, checkRateLimit, checkForPII, validateTTSText } from '@shared/validators';

describe('requireFields', () => {
  it('passes when all fields present', () => { expect(requireFields({ a: '1', b: '2' }, ['a', 'b']).valid).toBe(true); });
  it('fails when fields missing', () => { expect(requireFields({ a: '1' }, ['a', 'b']).valid).toBe(false); });
  it('fails on null values', () => { expect(requireFields({ a: null }, ['a']).valid).toBe(false); });
});

describe('isValidLanguage', () => {
  it('accepts supported languages', () => { for (const l of ['arabic','french','dari','spanish','english','burmese','twi','tigrinya']) expect(isValidLanguage(l)).toBe(true); });
  it('rejects invalid', () => { expect(isValidLanguage('klingon')).toBe(false); });
});

describe('isValidSessionToken', () => {
  it('accepts valid UUIDs', () => { expect(isValidSessionToken('550e8400-e29b-41d4-a716-446655440000')).toBe(true); });
  it('rejects short', () => { expect(isValidSessionToken('short')).toBe(false); });
  it('rejects null', () => { expect(isValidSessionToken(null)).toBe(false); });
});

describe('validateApiKey', () => {
  const req = (key: string | null) => ({ headers: { get: (_n: string) => key } });
  it('allows when no key configured', () => { delete process.env.LB_API_KEY; expect(validateApiKey(req(null)).valid).toBe(true); });
  it('rejects wrong key', () => { process.env.LB_API_KEY = 'k'; const r = validateApiKey(req('x')); expect(r.valid).toBe(false); delete process.env.LB_API_KEY; });
  it('accepts correct key', () => { process.env.LB_API_KEY = 'k'; expect(validateApiKey(req('k')).valid).toBe(true); delete process.env.LB_API_KEY; });
});

describe('checkRateLimit', () => {
  it('allows under limit', () => { expect(checkRateLimit('fresh-' + Date.now()).allowed).toBe(true); });
  it('blocks after 100', () => { const k = 'flood-' + Date.now(); for (let i = 0; i < 100; i++) checkRateLimit(k); expect(checkRateLimit(k).allowed).toBe(false); });
});

describe('checkForPII', () => {
  it('passes clean', () => { expect(checkForPII({ term: 'hi' }).hasPII).toBe(false); });
  it('catches email', () => { expect(checkForPII({ email: 'a@b.c' }).hasPII).toBe(true); });
  it('catches studentId', () => { expect(checkForPII({ studentId: '1' }).hasPII).toBe(true); });
});

describe('validateTTSText', () => {
  it('accepts valid', () => { expect(validateTTSText('Hello').valid).toBe(true); });
  it('rejects empty', () => { expect(validateTTSText('').valid).toBe(false); });
  it('rejects >500 chars', () => { expect(validateTTSText('a'.repeat(501)).valid).toBe(false); });
});
