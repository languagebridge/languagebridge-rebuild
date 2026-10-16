# Lexicon Flywheel — Phases and checklists

Legend: ✅ built on `feat/lexicon-flywheel` (tested, not deployed) · ⬜ to do · 🔒 blocked on a decision

---

## Phase 0 — Legal (owner: Chris)

- ⬜ Founder IP assignments signed (Justin, Prentice; Matt if he writes flywheel code)
- ⬜ Contributor agreement with present-tense IP assignment + confidentiality
- ⬜ NDPA clause: de-identified usage data improves the product; no district claim on resulting entries
- ⬜ Confirm Azure output is our customer data under Microsoft's terms (unblocks recognition flags as designed)
- ⬜ Rule on district bilingual aides as paid contributors
- ⬜ Set raw-flag retention window

**Gate:** Chris signs off. Phase 1 code can ship before this; contributor work (Phase 2) cannot.

---

## Phase 1 — Capture (owner: Matt)

Backend
- ✅ `flag-handler`: `recognition` flag type alongside `translation`, `pronunciation`
- ✅ Flag text and student code removed from function logs
- ✅ PII: flagged term with email/phone/SSN rejected (`PII_VIOLATION`); context and speech redacted (`redactPII`, `scrubFlagContext`)
- ✅ Context capture: scrubbed sentence window, subject, seat role, surface; school + grade band from enrollment (client values ignored)
- ✅ Candidates keyed by text + language + subject; legacy key preserved without subject
- ✅ Re-open on re-flag after `resolved`; admin statuses not overwritten
- ✅ `lexicon-lookup`: never serves `deprecated`; subject is a preference not a filter; ranks human_verified > glossary > machine; returns `entry_id` + `provenance`; logs them on hits
- ✅ Admin queue: `GET /api/flag-queue`, `POST /api/flag-queue/{id}/action` (super-admin only, school codes → count, `resolutionHistory`)
- ✅ Tests: `backend/__tests__/unit/flywheel.test.ts` (22) + existing suite (122)
- ⬜ Verify `enrollments` partition key in live Cosmos (see DATA-MODEL.md) — school/grade on flags depend on it
- ⬜ Composite index on `flags` for queue filters + `ORDER BY flagCount DESC` if Cosmos asks for one
- ⬜ Deploy (remember `LB_SUPERADMIN_EMAILS` must be set or no one can use the queue)

Extension
- ✅ Chips: "Wrong meaning" / "Wrong sound" / "Still in English" on the lookup card
- ✅ "Misheard me" / "Wrong meaning" under each Talk to Teacher bubble
- ✅ Flags send surface, subject and the selection's sentence (scrubbed server-side)
- ⬜ Manual Chrome test (checklist in README)
- ⬜ Version bump + Web Store release

Dialects (variants)
- ✅ `shared/variants.ts`: 22 variants across Spanish, Arabic, Pashto, French, Portuguese; chains never cross languages
- ✅ Variant on enrollment, flags (in key), lookup ranking, Dual Codex, TTS voice + cache key, STT locale
- ✅ `GET /api/onboarding/variants`; Settings picker; background attaches variant to same-language calls
- ✅ Wrong-language Piper voices removed (Pashto, Urdu, Somali, Spanish); core Spanish STT `es-ES` → `es-US`
- ⬜ Onboarding flow (first install) offers the dialect picker — today only Settings does
- ⬜ Small-group suppression before any report groups by variant

Policy
- ✅ TRAINING-DATA-POLICY.md; MASTER-DOCUMENT rule 4 corrected (store to fix, never train on machine output)
- ⬜ Recorder writes `speaker_id`, `release_version`, `authored_by`, `ai_assisted` per clip
- 🔒 OPEN-DECISIONS #12–#16 (Chris)

Dashboard (Prentice)
- ⬜ Internal flag queue page on languagebridge.app calling the admin endpoints

Manual loop (bridges to Phase 2)
- ✅ `export-flag-queue.mjs` (read-only) and `publish-approved.mjs` (dry run by default; enforces the two-approval gate) — verified against production read-only
- ⬜ Triage the 12 live flags: dismiss the 4 empty legacy flags; name `source_term` for the 4 passages
- ⬜ Clean polluted machine-cache rows (echoes like Somali "les"; passage-length "terms") — production write, needs go-ahead

Bootstrap
- ✅ `flywheel/scripts/bootstrap-candidates.mjs` — science-only bridge backlog (offline), Dari-as-Persian list (`--live`, read-only)
- ⬜ Run it, review the output with Justin, decide which rows enter the queue

**Gate:** flags arriving from at least one live building, or the bootstrap backlog loaded into the queue.

---

## Voice program (runs alongside Phases 2–3, R&D-funded) — PRODUCTION-LOOP.md

- ✅ Decisions: one voice per language; Haitian Creole first, Dari second; US-resident contributors; voice release in the terms of service
- ✅ Recorder works locally; Haitian Creole session 1 (120 sentences) drafted
- ⬜ Recorder writes `speaker_id`, `release_version`, `authored_by`, `ai_assisted` per clip
- ⬜ Contributor terms of service (voice release + IP assignment) — Chris writes the wording
- ⬜ Recruit the Haitian Creole voice talent and a native reviewer
- ⬜ Native review of session 1; seeding batch for sessions 2–50 (~6,000 sentences)
- ⬜ Hours ledger; 1 h sanity fine-tune → 5 h listening → 8–10 h full fine-tune
- 🔒 Base model + licence (OPEN-DECISIONS #19)
- ⬜ Blind listening test → add Haitian Creole as a supported language → ship behind `LB_TTS_SERVICE_URL`
- ⬜ Repeat for Dari

## Phase 2 — Internal correction (owner: Matt + 2–3 paid linguists)

- 🔒 Pick first three languages (by flag volume; until pilots, by bootstrap backlog size: likely Dari, Pashto, Somali — confirm)
- 🔒 Pay rate per accepted entry
- ⬜ `contributors` + `lexicon_reviews` containers and accessors
- ⬜ Contributor endpoints: list assigned candidates (term + scrubbed context + gloss only), submit proposal
- ⬜ Reviewer endpoints: approve / reject with note; enforce two independent approvals, no self-review
- ⬜ On second approval: write/upgrade the Lexicon entry (`status: approved`, `entry_kind`, `sense_key`, version + 1), resolve the candidate with that entry id
- ⬜ Move the machine-translation cache out of `lexicon` (recommended, DATA-MODEL.md)
- ⬜ Review UI (Prentice)
- ⬜ Turn on `LB_LEXICON_OVERRIDES` after the checks in DUAL-CODEX.md
- ⬜ Dual Codex layer 3 (alignment-based term substitution) for languages with stored inflections

**Gate:** corrected terms stop being re-flagged (re-open rate on resolved candidates trends to zero).

---

## Phase 3 — Sound

- ⬜ `pronunciations` container; inject SSML `<phoneme>` in `tts-router` `buildSSML` (or custom lexicon file per language)
- ⬜ Verify phrase-list support for our speech-to-text call; switch to Speech SDK / Custom Speech if needed
- ⬜ `recognition_phrases` container; send per language + subject

## Phase 4 — Sentences

- ⬜ LLM drafts English sentences on approval; contributor writes target sentence; same two-approval gate
- ⬜ `authored_by`, `ai_assisted` on every sentence
- ⬜ Feed Bridge Glossary cards and Highlight & Hear

## Phase 5 — Marketplace

- ⬜ Open onboarding, payouts, quality scoring, demotion
