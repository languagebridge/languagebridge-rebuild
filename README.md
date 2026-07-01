# LanguageBridge

> **Read this first.** This is the canonical "start here" document for any human or AI agent working on LanguageBridge. It tells you exactly where the project is, what's been built, what's planned, and where to look for everything else.

---

## What LanguageBridge Is

LanguageBridge is a Chrome extension that gives K-12 English Language Learners instant, culturally aware translations of academic vocabulary in their home language. A student highlights a word on any webpage, and LanguageBridge returns:

- A plain-English **bridge definition** that explains the concept (not just the translation)
- The word's **cognate** in the student's home language script
- **Native-speaker audio** they can tap to hear pronunciation
- **Grammatical forms** (noun/verb/adjective) for academic use

It supports **21 languages** today (Haitian Creole in training as the 22nd), specifically including the refugee/immigrant languages that other tools handle poorly: Dari, Pashto, Twi, Kinyarwanda, Tigrinya, Burmese, Somali, Swahili, Amharic.

The product has three features:

1. **Highlight & Hear** — student highlights a word, gets bridge + cognate + audio
2. **Academic Glossary** — searchable K-12 vocabulary library with audio
3. **Talk to Teacher** — student speaks in their home language, teacher reads English; teacher types English, student reads home language with audio

---

## What Makes This Different

Every translation tool on the market is a thin wrapper around Google or Azure. They have no defensibility — anyone can swap out their LLM tomorrow.

LanguageBridge's defensibility comes from a **closed-loop human-in-the-loop ML system** (currently being designed, see `docs/PRD-ML-FLYWHEEL.md`):

1. Students flag bad translations and audio in real classroom contexts
2. Verified human interpreters fix them through a marketplace
3. Their corrections become training data for proprietary voice models
4. Each generation of our models is provably better than Azure's stock voices for refugee/immigrant languages
5. Lexicon and audio quality compound over time in ways competitors cannot copy without our flag data

**Today we have step 1 (flag capture) built. Steps 2-5 are the post-pilot roadmap.**

---

## Where We Are Right Now (April 2026)

### ✅ Built and live in production

| Component | Status | Where |
|---|---|---|
| 10 Azure Functions endpoints | Live at `https://languagebridge-api.azurewebsites.net/api` | `backend/azure-functions/` |
| 117 tests across 11 suites | All passing | `backend/__tests__/` |
| Cosmos DB with 9 containers | Live, indexed, distributed rate limiting | `backend/shared/cosmos-client.ts` |
| 127,590 bridge definitions | Seeded across 21 languages | Cosmos `lexicon` container |
| Azure TTS for all 21 languages | Working with caching | `backend/azure-functions/tts-router/` |
| Azure Translator fallback | Auto-caches into lexicon on miss | `backend/azure-functions/lexicon-lookup/` |
| Speech-to-Text (Talk to Teacher) | Live, supports 18 of 21 languages | `backend/azure-functions/speech-to-text/` |
| Translate (Talk to Teacher) | Live, all 21 languages | `backend/azure-functions/translate/` |
| Flag system with type (pronunciation/translation) | Live | `backend/azure-functions/flag-handler/` |
| FERPA/SB-29 compliant analytics | Zero-PII, 16 prohibited fields rejected | `backend/azure-functions/analytics-writer/` |
| Onboarding (pseudonymous student codes) | Live, cryptographically unbiased | `backend/azure-functions/onboarding/` |
| Teacher auth (Supabase JWT) | Live | `backend/azure-functions/auth-layer/` |
| Dashboard analytics endpoint | API only, no frontend yet | `backend/azure-functions/dashboard/` |

### ⚠️ Built but untested with real users

| Component | What's missing |
|---|---|
| Talk to Teacher | Never tested with real microphone input — only unit tests with mocked audio |
| Flag escalation to bounty | Logic works in tests, no real student has triggered the 6+ threshold yet |
| All 22 languages | Tested via curl, never used by an actual native speaker |

### 🚧 In active development (not by this repo)

