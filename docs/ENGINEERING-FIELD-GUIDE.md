# LanguageBridge Engineering Field Guide

**LanguageBridge LLC | Confidential | September 2026**

How the platform is built, the decisions behind it, and what we're building next — the one document a new engineer reads before touching the code. This is the orientation layer; the domain docs in `docs/` are the authority on their own subjects, and where they conflict with this page, **they win** (and this page should be updated).

> A companion, readable/shareable version of this document is published as an artifact:
> https://claude.ai/code/artifact/1007a42c-8faf-4282-a3fc-4bf8233cf859

---

## At a Glance

| | |
|---|---|
| Status | Pilot / pre-launch |
| Backend | Azure Functions (TypeScript), serverless |
| Azure Functions | 9 endpoints |
| Cosmos DB containers | 8 |
| Languages supported | 16 (15 fully native; Dari via Persian) |
| Lexicon | ~127,590 RBERN terms + ~1,080 bridge glosses |
| Clients | Chrome extension, `languagebridge.app` (PWA + marketing) |

---

## 1. What it is

LanguageBridge is a comprehension tool for K-12 English learners. A student selects any text on any page and sees it in their home language with read-aloud audio; hard academic terms come with a short *simple-English* scaffold rather than just a translation; and a two-way voice feature, **Talk to Teacher**, lets a student and teacher hold a spoken conversation across languages on one device.

The product is delivered as a **Chrome extension** (the primary surface, where students read) and a **web dashboard, companion app, and marketing site** at `languagebridge.app`. Both speak to one shared Azure serverless backend. (An earlier separate marketing domain, `pierlearning.com`, is no longer being pursued — marketing lives on `languagebridge.app`.)

Sixteen languages are supported end-to-end: Arabic, Burmese, Dari, English, French, Nepali, Pashto, Persian, Portuguese, Somali, Spanish, Swahili, Tagalog, Ukrainian, Urdu, and Vietnamese. Fifteen have fully native translation + audio; **Dari** works via Persian for both speech synthesis and recognition (shared script, ~80% mutual intelligibility).

**The single job:** a student hits a word they don't know in an English assignment and, in one action, understands it — in their language, with sound, without leaving the page.

---

## 2. System at a glance

Every client is a thin presentation layer over the same contract. No client holds a database connection or a service key; requests flow down through an auth edge into stateless Azure Functions, which are the only tier that touches data and third-party AI services.

```
CLIENTS        Chrome Extension (MV3)   languagebridge.app (PWA: dashboard + /teacher + marketing)
                    │
EDGE & AUTH    background.js proxy (injects x-lb-api-key) │ Supabase edge proxy (/teacher) │ Supabase Auth (JWT)
                    │
BACKEND        Azure Functions (TypeScript):
               lexicon-lookup · translate · tts-router · speech-to-text · analytics-writer
               dashboard · flag-handler · onboarding · auth-layer
                    │
DATA & AI      Cosmos DB (languagebridge-prod) · Blob (audio cache) · Azure Translator
               Azure Speech (TTS + STT) · Piper / Kokoro (Container App)
```

The shape matters: because the functions are the sole data-touching tier, *compliance, rate-limiting, and secret custody all live in one place*. A new client is safe to build the moment it can make an HTTPS POST — it inherits every guarantee below for free.

---

## 3. The backend

Each function lives in `backend/azure-functions/<name>/index.ts` and shares one library of validators, an auth helper, and typed Cosmos clients in `backend/shared/`. Every handler follows the same spine: **validate auth → validate input → rate-limit → do the one thing → return**. None store request payloads unless that is explicitly their job.

