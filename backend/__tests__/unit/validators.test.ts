import { checkForPII, isValidLanguage, requireFields, validateTTSText, isValidSessionToken } from '../../shared/validators';

describe('checkForPII', () => {
  it('returns hasPII: false for clean payloads', () => {
    const result = checkForPII({ sessionToken: 'abc', pilotId: 'PCSD-2026', language: 'dari' });
    expect(result.hasPII).toBe(false);
  });

  it('detects email field', () => {
    const result = checkForPII({ email: 'student@school.edu', sessionToken: 'abc' });
    expect(result.hasPII).toBe(true);
    if (result.hasPII) {
      expect(result.prohibitedFields).toContain('email');
    }
  });

  it('detects multiple PII fields', () => {
    const result = checkForPII({ firstName: 'John', lastName: 'Doe', studentId: '12345' });
    expect(result.hasPII).toBe(true);
    if (result.hasPII) {
      expect(result.prohibitedFields).toEqual(expect.arrayContaining(['firstName', 'lastName', 'studentId']));
    }
  });

  it('detects all prohibited fields', () => {
    const prohibited = [
      'email', 'name', 'firstName', 'lastName', 'studentId', 'schoolId',
      'teacherId', 'userId', 'phone', 'address', 'dob', 'dateOfBirth',
      'ssn', 'ipAddress', 'deviceId',
    ];
    for (const field of prohibited) {
      const result = checkForPII({ [field]: 'value' });
      expect(result.hasPII).toBe(true);
    }
  });
});

describe('isValidLanguage', () => {
  it('accepts supported languages', () => {
    expect(isValidLanguage('dari')).toBe(true);
    expect(isValidLanguage('pashto')).toBe(true);
    expect(isValidLanguage('spanish')).toBe(true);
    expect(isValidLanguage('english')).toBe(true);
  });

  it('rejects unsupported languages', () => {
    expect(isValidLanguage('klingon')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
    expect(isValidLanguage('DARI')).toBe(false); // case sensitive
  });

  it('rejects non-string values', () => {
    expect(isValidLanguage(123)).toBe(false);
    expect(isValidLanguage(null)).toBe(false);
    expect(isValidLanguage(undefined)).toBe(false);
  });
});

describe('requireFields', () => {
  it('returns valid: true when all fields present', () => {
    const result = requireFields({ a: 'x', b: 'y' }, ['a', 'b']);
    expect(result.valid).toBe(true);
  });

  it('returns missing fields', () => {
    const result = requireFields({ a: 'x' }, ['a', 'b', 'c']);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.missing).toEqual(['b', 'c']);
    }
  });

  it('treats empty string as missing', () => {
    const result = requireFields({ a: '' }, ['a']);
    expect(result.valid).toBe(false);
  });

  it('treats null as missing', () => {
    const result = requireFields({ a: null }, ['a']);
    expect(result.valid).toBe(false);
  });
});

describe('validateTTSText', () => {
  it('accepts valid text', () => {
    expect(validateTTSText('hello world').valid).toBe(true);
  });

  it('rejects empty string', () => {
    const result = validateTTSText('');
    expect(result.valid).toBe(false);
  });

  it('rejects whitespace-only string', () => {
    const result = validateTTSText('   ');
    expect(result.valid).toBe(false);
  });

  it('rejects text over 500 characters', () => {
    const result = validateTTSText('a'.repeat(501));
    expect(result.valid).toBe(false);
  });

  it('accepts text at exactly 500 characters', () => {
    expect(validateTTSText('a'.repeat(500)).valid).toBe(true);
  });

  it('rejects non-string input', () => {
    expect(validateTTSText(123).valid).toBe(false);
    expect(validateTTSText(null).valid).toBe(false);
  });
});

describe('isValidSessionToken', () => {
  it('accepts valid tokens', () => {
    expect(isValidSessionToken('abcdef12')).toBe(true);
    expect(isValidSessionToken('a1b2c3d4-e5f6-7890')).toBe(true);
  });

  it('rejects tokens that are too short', () => {
    expect(isValidSessionToken('abc')).toBe(false);
  });

  it('rejects tokens that are too long', () => {
    expect(isValidSessionToken('a'.repeat(65))).toBe(false);
  });

  it('rejects tokens with invalid characters', () => {
    expect(isValidSessionToken('abc def12')).toBe(false); // space
    expect(isValidSessionToken('abc!def12')).toBe(false); // special char
  });

  it('rejects non-string input', () => {
    expect(isValidSessionToken(123)).toBe(false);
    expect(isValidSessionToken(null)).toBe(false);
  });
});
