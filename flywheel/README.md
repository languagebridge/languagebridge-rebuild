# Lexicon Flywheel

Every bad translation, mispronunciation, or misheard word a teacher or student flags becomes a human-verified entry in the LanguageBridge Lexicon, which we own and serve ahead of Azure.

This folder is the home of that project: the spec, design, plan, and tooling. **Runtime code lives in `backend/` and `extension/`**, using the same functions, shared contract and Cosmos containers as everything else. It is deliberately not a separate repo or Function App: the flywheel *is* the existing request path, and a copy would drift from `backend/shared/types.ts` the first time either side changed.

**Start here (Matt):** read [SPEC.md](SPEC.md) §1–3, then [PHASES.md](PHASES.md) for what is done and what is next.

| File | What it is |
|---|---|
| [SPEC.md](SPEC.md) | The spec. Replaces `docs/PRD-ML-FLYWHEEL.md` |
| [PRODUCTION-LOOP.md](PRODUCTION-LOOP.md) | How the Lexicon and our own voices get built: three intake streams, task types, R&D commissions, 8–10 h per voice. First voice Haitian Creole, then Dari |
| [DATA-MODEL.md](DATA-MODEL.md) | Flag candidates, Lexicon fields, provenance, planned containers |
| [DUAL-CODEX.md](DUAL-CODEX.md) | The override layer that serves our entries ahead of Azure in `/translate` |
| [PHASES.md](PHASES.md) | Phase 0–5 checklists with build status |
| [VARIANTS.md](VARIANTS.md) | Dialects: Honduran vs Cuban Spanish, Pashto regions, Arabic varieties; fallback chains; privacy |
| [TRAINING-DATA-POLICY.md](TRAINING-DATA-POLICY.md) | What we may store, train on, and claim as ours; base-model licences; voice releases; paying contributors |
| [OPEN-DECISIONS.md](OPEN-DECISIONS.md) | Decisions for Chris (legal) and Justin, with what each blocks |
| [scripts/bootstrap-candidates.mjs](scripts/bootstrap-candidates.mjs) | Builds the review backlog from known-bad data (no writes) |
| [scripts/export-flag-queue.mjs](scripts/export-flag-queue.mjs) | Manual loop step 1: open flags → CSV for linguists (read-only) |
| [scripts/publish-approved.mjs](scripts/publish-approved.mjs) | Manual loop step 2: filled CSV → review gate → approved Lexicon entries + resolved flags (dry run unless `--write`) |
| `backlog/` | Output of the bootstrap script |

---

## Run the loop today (before Phase 2 tooling)

```bash
# 1. Export open flags (read-only key via Azure CLI). Output is gitignored.
node flywheel/scripts/export-flag-queue.mjs --az [--language dari] [--min-reports 2]

# 2. Linguists fill, per row:
#    action        fix | dismiss
#    source_term   for scope=passage: the English word/phrase that was actually wrong
#    fix_text      the correct target-language term or phrase
#    entry_kind    term (default) | phrase | fixed_term
#    sense_tag     e.g. math, furniture        sense_gloss  short English gloss
#    author, reviewer_1 + decision, reviewer_2 + decision   (contributor IDs like C-007, never names)

# 3. Dry run, then publish
node flywheel/scripts/publish-approved.mjs flywheel/backlog/flag-queue-2026-10-16.csv --by C-001 --az
node flywheel/scripts/publish-approved.mjs flywheel/backlog/flag-queue-2026-10-16.csv --by C-001 --az --write
```

The publish step enforces the gate: two `approve` decisions from two different reviewers, neither the author. It writes a new `approved` entry (version + 1, with `authored_by`, `reviewed_by`, `ai_assisted`, `source_flag_id`) and resolves the flag with that entry id. Lookup serves it ahead of everything else for that term, sense and dialect, from the next request. Sound and misheard flags are skipped (Phase 3).

**State of the live queue (16 Oct 2026):** 12 open flags — 4 empty legacy flags (from before `flagType` was required; dismiss them), 4 whole-passage flags (need `source_term`), 4 term flags. Several served entries are polluted machine cache (a French "les" stored as its own Somali translation; a whole French quiz question stored as a "term"); `lexicon-lookup` no longer caches echoes, but existing rows need cleanup.