| Component | Owner | State |
|---|---|---|
| Chrome extension frontend | Prentice Howard (`feat/prentice-extension-rebuild` branch) | 7+ commits in, integrating against live backend |
| Talk to Teacher UI | Prentice | Just received endpoint docs — not started |
| Simplified flag UX (one-tap + type icons) | Prentice | Just received breaking-change spec |

### ❌ Not built — post-pilot roadmap

| Component | When | Where to find the spec |
|---|---|---|
| Interpreter Marketplace (Phase 3) | After pilot validates demand | `docs/PRD-ML-FLYWHEEL.md` |
| Admin terminal for flag triage | Phase 2 (during pilot) | `docs/PRD-ADMIN-DATABASE.md` |
| Customer transparency dashboard | Phase 3 (renewal prep) | `docs/PRD-ADMIN-DATABASE.md` |
| Audit log infrastructure | Phase 2 | `docs/PRD-ADMIN-DATABASE.md` |
| ML training corpus pipeline | Phase 4-5 | `docs/PRD-ML-FLYWHEEL.md` |
| Stripe Connect for interpreter 1099s | Phase 3 | `docs/PRD-ML-FLYWHEEL.md` |
| Custom Piper voice deployment | Post-pilot | `ml-pipeline/` (training scripts exist, not deployed) |
| CI/CD pipeline | Post-pilot | Currently manual via `scripts/deploy-backend.sh` |
| Pilot dry run | Before pilot launches | Not scheduled |

---

## Repo Structure

```
languagebridge-rebuild/
├── backend/                    ← Azure Functions backend (THE PRODUCTION SYSTEM)
│   ├── azure-functions/        ← 10 endpoint handlers
│   │   ├── lexicon-lookup/
│   │   ├── tts-router/
│   │   ├── flag-handler/
│   │   ├── analytics-writer/
│   │   ├── onboarding/
│   │   ├── auth-layer/
│   │   ├── dashboard/
│   │   ├── speech-to-text/     ← NEW (Talk to Teacher)
│   │   └── translate/          ← NEW (Talk to Teacher)
│   ├── shared/                 ← Cross-cutting infrastructure
│   │   ├── types.ts            ← API contracts (THE SOURCE OF TRUTH for shapes)
│   │   ├── cosmos-client.ts    ← Lazy-init Cosmos accessors
│   │   ├── blob-client.ts      ← Blob Storage with SAS URL signing
│   │   ├── validators.ts       ← PII checks, rate limiting, API key validation
│   │   ├── auth-helpers.ts     ← Supabase JWT resolution
│   │   ├── reporting-queries.ts← 10 dashboard SQL queries
│   │   └── voice-config.json   ← TTS voice mapping per language
│   ├── __tests__/
│   │   ├── unit/               ← 10 unit test files (one per endpoint + validators)
│   │   └── integration/        ← Full student-journey integration test
│   ├── index.ts                ← Entry point — imports all functions for runtime registration
│   ├── package.json
│   └── jest.config.js
│
├── extension/                  ← Chrome extension scaffold (Prentice's work happens on his branch)
├── pwa/                        ← Progressive Web App scaffold (not yet active)
├── ml-pipeline/                ← Custom Piper voice training (not deployed to prod)
├── data/                       ← Glossary seed data, Ohio standards pipeline
├── scripts/
│   ├── deploy-backend.sh       ← Manual deploy script
│   ├── seed-lexicon.ts         ← One-time bridge definition seeding
│   └── load-bridge-glosses.ts  ← Loads RBERN glossaries
│
├── docs/                       ← All design documentation
│   ├── README.md ← (you are here, but actually at repo root)
│   ├── BACKEND-ARCHITECTURE.md ← Investor/stakeholder overview
│   ├── TECHNICAL-OVERVIEW.md   ← Comprehensive technical reference
│   ├── PRD-ML-FLYWHEEL.md      ← THE DEFINING IP — interpreter marketplace + ML loop
│   └── PRD-ADMIN-DATABASE.md   ← Customer transparency + internal admin
│
└── README.md                   ← THIS FILE
```

---

## Architecture Decisions (Why Things Are The Way They Are)

