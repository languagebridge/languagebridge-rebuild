# 2026-10-16 — Lexicon flywheel Phase 1, Dual Codex, dialects

Branch: `feat/lexicon-flywheel`. Project home: `flywheel/` (start at `flywheel/README.md`).

## What changed

**New project folder `flywheel/`** — spec (replaces `docs/PRD-ML-FLYWHEEL.md`, now deleted), data model, Dual Codex design, phase checklists, open decisions for Chris/Justin, and `scripts/bootstrap-candidates.mjs` (319 science-only bridge candidates offline; `--live` adds Dari-as-Persian rows, read-only).

**Backend**
- `flag-handler`: third flag type `recognition`; flag text and student code no longer written to logs; PII in a flagged term → `400 PII_VIOLATION`; context, misheard transcripts and all Talk to Teacher text redacted (`redactPII`, `scrubFlagContext` in `validators.ts`); school + grade band read from the enrollment; candidates keyed by text + language + subject (legacy key kept when no subject); up to 10 context samples; resolved candidates re-open on re-flag.
- New `flag-queue` function: `GET /api/flag-queue`, `POST /api/flag-queue/{id}/action`. Super-admin only, school codes → `schoolCount`, `resolutionHistory`.
- `lexicon-lookup`: never serves `deprecated`; subject is a preference not a filter (a math lookup with no math row now gets the general row instead of Azure); ranks human_verified > glossary > machine; returns and logs `entry_id` + `provenance`.
- New `shared/dual-codex.ts`, wired into `translate`: approved `phrase` entries replace Azure for whole-utterance matches; `fixed_term` entries go as dynamic dictionary markup; `term` entries counted only. Off unless `LB_LEXICON_OVERRIDES=on`. Logs entry ids only.
- `types.ts`: `FLAG_TYPES`, `SeatRole`, `FlagSurface`, `FlagContextSample`, `FlagQueueItem`, `FlagQueueAction`, `LexiconProvenance`; additive fields on `FlagEventRequest`, `FlagDoc`, `LexiconDoc` (`entry_kind`, `sense_key`, `sense_gloss`), `LexiconLookupResponse`.

**Extension**
- Lookup card chips: "Wrong meaning" / "Wrong sound" / "Still in English".
- Talk to Teacher: "Misheard me" / "Wrong meaning" under every bubble.
- `reportProblem(text, flagType, opts)` sends surface, subject and the selection's sentence.
- `LBTranslationService.detectSubject()` extracted for reuse.

