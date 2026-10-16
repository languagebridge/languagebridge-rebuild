# LanguageBridge Master Document

**LanguageBridge LLC · Confidential · Last reconciled against the code: 10 October 2026**

This is the single current reference for how LanguageBridge is built, how to run and test it, why it is shaped the way it is, and what comes next. It replaces six older engineering documents that overlapped and had drifted (listed in [section 18](#18-document-map)).

How to trust it:

- Function names, routes, limits, containers and environment variables in sections 5, 6, 9 and 11 were read from the source on the date above.
- Anything marked *(not re-checked)* was carried over from an older document and has not been verified against the live system.
- When this document and the code disagree, the code is right. Fix this document in the same pull request.

Customer-facing facts (pricing, the DPA, what we may claim in sales material) live in `company/` and are not repeated here. `company/00-CANONICAL-FACTS.md` governs anything that leaves the building.

---

## 1. What LanguageBridge is

LanguageBridge is a comprehension tool for K-12 English learners, built especially for refugee and immigrant students. A student selects text on any webpage and gets it in their home language, with audio, without leaving the page.

It has three features:

| Feature | What the student does | What they get |
|---|---|---|
| **Highlight & Hear** | Selects a word or passage | The translation, a read-aloud voice, and for academic terms a short simple-English "bridge" gloss |
| **Academic Glossary** | Opens the glossary tab on a selection | The hard words in that passage, sorted by difficulty, each with audio and a flag button |
| **Talk to Teacher** | Speaks into the device | A two-way spoken conversation with a teacher across two languages |

It is delivered as a **Chrome extension** (the primary surface) and **languagebridge.app** (teacher dashboard, a `/teacher` companion app, and marketing). Both use one shared Azure backend.

Students never create accounts and we never hold their identity. That is the central design rule; see [section 7](#7-privacy-and-compliance-method).

---

## 2. Current state

| Area | State |
|---|---|
| Backend: 10 HTTP functions in 9 function folders | Live at `https://languagebridge-api.azurewebsites.net/api` |
| Languages | **18 live.** All 18 passed the live translation and audio smoke check on 10 October 2026. The published extension (2.0.4) does not yet offer Amharic or Uzbek in its picker |
| Lexicon | Seeded from RBERN glossaries plus about 1,080 bridge glosses *(counts not re-checked)* |
| Audio | **All live audio is Azure Speech.** The proprietary voice service is not configured on the live app (`LB_TTS_SERVICE_URL` is not set) |
| Chrome extension | Version 2.0.4 in the repo. QA fixes and the read-along glow from 10 October are merged in code but **not yet tested in Chrome** |
| Talk to Teacher | Built end to end. Still needs a manual test with a real speaker |
| Teacher dashboard | The API exists. The front end is built outside this repo |
| Licence enforcement | **Not built.** Enrolment issues a student code without checking seats, term or licence status |
| Flag pipeline | Flags are captured and escalate by count. Nothing acts on them yet |
| CI | Runs on pull requests to `main`: dependency audit, lint, type-check, build, tests |
| Deploys | Manual, via `scripts/deploy-backend.sh` |

Not built, with specs: admin terminal and audit log (`docs/PRD-ADMIN-DATABASE.md`), Lexicon flywheel phases 2–5: review gate, contributors, sound overrides, marketplace (`flywheel/`). Phase 1 capture, the admin flag queue and the Dual Codex override layer are built on branch `feat/lexicon-flywheel`, not yet deployed, licence enforcement (`company/PROVISIONING-AND-LICENSING.md`).

---

## 3. Languages

The source of truth is `SUPPORTED_LANGUAGES` in `backend/shared/types.ts`. The extension's `LB_LANGUAGES` (`extension/content/services/lb-azure-core.js`) must match it.

| Language | Key | Translator | Azure voice | STT locale | Status |
|---|---|---|---|---|---|
| Arabic | `arabic` | `ar` | `ar-SA-HamedNeural` | `ar-SA` | Live |
| Burmese | `burmese` | `my` | `my-MM-ThihaNeural` | `my-MM` | Live |
| Dari | `dari` | `prs` | `fa-IR-FaridNeural` (Persian) | `fa-IR` | Live; translated as Dari, audio and STT use Persian |
| English | `english` | `en` | `en-US-AndrewNeural` | `en-US` | Live |
| French | `french` | `fr` | `fr-FR-HenriNeural` | `fr-FR` | Live |
| Nepali | `nepali` | `ne` | `ne-NP-SagarNeural` | `ne-NP` | Live |
| Pashto | `pashto` | `ps` | `ps-AF-GulNawazNeural` | `ps-AF` | Live |
| Persian | `persian` | `fa` | `fa-IR-DilaraNeural` | `fa-IR` | Live |
| Portuguese | `portuguese` | `pt` | `pt-BR-AntonioNeural` | `pt-BR` | Live |
| Somali | `somali` | `so` | `so-SO-MuuseNeural` | `so-SO` | Live |
| Spanish | `spanish` | `es` | `es-US-AlonsoNeural` | `es-US` (was `es-ES`, Spain, until Oct 2026) | Live |
| Swahili | `swahili` | `sw` | `sw-KE-RafikiNeural` | `sw-KE` | Live |
| Tagalog | `tagalog` | `fil` | `fil-PH-AngeloNeural` | `fil-PH` | Live |
| Ukrainian | `ukrainian` | `uk` | `uk-UA-OstapNeural` | `uk-UA` | Live |
| Urdu | `urdu` | `ur` | `ur-PK-AsadNeural` | `ur-IN` | Live |
| Vietnamese | `vietnamese` | `vi` | `vi-VN-NamMinhNeural` | `vi-VN` | Live |
| Amharic | `amharic` | `am` | `am-ET-AmehaNeural` | `am-ET` | Live since 10 Oct 2026; STT untested |
| Uzbek | `uzbek` | `uz` | `uz-UZ-SardorNeural` | `uz-UZ` | Live since 10 Oct 2026; STT untested |

Notes:

- **Smoke check, 10 October 2026:** 18 of 18 for translation and 18 of 18 for audio. It does not cover speech recognition.
- **Dari.** Azure has no Dari voice or Dari speech recognition, so both use Persian. Until October 2026 the config named a voice Azure does not offer (`fa-AF-HasanNeural`), so every Dari audio request failed and the extension retried as Persian; that retry is still in the extension as a safety net. Translation uses Azure's Dari (`prs`), which gives noticeably different wording from Persian (`fa`). A Dari speaker has not yet reviewed it.
- **Dialects (variants).** Spanish, Arabic, Pashto, French and Portuguese have optional dialects (`es-HN`, `es-CU`, `ar-SY`, `ps-PK`, …) that pick a regional voice, recognizer and Lexicon entries, falling back to the core language. Dialects never cross languages: Dari never falls back to Persian content. See `flywheel/VARIANTS.md`.
- **Our own voices.** Piper models from a different language were removed from `voice-config.json` (Pashto had Persian, Urdu Arabic, Somali Swahili; Spanish had Argentine). Each `note` field says why.
- **Removed and not coming back as-is:** Kinyarwanda, Twi and Tigrinya. Azure has no voice or speech recognition for any of them, and no translation for Twi.
- **Requested by districts, not supported:** Haitian Creole, Kinyarwanda and Hmong have Azure translation but no Azure voice. They need our own voices; see [section 16](#16-roadmap-and-open-decisions).

### Adding a language

1. Add the key to `SUPPORTED_LANGUAGES` in `backend/shared/types.ts`.
2. Add a row to `backend/shared/voice-config.json`. Use a voice in that language. Never point a language at an English voice, or at a related language's voice. Dialects go in `backend/shared/variants.ts`, not here.
3. Add the Translator code to the maps in `translate/index.ts` and `lexicon-lookup/index.ts`, and the STT locale in `speech-to-text/index.ts`.
4. Extension: `lb-azure-core.js` (`LB_LANGUAGES`), `options/options.js`, `content/onboarding.js` (flag chip and order), and `_ISO_TO_LB` in `lb-translation-service.js`.
5. `deliverables/talk-to-teacher-pwa/src/languages.ts`.
6. `tests/unit/validators.test.ts` and `backend/scripts/lang-smoke-check.mjs`.
7. Deploy, run the smoke check, and only then change the language count in customer-facing copy.

---

## 4. Architecture

```
CLIENTS      Chrome extension (MV3)          languagebridge.app (dashboard, /teacher, marketing)
                  │                                   │
EDGE         background.js adds x-lb-api-key     Supabase edge proxy adds the key; Supabase Auth issues JWTs
                  │                                   │
BACKEND      Azure Functions (TypeScript) — the only tier that touches data or AI services
                  │
DATA & AI    Cosmos DB · Blob Storage (audio cache) · Azure Translator · Azure Speech (TTS and STT)
```

Clients are thin. No client holds a database connection or a service key. Because the functions are the only tier that touches data, privacy rules, rate limits and secrets are enforced in one place, and a new client inherits them by making HTTPS calls.

Stack: Azure Functions v4 on Node (CI uses Node 22), TypeScript in strict mode, Cosmos DB, Blob Storage, Azure Translator, Azure Speech, Supabase for teacher and admin sign-in, Jest and Vitest for tests.

---

## 5. Backend reference

Code: `backend/azure-functions/<folder>/index.ts`. Every function is registered through `backend/index.ts`, which also runs `validateEnvironment()` on cold start. `host.json` sets the route prefix to `api`.

### 5.1 HTTP functions

| Registered name | Route | Method | Handler | Auth | Rate limit per minute |
|---|---|---|---|---|---|
| `lexicon-lookup` | `/api/lexicon-lookup` | POST | `lexiconLookup` | App key + student code | 300 per student |
| `translate` | `/api/translate` | POST | `translate` | App key + student code | 100 per student |
| `tts-router` | `/api/tts-router` | POST | `ttsRouter` | App key + student code | 60 per student |
| `speech-to-text` | `/api/speech-to-text` | POST | `speechToText` | App key + student code | 30 per student |
| `flag-handler` | `/api/flag-handler` | POST | `flagHandler` | App key + student code | 100 per student |
| `analytics-writer` | `/api/analytics-writer` | POST | `analyticsWriter` | App key + student code | 300 per student |
| `onboarding-schools` | `/api/onboarding/schools` | GET | `getSchools` | App key | 100 per client address |
| `onboarding-enroll` | `/api/onboarding/enroll` | POST | `enroll` | App key | 100 per client address |
| `onboarding-variants` | `/api/onboarding/variants` | GET | `getVariants` | App key | — |
| `auth-layer` | `/api/auth-layer` | POST, GET | `authLayer` | Supabase JWT | — |
| `dashboard` | `/api/dashboard` | POST | `dashboard` | Supabase JWT + `view_dashboard` | 100 per user |
| `flag-queue-list` | `/api/flag-queue` | GET | `listFlagQueue` | Supabase JWT + super-admin | 100 per user |
| `flag-queue-action` | `/api/flag-queue/{id}/action` | POST | `actOnFlag` | Supabase JWT + super-admin | 100 per user |

What each does:

- **`lexiconLookup`** — one term in, native translation plus bridge gloss out. Reads the `lexicon` container, falls back to Azure Translator on a miss, and caches the result.
- **`translate`** — arbitrary text between two supported languages. 2,000 characters maximum.
- **`ttsRouter`** — text in, signed audio URL out. Checks the blob cache first. 500 characters maximum, so clients chunk long text.
- **`speechToText`** — base64 audio in, transcript out. 16 kHz mono WAV, 4 MB maximum. Audio is passed to Azure and not stored.
- **`flagHandler`** — records a report that a translation, pronunciation or speech recognition is wrong. `flagType` is required (`translation`, `pronunciation`, `recognition`). Optional scrubbed context, subject, seat role and surface. See `flywheel/README.md`.
- **`listFlagQueue` / `actOnFlag`** — internal flag triage for super-admins. School codes are returned only as a count.
- **`analyticsWriter`** — records anonymous usage events after the PII check.
- **`getSchools` / `enroll`** — lists schools and issues a pseudonymous student code.
- **`authLayer`** — turns a Supabase sign-in into permissions.
- **`dashboard`** — runs one of ten fixed reporting queries, scoped to the caller's schools, capped at 5,000 rows.

Dashboard query names: `usage_by_week`, `active_students`, `term_retention`, `student_progress`, `scaffold_engagement`, `audio_engagement`, `student_independence`, `bridge_vs_fallback`, `vocabulary_breadth`, `top_flagged`.

Every handler follows the same order: **check auth → validate input → rate-limit → do the one job → return**. Errors use `errorResponse(status, error, details)`.

### 5.2 Shared modules (`backend/shared/`)

| File | Exports |
|---|---|
| `types.ts` | `SUPPORTED_LANGUAGES`, `SupportedLanguage`, `FLAG_THRESHOLDS`, and every request, response and document type. The contract for all clients |
| `validators.ts` | `checkForPII`, `isValidLanguage`, `requireFields`, `validateTTSText`, `isValidStudentCode`, `validateApiKey`, `checkRateLimit`, `errorResponse` |
| `auth-helpers.ts` | `resolveAuthContext` |
| `cosmos-client.ts` | `getSessionsContainer`, `getFlagsContainer`, `getPilotsContainer`, `getAdminUsersContainer`, `getAudioCacheMetadataContainer`, `getLexiconContainer`, `getEnrollmentsContainer`, `getAnalyticsContainer`, `getRateLimitContainer` |
| `blob-client.ts` | `generateSasUrl`, `getAudioCacheContainer`, `getFlagDataContainer`, `getModelWeightsContainer` |
| `env-validation.ts` | `validateEnvironment` |
| `reporting-queries.ts` | The ten dashboard query strings |
| `voice-config.json` | Voice per language. Also read by `ml-pipeline/scripts/voice_router.py` |

Never construct a Cosmos or Blob client anywhere else.

### 5.3 Rules the validators enforce

- **Student code:** must match `^LB-[A-HJ-NP-Z2-9]{4,8}$`. The letters I and O and the digits 0 and 1 are excluded because they are easy to confuse. The code is checked for shape only; there is no enrolment lookup on the student endpoints.
- **App key:** sent as `x-lb-api-key`, compared in constant time.
- **Rate limiting:** fixed one-minute windows counted in the Cosmos `rate_limits` container, so limits hold across function instances. If Cosmos is unreachable it falls back to an in-memory counter per instance.
- **Flag escalation** (`FLAG_THRESHOLDS`): 3 reports moves a flag to review, 6 to bounty, 10 to high priority.

---

## 6. Data

### 6.1 Cosmos DB

One database, named by `COSMOS_DB_DATABASE` (production: `languagebridge-prod`). Nine containers:

| Container | Holds |
|---|---|
| `lexicon` | The bilingual glossary: term, translation, bridge gloss, subject, grade band |
| `sessions` | Anonymous usage events |
| `enrollments` | Student code, school code, grade band. No names |
| `flags` | Student-reported problems, deduplicated by text and language |
| `pilots` | School and pilot configuration. Planned home of the licence record |
| `admin_users` | Dashboard users and their permissions |
| `audio_cache_metadata` | Index of generated audio clips |
| `analytics` | Derived reporting data |
| `rate_limits` | Rate-limit counters. Each document deletes itself after 120 seconds |

Partition keys and indexes were not re-checked for this document.

### 6.2 Blob Storage

| Container | Holds |
|---|---|
| `tts-audio-cache` (override with `AZURE_STORAGE_CONTAINER_AUDIO`) | Generated audio, keyed by a hash of text and language |
| `flag-data` | Flag exports |
| `model-weights` | Voice model weights |

Audio is served through signed URLs that expire after one hour.

### 6.3 What the lexicon contains

- **Translations** from the NYU Steinhardt RBERN bilingual glossaries.
- **Bridge glosses:** about 1,080 short simple-English anchors of one to three words that fit inside the sentence ("light-feeding" for photosynthesis). They are not dictionary definitions.
- **Cached machine translations**, added automatically the first time a term misses.

Known data problems: about 319 of the bridge entries are science-only and some give a common word a narrow science meaning. The source for "producer" was corrected in June but the live database was not updated. Lexicon rows for the three removed languages are still in the database and unreachable. Dari terms that missed the glossary before October 2026 were machine-translated as Persian and cached under `dari`; they are still served until cleared.

---

## 7. Privacy and compliance method

This is the method every change must follow. It is why districts can approve us.

### 7.1 The rules

1. **No student identity, ever.** No names, emails, student IDs, addresses, dates of birth or device IDs. A student is a random code (`LB-XXXXXX`) generated at enrolment.
2. **Reject PII at the door.** `checkForPII` runs before a write. It rejects 15 prohibited field names (`email`, `name`, `firstName`, `lastName`, `studentId`, `schoolId`, `teacherId`, `userId`, `phone`, `address`, `dob`, `dateOfBirth`, `ssn`, `ipAddress`, `deviceId`) and scans text values for emails, US phone numbers and Social Security numbers, five levels deep.
3. **Process and discard.** Selected text and microphone audio go to Azure for processing and are not stored by us.
4. **Flags store only what is needed to fix them, scrubbed.** A highlighted term with PII is rejected; surrounding context and speech (misheard transcripts, Talk to Teacher) are redacted and trimmed before storage; no audio; flag text never goes to logs. Recognition flags store redacted speech-to-text output so a person can fix it. **Store machine output to fix it; never train on it, sell it, or call it ours** — training exports are human-verified only (`flywheel/TRAINING-DATA-POLICY.md`). Whether Microsoft's terms allow storing it this way is **pending Chris** (`flywheel/OPEN-DECISIONS.md` #1).
5. **Keys stay on a server.** The app key lives in the extension's service worker or behind a server-side proxy. It is never placed in a public web page.
6. **No silent defaults.** Missing configuration fails loudly instead of quietly pointing at the wrong database.
7. **Adults are the only accounts.** Teachers and admins sign in through Supabase. Students do not sign in.

### 7.2 How to apply it to a change

Before merging anything that touches data, answer these:

- Does it add a field? If the field could identify a person, it does not ship.
- Does it store free text a student typed? Run it through `checkForPII` first.
- Does it add a client? It must call the backend over HTTPS and must not embed the key in public code.
- Does it add a third-party service? That is a new subprocessor: update the DPA and `company/00-CANONICAL-FACTS.md` before it goes live.
- Does it change what is stored or for how long? Update `docs/compliance/DATA-FLOW-DIAGRAM.md`.

### 7.3 Known gaps

- **Client address used as a rate-limit key.** `getSchools` and `enroll` have no student code yet, so they rate-limit on the `x-forwarded-for` address. That address is written to `rate_limits` and deleted after 120 seconds. This is at odds with the plain statement that we store no IP addresses. Either hash the address before using it as a key or change the wording in customer documents.
- **The PII value scan is a safety net, not a guarantee.** It catches common formats only.
- **Not SOC 2 certified.** Our subprocessors are; we are not. Never claim otherwise.
- **Direct sales to individuals** would have no school and no DPA in the loop, and children under 13 raise COPPA parental-consent questions. Unresolved; see section 16.

Formal compliance documents (incident response, disaster recovery, risk assessment, NIST mapping, vulnerability scanning, data flow) are in `docs/compliance/`. The DPA template is `company/DPA-TEMPLATE.md`.

---

## 8. Pipelines

**Lookup.** `lexiconLookup` reads the `lexicon` container. A hit with a bridge gloss returns type `bridge`; a hit without one returns type `cognate`. A miss calls Azure Translator, caches the result and returns it marked `translator_fallback`.

**Text to speech.** `ttsRouter` hashes the text and language and checks the blob cache. On a miss it tries the proprietary voice service if `LB_TTS_SERVICE_URL` is set, then Azure Speech, then stores the audio and returns a signed URL. Today that variable is unset in production, so every clip is Azure.

**Speech to text.** The client records the microphone, converts to 16 kHz mono 16-bit WAV, and posts base64 to `speechToText`, which passes it to Azure and returns the transcript.

**Flags.** A flag stores the selected text, the language, a `flagType` of `translation`, `pronunciation` or `recognition`, and optionally a scrubbed context sample, subject, seat role and surface; school and grade band come from the enrollment. Repeats of the same text, language and subject increase one candidate's counts, which drive the escalation in section 5.3. The full pipeline is in `flywheel/SPEC.md`.

**Lexicon overrides.** `lexiconLookup` never serves `deprecated` entries, ranks human-verified over glossary over machine-cached, and returns `entry_id` and `provenance`. `translate` applies approved phrase and fixed-term entries through Dual Codex (`backend/shared/dual-codex.ts`) when `LB_LEXICON_OVERRIDES=on`; it is off in production.

---

## 9. Chrome extension reference

Manifest V3, in `extension/`. Permissions: `storage`, `activeTab`, `offscreen`.

### 9.1 Content scripts, in load order

| File | Provides |
|---|---|
| `utils/logger.js` | `LBLog` |
| `utils/help-content.js` | `LB_HELP_TIPS`, shared by the in-page help overlay and the help page |
| `config.js` | `CONFIG` (endpoints, client-side rate limits, text limits) |
| `content/core/lb-state-manager.js` | `LBState` (language, student code, reading speed, selected text) |
| `content/services/lb-azure-core.js` | `LB_LANGUAGES`, `escapeHtml`, `LBRateLimiter.check`, `LBRuntime.alive / handle / notifyLost` |
| `content/services/lb-translation-service.js` | `LBTranslationService.translate` |
| `content/services/lb-tts-service.js` | `LBTTSService.speakCached / play / generateAndPlay / stop` |
| `content/lb-read-along.js` | `LBReadAlong.attach / focus / start / stop` |
| `content/services/lb-stt-service.js` | `LBSTTService.startRecording / stopRecording / requestMicPermission / transcribe` |
| `content/services/lb-analytics.js` | `LBAnalytics.send / termLookup / scaffoldView / ttsPlay / flagEvent / glossaryView / sessionStart / sessionEnd` |
| `content/session-audio-cache.js` | `LBSessionCache.get / set / clear` |
| `content/activation-modal.js` | Consent and activation |
| `content/google-docs-adapter.js` | `LBGoogleDocsAdapter.isGoogleDocs / getSelectedText / showFallbackHint` |
| `content/onboarding.js` | Language-first onboarding and the demo path |
| `content/toolbar.js` | `LanguageBridgeToolbar` class: UI, events, selection, status |
| `content/toolbar-audio.js` | Adds `splitSentences`, `toggleReading`, `readText`, `playSentences`, `pauseReading`, `resumeReading`, `showWrittenTranslation` |
| `content/toolbar-tooltip.js` | Adds `showTranslationTooltip`, the translation and glossary tabs, `hideTranslationTooltip` |
| `content/toolbar-flag.js` | Adds `reportProblem`, `showHelp`. Creates the toolbar instance, so it must load last of the toolbar files |
| `content/floating-translator.js` | `FloatingTranslator.show / hide / setStudentLanguage` (Talk to Teacher) |

All of these are globals on `window` in the extension's isolated world. Order in `manifest.json` matters.

### 9.2 Other parts

- **`background.js`** — the service worker. Proxies every API call (`api-fetch`) and audio download (`fetch-audio`) and adds the app key.
- **`offscreen.html` / `offscreen.js`, `mic-permission.html` / `.js`** — microphone capture for Talk to Teacher. Content scripts cannot use the microphone reliably in MV3, so recording runs in an offscreen document.
- **`popup/`** — the toolbar-icon popup. It sends `lb-ping` to the active tab; if nothing answers, the page cannot run the extension and the popup says so.
- **`help/`** — a help page bundled in the extension. Help and Support open it when the in-page guide cannot be shown.
- **`options/`** — default language and reading speed.

Messages the content scripts answer: `lb-ping`, `toggle-toolbar`, `toggle-floating-translator`, `settings-updated`, `show-tutorial`.

### 9.3 Read-along glow

The word being spoken glows in the translation card. `LBReadAlong` rebuilds the translation as one span per word using `Intl.Segmenter`. `LBTTSService` reports each clip's text, length, speed and leading and trailing silence. Timing is **estimated** by sharing the speech across words by length, and it re-syncs at every sentence. If the spoken text cannot be matched to the words on screen, nothing glows. Exact sync would need word timings from the backend, which is not built.

### 9.4 Where the extension cannot run

Chrome does not inject content scripts into a new empty tab, the Chrome Web Store, or `chrome://` pages. A tab that was open before the extension was installed or updated also has no content script until it is reloaded. Whether it loads in Chrome's reading mode has not been tested.

---

## 10. Other clients

- **languagebridge.app** — the dashboard, the `/teacher` companion app and marketing. It is built in a separate Lovable project. **Its source is not in this repo.**
- **`deliverables/talk-to-teacher-pwa/`** — a self-contained React copy of Talk to Teacher, with a reference server-side proxy that hides the app key, written to be dropped into the Lovable project as a `/teacher` route. It has not been confirmed integrated or deployed.
- **`pwa/`** — empty folders from the first commit. Nothing was ever built there.
- **`deliverables/chrome-store-*.md`, `privacy-microphone-disclosure.md`** — the Chrome Web Store listing copy, permission justifications and microphone disclosure.

---

## 11. Local setup

> **Local development talks to production.** There is no separate development database. With real credentials in `backend/local.settings.json`, a local backend reads and writes the same Cosmos database and Blob storage that students use. Agree with Justin how to handle this before calling anything that writes (`flag-handler`, `analytics-writer`, `onboarding/enroll`).

### 11.1 Prerequisites

- Node.js 20 or later (CI uses 22).
- Azure Functions Core Tools v4. It is not an npm dependency of the project:
  `brew tap azure/functions && brew install azure-functions-core-tools@4`

### 11.2 Install, configure, run

```bash
npm install                      # from the repo root
cp backend/local.settings.json.example backend/local.settings.json
cd backend
npm start                        # builds, then runs func start
```

Endpoints are then at `http://localhost:7071/api/<route>`. `local.settings.json` is gitignored. Get real values from Justin, not from anything in the repo.

### 11.3 Environment variables

| Variable | Needed for | If missing |
|---|---|---|
| `COSMOS_DB_ENDPOINT`, `COSMOS_DB_KEY` | Everything that touches data | Startup fails (with `NODE_ENV=development` it only warns, then fails on first use) |
| `COSMOS_DB_DATABASE` | Everything that touches data | Fails on the first database call. It is not in the startup check, which is a gap |
| `AZURE_BLOB_CONN_STRING` | Audio cache | Startup fails, as above |
| `LB_API_KEY` | Every student endpoint | Startup fails, as above; requests get a 500 |
| `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY` | Signed audio URLs | Listed as optional, but `tts-router` breaks without them |
| `AZURE_TTS_KEY`, `AZURE_TTS_REGION` | `tts-router`, `speech-to-text` | 500 "service not configured". Region defaults to `eastus` |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` | `translate`, lookup fallback | 500 "Translator service not configured" |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | `auth-layer`, `dashboard` | Those two endpoints fail |
| `LB_SUPERADMIN_EMAILS` | Dashboard sign-in | **No one can sign in to the dashboard** |
| `LB_TTS_SERVICE_URL` | Proprietary voices | Audio uses Azure only |
| `LB_LEXICON_OVERRIDES` | Dual Codex in `translate` (`on` to enable) | Off: `translate` is plain Azure. Leave off until `flywheel/DUAL-CODEX.md` checks pass |
| `LB_LEXICON_OVERRIDE_TTL_MS` | Dual Codex cache lifetime | Defaults to 300000 (5 minutes) |
| `LB_ALLOW_INSECURE_DEV` | Local only | Bypasses the app key. Never set it on a deployed app |

### 11.4 Quick check

```bash
curl -X POST http://localhost:7071/api/translate \
  -H "Content-Type: application/json" \
  -H "x-lb-api-key: <LB_API_KEY from local.settings.json>" \
  -d '{"text":"Where is the library?","fromLanguage":"english","toLanguage":"spanish","studentCode":"LB-TEST99"}'
```

A 200 with `translatedText` proves the Translator credentials work. It does not prove Cosmos is reachable, because the rate limiter falls back to memory when Cosmos is down.

---

## 12. Testing

### 12.1 Automated

| Command (repo root) | Runs | Result on 10 Oct 2026 |
|---|---|---|
| `npm run test:backend` | Jest, `backend/__tests__/` | 11 suites, 122 tests |
| `npx vitest run` | Vitest, `tests/unit` and `tests/integration` | 3 files, 39 tests |
| `npm run test:ml` | pytest, `ml-pipeline/tests/` | 8 tests in the voice-router file |
| `npm run type-check:backend` | TypeScript | Clean |
| `npm run lint:backend` | ESLint | Clean |

The backend tests mock Cosmos, Blob, Supabase and outbound HTTP, so they need no credentials. **The extension has no automated tests.**

### 12.2 Production checks

Both scripts are read-only and run against the live API:

- `node --env-file=.env backend/scripts/lang-smoke-check.mjs` — translation and audio for every language.
- `node --env-file=.env backend/scripts/analytics-check.mjs` — recent usage from the `sessions` container.

### 12.3 Manual extension test

Load it: `chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`. After any code change, click reload on the extension card **and** reload the page under test.

Use the demo path so you do not touch a real school: on the language screen choose **Try a demo**, then a language.

Onboarding
- [ ] Language is the first screen, with English last
- [ ] Right-to-left languages show their names right-aligned
- [ ] School search filters as you type; the demo school is not listed
- [ ] Grade screen, then a ready screen with a code; reloading does not show onboarding again
- [ ] Demo path goes straight to ready

Lookup and audio
- [ ] Highlight a word: the card shows the translation and a listen button
- [ ] Listen: the button shows loading, audio plays, the button becomes replay
- [ ] Replay makes no new `tts-router` call (Network tab)
- [ ] Highlight a paragraph: it is translated as a passage, not looked up as one term

Read-along glow
- [ ] Play a multi-sentence passage: the glow follows the voice
- [ ] Pause clears the glow; resume picks up correctly
- [ ] Check an RTL language and Burmese
- [ ] Check reading speeds other than 1.0
- [ ] A sentence containing "3.5" is read as one number

Glossary and flags
- [ ] Words are ordered hardest first; words of three or more syllables show a count
- [ ] Switching grade tiers is instant
- [ ] The flag button is easy to see and shows a check after use
- [ ] Closing the card returns the toolbar status to "Active"

Popup and help
- [ ] New tab and Chrome Web Store: the popup shows the "can't run on this page" note, toggles move and stay, Help opens the help page
- [ ] Normal page: no note, Help opens the in-page guide
- [ ] Support opens the help page at the support section

Talk to Teacher
- [ ] Opens from the toolbar or Alt+Shift+T; microphone prompt appears
- [ ] Speak, stop: transcript, translation and spoken translation
- [ ] The other direction works
- [ ] Denying the microphone and staying silent both give friendly messages

Resilience
- [ ] Reload the extension without reloading the page: a "reload this page" banner appears instead of console errors

Not testable yet because the backend work is not done: joining by class code, demo tagging, seat enforcement, blocking expired schools, onboarding screens in the student's language.

Report bugs with the page URL, steps, expected and actual result, and any red console errors (extension logs are prefixed `LB`).

---

## 13. Deploy and operations

- **Live API:** function app `languagebridge-api` in resource group **`languagebridge-ce`**. The `AZURE_RESOURCE_GROUP` value in `.env` names a different, stale app. Use `-g languagebridge-ce`.
- **Deploy:** `bash scripts/deploy-backend.sh`. It builds, stages with production dependencies, publishes and health-checks. Deploy from `main` after CI passes, then run the language smoke check.
- **Settings on the live app** (names confirmed 10 October 2026): `LB_API_KEY`, `LB_SUPERADMIN_EMAILS`, `AZURE_TTS_KEY`, `AZURE_TTS_REGION`, `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION`. `LB_TTS_SERVICE_URL` is not set.
- **CI** (`.github/workflows/ci.yml`): runs on pushes to `main` and pull requests to `main`. It fails on any high or critical dependency advisory, including in dev tools, before tests run.
- **Dependency fixes:** `npm audit fix` crashes on this repo. Use `npm update <package>`.
- **Extension release:** bump `version` in `extension/manifest.json` in its own commit, zip `extension/`, upload to the Chrome Web Store.
- Storage account and Speech resource names in older documents disagree with each other and were not re-checked. Look them up in the Azure portal.

---

## 14. Decisions and why

Change these only with the reason in view.

| Decision | Why |
|---|---|
| Serverless Azure Functions | Pilot load is spiky. Pay per request, nothing to patch, and a small uniform surface that touches data |
| Pseudonymous student codes | We cannot leak what we never hold. This is the basis of the FERPA position |
| PII rejected at the API boundary | A front-end bug that sends a name is refused before any write |
| Shared key for students, JWT for adults | Students must get help mid-lesson without an account. Teachers and admins need real identity and permissions |
| Keys at a server-side edge | A key in a public bundle can be taken by anyone who views source |
| Rate limits counted in Cosmos | In-memory counters do not work across multiple function instances |
| Flags scrubbed, not Azure-free; training human-only | Recognition flags need the misheard transcript to be fixed, but machine output never enters training data or ownership claims (`flywheel/TRAINING-DATA-POLICY.md`) |
| Dialects are variants with a fallback chain | One entry per real difference, never a copy per dialect; chains never cross languages, so Dari never falls back to Persian (`flywheel/VARIANTS.md`) |
| `flagType` on every flag | Tells a future interpreter whether to re-record audio or fix text |
| Bridge glosses are inline anchors | A reader needs a word that fits the sentence, not a paragraph |
| Machine translations cached on first miss | The first lookup of an unknown term is slow; every later one is instant |
| Azure voices as the floor | Every language always has some voice, whatever happens to our own |
| Talk to Teacher as a web app first | One codebase, installable on both phone platforms, no store review |
| Over-seat means grace and a flag, never a lockout | Locking a newcomer out mid-lesson is the wrong failure |
| A language is only "supported" after the live smoke check | Five languages were once listed that did not work |

---

## 15. History in brief

1. **Scaffold.** A monorepo with `backend/`, `extension/`, `pwa/` and `ml-pipeline/`. `pwa/` was never touched again.
2. **Backend core.** Shared types, clients and validators first, then the functions one by one.
3. **Custom voices, first attempt.** A Kokoro fine-tuning pipeline and a push toward 22 languages, with a long debugging trail on Apple Silicon.
4. **The pivot.** Kokoro training code was deleted. Azure Speech became the production voice path, and `ml-pipeline/` became a parked research track. That is why it exists but is not deployed.
5. **Hardening.** Multi-tenancy, the dashboard endpoint, distributed rate limiting, the clean flag pipeline, pseudonymous onboarding, and the Talk to Teacher backend.
6. **The language correction.** Documents claimed 21 or 22 languages. In June 2026 five that did not work were removed, leaving 16.
7. **The extension joins the repo.** Prentice Howard's extension was copied in and has been developed here since. The old `feat/prentice-extension-rebuild` branch has unrelated history; do not merge it.
8. **Company documents.** The canonical company set in `company/` was written in September 2026.
9. **October 2026.** Amharic and Uzbek restored and live (18 languages), Dari given a working voice and real Dari translation, the QA bug sheet worked through, the read-along glow added, and these documents consolidated.

Commit-level detail is in `git log` and in `docs/dev-notes/`.

---

## 16. Roadmap and open decisions

| When | What | Spec |
|---|---|---|
| Now | Test the extension changes in Chrome; next Web Store release (brings Amharic and Uzbek to students); test Talk to Teacher in Amharic, Uzbek and Dari; Dari speaker review | `docs/dev-notes/` |
| Next | Licence record and enforcement at enrolment (seats, term, status, demo) | `company/PROVISIONING-AND-LICENSING.md` |
| During pilot | Admin terminal for flag triage, and an audit log | `docs/PRD-ADMIN-DATABASE.md` |
| Now | Lexicon flywheel Phase 1: deploy capture + admin queue, run the bootstrap backlog | `flywheel/PHASES.md` |
| After pilot | Lexicon flywheel Phases 2–5: paid linguists, two-approval gate, sound overrides, marketplace | `flywheel/SPEC.md` |
| After pilot | Our own voices behind `LB_TTS_SERVICE_URL`; automated deploys | `ml-pipeline/` |

Decisions waiting on Justin:

1. **Small purchases.** The minimum order for a tutor or a district buying for a few students.
2. **Selling to individuals.** Whether to do it now, and on what privacy footing.
3. **Individual pricing.** A subscription with a speech allowance, or prepaid credits.
4. **Licence holder naming.** Whether "school" becomes "licence holder" in code. This should be settled before the cleanup renames anything in onboarding or the dashboard.
5. **New voices.** Haitian Creole, Kinyarwanda and Hmong need our own voices. Meta's MMS models for the first two are downloaded locally for evaluation only; their licence is non-commercial.
6. **Dependency gate.** Whether CI should fail on advisories in dev tools or only in what ships.

---

## 17. Known issues and cleanup list

Found while reconciling. None are fixed by this document.

| Item | Where |
|---|---|
| Root `package.json` lists `extension`, `pwa` and `ml-pipeline` as workspaces; none has a `package.json` | `package.json` |
| `pwa/` is four empty folders, and `dev:pwa` and `build:pwa` scripts point at it | `pwa/`, `package.json` |
| `backend/tests/` duplicates `backend/__tests__/`; Jest only runs `__tests__` | `backend/tests/` |
| `tests/e2e/` is empty | `tests/e2e/` |
| `.env.example` carries variables the backend never reads | `.env.example` |
| Stale comments saying "21 languages" | `translate/index.ts`, `speech-to-text/index.ts` |
| `CONFIG.version` is hard-coded to `2.0.0` | `extension/config.js` |
| The extension allows 90 audio requests a minute; the backend allows 60 | `extension/config.js`, `tts-router/index.ts` |
| `COSMOS_DB_DATABASE` is missing from the startup check | `backend/shared/env-validation.ts` |
| Two PDFs and old extension zips sit in the repo root and `build/` | repo root |
| `docs/DPA-V2-DRAFT.md` still describes 21 languages | that file |
| Sentence splitting still breaks on abbreviations such as "U.S." | `extension/content/toolbar-audio.js` |

---

## 18. Document map

### Replaced by this document (deleted)

`docs/TECHNICAL-OVERVIEW.md`, `docs/BACKEND-ARCHITECTURE.md`, `docs/ENGINEERING-FIELD-GUIDE.md`, `docs/NEW-DEV-BACKEND-SETUP.md`, `docs/TESTING-UNPACKED-EXTENSION.md`, `docs/HISTORY.md`. They remain in git history. `README.md` is now a short entry point that links here.

### Kept separate, and why

| Documents | Why they stay separate |
|---|---|
| `company/` (canonical facts, pricing, provisioning, cost model, DPA template, FAQ, security overview, send checklist) | Different audience. Several are sent to districts as they are, and the DPA is a signable template |
| `docs/compliance/` | Formal plans that districts and auditors ask for one at a time |
| `docs/DPA-V2-DRAFT.md` | A legal draft awaiting review |
| `docs/PRD-ADMIN-DATABASE.md` | Specification for things not built yet |
| `flywheel/` | The Lexicon flywheel project: spec, data model, Dual Codex, phases, open decisions. Replaced `docs/PRD-ML-FLYWHEEL.md` (deleted Oct 2026) |
| `docs/dev-notes/` | Dated notes per change. A log, not a reference |
| `deliverables/` | Text that is pasted into the Chrome Web Store and the PWA hand-off |

`docs/LANGUAGEBRIDGE-MASTER-BLUEPRINT.md` exists only on Justin's machine (it is gitignored) and dates from March 2026. Treat it as historical.

### Keeping this current

- A pull request that changes a function, route, limit, container, environment variable or language updates this document in the same pull request.
- Section 2 and the "last reconciled" date are updated at each release.
- New facts go in one place. If something belongs in `company/`, link to it instead of copying it.