## Test the whole flywheel without touching production

`flywheel/scripts/test-env/` runs the real backend locally against a throwaway Cosmos database. Last run, 16 Oct 2026: **30 of 30 checks passed**. It covers dialect enrollment, lookup merging, the machine cache, junk and PII rejection, flag scrubbing, the review gate, publishing, lookup serving the fix, the Dual Codex phrase, and the pilot ID on events.

```bash
D=languagebridge-flywheel-test; RG=languagebridge-rg; A=languagebridge-cosmos
# 1. Throwaway database mirroring production's containers (~$0.75/day while it exists)
az cosmosdb sql database create -g $RG -a $A -n $D --throughput 400
for s in flags:/language lexicon:/language lexicon_machine_cache:/language enrollments:/schoolCode pilots:/id \
         sessions:/pilotId analytics:/pilotId rate_limits:/partitionKey audio_cache_metadata:/language admin_users:/email; do
  az cosmosdb sql container create -g $RG -a $A -d $D -n ${s%%:*} -p ${s#*:}; done
# 2. Copy a small real slice of production into it (production is only read)
node flywheel/scripts/test-env/seed-test-db.mjs --target $D
# 3. Run the backend from a separate folder whose local.settings.json points at $D
#    (COSMOS_DB_DATABASE=$D, LB_API_KEY=<any test key>, LB_LEXICON_OVERRIDES=on, Translator key), then:
LB_TEST_API=http://localhost:7122/api LB_API_KEY=<test key> COSMOS_DB_ENDPOINT=… COSMOS_DB_KEY=… COSMOS_DB_DATABASE=$D \
  node flywheel/scripts/test-env/e2e-local.mjs
# 4. Delete it
az cosmosdb sql database delete -g $RG -a $A -n $D --yes
```

Never point step 3 at `languagebridge-prod`. Both scripts refuse to run against it.

## Where the code is

| Piece | File | Function / route |
|---|---|---|
| Flag capture | `backend/azure-functions/flag-handler/index.ts` | `flagHandler` · `POST /api/flag-handler` |
| Admin flag queue | `backend/azure-functions/flag-queue/index.ts` | `listFlagQueue` · `GET /api/flag-queue`; `actOnFlag` · `POST /api/flag-queue/{id}/action` |
| Term lookup + ranking | `backend/azure-functions/lexicon-lookup/index.ts` | `lexiconLookup`, `rankEntries`, `provenanceOf` |
| Sentence override | `backend/shared/dual-codex.ts` → `backend/azure-functions/translate/index.ts` | `loadOverrides`, `applyOverrides` · `POST /api/translate` |
| PII scrubbing | `backend/shared/validators.ts` | `checkForPII`, `redactPII`, `scrubFlagContext` |
| Dialects | `backend/shared/variants.ts` | `LANGUAGE_VARIANTS`, `variantChain`, `variantRank`, `resolveAlongChain` |
| Dialect voices | `backend/azure-functions/tts-router/index.ts` | `resolveVoice` |
| Dialect choices | `backend/azure-functions/onboarding/index.ts` | `getVariants` · `GET /api/onboarding/variants` |
| Dialect on extension calls | `extension/background.js` | `withVariant` |
| Dialect picker | `extension/options/options.js` | `loadVariants` |
| Contract | `backend/shared/types.ts` | `FLAG_TYPES`, `FlagEventRequest`, `FlagDoc`, `FlagContextSample`, `FlagQueueItem`, `LexiconDoc`, `LexiconProvenance` |
| Containers | `backend/shared/cosmos-client.ts` | `getFlagsContainer`, `getLexiconContainer`, `getEnrollmentsContainer`, `getAnalyticsContainer` |
| Admin auth | `backend/shared/auth-helpers.ts` | `resolveAuthContext` (queue requires `isSuperAdmin`) |
| Extension flag call | `extension/content/toolbar-flag.js` | `reportProblem(text, flagType, opts)` |
| Lookup card chips | `extension/content/toolbar-tooltip.js` | `_buildFlagRow` |
| Talk to Teacher chips | `extension/content/floating-translator.js` | `buildFlagRow` |
| Sentence context | `extension/content/toolbar.js` | `getSelectionContext` |
| Subject detection | `extension/content/services/lb-translation-service.js` | `detectSubject` |
| Tests | `backend/__tests__/unit/flywheel.test.ts`, `variants.test.ts`; `tests/unit/variant-injection.test.ts` | |

