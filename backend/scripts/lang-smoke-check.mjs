#!/usr/bin/env node
// backend/scripts/lang-smoke-check.mjs
//
// Per-language smoke test against the LIVE backend. For every backend-supported
// language it (1) translates a fixed academic sentence via /translate and
// (2) speaks the result via /tts-router, then fetches the returned audio URL to
// confirm real, non-empty bytes come back. Prints a pass/fail matrix and writes
// a JSON report next to this file. Exits non-zero if anything fails.
//
// This mirrors exactly what the extension does (translate a phrase, then speak
// it), so a green row here means that language works end-to-end for a student.
//
// Usage:
//   node backend/scripts/lang-smoke-check.mjs
//   LB_API_KEY=... LB_API_BASE=... node backend/scripts/lang-smoke-check.mjs
//
// The API key / base default to the extension's production values so it "just
// runs", but can be overridden via env for staging.

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API_BASE = process.env.LB_API_BASE
  || 'https://languagebridge-api.azurewebsites.net/api';
const API_KEY = process.env.LB_API_KEY
  || '02dd1fc2301b6277cd7aed4357ea09990373078409a11942707d760726ec58e3';
const STUDENT_CODE = process.env.LB_STUDENT_CODE || 'LB-TEST7';

// The 16 languages the backend actually accepts (backend/shared/types.ts).
// english is included but skips the "must differ" translation assertion.
const BACKEND_LANGUAGES = [
  'arabic', 'french', 'portuguese', 'ukrainian', 'vietnamese', 'spanish',
  'persian', 'english', 'nepali', 'swahili', 'dari', 'pashto', 'urdu',
  'somali', 'burmese', 'tagalog',
];

// On-disk glossary dirs (data/glossaries). Kept here only to REPORT drift —
// this script changes nothing about the language set.
const GLOSSARY_DIRS = [
  'arabic', 'burmese', 'dari', 'french', 'kinyarwanda', 'nepali', 'pashto',
  'portuguese', 'somali', 'spanish', 'swahili', 'tagalog', 'twi', 'ukrainian',
  'urdu', 'uzbek', 'vietnamese',
];

const SAMPLE = 'The cell is the basic unit of life.';

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

async function api(endpoint, body) {
  const res = await fetch(`${API_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lb-api-key': API_KEY },
    body: JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON error body */ }
  return { ok: res.ok, status: res.status, data };
}

async function checkTranslation(language) {
  if (language === 'english') {
    return { ok: true, text: SAMPLE, note: 'source language (identity)' };
  }
  const r = await api('translate', {
    text: SAMPLE,
    fromLanguage: 'english',
    toLanguage: language,
    studentCode: STUDENT_CODE,
  });
  if (!r.ok) {
    return { ok: false, text: null, error: `${r.status} ${r.data?.error || ''} ${r.data?.details || ''}`.trim() };
  }
  const text = r.data?.translatedText;
  if (!text || !text.trim()) return { ok: false, text: null, error: 'empty translatedText' };
  if (text.trim() === SAMPLE) return { ok: false, text, error: 'unchanged (translation passthrough)' };
  return { ok: true, text };
}

async function checkAudio(language, text) {
  const r = await api('tts-router', {
    text: text || SAMPLE,
    language,
    studentCode: STUDENT_CODE,
  });
  if (!r.ok) {
    const err = `${r.status} ${r.data?.error || ''} ${r.data?.details || ''}`.trim();
    return { ok: false, bytes: 0, error: err };
  }
  const url = r.data?.audioUrl || r.data?.audio_url;
  if (!url) return { ok: false, bytes: 0, error: 'no audioUrl in response' };
  // Fetch the actual audio to confirm it is real, non-empty content.
  try {
    const audioRes = await fetch(url);
    if (!audioRes.ok) return { ok: false, bytes: 0, error: `audio fetch ${audioRes.status}` };
    const buf = await audioRes.arrayBuffer();
    if (buf.byteLength < 512) return { ok: false, bytes: buf.byteLength, error: 'audio too small' };
    return { ok: true, bytes: buf.byteLength };
  } catch (e) {
    return { ok: false, bytes: 0, error: `audio fetch threw: ${e.message}` };
  }
}

function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

async function main() {
  console.log(c.bold(`\nLanguageBridge per-language smoke check`));
  console.log(c.dim(`base=${API_BASE}  student=${STUDENT_CODE}  sample="${SAMPLE}"\n`));

  const results = [];
  for (const lang of BACKEND_LANGUAGES) {
    process.stdout.write(`  ${pad(lang, 12)} `);
    const t = await checkTranslation(lang);
    const a = await checkAudio(lang, t.text);
    const row = {
      language: lang,
      translation: t.ok,
      translationNote: t.error || t.note || (t.text ? t.text.slice(0, 40) : ''),
      audio: a.ok,
      audioBytes: a.bytes,
      audioNote: a.error || `${(a.bytes / 1024).toFixed(0)}KB`,
    };
    results.push(row);
    const tMark = t.ok ? c.green('translate ✓') : c.red('translate ✗');
    const aMark = a.ok ? c.green('audio ✓') : c.red('audio ✗');
    const detail = [t.ok ? '' : c.red(`(${row.translationNote})`), a.ok ? c.dim(row.audioNote) : c.red(`(${row.audioNote})`)]
      .filter(Boolean).join(' ');
    console.log(`${tMark}  ${aMark}  ${detail}`);
  }

  // ── Summary ────────────────────────────────────────────────
  const tFail = results.filter((r) => !r.translation);
  const aFail = results.filter((r) => !r.audio);
  console.log(c.bold(`\nSummary: ${results.length} languages`));
  console.log(`  Translation: ${c.green(`${results.length - tFail.length} pass`)}${tFail.length ? '  ' + c.red(`${tFail.length} fail: ${tFail.map((r) => r.language).join(', ')}`) : ''}`);
  console.log(`  Audio:       ${c.green(`${results.length - aFail.length} pass`)}${aFail.length ? '  ' + c.red(`${aFail.length} fail: ${aFail.map((r) => r.language).join(', ')}`) : ''}`);

  // ── Glossary / backend drift (report only) ─────────────────
  const backendSet = new Set(BACKEND_LANGUAGES);
  const glossSet = new Set(GLOSSARY_DIRS);
  const staleGloss = GLOSSARY_DIRS.filter((l) => !backendSet.has(l));
  const noGloss = BACKEND_LANGUAGES.filter((l) => l !== 'english' && !glossSet.has(l));
  console.log(c.bold(`\nGlossary vs backend drift (informational — nothing changed):`));
  if (staleGloss.length) console.log(`  ${c.yellow('stale glossaries')} (on disk, not served by backend): ${staleGloss.join(', ')}`);
  if (noGloss.length) console.log(`  ${c.yellow('no glossary dir')} (backend-supported, no data/glossaries entry): ${noGloss.join(', ')}`);
  if (!staleGloss.length && !noGloss.length) console.log(`  ${c.green('aligned')}`);

  // ── Write JSON report ──────────────────────────────────────
  const outPath = join(dirname(fileURLToPath(import.meta.url)), 'lang-smoke-report.json');
  writeFileSync(outPath, JSON.stringify({
    base: API_BASE, sample: SAMPLE, results,
    drift: { staleGlossaries: staleGloss, backendSupportedNoGlossary: noGloss },
  }, null, 2));
  console.log(c.dim(`\nJSON report → ${outPath}\n`));

  process.exit(tFail.length || aFail.length ? 1 : 0);
}

main().catch((e) => { console.error(c.red(`Harness crashed: ${e.stack || e}`)); process.exit(2); });
