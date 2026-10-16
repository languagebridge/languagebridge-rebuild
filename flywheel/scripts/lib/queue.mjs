/**
 * Shared logic for the manual flywheel loop (export-flag-queue.mjs → people fill
 * the CSV → publish-approved.mjs). Pure functions only, so the rules are tested
 * in tests/unit/flywheel-scripts.test.ts.
 *
 * The approval rules here mirror SPEC §3 / §6:
 *   - two independent approvals, from two different reviewers
 *   - nobody reviews their own work
 *   - contributor IDs only (e.g. "C-007"), never names
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

// ── Contract, read from the backend source so the scripts never drift ──

export function loadContract(root = ROOT) {
  const types = readFileSync(resolve(root, 'backend/shared/types.ts'), 'utf8');
  const block = types.slice(types.indexOf('export const SUPPORTED_LANGUAGES'), types.indexOf('] as const;'));
  const languages = [...block.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const variantsSrc = readFileSync(resolve(root, 'backend/shared/variants.ts'), 'utf8');
  const variants = Object.fromEntries(
    [...variantsSrc.matchAll(/tag: '([A-Za-z0-9-]+)', language: '([a-z_]+)'/g)].map((m) => [m[1], m[2]])
  );
  return { languages, variants };
}

// ── CSV (RFC 4180, UTF-8, tolerates a BOM from Excel / Sheets) ──

export const QUEUE_COLUMNS = [
  // filled by export — do not edit
  'flag_id', 'language', 'variant', 'subject', 'scope', 'flagged_text', 'total_reports',
  'translation_reports', 'pronunciation_reports', 'recognition_reports', 'status',
  'contexts', 'currently_served',
  // filled by people
  'action',          // fix | dismiss | (blank = skip)
  'source_term',     // the English word/phrase that was actually wrong (required when scope = passage)
  'fix_text',        // the corrected target-language term or phrase
  'entry_kind',      // term (default) | phrase | fixed_term
  'sense_tag',       // e.g. math, furniture — becomes sense_key "<term>#<tag>"
  'sense_gloss',     // short English gloss for contributors
  'ai_assisted',     // yes | no (default no)
  'author',          // contributor ID
  'reviewer_1', 'reviewer_1_decision',   // approve | reject
  'reviewer_2', 'reviewer_2_decision',
  'note',
];

export function toCsv(rows, columns = QUEUE_COLUMNS) {
  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.join(','), ...rows.map((r) => columns.map((c) => esc(r[c])).join(','))].join('\n') + '\n';
}

export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const records = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); records.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  const [header, ...body] = records.filter((r) => r.some((c) => c.trim() !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

// ── Lexicon helpers (mirror lexicon-lookup provenanceOf) ──

export function provenanceOf(entry) {
  if (entry.status === 'approved') return 'human_verified';
  if (entry.status === 'auto_generated' || entry.created_by === 'system' || entry.created_by === 'translator_fallback') return 'machine';
  return 'glossary';
}

export function summarizeServed(entries) {
  const rank = { human_verified: 0, glossary: 1, machine: 2 };
  return entries
    .filter((e) => e.status !== 'deprecated')
    .sort((a, b) => rank[provenanceOf(a)] - rank[provenanceOf(b)] || (b.version ?? 0) - (a.version ?? 0))
    .slice(0, 2)
    .map((e) => `${e.cognate ?? '(no translation)'} [${provenanceOf(e)}${e.variant ? ', ' + e.variant : ''}${e.subject ? ', ' + e.subject : ''}]`)
    .join(' | ');
}

/** A flag on more than a short phrase is a passage: the fixer must name the wrong term. */
export const MAX_TERM_WORDS = 6;
export function scopeOf(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length > MAX_TERM_WORDS ? 'passage' : 'term';
}

/** Short single-line label for console output — never print whole passages. */
export function labelOf(row) {
  const t = (row.source_term || row.flagged_text || '').replace(/\s+/g, ' ').trim();
  return `${row.language}/${t.length > 40 ? t.slice(0, 40) + '…' : t || '(empty)'}`;
}

// ── Row validation → plan ──

const ID_RE = /^[A-Za-z]{1,4}-?\d{1,5}$/;   // contributor IDs like C-007, LB12 — not names
const KINDS = ['term', 'phrase', 'fixed_term'];

/**
 * Decide what to do with one filled CSV row. Returns
 *   { kind: 'skip', reason } | { kind: 'reject', reason } | { kind: 'dismiss', ... } | { kind: 'publish', ... }
 */