| Decision | Reasoning |
|---|---|
| **Azure Functions (serverless)** | Pay-per-request, auto-scale, no servers to patch. Right call for unpredictable pilot load. |
| **Cosmos DB (NoSQL)** | Flexible schema for evolving lexicon entries; partition by language scales horizontally. |
| **Pseudonymous student codes (LB-XXXXXX)** | FERPA-by-design. We CAN'T leak student identity because we don't have it. |
| **PII rejection at API boundary** | Defensive engineering — even if a frontend bug sends a name, backend refuses it before any write. |
| **Distributed rate limiting via Cosmos** | In-memory rate limiters don't work across multiple Azure Functions instances. |
| **TOS-clean flag pipeline (only student input stored)** | Azure Translator/TTS output never enters bounty system — interpreter marketplace stays our own IP. |
| **`flagType` field on every flag** | Lets interpreters know whether to fix audio (re-record) or text (retranslate). |
| **Bridge definitions are language-agnostic English scaffolds** | One Ohio standards term yields scaffolding usable in all 21 languages — efficient curation. |
| **Cognates auto-cached on first translator fallback** | First lookup of an unknown term is slow (calls Azure); every subsequent lookup is instant. |
| **Two-tier voice quality (Piper + Azure)** | Piper for production-quality refugee languages (when trained); Azure as universal fallback. |
| **Audit log writes are synchronous, not fire-and-forget** | Compliance requires we never lose admin actions, even if it slows requests. |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Azure Functions v4 (Node.js 20, migrating to 24) |
| Language | TypeScript (strict mode) |
| Database | Azure Cosmos DB (NoSQL, 9 containers, composite indexed) |
| Blob Storage | Azure Blob Storage (TTS audio cache + planned interpreter audio) |
| Translation | Azure Translator (21 languages) |
| Speech | Azure Speech Services (TTS + STT) + Piper (post-pilot custom voices) |
| Auth | Supabase (teacher/admin JWTs) |
| Testing | Jest + ts-jest |
| Deployment | Azure Functions Core Tools via `scripts/deploy-backend.sh` (manual, no CI yet) |
| Future: Payments | Stripe Connect (for interpreter marketplace, not yet built) |

---

## Supported Languages (21 today, 22 with Haitian Creole post-pilot)

| Tier | Languages | TTS Engine |
|---|---|---|
| **Tier 1 (production)** | Arabic, French, Portuguese, Ukrainian, Vietnamese, Spanish, Persian, English | Azure today, Piper after training |
| **Tier 2 (beta, related-language model)** | Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi | Azure today, Piper proxies after training |
| **Tier 3 (Azure-only)** | Burmese, Uzbek, Amharic, Tagalog, Tigrinya | Azure (no Piper plan) |

**Coverage:** 95%+ of Ohio's K-12 ELL population.

**Speech-to-Text caveat:** Azure STT does not support Kinyarwanda, Twi, or Tigrinya. The Talk to Teacher feature works for 18 of 21 languages today.

---

## How To Run This Project

### Local development

```bash
# Install dependencies
npm install

# Run all tests (117 across 11 suites)
npx jest --config backend/jest.config.js

# Type check
npx tsc --noEmit --project tsconfig.backend.json
```

### Deploy to Azure

```bash
bash scripts/deploy-backend.sh
```

This compiles TypeScript → creates clean staging folder → installs production deps → publishes to `languagebridge-api` → health-checks.

### Required environment variables

See `backend/shared/config.ts` for the full validated list. At minimum:

```
COSMOS_DB_ENDPOINT
COSMOS_DB_KEY
COSMOS_DB_DATABASE             ← MUST be explicit, no fallback
AZURE_BLOB_CONN_STRING
AZURE_STORAGE_ACCOUNT
AZURE_STORAGE_KEY
LB_API_KEY
AZURE_TTS_KEY                  ← Required for tts-router and speech-to-text
AZURE_TTS_REGION
AZURE_TRANSLATOR_KEY           ← Required for cognate fallback and translate
AZURE_TRANSLATOR_REGION
SUPABASE_URL                   ← Required for teacher dashboard
SUPABASE_SERVICE_ROLE_KEY
```

The backend fails loud at startup if required vars are missing — no silent defaults.

---