| Function | Purpose | Auth | Notes |
|---|---|---|---|
| **lexicon-lookup** | Single academic term → native cognate + simple-English bridge gloss + audio URL. | app key | Reads the `lexicon` container; falls back to `translate` on a miss. |
| **translate** | Arbitrary text between any two supported languages. | app key | Azure Translator. Used for sentences and lexicon misses. |
| **tts-router** | Text → audio URL. Cache hit returns URL; miss generates, caches, returns. | app key | Proprietary voices first via `LB_TTS_SERVICE_URL`, else Azure. Dari→Persian. |
| **speech-to-text** | Microphone audio → transcribed text (Talk to Teacher). | app key | Pure pass-through to Azure STT. Never stored. 16 kHz WAV, 4 MB cap. |
| **analytics-writer** | Logs anonymous session events to Cosmos. | app key | Rejects any payload containing PII before writing. |
| **dashboard** | Teacher/admin analytics queries, school-scoped. | Supabase JWT | Requires `view_dashboard`; runs canned reporting queries. |
| **flag-handler** | Captures student-reported translation problems. | app key | Seed of the future correction + interpreter flywheel. |
| **onboarding** | Enrollment: issues the student code, stores school/grade. | app key | Writes the `enrollments` container. |
| **auth-layer** | Resolves a Supabase identity to permissions + super-admin. | Supabase JWT | Allowlist via `LB_SUPERADMIN_EMAILS`. Shared by dashboard. |

Shared modules in `backend/shared/`: `validators.ts`, `auth-helpers.ts`, `cosmos-client.ts`, `blob-client.ts`, `reporting-queries.ts`, `types.ts`, `config.ts`, `env-validation.ts`, `voice-config.json`.

---

## 4. Data & the lexicon

State lives in one Cosmos database, `languagebridge-prod`, split by concern. Accessors are in `backend/shared/cosmos-client.ts` — never construct a client anywhere else.

| Container | Holds |
|---|---|
| **lexicon** | The bilingual glossary — the heart of the product. Terms with cognate, bridge gloss, audio, subject. |
| **sessions** | Anonymous analytics events (session_start/end, term_lookup, tts_play, glossary_view, flag_event). |
| **enrollments** | Student enrollment records (code, school, grade band). No names. |
| **flags** | Student-reported translation problems awaiting triage. |
| **pilots** | Pilot / school configuration. |
| **admin_users** | Dashboard identities and super-admin flags. |
| **audio_cache_metadata** | Index of generated TTS clips in blob storage (dedupe by text hash). |
| **analytics** | Aggregated/derived reporting data. |

**What the lexicon actually contains.** The glossary was seeded from the NYU Steinhardt **RBERN** bilingual term collections — roughly **127,590 terms across 17 languages**. On top of that sit ~1,080 hand-built **bridge glosses**: 1–3 word simple-English drop-ins that fit inside the sentence, not dictionary definitions. "Photosynthesis (light-feeding)", not a paragraph. That inline design is deliberate and covers ~95% of student term encounters by frequency; the long tail falls through to `translate`.

---

## 5. Auth & privacy

There are exactly two auth models, and knowing which applies to a function tells you almost everything about it.

**Student endpoints — a shared app key.** The translate/lexicon/tts/stt/analytics functions authenticate with a single shared secret, `x-lb-api-key`, held server-side by the client's edge (the extension's `background.js`, or the PWA's Supabase proxy) and **never shipped to the browser**. They additionally require a well-formed `studentCode` (`LB-XXXX`) — but note it is only checked for shape and used as a rate-limit bucket; there is no enrollment lookup. That is intentional: it keeps the student path low-friction and privacy-preserving.

**Admin endpoints — Supabase JWT + allowlist.** The dashboard and auth-layer require a real Supabase-issued JWT and a permission (`view_dashboard`). Super-admin is allowlist-based via `LB_SUPERADMIN_EMAILS` — if that env var is empty, *no one* can sign in, which is a known deploy gotcha.

**PII never enters the system.** FERPA/COPPA compliance is enforced in one place — `backend/shared/validators.ts` — not sprinkled through handlers. Before `analytics-writer` stores anything, `checkForPII` scans both field names and free-text *values* and rejects the write if it finds an email, name, ID, phone, address, DOB, SSN, IP, or device ID. Selected text and microphone audio are sent to Azure for processing and immediately discarded; the student code is a random string, not an identity.

