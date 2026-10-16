import { flagHandler } from '../../azure-functions/flag-handler/index';
import { listFlagQueue, actOnFlag } from '../../azure-functions/flag-queue/index';
import { rankEntries, provenanceOf } from '../../azure-functions/lexicon-lookup/index';
import { applyOverrides, OverrideEntry } from '../../shared/dual-codex';
import { redactPII, scrubFlagContext } from '../../shared/validators';
import { HttpRequest, InvocationContext } from '@azure/functions';
import { LexiconDoc } from '../../shared/types';
import { clearEnrollmentCache } from '../../shared/enrollments';

// ── Mocks ───────────────────────────────────────────────────────────

const mockPatch = jest.fn();
const mockCreate = jest.fn();
const mockRead = jest.fn();
const mockQueryFetch = jest.fn();
const mockEnrollmentRead = jest.fn();
const mockResolveAuth = jest.fn();

jest.mock('../../shared/cosmos-client', () => ({
  getFlagsContainer: () => ({
    item: () => ({ patch: mockPatch, read: mockRead }),
    items: { create: mockCreate, query: () => ({ fetchAll: mockQueryFetch }) },
  }),
  getEnrollmentsContainer: () => ({ items: { query: () => ({ fetchAll: async () => { const r = await mockEnrollmentRead(); return { resources: r?.resource ? [{ id: r.resource.id ?? 'LB-TEST7', ...r.resource }] : [] }; } }) } }),
  getRateLimitContainer: () => ({
    item: () => ({ patch: jest.fn().mockResolvedValue({ resource: { count: 1 } }) }),
    items: { create: jest.fn().mockResolvedValue({}) },
  }),
}));

jest.mock('../../shared/auth-helpers', () => ({
  resolveAuthContext: (...args: unknown[]) => mockResolveAuth(...args),
}));

function makeRequest(body: unknown, extra: Partial<{ query: Map<string, string>; params: Record<string, string> }> = {}): HttpRequest {
  return {
    method: 'POST',
    url: 'http://localhost/api/x',
    headers: new Map([['x-lb-api-key', 'test-api-key-for-jest'], ['authorization', 'Bearer t']]),
    query: extra.query ?? new Map(),
    params: extra.params ?? {},
    json: async () => body,
  } as unknown as HttpRequest;
}

function makeContext(): InvocationContext {
  return { log: jest.fn(), error: jest.fn(), warn: jest.fn() } as unknown as InvocationContext;
}

beforeEach(() => {
  jest.clearAllMocks();
  clearEnrollmentCache();
  mockEnrollmentRead.mockResolvedValue({ resource: { schoolCode: 'GREENBRIAR', gradeBand: '6-8' } });
});

const base = {
  flaggedText: 'table',
  language: 'somali',
  studentCode: 'LB-TEST7',
  timestamp: '2026-10-16T12:00:00Z',
  flagType: 'translation',
};

// ── Scrubbing ───────────────────────────────────────────────────────

describe('redactPII / scrubFlagContext', () => {
  it('redacts emails, long numbers and mid-sentence names', () => {
    const out = redactPII('Ask Maria at maria@school.org or room 1204 about the table.');
    expect(out).not.toMatch(/Maria|maria@|1204/);
    expect(out).toContain('[name]');
    expect(out).toContain('[number]');
    expect(out).toContain('table');
  });

  it('keeps the sentence-initial word and the flagged term', () => {
    expect(redactPII('Fractions are parts. Look at the Table.', ['table'])).toBe('Fractions are parts. Look at the Table.');
  });

  it('trims context to a window around the term', () => {
    const long = Array.from({ length: 40 }, (_, i) => `w${i}`).join(' ').replace('w20', 'table');
    const out = scrubFlagContext(long, 'table')!;
    expect(out.split(' ')).toHaveLength(17);
    expect(out).toContain('table');
    expect(out.length).toBeLessThanOrEqual(200);
  });

  it('returns null for empty context', () => {
    expect(scrubFlagContext('   ', 'table')).toBeNull();
    expect(scrubFlagContext(undefined, 'table')).toBeNull();
  });
});

// ── flag-handler Phase 1 ────────────────────────────────────────────