## API Quick Reference

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /onboarding/schools` | API key | School picker for first install |
| `POST /onboarding/enroll` | API key | Generate pseudonymous student code |
| `POST /lexicon-lookup` | API key | Highlight & Hear — bridge + cognate + audio URL |
| `POST /tts-router` | API key | Generate audio for any text (cached) |
| `POST /flag-handler` | API key | Flag bad content (requires `flagType`) |
| `POST /analytics-writer` | API key | Log session events (zero PII) |
| `POST /speech-to-text` | API key | Talk to Teacher — transcribe student audio |
| `POST /translate` | API key | Talk to Teacher — translate arbitrary text |
| `POST /auth-layer` | Supabase JWT | Teacher/admin authentication |
| `POST /dashboard` | Supabase JWT | Teacher analytics (10 query types) |

For full request/response schemas, see `backend/shared/types.ts` (the canonical source of truth) or `docs/TECHNICAL-OVERVIEW.md` (human-readable).

---

## How The Flag System Works

This is the foundation of the future ML flywheel, so it's worth understanding deeply.

### Today

```
Student highlights "the pronunciation of فتوسنتز sounds wrong"
    ↓
POST /flag-handler {
  flaggedText, language, studentCode, timestamp,
  flagType: 'pronunciation' | 'translation'
}
    ↓
Backend SHA-256 dedup by (flaggedText + language)
    ↓
FlagDoc stored in Cosmos with:
  - flagCount (total)
  - pronunciationFlagCount (when ear icon tapped)
  - translationFlagCount (when mouth icon tapped)
  - status: logged → review (3+) → bounty (6+) → high_priority (10+)
    ↓
[STOP — nothing happens after this in the pilot]
```

### Post-pilot (planned, see PRD-ML-FLYWHEEL.md)

```
[Continued from above]
    ↓
Admin reviews bounty status flags in admin terminal
    ↓
Verified interpreter claims bounty in marketplace
    ↓
Interpreter submits corrected text + native audio recording
    ↓
Admin approves → 3 things happen automatically:
  1. LexiconDoc updated (cognate replaced, audio_source = 'interpreter')
  2. Audio archived to training-audio-corpus blob container
  3. Stripe payment triggered to interpreter
    ↓
ML pipeline pulls training corpus monthly to retrain Piper voices
    ↓
Next deployment of voice models is provably better than Azure baseline
    ↓
