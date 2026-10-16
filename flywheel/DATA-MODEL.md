# Lexicon Flywheel — Data Model

All types live in `backend/shared/types.ts`, the contract for every client. Containers are in the Cosmos database named by `COSMOS_DB_DATABASE` (production `languagebridge-prod`). Never construct a Cosmos client outside `backend/shared/cosmos-client.ts`.

**Built** = in code on `feat/lexicon-flywheel`. **Planned** = design only; build in the phase named.

---

## Core rule

Entries are keyed by **English sense**, not English spelling.

```
sense_key  = "<normalized english term>#<sense tag>"
             table#math        ("rows and columns of numbers")
             table#furniture   ("the table you eat at")
```

At capture time the only sense signal is the subject, so flag candidates are keyed by text + language + subject. A reviewer assigns the real `sense_key` when fixing.

---

## `flags` — candidates (Built)

Partition key: `/language`. One document per candidate.

| Field | Type | Notes |
|---|---|---|
| `id` | sha256 hex | `${text}::${language}` — or `${text}::${language}::${subject}` when a subject is known. Subject-less keys equal the pre-Phase-1 keys, so old documents keep counting |
| `flaggedText` | string | Lower-cased. Never contains detected PII (rejected or redacted) |
| `language` | SupportedLanguage | For `recognition`, the language that was spoken |
| `subject` | string \| null | `math` \| `science` \| `ela` \| `social_studies` |
| `variant` | string \| null | Dialect tag (`es-HN`). From the client, else the enrollment when languages match. Part of the key |
| `flagCount` | number | All types |
| `translationFlagCount` / `pronunciationFlagCount` / `recognitionFlagCount` | number | `recognitionFlagCount` absent on old docs (treat as 0) |
| `status` | enum | Count-driven: `logged` `review` `bounty` `high_priority`. Admin-set: `in_review` `resolved` `dismissed` |
| `requiresReview` | boolean | |
| `schoolCodes` | string[] | From the enrollment. **Internal only** — never in contributor or queue output |
| `gradeBands` / `seatRoles` / `surfaces` | arrays | Treated as sets (rare duplicates possible under concurrency) |
| `contexts` | FlagContextSample[] | ≤ 10, scrubbed: `{ text, flagType, intendedText, gradeBand, seatRole, surface, at }` |
| `contentSource` | `student_input` \| `speech_recognition` | |
| `resolution` | object | Last admin action: `{ action, note, entryId, by, at }` |
| `resolutionHistory` | array | Every admin action, oldest first |
| `createdAt` / `lastFlaggedAt` | ISO 8601 | |

---

## `lexicon` — entries (Built: fields; Planned: review flow)

Partition key: `/language`. Existing `LexiconDoc` plus three additive fields.

| Field | Status | Notes |
|---|---|---|
| `status` | existing | `auto_generated` · `pending_review` · `approved` · `deprecated`. **`approved` means passed the two-approval gate.** `deprecated` is never served |
| `created_by` | existing | `rbern_glossary` · `bridge_pipeline_v1` · `system` (Azure cache) · `manual` |
| `entry_kind` | **new** | `phrase` · `fixed_term` · `term`. Absent on plain glossary rows. Only rows with this field AND `status: approved` are used by Dual Codex |
| `sense_key` | **new** | See core rule |
| `sense_gloss` | **new** | Short English gloss shown to contributors |
| `variant` | **new** | Dialect tag, null = core entry shared by all variants (VARIANTS.md) |
| `version` | existing | Highest version wins among same term + kind |
| `usage_count` | existing | Incremented on every lookup hit |

**Provenance** (computed, returned by `lexicon-lookup` as `provenance`):

| Value | Rule |
|---|---|
| `human_verified` | `status === 'approved'` |
| `machine` | `status === 'auto_generated'` or `created_by` is `system` / `translator_fallback` |
| `glossary` | everything else (RBERN, bridge pipeline, manual) |

Lookup ranking: subject match → provenance (human_verified, glossary, machine) → version.

**Machine cache (decided, built 16 Oct 2026):** Azure answers no longer go into `lexicon`. `lexicon-lookup` reads and writes `lexicon_machine_cache` instead, and serves the translation half and the bridge-gloss half of a term from separate rows when they are split (RBERN + bridge). The junk cleanup ran 16 Oct (482 rows deleted, 20 "producer" glosses fixed, backup kept locally). After deploying, run `clean-lexicon.mjs --phase split --az --write` to move the remaining 789 cached rows and the 98 Azure translations inside bridge rows.

---

## `analytics` — usage signals (Built)

| `type` | Written by | Fields |
|---|---|---|
| `lexicon_hit` | lexicon-lookup | term, language, `entry_id`, `provenance`, studentCode (existing behaviour) |
| `lexicon_miss` | lexicon-lookup | term, language |
| `lexicon_override_fired` | translate (Dual Codex) | language, layer, `entry_ids`, `matched_term_ids`. **No text, no student code** |

---

## Planned containers (Phase 2+)

| Container | PK | Purpose | Phase |
|---|---|---|---|
| `lexicon_reviews` | `/entryId` | One doc per proposal: contributor id, proposed fields, two approval records `{ reviewerId, decision, note, at }`, outcome. Enforces "two independent approvals, no self-review" | 2 |
| `contributors` | `/id` | Role (contributor/reviewer/lead), languages, agreement signed date + version, agreement-rate score, demotion state. No pay details (payment processor holds those) | 2 |
| `pronunciations` | `/language` | `{ sense_key, ipa | sapi, alphabet, authored_by, status }` → SSML `<phoneme>` or custom lexicon file | 3 |
| `recognition_phrases` | `/language` | `{ phrase, subject, authored_by, status }` → per-language/subject phrase list | 3 |
| `english_sentences` | `/sense_key` | The menu: `{ text, term, grade_band, subject, origin: authored \| ai_draft \| remix, authored_by, reviewed_by, status }`. Never machine translations, student text or copied text | 4 |
| `target_sentences` | `/language` | `{ english_sentence_id, text, variant, authored_by, ai_assisted, reviewed_by, copy_check_score, status }` | 4 |
| `lexicon_machine_cache` | `/language` | Azure answers, 90-day TTL. **Code built**; container is created by `clean-lexicon.mjs --phase split` after deploy | now |

Create containers in a seed/migration script modelled on `scripts/seed-pilot-schools.ts` (`createIfNotExists`). Add new accessors to `backend/shared/cosmos-client.ts`.

---

## Verified against live Cosmos (16 Oct 2026, read-only)

| Container | Partition key | Notes |
|---|---|---|
| `flags` | `/language` | 12 docs, 15 reports (Dari 5 docs). Queue queries run: ~3 RU |
| `lexicon` | `/language` | Lookup query ~3.7 RU (the `LOWER(term)` filter still uses the index) |
| `enrollments` | `/schoolCode` | 40 docs. Point reads by student code always 404 — fixed by `shared/enrollments.ts` `findEnrollment` (query by id, ~2.8 RU, cached) |
| `analytics` | `/pilotId` | Lookup and override events carry no `pilotId`, so they all land in one logical partition (20 GB cap). Fine for now; add `pilotId` before volume grows |
| `audio_cache_metadata` | `/language` | `tts-router` hit counter used the wrong key; fixed |
| `sessions` | `/pilotId` | |

All containers: autoscale 100–1,000 RU/s. Raising the max is a setting, not a code change.