export function planRow(row, contract) {
  const action = (row.action || '').toLowerCase();
  if (!action) return { kind: 'skip', reason: 'no action' };
  if (!/^[a-f0-9]{64}$/.test(row.flag_id || '')) return { kind: 'skip', reason: 'flag_id missing or malformed' };
  if (!contract.languages.includes(row.language)) return { kind: 'skip', reason: `unknown language '${row.language}'` };
  const variant = row.variant || null;
  if (variant && contract.variants[variant] !== row.language) return { kind: 'skip', reason: `variant '${variant}' is not a ${row.language} variant` };

  if (action === 'dismiss') {
    return { kind: 'dismiss', flagId: row.flag_id, language: row.language, note: row.note || null };
  }
  if (action !== 'fix') return { kind: 'skip', reason: `unknown action '${row.action}' (use fix or dismiss)` };

  // Only meaning fixes become Lexicon entries; sound fixes are Phase 3.
  const meaningReports = Number(row.translation_reports || 0);
  if (meaningReports === 0) return { kind: 'skip', reason: 'no "wrong meaning" reports — sound and misheard fixes are Phase 3' };

  const fixText = row.fix_text;
  if (!fixText) return { kind: 'skip', reason: 'fix_text is empty' };
  const entryKind = (row.entry_kind || 'term').toLowerCase();
  if (!KINDS.includes(entryKind)) return { kind: 'skip', reason: `entry_kind must be one of ${KINDS.join(', ')}` };

  const author = row.author, r1 = row.reviewer_1, r2 = row.reviewer_2;
  for (const [label, id] of [['author', author], ['reviewer_1', r1], ['reviewer_2', r2]]) {
    if (!id) return { kind: 'skip', reason: `${label} is empty` };
    if (!ID_RE.test(id)) return { kind: 'skip', reason: `${label} '${id}' is not a contributor ID (use e.g. C-007, never a name)` };
  }
  const same = (a, b) => a.toLowerCase() === b.toLowerCase();
  if (same(r1, r2)) return { kind: 'skip', reason: 'the two reviewers must be different people' };
  if (same(r1, author) || same(r2, author)) return { kind: 'skip', reason: 'a reviewer cannot review their own work' };

  const d1 = (row.reviewer_1_decision || '').toLowerCase(), d2 = (row.reviewer_2_decision || '').toLowerCase();
  if (d1 === 'reject' || d2 === 'reject') return { kind: 'reject', reason: 'a reviewer rejected it — back to the contributor', flagId: row.flag_id };
  if (d1 !== 'approve' || d2 !== 'approve') return { kind: 'skip', reason: 'needs two "approve" decisions' };

  // A passage flag is fixed at the word the fixer identifies, never as a whole passage.
  const term = (row.source_term || row.flagged_text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!term) return { kind: 'skip', reason: 'flagged_text is empty' };
  if (scopeOf(term) === 'passage') {
    return { kind: 'skip', reason: 'this is a passage — put the English word or phrase that was wrong in source_term' };
  }
  const senseTag = (row.sense_tag || row.subject || 'general').toLowerCase().replace(/\s+/g, '_');

  return {
    kind: 'publish',
    flagId: row.flag_id,
    language: row.language,
    variant,
    subject: row.subject || null,
    term,
    cognate: fixText,
    entryKind,
    senseKey: `${term}#${senseTag}`,
    senseGloss: row.sense_gloss || null,
    authoredBy: author,
    reviewedBy: [r1, r2],
    aiAssisted: /^(y|yes|true|1)$/i.test(row.ai_assisted || ''),
    note: row.note || null,
  };
}

/**
 * Build the new Lexicon document for a publish plan. `existing` = current rows for
 * the same term + language (any variant). Bridge fields are carried over from the
 * best same-variant row so the lookup card keeps its "In simple English" aid.
 */
export function buildEntry(plan, existing, now = new Date().toISOString()) {
  const sameVariant = existing.filter((e) => (e.variant ?? null) === plan.variant);
  const base = sameVariant.find((e) => e.bridge_anchor || e.bridge_scaffold) ?? sameVariant[0] ?? existing[0] ?? {};
  const version = Math.max(0, ...existing.map((e) => e.version ?? 0)) + 1;
  const slug = plan.term.replace(/[^\p{L}\p{N}]+/gu, '_');
  return {
    id: `${slug}_${plan.language}${plan.variant ? '_' + plan.variant : ''}_${plan.senseKey.split('#')[1]}_v${version}`,
    term: plan.term,
    term_normalized: plan.term,
    language: plan.language,
    variant: plan.variant,
    domain: base.domain ?? 'k12_academic',
    subject: plan.subject,
    subjects: base.subjects,
    grade_band: base.grade_band,
    grade_bands: base.grade_bands,
    cognate: plan.cognate,
    bridge_anchor: base.bridge_anchor ?? null,
    bridge_scaffold: base.bridge_scaffold ?? null,
    bridge_definition: base.bridge_definition ?? null,
    bridge_definition_en: base.bridge_definition_en ?? null,
    grammatical_forms: base.grammatical_forms,
    transliteration_difficulty: base.transliteration_difficulty,
    entry_kind: plan.entryKind,
    sense_key: plan.senseKey,
    sense_gloss: plan.senseGloss,
    audio_blob_path: null,
    audio_source: null,
    status: 'approved',
    version,
    usage_count: 0,
    flag_count: 0,
    authored_by: plan.authoredBy,
    reviewed_by: plan.reviewedBy,
    ai_assisted: plan.aiAssisted,
    approved_at: now,
    source_flag_id: plan.flagId,
    created_by: 'flywheel_publish',
    created_at: now,
    updated_at: now,
  };
}

/** Patch ops that resolve/dismiss a flag — same shape as the flag-queue endpoint writes. */
export function flagResolutionOps(flagDoc, { action, entryId = null, note = null, by }, now = new Date().toISOString()) {
  const resolution = { action, note, entryId, by, at: now };
  return [
    { op: 'set', path: '/status', value: action },
    { op: 'set', path: '/requiresReview', value: false },
    { op: 'set', path: '/resolution', value: resolution },
    flagDoc.resolutionHistory
      ? { op: 'add', path: '/resolutionHistory/-', value: resolution }
      : { op: 'set', path: '/resolutionHistory', value: [resolution] },
  ];
}