Defensibility compounds — competitors would need our flag data to replicate
```

---

## The Three Features and Their Current State

### 1. Highlight & Hear ✅ Production Ready

| Step | Backend | Frontend (Prentice) |
|---|---|---|
| Student highlights word | — | ✅ Working |
| Lookup bridge + cognate | ✅ `/lexicon-lookup` | ✅ Wired correctly |
| Get audio URL | ✅ Returned in lookup or via `/tts-router` | ✅ Wired correctly |
| Play audio | — | ✅ AudioContext + HTML5 fallback |
| Log analytics | ✅ `/analytics-writer` | ✅ All 7 event types wired |

### 2. Academic Glossary ✅ Production Ready

Same endpoints as Highlight & Hear. Rate limit on `/lexicon-lookup` was bumped to 300/min specifically to allow fast sequential glossary browsing without hitting 429s.

### 3. Talk to Teacher ⚠️ Backend Live, Frontend Not Started

| Step | Backend | Frontend |
|---|---|---|
| Capture audio from mic | — | ❌ Not built (MediaRecorder + base64 encoding) |
| Transcribe student speech | ✅ `/speech-to-text` | ❌ Not wired |
| Translate to teacher's English | ✅ `/translate` | ❌ Not wired |
| Teacher reply UI | — | ❌ Not built |
| Translate teacher to student | ✅ `/translate` | ❌ Not wired |
| Optionally speak teacher's reply | ✅ `/tts-router` | ❌ Not wired |

**Blocker:** Has never been tested end-to-end with real human audio. First real Dari speaker into the system will surface unknowns: latency feel, dialect handling, audio format compatibility.

---

## Open Questions That Need Answers Before Pilot Launch

1. **Will Talk to Teacher work in practice?** Untested with real audio. Needs a 30-minute smoke test before any classroom use.
2. **Where does the teacher dashboard live?** API exists, no UI built. Teachers in pilot will have no visibility into engagement.
3. **What's the pilot escalation path when something breaks?** Justin gets emailed? Slack channel? On-call rotation? Undefined.
4. **Bounty pricing.** $5/flag is a placeholder. Real interpreter rates need to be discovered during pilot.
5. **Interpreter recruitment.** Where do verified bilingual interpreters come from at scale? Refugee resettlement orgs? University ELL programs? Court interpreter registries?
6. **Pilot success metrics.** What does success look like at 4 weeks? At 12 weeks? Define before we start so we know if it's working.

---

## Roadmap Summary

| Phase | Window | Focus |
|---|---|---|
| **Phase 1: Pilot Launch** | Now → 4 weeks | Ship Chrome extension, get students enrolled, validate flag volume is meaningful |
| **Phase 2: Admin Terminal + Audit Log** | Pilot weeks 4-8 | Manual flag triage tool for LanguageBridge team, compliance audit log |
| **Phase 3: Interpreter Marketplace** | Pilot weeks 8-16 | Stripe Connect, claim/submit/approve workflow, lexicon updates |
| **Phase 4: ML Training Pipeline** | Month 5 | Approved interpreter audio → training corpus → Piper retraining |
| **Phase 5: Customer Transparency Dashboard** | Pre-renewal (~month 6) | School admin dashboards, export functionality, ROI metrics |
| **Phase 6: Custom Piper Voice Deployment** | Month 7+ | Replace Azure TTS with proprietary voices for trained languages |

---

## For AI Agents Picking This Up Cold

If you (Claude, ChatGPT, Cursor, or any future AI assistant) are reading this for the first time, here's what you need to know:

1. **Read these in order:**
   - This README (you're here)
   - `docs/TECHNICAL-OVERVIEW.md` — comprehensive technical reference
   - `docs/PRD-ML-FLYWHEEL.md` — the post-pilot vision (DEFINING IP)
   - `docs/PRD-ADMIN-DATABASE.md` — admin/compliance roadmap
   - `backend/shared/types.ts` — every API shape, source of truth

2. **The team:**
   - **Justin Bernard** — backend dev, CEO, decision maker
   - **Prentice Howard** — frontend dev, owns the Chrome extension on `feat/prentice-extension-rebuild`
   - **You (AI)** — pair programming partner; default to honest, specific feedback over cheerleading

3. **The branch model:**
   - `main` — production
   - `feat/v2-lexicon-tts-hardening` — Justin's active backend branch
   - `feat/prentice-extension-rebuild` — Prentice's active frontend branch
   - PRs land in `main` after pilot stabilizes

4. **Sacred rules:**
   - **Never store PII.** Names, emails, IDs, IPs, devices — none of it. Pseudonymous codes only.
   - **Never store Azure-derived content in flag/bounty pipeline.** Only student-input text.
   - **Never use silent defaults for env vars.** Fail loud at startup.
   - **Never write to Cosmos without composite-indexed query patterns.** Cost matters.
   - **Audit log writes are synchronous.** Compliance requirement.

5. **What to push back on:**
   - Adding new endpoints before pilot validates demand for existing ones
   - Building features without a real user who needs them this week
   - Anything that compromises the "zero PII" architectural property
   - Piper deployment ahead of pilot data telling us which languages need it
   - Marketplace work before Phase 2 (admin terminal) is in place

6. **What's defensible:**
   - The 21-language coverage including refugee languages (Pashto, Twi, Kinyarwanda, etc.)
   - The flag → interpreter → ML training loop (post-pilot)
   - The classroom-validated training data that competitors can't acquire
   - FERPA/SB-29 compliance as architectural property, not afterthought

7. **What's NOT defensible:**
   - The current product as a Chrome extension (anyone can build that)
   - Translation quality (we use Azure like everyone else, until Piper voices ship)
   - The 127k bridge definitions (mostly RBERN/Ohio standards data, available publicly)

---

## License

Proprietary. Copyright 2026 LanguageBridge LLC. All rights reserved.

---

## Contact

**Justin Bernard** — admin@languagebridge.app
