import { checkForPII, isValidLanguage, requireFields, validateTTSText, isValidStudentCode, validateApiKey } from '../../shared/validators';

describe('checkForPII', () => {
  it('returns hasPII: false for clean payloads', () => {
    const result = checkForPII({ studentCode: "LB-TEST1",  language: 'dari' });
    expect(result.hasPII).toBe(false);
  });

  it('detects email field', () => {
    const result = checkForPII({ email: 'student@school.edu', studentCode: "LB-TEST1" });
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

describe('isValidStudentCode', () => {
  it('accepts valid codes', () => {
    expect(isValidStudentCode('LB-7K2M')).toBe(true);
    expect(isValidStudentCode('LB-ABCD')).toBe(true);
    expect(isValidStudentCode('LB-3P9X2W')).toBe(true);
  });

  it('rejects codes without LB- prefix', () => {
    expect(isValidStudentCode('XX-7K2M')).toBe(false);
    expect(isValidStudentCode('7K2M')).toBe(false);
  });

  it('rejects codes that are too short', () => {
    expect(isValidStudentCode('LB-AB')).toBe(false);
  });

  it('rejects codes with confusing characters (I, O, 0, 1)', () => {
    expect(isValidStudentCode('LB-IO01')).toBe(false);
  });

  it('rejects non-string input', () => {
    expect(isValidStudentCode(123)).toBe(false);
    expect(isValidStudentCode(null)).toBe(false);
  });
});

describe('validateApiKey', () => {
  const makeHeaders = (key?: string) => ({
    get: (name: string) => name === 'x-lb-api-key' ? (key ?? null) : null,
  });

  beforeEach(() => {
    process.env.LB_API_KEY = 'test-secret-key-12345';
  });

  afterEach(() => {
    delete process.env.LB_API_KEY;
    delete process.env.NODE_ENV;
    delete process.env.LB_ALLOW_INSECURE_DEV;
  });

  it('accepts valid API key', () => {
    const result = validateApiKey({ headers: makeHeaders('test-secret-key-12345') });
    expect(result.valid).toBe(true);
  });

  it('rejects missing API key header', () => {
    const result = validateApiKey({ headers: makeHeaders() });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.status).toBe(401);
  });

  it('rejects wrong API key', () => {
    const result = validateApiKey({ headers: makeHeaders('wrong-key') });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.status).toBe(401);
  });

  it('returns 500 when server key is not configured', () => {
    delete process.env.LB_API_KEY;
    const result = validateApiKey({ headers: makeHeaders('any-key') });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.status).toBe(500);
  });

  it('bypasses validation only with explicit LB_ALLOW_INSECURE_DEV opt-in', () => {
    delete process.env.LB_API_KEY;
    process.env.LB_ALLOW_INSECURE_DEV = 'true';
    const result = validateApiKey({ headers: makeHeaders() });
    expect(result.valid).toBe(true);
  });

  it('does NOT bypass on NODE_ENV=development alone (no opt-in)', () => {
    delete process.env.LB_API_KEY;
    process.env.NODE_ENV = 'development';
    const result = validateApiKey({ headers: makeHeaders() });
    expect(result.valid).toBe(false);
    if (!result.valid) expect(result.status).toBe(500);
  });
});