---

## 6. Speech pipeline

**Text-to-speech (three tiers).**
- **Piper** — pre-trained MIT-licensed voices for 13 languages, natural quality, the default.
- **Kokoro fine-tunes** — for the handful of languages with no Piper voice (e.g. Burmese, Tagalog), trained from scratch in `ml-pipeline/`.
- **Azure fallback** — all 16 languages, used whenever the proprietary service is unreachable.

`tts-router` tries the proprietary service (`LB_TTS_SERVICE_URL`, an Azure Container App fed from registry `languagebridgeacr`) first, then Azure. Several languages ride a related-language voice model (Pashto→Persian, Urdu→Arabic, Somali→Swahili) — working audio today, bespoke voices later.

**Speech-to-text (Talk to Teacher).** Azure's STT REST endpoint needs a specific format, so the client records the mic and transcodes to **16 kHz mono 16-bit PCM WAV** before sending base64 to `speech-to-text`. That transcode — plus peak/clip level analysis for "I didn't hear you / too noisy" diagnostics — is the reusable core carried between the extension and the PWA.

---

## 7. The clients

**Chrome extension (MV3).** The load order in `extension/manifest.json` is the mental model: a logger and `config.js`, then the shared `LBState` manager, then services (`lb-translation-service`, `lb-tts-service`, `lb-stt-service`, `lb-analytics`), then the UI (`toolbar`, `toolbar-tooltip`, `toolbar-flag`, `floating-translator`). `background.js` is the service worker that proxies every API call and injects the key. Microphone capture for Talk to Teacher runs in an **offscreen document** because MV3 content scripts can't reliably use `getUserMedia`.

**languagebridge.app/teacher — the PWA clone.** Talk to Teacher is being cloned to a `/teacher` route on the Lovable-built PWA (the extension copy stays untouched). The port *simplifies*: a real page calls `getUserMedia` directly, so the offscreen/background machinery disappears; the WAV transcode carries over verbatim; and audio plays via an `<audio>` element (no CORS). The one rule that cannot bend: a public web app must not embed the app key, so it calls a **Supabase edge proxy** that injects it server-side. The package lives in `deliverables/talk-to-teacher-pwa/`.

---

## 8. Decisions & why

These are the decisions a new engineer will otherwise re-litigate. Each was made deliberately; change them only with the reason in view.

**Serverless Azure Functions, not a standing server.** Pilot load is spiky and unpredictable. Pay-per-request auto-scaling with no servers to patch is the right risk profile before demand is proven — and it keeps the data-touching surface tiny and uniform.

**Keys live at a server-side edge, never in the client.** The extension hides `x-lb-api-key` in `background.js`; the PWA uses a Supabase edge proxy. A public bundle that embeds the key can be drained by anyone who views source. This single rule dictates the shape of every client.

**Two-tier auth: shared key for students, JWT for admins.** Students shouldn't need accounts to get help mid-lesson, and we deliberately don't want to hold their identities — so the student path is a shared key + a shape-checked code used only for rate-limiting. Teachers/admins *do* need real identity and permissions, so that path is full Supabase JWT auth.

**Bridge glosses are inline drop-ins, not definitions.** A student reading a sentence needs a word that fits the sentence, not a paragraph to parse. 1–3 word anchors preserve reading flow and are why the product feels like comprehension support rather than a dictionary.

**Piper > Kokoro, with Azure as the floor.** Pre-trained Piper voices sound better than fine-tuned Kokoro with less effort, so Kokoro is reserved for the languages with no Piper option. Azure underneath guarantees every language always has *some* voice.

**Talk to Teacher goes PWA-first, not native.** A PWA installs to the home screen on both platforms and reuses the whole web stack; a native app is a second codebase and two store reviews for a pre-pilot team. If store presence is wanted later, the PWA *wraps* — it isn't rewritten.

---

## 9. Environments & ops

