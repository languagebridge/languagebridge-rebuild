import { variantChain, isValidVariant, variantRank, resolveAlongChain, LANGUAGE_VARIANTS } from '../../shared/variants';
import { rankEntries } from '../../azure-functions/lexicon-lookup/index';
import { resolveVoice } from '../../azure-functions/tts-router/index';
import { selectForVariant, applyOverrides, OverrideEntry } from '../../shared/dual-codex';
import { flagHandler } from '../../azure-functions/flag-handler/index';
import { enroll, getVariants } from '../../azure-functions/onboarding/index';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { LexiconDoc, SUPPORTED_LANGUAGES } from '../../shared/types';
import voiceConfig from '../../shared/voice-config.json';
import { clearEnrollmentCache } from '../../shared/enrollments';

// ── Mocks ───────────────────────────────────────────────────────────

const mockFlagPatch = jest.fn();
const mockFlagCreate = jest.fn();
const mockEnrollmentRead = jest.fn();
const mockEnrollmentCreate = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getFlagsContainer: () => ({ item: () => ({ patch: mockFlagPatch }), items: { create: mockFlagCreate } }),
  getEnrollmentsContainer: () => ({ items: { create: mockEnrollmentCreate, query: () => ({ fetchAll: async () => { const r = await mockEnrollmentRead(); return { resources: r?.resource ? [{ id: r.resource.id ?? 'LB-TEST7', ...r.resource }] : [] }; } }) } }),
  getPilotsContainer: () => ({ items: { query: () => ({ fetchAll: async () => ({ resources: [{ id: 'p1' }] }) }) } }),
  getRateLimitContainer: () => ({
    item: () => ({ patch: jest.fn().mockResolvedValue({ resource: { count: 1 } }) }),
    items: { create: jest.fn().mockResolvedValue({}) },
  }),
}));

function req(body: unknown, query: Record<string, string> = {}): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/x',
    headers: new Map([['x-lb-api-key', 'test-api-key-for-jest'], ['x-forwarded-for', '1.2.3.4']]),
    query: new Map(Object.entries(query)),
    params: {},
    json: async () => body,
  } as unknown as HttpRequest;
}
const ctx = () => ({ log: jest.fn(), error: jest.fn(), warn: jest.fn() }) as unknown as InvocationContext;

beforeEach(() => {
  jest.clearAllMocks();
  clearEnrollmentCache();
});

// ── Registry ────────────────────────────────────────────────────────

describe('variant registry', () => {
  it('builds most-specific-first chains ending at the core language', () => {
    expect(variantChain('spanish', 'es-HN')).toEqual(['es-HN', 'es-419', null]);
    expect(variantChain('spanish', 'es-419')).toEqual(['es-419', null]);
    expect(variantChain('spanish', null)).toEqual([null]);
  });

  it('never crosses languages', () => {
    expect(isValidVariant('dari', 'fa-IR')).toBe(false);
    expect(isValidVariant('pashto', 'es-HN')).toBe(false);
    expect(variantChain('dari', 'ps-AF')).toEqual([null]);
    for (const v of Object.values(LANGUAGE_VARIANTS)) {
      if (v.parent) expect(LANGUAGE_VARIANTS[v.parent].language).toBe(v.language);
    }
  });

  it('every variant belongs to a supported language', () => {
    for (const v of Object.values(LANGUAGE_VARIANTS)) {
      expect(SUPPORTED_LANGUAGES as readonly string[]).toContain(v.language);
    }
  });

  it('ranks entries by position in the chain and rejects other variants', () => {
    const chain = variantChain('spanish', 'es-HN');
    expect(variantRank(chain, 'es-HN')).toBe(0);
    expect(variantRank(chain, 'es-419')).toBe(1);
    expect(variantRank(chain, null)).toBe(2);
    expect(variantRank(chain, undefined)).toBe(2);
    expect(variantRank(chain, 'es-CU')).toBe(-1);
  });

  it('resolves the first value along the chain', () => {
    expect(resolveAlongChain('spanish', 'es-HN', (v) => v.sttLocale)).toBe('es-HN');
    expect(resolveAlongChain('arabic', 'ar-SD', (v) => v.sttLocale)).toBeUndefined();   // no Azure locale → core
  });
});

// ── Voices ──────────────────────────────────────────────────────────

describe('voices', () => {
  it('uses the variant voice where Azure has one, else the core voice', () => {
    expect(resolveVoice('spanish', 'es-HN')).toBe('es-HN-KarlaNeural');
    expect(resolveVoice('spanish', null)).toBe('es-US-AlonsoNeural');
    expect(resolveVoice('arabic', 'ar-SD')).toBe('ar-SA-HamedNeural');
  });

  it('never assigns another language’s Piper model', () => {
    const cfg = voiceConfig as Record<string, { piper_model: string | null }>;
    expect(cfg.pashto.piper_model).toBeNull();
    expect(cfg.urdu.piper_model).toBeNull();
    expect(cfg.somali.piper_model).toBeNull();
    expect(cfg.spanish.piper_model).toBeNull();
  });
});

// ── Lexicon ranking ─────────────────────────────────────────────────