describe('flag-handler — flywheel capture', () => {
  it('accepts recognition flags and redacts the misheard transcript', async () => {
    mockPatch.mockRejectedValueOnce(new Error('Not found'));
    mockCreate.mockResolvedValueOnce({});
    const res = await flagHandler(makeRequest({
      ...base, flagType: 'recognition', flaggedText: 'can I go see Mr Okafor', language: 'english', surface: 'talk_to_teacher',
    }), makeContext());
    expect(res.status).toBe(200);
    const doc = mockCreate.mock.calls[0][0];
    expect(doc.recognitionFlagCount).toBe(1);
    expect(doc.contentSource).toBe('speech_recognition');
    expect(doc.flaggedText).not.toMatch(/okafor/);
  });

  it('rejects a flagged term that contains PII', async () => {
    const res = await flagHandler(makeRequest({ ...base, flaggedText: 'kid@example.com' }), makeContext());
    expect(res.status).toBe(400);
    expect((res.jsonBody as { error: string }).error).toBe('PII_VIOLATION');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('never writes the flagged text or student code to logs', async () => {
    mockPatch.mockRejectedValueOnce(new Error('Not found'));
    mockCreate.mockResolvedValueOnce({});
    const ctx = makeContext();
    await flagHandler(makeRequest({ ...base, flaggedText: 'photosynthesis' }), ctx);
    const logged = JSON.stringify((ctx.log as jest.Mock).mock.calls);
    expect(logged).not.toContain('photosynthesis');
    expect(logged).not.toContain('LB-TEST7');
  });

  it('stores scrubbed context, school and grade from the enrollment', async () => {
    mockPatch.mockRejectedValueOnce(new Error('Not found'));
    mockCreate.mockResolvedValueOnce({});
    await flagHandler(makeRequest({
      ...base, subject: 'math', context: 'Copy the numbers from the table that Jamal made.', schoolCode: 'SPOOFED',
    }), makeContext());
    const doc = mockCreate.mock.calls[0][0];
    expect(doc.subject).toBe('math');
    expect(doc.schoolCodes).toEqual(['GREENBRIAR']);
    expect(doc.gradeBands).toEqual(['6-8']);
    expect(doc.contexts[0].text).toContain('table');
    expect(doc.contexts[0].text).not.toContain('Jamal');
  });

  it('keys candidates by subject, and keeps the legacy key without one', async () => {
    mockPatch.mockRejectedValue(new Error('Not found'));
    mockCreate.mockResolvedValue({});
    const math = await flagHandler(makeRequest({ ...base, subject: 'math' }), makeContext());
    const lunch = await flagHandler(makeRequest({ ...base }), makeContext());
    expect((math.jsonBody as { flagId: string }).flagId).not.toBe((lunch.jsonBody as { flagId: string }).flagId);
  });

  it('re-opens a resolved candidate when flagged again', async () => {
    mockPatch
      .mockResolvedValueOnce({ resource: { flagCount: 2, status: 'resolved', schoolCodes: [] } })
      .mockResolvedValueOnce({});
    const res = await flagHandler(makeRequest(base), makeContext());
    expect((res.jsonBody as { status: string }).status).toBe('review');
  });

  it('does not overwrite a dismissed candidate', async () => {
    mockPatch
      .mockResolvedValueOnce({ resource: { flagCount: 12, status: 'dismissed', schoolCodes: [] } })
      .mockResolvedValueOnce({});
    const res = await flagHandler(makeRequest(base), makeContext());
    expect((res.jsonBody as { status: string }).status).toBe('dismissed');
  });

  it('still works when the enrollment lookup fails', async () => {
    mockEnrollmentRead.mockRejectedValueOnce(new Error('down'));
    mockPatch.mockRejectedValueOnce(new Error('Not found'));
    mockCreate.mockResolvedValueOnce({});
    const res = await flagHandler(makeRequest(base), makeContext());
    expect(res.status).toBe(200);
    expect(mockCreate.mock.calls[0][0].schoolCodes).toEqual([]);
  });
});

// ── Lexicon ranking ─────────────────────────────────────────────────

describe('lexicon ranking', () => {
  const row = (id: string, extra: Partial<LexiconDoc>) => ({ id, term: 'table', status: 'pending_review', created_by: 'rbern_glossary', ...extra }) as LexiconDoc;

  it('labels provenance', () => {
    expect(provenanceOf(row('a', { status: 'approved' }))).toBe('human_verified');
    expect(provenanceOf(row('b', { status: 'auto_generated', created_by: 'system' }))).toBe('machine');
    expect(provenanceOf(row('c', {}))).toBe('glossary');
  });

  it('prefers subject match, then human-verified over glossary over machine', () => {
    const ranked = rankEntries([
      row('machine', { status: 'auto_generated', created_by: 'system' }),
      row('glossary', {}),
      row('verified', { status: 'approved' }),
      row('math', { subjects: 'math|science' }),
    ], 'math');
    expect(ranked.map((r) => r.id)).toEqual(['math', 'verified', 'glossary', 'machine']);
  });
});

// ── Dual Codex ──────────────────────────────────────────────────────

describe('dual codex applyOverrides', () => {
  const entries: OverrideEntry[] = [
    { id: 'p1', term: 'line up for lunch', cognate: 'SAF U GAL QADADA', entry_kind: 'phrase', version: 1 },
    { id: 'f1', term: 'Pier Learning Lab', cognate: 'Pier Learning Lab', entry_kind: 'fixed_term', version: 1 },
    { id: 't1', term: 'fraction', cognate: 'jajab', entry_kind: 'term', version: 1 },
  ];

  it('returns the human phrase for a whole-utterance match, ignoring case and punctuation', () => {
    expect(applyOverrides('Line up for lunch!', entries)).toEqual({ mode: 'phrase', translatedText: 'SAF U GAL QADADA', firedEntryIds: ['p1'] });
  });

  it('wraps fixed terms in dynamic dictionary markup', () => {
    const r = applyOverrides('Go to the Pier Learning Lab now', entries);
    expect(r.mode).toBe('azure');
    if (r.mode !== 'azure') return;
    expect(r.textForAzure).toBe('Go to the <mstrans:dictionary translation="Pier Learning Lab">Pier Learning Lab</mstrans:dictionary> now');
    expect(r.firedEntryIds).toEqual(['f1']);
  });

  it('counts inflecting terms without substituting them', () => {
    const r = applyOverrides('Write the fraction', entries);
    if (r.mode !== 'azure') throw new Error('expected azure');
    expect(r.textForAzure).toBe('Write the fraction');
    expect(r.matchedTermIds).toEqual(['t1']);
  });

  it('strips dictionary markup supplied by the caller', () => {
    const r = applyOverrides('<mstrans:dictionary translation="bad">hi</mstrans:dictionary>', entries);
    if (r.mode !== 'azure') throw new Error('expected azure');
    expect(r.textForAzure).toBe('hi');
  });
});

// ── flag-queue ──────────────────────────────────────────────────────

describe('flag-queue', () => {
  const admin = { authenticated: true, context: { userId: 'u1', isSuperAdmin: true, permissions: [] } };
  const id = 'a'.repeat(64);

  it('forbids non-super-admins', async () => {
    mockResolveAuth.mockResolvedValueOnce({ authenticated: true, context: { userId: 'u2', isSuperAdmin: false, permissions: ['manage_flags'] } });
    const res = await listFlagQueue(makeRequest(undefined), makeContext());
    expect(res.status).toBe(403);
  });

  it('lists candidates with school codes reduced to a count', async () => {
    mockResolveAuth.mockResolvedValueOnce(admin);
    mockQueryFetch.mockResolvedValueOnce({ resources: [{ id, flaggedText: 'table', schoolCodes: ['A', 'B', 'A'], flagCount: 4 }] });
    const res = await listFlagQueue(makeRequest(undefined, { query: new Map([['language', 'somali']]) }), makeContext());
    const body = res.jsonBody as { items: Array<Record<string, unknown>> };
    expect(body.items[0].schoolCount).toBe(2);
    expect(body.items[0]).not.toHaveProperty('schoolCodes');
  });

  it('requires an entryId to resolve', async () => {
    mockResolveAuth.mockResolvedValueOnce(admin);
    const res = await actOnFlag(makeRequest({ language: 'somali', action: 'resolved' }, { params: { id } }), makeContext());
    expect(res.status).toBe(400);
  });

  it('records the action in resolutionHistory', async () => {
    mockResolveAuth.mockResolvedValueOnce(admin);
    mockRead.mockResolvedValueOnce({ resource: { id, status: 'review' } });
    mockPatch.mockResolvedValueOnce({});
    const res = await actOnFlag(makeRequest({ language: 'somali', action: 'dismissed', note: 'test flag' }, { params: { id } }), makeContext());
    expect(res.status).toBe(200);
    const ops = mockPatch.mock.calls[0][0] as Array<{ path: string; value: unknown }>;
    expect(ops.find((o) => o.path === '/status')?.value).toBe('dismissed');
    expect(ops.find((o) => o.path === '/resolutionHistory')).toBeDefined();
  });
});
