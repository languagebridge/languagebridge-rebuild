import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain .mjs module without type declarations
import { parseCsv, toCsv, planRow, buildEntry, flagResolutionOps, loadContract, summarizeServed, labelOf } from '../../flywheel/scripts/lib/queue.mjs';

const contract = loadContract();
const FLAG = 'a'.repeat(64);
const row = (extra: Record<string, string> = {}) => ({
  flag_id: FLAG, language: 'somali', variant: '', subject: 'math', flagged_text: 'table',
  translation_reports: '3', action: 'fix', fix_text: 'shax', author: 'C-001',
  reviewer_1: 'C-002', reviewer_1_decision: 'approve', reviewer_2: 'C-003', reviewer_2_decision: 'approve',
  ...extra,
});

describe('contract loaded from backend source', () => {
  it('reads supported languages and variants', () => {
    expect(contract.languages).toContain('dari');
    expect(contract.languages).toContain('uzbek');
    expect(contract.variants['es-HN']).toBe('spanish');
  });
});

describe('CSV', () => {
  it('round-trips quotes, commas, newlines and RTL text', () => {
    const rows = [{ flag_id: FLAG, contexts: 'the "table", row 2\nnext', fix_text: 'جدول' }];
    const back = parseCsv('﻿' + toCsv(rows));
    expect(back[0].contexts).toBe('the "table", row 2\nnext');
    expect(back[0].fix_text).toBe('جدول');
  });
});

describe('review gate', () => {
  it('publishes with two distinct approvals from non-authors', () => {
    const p = planRow(row(), contract);
    expect(p.kind).toBe('publish');
    expect(p.senseKey).toBe('table#math');
    expect(p.reviewedBy).toEqual(['C-002', 'C-003']);
  });

  it.each([
    [{ reviewer_2: 'C-002' }, 'different people'],
    [{ reviewer_1: 'C-001' }, 'own work'],
    [{ reviewer_2_decision: '' }, 'two "approve"'],
    [{ author: 'Maria' }, 'not a contributor ID'],
    [{ fix_text: '' }, 'fix_text is empty'],
    [{ translation_reports: '0' }, 'Phase 3'],
    [{ variant: 'fa-IR' }, 'not a somali variant'],
    [{ language: 'klingon' }, 'unknown language'],
  ])('skips %o', (extra, reason) => {
    const p = planRow(row(extra as Record<string, string>), contract);
    expect(p.kind).toBe('skip');
    expect(p.reason).toContain(reason);
  });

  it('refuses to publish a whole passage, and keys a passage fix on the named source_term', () => {
    const passage = 'what document established the first national government of the united states';
    expect(planRow(row({ flagged_text: passage }), contract).reason).toContain('source_term');
    const p = planRow(row({ flagged_text: passage, source_term: 'Articles of Confederation' }), contract);
    expect(p.kind).toBe('publish');
    expect(p.term).toBe('articles of confederation');
  });

  it('labels output with a short single line, never the whole passage', () => {
    const label = labelOf({ language: 'french', flagged_text: 'a\nvery long passage '.repeat(10) });
    expect(label).not.toContain('\n');
    expect(label.length).toBeLessThanOrEqual(50);
  });

  it('reports a reviewer rejection without publishing', () => {
    expect(planRow(row({ reviewer_2_decision: 'reject' }), contract).kind).toBe('reject');
  });

  it('dismisses without needing reviewers', () => {
    expect(planRow(row({ action: 'dismiss', author: '', reviewer_1: '' }), contract).kind).toBe('dismiss');
  });

  it('ignores rows nobody filled in', () => {
    expect(planRow(row({ action: '' }), contract)).toEqual({ kind: 'skip', reason: 'no action' });
  });
});

describe('buildEntry', () => {
  const plan = planRow(row(), contract);
  const existing = [
    { id: 'table_somali_rbern', term: 'table', language: 'somali', version: 1, cognate: 'miis', bridge_anchor: 'grid', status: 'pending_review', created_by: 'rbern_glossary' },
    { id: 'table_somali_cu', term: 'table', language: 'somali', variant: 'x', version: 3 },
  ];
  const e = buildEntry(plan, existing, '2026-10-16T00:00:00Z');

  it('creates an approved, versioned entry with the full authorship trail', () => {
    expect(e).toMatchObject({
      status: 'approved', version: 4, cognate: 'shax', sense_key: 'table#math', subject: 'math',
      authored_by: 'C-001', reviewed_by: ['C-002', 'C-003'], ai_assisted: false,
      source_flag_id: FLAG, created_by: 'flywheel_publish', variant: null,
    });
    expect(e.id).toBe('table_somali_math_v4');
  });

  it('keeps the bridge ("In simple English") from the same-variant row', () => {
    expect(e.bridge_anchor).toBe('grid');
  });

  it('resolution ops match the flag-queue endpoint shape', () => {
    const ops = flagResolutionOps({}, { action: 'resolved', entryId: e.id, by: 'C-009' }, 'now');
    expect(ops.find((o: { path: string }) => o.path === '/status').value).toBe('resolved');
    expect(ops.find((o: { path: string }) => o.path === '/resolutionHistory').value[0]).toMatchObject({ entryId: e.id, by: 'C-009' });
  });

  it('summarizes what is served, best first', () => {
    expect(summarizeServed([{ cognate: 'miis', status: 'pending_review' }, { cognate: 'shax', status: 'approved', version: 2 }]))
      .toBe('shax [human_verified] | miis [glossary]');
  });
});