---

## API contract

### `POST /api/flag-handler` (app key + student code)

Old clients keep working: the five original fields are still the only required ones.

```jsonc
{
  "flaggedText": "table",              // ≤ 500 chars; recognition: misheard transcript (stored ≤ 200, redacted)
  "language": "somali",                // recognition: the language SPOKEN
  "studentCode": "LB-7K2M",
  "timestamp": "2026-10-16T12:00:00Z",
  "flagType": "translation",           // translation | pronunciation | recognition
  // optional
  "context": "Copy the numbers from the table.",  // scrubbed + trimmed server-side
  "intendedText": null,                // recognition only
  "subject": "math",                   // math | science | ela | social_studies
  "seatRole": "student",               // student | teacher
  "surface": "lookup"                  // lookup | passage | talk_to_teacher | audio
}
```
Errors: `INVALID_FLAG_TYPE`, `PII_VIOLATION`, `TEXT_TOO_LONG`, plus the existing ones.

### `GET /api/flag-queue?language=&status=&flagType=&limit=` (Supabase JWT, super-admin)
Returns `{ items: FlagQueueItem[], count }`, most-reported first, `limit` ≤ 200. School codes are replaced by `schoolCount`.

### `POST /api/flag-queue/{id}/action` (Supabase JWT, super-admin)
```json
{ "language": "somali", "action": "resolved", "entryId": "table_somali_v2", "note": "math sense fixed" }
```
`action`: `in_review` · `resolved` (needs `entryId`) · `dismissed` · `reopen`. Appended to `resolutionHistory`.

### `POST /api/lexicon-lookup` — additive response fields
`entry_id` (string | null) and `provenance` (`human_verified` | `glossary` | `machine`).

---

## Environment

| Variable | Needed for |
|---|---|
| `LB_SUPERADMIN_EMAILS` | The admin queue. **Still unset in production** — set before deploy |
| `LB_LEXICON_OVERRIDES` | `on` enables Dual Codex in `/translate`. Leave off until DUAL-CODEX.md checks pass |
| `LB_LEXICON_OVERRIDE_TTL_MS` | Override cache lifetime (default 300000) |

Production app: `languagebridge-api` in resource group **`languagebridge-ce`** (not `languagebridge-rg`).

---

## Run it

```bash
npm install
cd backend && npx jest                       # 163 tests, includes flywheel + variants
npx tsc --noEmit -p ../tsconfig.backend.json
cd .. && npx vitest run                      # 43 extension tests
node flywheel/scripts/bootstrap-candidates.mjs          # offline backlog
node flywheel/scripts/bootstrap-candidates.mjs --live   # + Dari-as-Persian (read-only Cosmos)
```

## Manual Chrome test (before Web Store release)

1. Load `extension/` unpacked, enrol, open a page with "math" in the title.
2. Highlight a word → lookup card → **Wrong meaning**. Confirmation shows. In Cosmos `flags`, the doc has `subject: "math"`, a `contexts[0].text` around the word, and the school + grade from your enrollment.
3. Highlight a sentence containing a name and a phone number → flag it. Name is `[name]`, number is `[redacted]` or `[number]` in `contexts`.
4. Highlight `someone@example.com` → flag → "Could not send". No doc created.
5. Talk to Teacher: speak, then tap **Misheard me** under the bubble. Doc has `recognitionFlagCount: 1`, `surface: "talk_to_teacher"`, `contentSource: "speech_recognition"`.
6. App Insights for `flag-handler`: log lines show an id prefix and type, never the text or student code.
7. With a super-admin login, `GET /api/flag-queue` lists the docs with `schoolCount` and no `schoolCodes`.
8. Settings: choose Spanish → "Which sounds most like home?" appears → pick Spanish — Honduras → save. Play audio on a Spanish word: the voice is Honduran (Karla), not the US voice. Flag a word: the doc has `variant: "es-HN"`.
9. Settings: choose Dari → no dialect picker appears.