describe('lexicon ranking with variants', () => {
  const row = (id: string, extra: Partial<LexiconDoc>) =>
    ({ id, term: 'bus', language: 'spanish', status: 'pending_review', created_by: 'rbern_glossary', ...extra }) as LexiconDoc;
  const rows = [row('core', {}), row('cu', { variant: 'es-CU', cognate: 'guagua' }), row('latam', { variant: 'es-419' })];

  it('serves the exact variant first', () => {
    expect(rankEntries(rows, null, 'es-CU').map((r) => r.id)).toEqual(['cu', 'latam', 'core']);
  });

  it('falls back through the parent to core, never to a sibling variant', () => {
    expect(rankEntries(rows, null, 'es-HN').map((r) => r.id)).toEqual(['latam', 'core']);
  });

  it('serves only core entries when no variant is requested', () => {
    expect(rankEntries(rows, null, null).map((r) => r.id)).toEqual(['core']);
  });

  it('puts sense before dialect', () => {
    const ranked = rankEntries([row('cu', { variant: 'es-CU' }), row('core-math', { subject: 'math' })], 'math', 'es-CU');
    expect(ranked[0].id).toBe('core-math');
  });
});

// ── Dual Codex ──────────────────────────────────────────────────────

describe('dual codex with variants', () => {
  const entries: OverrideEntry[] = [
    { id: 'core', term: 'take the bus', cognate: 'toma el autobús', entry_kind: 'phrase', version: 1, variant: null },
    { id: 'cu', term: 'take the bus', cognate: 'coge la guagua', entry_kind: 'phrase', version: 1, variant: 'es-CU' },
  ];

  it('uses the variant phrase for that variant and the core phrase otherwise', () => {
    const cu = applyOverrides('Take the bus', selectForVariant(entries, 'spanish', 'es-CU'));
    const hn = applyOverrides('Take the bus', selectForVariant(entries, 'spanish', 'es-HN'));
    expect(cu).toMatchObject({ mode: 'phrase', translatedText: 'coge la guagua' });
    expect(hn).toMatchObject({ mode: 'phrase', translatedText: 'toma el autobús' });
  });
});

// ── Flags ───────────────────────────────────────────────────────────

describe('flag-handler with variants', () => {
  const base = { flaggedText: 'bus', language: 'spanish', studentCode: 'LB-TEST7', timestamp: '2026-10-16T12:00:00Z', flagType: 'translation' };

  it('inherits the enrollment variant when the flag is in the student’s language', async () => {
    mockEnrollmentRead.mockResolvedValue({ resource: { schoolCode: 'S', gradeBand: '6-8', language: 'spanish', variant: 'es-HN' } });
    mockFlagPatch.mockRejectedValue(new Error('Not found'));
    mockFlagCreate.mockResolvedValue({});
    await flagHandler(req(base), ctx());
    expect(mockFlagCreate.mock.calls[0][0].variant).toBe('es-HN');
  });

  it('does not inherit it for a flag in another language', async () => {
    mockEnrollmentRead.mockResolvedValue({ resource: { schoolCode: 'S', gradeBand: '6-8', language: 'spanish', variant: 'es-HN' } });
    mockFlagPatch.mockRejectedValue(new Error('Not found'));
    mockFlagCreate.mockResolvedValue({});
    await flagHandler(req({ ...base, language: 'english', flagType: 'recognition', surface: 'talk_to_teacher' }), ctx());
    expect(mockFlagCreate.mock.calls[0][0].variant).toBeNull();
  });

  it('keys a variant flag separately from a core flag', async () => {
    mockEnrollmentRead.mockResolvedValue({ resource: null });
    mockFlagPatch.mockRejectedValue(new Error('Not found'));
    mockFlagCreate.mockResolvedValue({});
    const a = await flagHandler(req({ ...base, variant: 'es-CU' }), ctx());
    const b = await flagHandler(req(base), ctx());
    expect((a.jsonBody as { flagId: string }).flagId).not.toBe((b.jsonBody as { flagId: string }).flagId);
  });
});

// ── Onboarding ──────────────────────────────────────────────────────

describe('onboarding variants', () => {
  it('rejects a variant from another language', async () => {
    const res = await enroll(req({ schoolCode: 'S', gradeBand: '6-8', language: 'dari', variant: 'fa-IR' }), ctx());
    expect(res.status).toBe(400);
    expect((res.jsonBody as { error: string }).error).toBe('INVALID_VARIANT');
  });

  it('stores a valid variant on the enrollment', async () => {
    mockEnrollmentCreate.mockResolvedValue({});
    const res = await enroll(req({ schoolCode: 'S', gradeBand: '6-8', language: 'spanish', variant: 'es-GT' }), ctx());
    expect(res.status).toBe(201);
    expect(mockEnrollmentCreate.mock.calls[0][0].variant).toBe('es-GT');
  });

  it('lists student-facing choices for one language', async () => {
    const res = await getVariants(req(undefined, { language: 'spanish' }), ctx());
    const body = res.jsonBody as { variants: Record<string, Array<{ tag: string; label: string }>> };
    expect(body.variants.spanish.map((v) => v.tag)).toContain('es-HN');
    expect(body.variants.spanish.find((v) => v.tag === 'es-CU')?.label).toBe('Spanish — Cuba');
  });

  it('omits languages without variants', async () => {
    const res = await getVariants(req(undefined), ctx());
    const body = res.jsonBody as { variants: Record<string, unknown> };
    expect(body.variants).toHaveProperty('spanish');
    expect(body.variants).not.toHaveProperty('dari');
  });
});