- The live API is the app `languagebridge-api` in resource group **`languagebridge-ce`** — *not* `languagebridge-rg`. The `AZURE_RESOURCE_GROUP` value in `.env` is misleading and points at a stale app; use `-g languagebridge-ce` for az commands against production.
- Secrets and config live in the Function App settings: `LB_API_KEY` (set), `LB_SUPERADMIN_EMAILS` (the dashboard-login gate), `LB_TTS_SERVICE_URL`, Cosmos and Azure Speech keys. `LB_ALLOW_INSECURE_DEV` is local-only and must never be set in a deployed env.
- Cosmos: database `languagebridge-prod`. Blob: the audio cache the TTS router writes.
- Backend deploys are currently manual via `scripts/deploy-backend.sh` (CI/CD is on the roadmap).

**Ground-truth tooling (no dashboard required).** Two read-only Node scripts give a fast, repeatable read on production health without any UI:
- `backend/scripts/lang-smoke-check.mjs` — per-language translate + audio matrix. Latest run: 16/16 translate, 15/16 audio (Dari via Persian).
- `backend/scripts/analytics-check.mjs` — reads the `sessions` container directly and prints usage: active students, lookups, audio plays, daily activity.

---

## 10. Roadmap — what we'll build to connect it all

The near term is about shipping cleanly; the longer arc turns the flag system and the voice pipeline into a data flywheel that improves the lexicon and opens a marketplace.

| When | Status | What |
|---|---|---|
| Now → Oct | In progress | **Conference launch & store submission** — OHIO TESOL demo (live extension + Talk to Teacher), Chrome Web Store submission, and the `/teacher` PWA deploy via the Supabase proxy. Gated on the mic privacy disclosure going live and a hardware test of the voice loop. |
| Pilot wks 4–8 | Planned | **Admin terminal + audit log** — a triage UI over the `flags` container plus a compliance audit log. Spec: `docs/PRD-ADMIN-DATABASE.md`. |
| Pilot wks 8–16 | Planned | **Interpreter marketplace** — human interpreters claim/submit/approve flagged terms (Stripe Connect), feeding corrections back into the lexicon. Spec: `docs/PRD-ML-FLYWHEEL.md`. |
| Post-pilot | Planned | **Custom voice deployment & CI/CD** — ship the Piper/Kokoro Container App as the proprietary TTS behind `LB_TTS_SERVICE_URL`, retiring related-language substitutions, and replace manual deploys with a pipeline. |

**How it connects:** `flag-handler` captures a bad translation → the admin terminal triages it → the marketplace routes it to a human → the correction lands in the `lexicon` container → every client gets a better answer on the next lookup. The voice pipeline follows the same arc: Azure fallback today, bespoke Piper/Kokoro voices tomorrow, same `tts-router` contract throughout.

---

## 11. Repo & docs map

**Repository layout**
- `backend/azure-functions/` — the 9 functions · `backend/shared/` — validators, auth, Cosmos/blob clients, types
- `extension/` — the Chrome extension (MV3) · `pwa/` and `deliverables/talk-to-teacher-pwa/` — the web/PWA work
- `ml-pipeline/` — Piper/Kokoro voice training & inference · `data/` — glossaries and the standards pipeline
- `backend/scripts/` — smoke & analytics tooling · `scripts/` — deploy

**Deeper internal docs**
- `docs/HISTORY.md` — phase-by-phase build history (why things are shaped the way they are)
- `docs/LANGUAGEBRIDGE-MASTER-BLUEPRINT.md` — product + system blueprint
- `docs/BACKEND-ARCHITECTURE.md` — backend deep dive · `docs/TECHNICAL-OVERVIEW.md` — overview
- `docs/PRD-ADMIN-DATABASE.md`, `docs/PRD-ML-FLYWHEEL.md` — the two roadmap specs
- `docs/compliance/` — FERPA/COPPA, data-flow diagram, incident response, NIST-CSF mapping, risk assessment

*This field guide is the orientation layer; those documents are the authority on their own domains. When they disagree with this page, they win — and this page should be updated.*