**Dialects (second pass, same day)**
- New `backend/shared/variants.ts`: 22 variants (Spanish ×10, Arabic ×6, Pashto ×2, French ×2, Portuguese ×2), fallback chains that never cross languages. Azure voices/locales set only where Microsoft Learn lists them.
- Variant on enrollment (`INVALID_VARIANT` if wrong), flags (part of the key; inherited from enrollment only for the student's own language), lookup ranking (sense → dialect → provenance), Dual Codex (`selectForVariant`), TTS (`resolveVoice`, separate cache key per variant voice), STT locale.
- New `GET /api/onboarding/variants`. Extension: Settings picker ("Which sounds most like home?"); `background.js` `withVariant` attaches it to same-language calls.
- `voice-config.json`: removed wrong-language Piper models (Pashto→Persian, Urdu→Arabic, Somali→Swahili) and the Argentine Spanish model. Core Spanish STT `es-ES` → `es-US`.
- Privacy: `tts-router` no longer logs the student code or the SSML (which contained the selected text).
- Policy: `flywheel/TRAINING-DATA-POLICY.md` (store machine output to fix it, never train on it or claim it); MASTER-DOCUMENT rule 4 corrected; OPEN-DECISIONS #12–#17 (RBERN licence, voice release, sanctions, base-model licences, dialect privacy, Mayan languages).

**Live-backend fixes (third pass)** — verified read-only against production Cosmos and a local Functions host:
- `enrollments` is partitioned by `/schoolCode`, so `item(code, code)` always 404'd: production analytics recorded every event with school `unknown`. New `shared/enrollments.ts` `findEnrollment` (query by id, ~2.8 RU, per-instance cache); used by `analytics-writer` and `flag-handler`.
- `tts-router` cache-hit counter used the wrong partition key (`audio_cache_metadata` is `/language`); fixed.
- Flag-queue routes renamed `admin/flags` → `flag-queue`: Azure Functions reserves `admin` routes, and the host refused to register them. All 13 routes now register under `func start`.
- `LB_SUPERADMIN_EMAILS` is already set in production.

**Manual loop tooling (fourth pass)**
- `flywheel/scripts/export-flag-queue.mjs` (read-only) and `publish-approved.mjs` (dry run unless `--write`), sharing `lib/queue.mjs` (CSV, review gate, entry builder) and `lib/cosmos.mjs` (`--az` uses the read-only key unless writing). Exports are gitignored.
- Passage flags must name a `source_term`; output labels are short single lines.
- `LexiconDoc` gains `authored_by`, `reviewed_by`, `ai_assisted`, `approved_at`, `source_flag_id`.
- `lexicon-lookup` no longer caches a translator echo of the input (found live: Somali "les" → "les").
- Verified read-only against production: 12 open flags exported; dry-run publish exercised the gate (self-review blocked, dismiss path, version-2 entry planned). Nothing written.

**Storage cleanup (fifth pass)**
- Audit of production `lexicon` (read-only): 150,461 rows, well partitioned, no RBERN duplicates; but 1,271 Azure answers cached inside it (482 junk), 98 Azure translations written into bridge rows, and 9,445 terms split across an RBERN row and a bridge row of which lookup served only one (so it called Azure even when RBERN had the translation).
- `lexicon-lookup`: merges the translation row and the bridge-gloss row; Azure answers read from and written to the new `lexicon_machine_cache` only; never caches echoes, passages, English→English or text without letters.
- `flag-handler`: rejects flags with no letters (`INVALID_TEXT`), tags `scope: term | passage`.
- `flywheel/scripts/clean-lexicon.mjs`: `--phase junk` APPLIED in production 16 Oct (482 deleted, 20 "producer" glosses fixed; 502-document backup in `flywheel/backlog/`, gitignored). `--phase split` must run after deploy.
- PRODUCTION-LOOP §9–10: English sentence menu (authored / AI-draft-reviewed / remix — never machine translations), recording menu, copy check, junk gates.

**Metrics data (sixth pass)**
- Production check: 7,036 `sessions` events stored with school `unknown` (the enrollment bug) — every dashboard query filters by school, so district reports were empty. Almost no event had `pilotId`, the partition key of `sessions` and `analytics`.
- `shared/enrollments.ts`: `findPilotId` and `resolveStudentScope` (student → school, grade, pilot; cached; never throws). `analytics-writer`, `lexicon-lookup` and `translate` now write `pilotId` on every event (`'unknown'` when unresolved).
- `backend/scripts/backfill-session-scope.mjs`: repairs school and grade on old events from enrollments. Dry run verified read-only: 7,033 of 7,036 repairable (Greenbriar 4,899, demo 2,134). **Not applied** — the write was blocked by the permission check; run it by hand. Old events keep no `pilotId` (partition keys can't change in place); dashboard queries still find them.
- Azure Monitor returned no request metrics for the account (only storage), so there is no alerting on throttling yet.
- Baseline: 1,276 of 2,137 lookups (60%) answered by Azure before the cleanup.

**Docs** — MASTER-DOCUMENT §2, §5.1, §7.1 rule 4 (rewritten, pending Chris), §8, §11.3, §14, §16, §18; README; company overview moat paragraph.

## Tested
- `backend`: 164 Jest tests pass; `tsc --noEmit` clean; `func start` registers all 13 routes.
- Root Vitest: 63 pass (variant injection + flywheel scripts).
- Bootstrap script run offline: 319 candidates.

## Not tested
- Nothing deployed; no request has hit live Cosmos or Azure.
- Extension not loaded in Chrome (manual checklist in `flywheel/README.md`).
- Dynamic dictionary markup not sent to the real Translator API.
- `--live` mode of the bootstrap script not run.
- No variant voice or recognizer has been called against Azure (the local speech key returns 401). Names come from Microsoft Learn, not a live voice list.
- The Settings dialect picker has not been opened in Chrome.

## To do
- [ ] Composite index on `flags` if the queue query asks for one.
- [ ] Manual Chrome test, then version bump + Web Store release.
- [ ] Chris: Azure-output ownership (gates recognition flags), contributor agreement, NDPA clause, retention window.
- [ ] Review `flywheel/backlog/candidates.csv` with Justin.
- [x] `backfill-session-scope.mjs --az --write` APPLIED 16 Oct: 7,033 events repaired (Greenbriar 4,899, demo 2,134), 0 failed; 3 unrepairable test-code events remain. Backup in `flywheel/backlog/`.
- [x] `clean-lexicon.mjs --phase split --az --write` APPLIED 16 Oct: `lexicon_machine_cache` created (/language, 90-day TTL); 789 cached Azure rows + 98 Azure cognates in bridge rows moved; lexicon now 149,190 rows, 0 machine rows. Until the new backend deploys, the old code may write some back — re-run the split after deploy.
- [x] Alerts (RG languagebridge-rg): action group `lb-cosmos-alerts` → admin@languagebridge.app; `cosmos-throttling-429` (> 50 in 5 min) and `cosmos-high-load` (max normalized RU > 90% for 15 min). Azure Monitor works — the earlier empty result was a bad query window.
- [ ] Bulk scripts hit the 1,000 RU/s ceiling (588 retried 429s on 16 Oct, none failed). Run large writes off-hours or raise the container's autoscale max first.
- [ ] **Right after deploy:** `node flywheel/scripts/clean-lexicon.mjs --phase split --az --write`. Before it runs, lookups still find the 789 old machine rows in `lexicon` (harmless); new Azure answers go to the cache, whose container the script creates — until then cache writes fail quietly and lookups call Azure.
- [ ] Prentice: internal flag queue page.
- [ ] Onboarding flow offers the dialect picker (today only Settings).
- [ ] Recorder writes speaker / release / authorship metadata per clip.
- [ ] Spec the production loop (commissioned Author/Record/Validate tasks, sense cards) — needs Justin's direction.
