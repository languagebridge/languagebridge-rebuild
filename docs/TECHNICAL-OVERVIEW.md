# LanguageBridge Technical Overview

**LanguageBridge LLC | April 2026**

LanguageBridge is an AI-powered Chrome extension that gives K-12 English Language Learners instant, culturally aware translations of academic vocabulary in their home language. A student highlights a word on any webpage, and LanguageBridge returns a plain-English bridge definition, a native-script cognate, grammatical forms, and text-to-speech audio — all in under two seconds.

This document describes the backend architecture that powers the product.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Technology Stack](#technology-stack)
- [API Endpoints](#api-endpoints)
- [Data Architecture](#data-architecture)
- [Translation Pipeline](#translation-pipeline)
- [Text-to-Speech Pipeline](#text-to-speech-pipeline)
- [Flag & Interpreter Marketplace Pipeline](#flag--interpreter-marketplace-pipeline)
- [Security & Privacy](#security--privacy)
- [Rate Limiting](#rate-limiting)
- [Testing](#testing)
- [Deployment](#deployment)
- [Supported Languages](#supported-languages)

---

## Architecture Overview

The backend is a set of serverless Azure Functions written in TypeScript. Each function handles a single responsibility. There are no monolithic services, no containers to manage, and no servers to patch.

```
Chrome Extension (Student)
│
├─ GET  /onboarding/schools ──── School picker (first install)
├─ POST /onboarding/enroll ───── Generate pseudonymous student code
│
├─ POST /lexicon-lookup ──────── Bridge definition + native translation
├─ POST /tts-router ──────────── Text-to-speech audio generation
├─ POST /flag-handler ────────── Flag incorrect translations/audio
├─ POST /analytics-writer ────── Anonymous session event logging
│
Teacher Dashboard
│
├─ POST /auth-layer ──────────── Supabase JWT verification
└─ POST /dashboard ───────────── 10 analytics queries, school-scoped
```

Every student-facing request follows the same pattern: validate API key, check rate limit, validate input, execute business logic, return JSON. There are no session cookies, no login tokens, and no personally identifiable information stored anywhere in the system.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Azure Functions v4 (Node.js) |
| Language | TypeScript (strict mode) |
| Database | Azure Cosmos DB (NoSQL, 9 containers) |
| Blob Storage | Azure Blob Storage (audio cache) |
| Translation | Azure Translator (21 languages, Haitian Creole in training) |
| Speech | Azure Speech Services + Piper TTS (proprietary voices) |
| Auth | Supabase (teacher/admin JWTs) |
| Deployment | Azure Functions Core Tools via deploy script |

### Codebase

| Metric | Count |
|--------|-------|
| Backend source (TypeScript) | 2,803 lines |
| Test code | 1,858 lines |
| Test suites | 9 (8 unit + 1 integration) |
| Tests | 96 |
| Azure Functions | 8 endpoints |
| Cosmos DB containers | 9 |
| Commits on feature branch | 48 |

---

## API Endpoints

### Student Endpoints

All student endpoints require an API key via the `x-lb-api-key` header. Students are identified by pseudonymous codes (e.g., `LB-7K2M`), never by name, email, or device ID.

#### `POST /lexicon-lookup`

The core endpoint. A student highlights a word, and the system returns a bridge definition — a plain-English explanation designed to scaffold understanding across languages.

**Request:**
```json
{
  "term": "photosynthesis",
  "language": "dari",
  "studentCode": "LB-7K2M",
  "context": "science"
}
```

**Response (bridge hit):**
```json
{
  "term": "photosynthesis",
  "language": "dari",
  "type": "bridge",
  "cognate": "فتوسنتز",
  "bridge_anchor": "light-feeding",
  "bridge_scaffold": "the way green plants turn light, water, and air into food they can use",
  "grammatical_forms": {
    "noun": "plant food-making from light",
    "verb": "to make food from light",
    "adjective": null
  },
  "subject": "science",
  "grade_band": "6-8",
  "source": "lexicon"
}
```

**Response (translator fallback):**
```json
{
  "term": "bureaucracy",
  "language": "dari",
  "type": "cognate",
  "cognate": "بوروکراسی",
  "bridge_anchor": null,
  "source": "translator_fallback"
}
```

The `type` field tells the frontend exactly how to render: `"bridge"` means show the full scaffold UI, `"cognate"` means show just the translation. This distinction is computed from actual content — an entry with no bridge phrases is always labeled `"cognate"`, even if it came from the lexicon.

#### `POST /tts-router`

Converts text to speech. Tries proprietary Piper TTS first (13 languages with custom-trained voices), falls back to Azure Speech Services (all 21 languages). Every generated audio file is cached in Blob Storage and deduplicated by SHA-256 hash.

Returns a signed SAS URL (1-hour read-only expiry) that the browser plays directly.

#### `POST /flag-handler`

Accepts flags on translations or audio — a single word, a sentence, or up to 500 characters of highlighted text. Deduplicates by SHA-256 hash of (text + language). Escalates automatically based on community consensus:

| Flag Count | Status | Action |
|-----------|--------|--------|
| 1-2 | `logged` | Recorded, no action |
| 3+ | `review` | Enters human review queue |
| 6+ | `bounty` | Posted to interpreter marketplace |
| 10+ | `high_priority` | Urgent escalation |

#### `POST /analytics-writer`

Logs anonymous session events: `term_lookup`, `scaffold_view`, `tts_play`, `flag_event`, `session_start`, `session_end`, `glossary_view`. PII is rejected at the API boundary before any write.

#### `GET /onboarding/schools` and `POST /onboarding/enroll`

First-install flow. The student picks a school, grade band, and language. The system generates a pseudonymous code (e.g., `LB-7K2M`) using cryptographically unbiased rejection sampling (32-character alphabet, no I/O/0/1 to avoid confusion).

### Teacher/Admin Endpoints

#### `POST /auth-layer`

Validates Supabase JWTs. Returns user context with pilot-level permissions. Super admin status is determined by the Cosmos DB `admin_users` record — email domain is used only for first-time bootstrap (auto-provisioned on first login, with 409 race condition handling).

#### `POST /dashboard`

Ten pre-built analytics queries, school-scoped. Teachers can only query schools their pilot IDs map to. Results are capped at 5,000 rows with a `truncated` flag. Queries run against composite indexes for performance.

---

## Data Architecture

### Cosmos DB (9 containers)

| Container | Partition Key | TTL | Purpose |
|-----------|--------------|-----|---------|
| `lexicon` | `/language` | — | 127,590 bridge definitions across 21 languages |
| `sessions` | `/language` | — | Anonymous analytics events (composite indexed) |
| `flags` | `/language` | — | Flagged content with escalation status |
| `enrollments` | `/schoolCode` | — | Student code to school mapping |
| `pilots` | `/id` | — | School metadata and configuration |
| `admin_users` | `/id` | — | Teacher/admin permissions |
| `audio_cache_metadata` | `/id` | — | TTS cache hit tracking |
| `analytics` | — | — | Fire-and-forget event stream |
| `rate_limits` | `/partitionKey` | 120s | Distributed rate limit counters (auto-expire) |

### Composite Indexes (sessions container)

Dashboard queries filter on `schoolCode + gradeBand + timestamp`. Without indexes, these are expensive cross-partition scans. Three composite indexes ensure efficient query execution:

```
(schoolCode ASC, gradeBand ASC, timestamp ASC)
(schoolCode ASC, gradeBand ASC, eventType ASC, timestamp ASC)
(schoolCode ASC, studentCode ASC, timestamp ASC)
```

### Azure Blob Storage

| Container | Content | Keying |
|-----------|---------|--------|
| `tts-audio-cache` | MP3/WAV audio files | `{language}/{SHA256(text+language)}.mp3` |
| `flag-data` | Flagged content exports | — |
| `model-weights` | Piper TTS model weights | Per-language directories |

---

## Translation Pipeline

The lexicon-lookup function implements a two-tier translation strategy:

```
Student highlights "photosynthesis" in Dari
    │
    ├─ Tier 1: Cosmos DB lexicon lookup
    │   ├─ Found with bridge? → Return bridge definition + cognate
    │   ├─ Found without cognate? → Backfill via Azure Translator (fire-and-forget persist)
    │   └─ Found without bridge? → Return as type: "cognate"
    │
    └─ Tier 2: Azure Translator fallback
        ├─ Translate term → Cache result in Cosmos DB
        └─ Return as type: "cognate" with source: "translator_fallback"
```

Cognates are backfilled on first lookup and persisted to Cosmos DB. The second request for the same term in the same language hits the lexicon directly — no translator call needed.

The bridge definitions themselves are language-agnostic English scaffolds generated by a standards-aligned pipeline from Ohio academic standards. They describe the concept in plain English, not the translation. The cognate is the translation; the bridge is the explanation.

### Bridge Definition Sources

| Source | Count | Content |
|--------|-------|---------|
| Ohio Standards Pipeline | ~1,080 terms x 21 languages | Bridge anchor, scaffold, grammatical forms |
| RBERN Bilingual Glossaries | 127,590 entries across 17 languages | Cognates (translations) |
| Azure Translator (auto-cached) | Grows with usage | Cognate-only fallback |

---

## Text-to-Speech Pipeline

```
POST /tts-router { text: "فتوسنتز", language: "dari" }
    │
    ├─ Cache check: SHA-256(text + language) → Blob exists?
    │   └─ Yes → Return signed SAS URL (cache hit)
    │
    ├─ Proprietary TTS (Piper, 13 languages)
    │   └─ Success → Upload to Blob → Write metadata → Return URL
    │
    └─ Azure Speech Services fallback (all 21 languages)
        └─ Success → Upload to Blob → Write metadata → Return URL
```

The metadata write is blocking with one retry. Without it, the cache entry is lost and audio would be regenerated on the next request.

### Voice Quality Tiers

| Tier | Languages | Engine |
|------|-----------|--------|
| Production | Arabic, French, Spanish, Portuguese, Ukrainian, Vietnamese, Persian | Piper (native models) |
| Beta | Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi | Piper (related-language proxy) |
| Azure-only | Burmese, Uzbek, Amharic, Tagalog, Tigrinya, English | Azure Speech Services |

---

## Flag & Interpreter Marketplace Pipeline

The flag system creates a quality improvement flywheel powered by community consensus and human interpreters.

```
Student flags content
    │
    └─ Flag handler stores ONLY:
        - Original highlighted text (student input, up to 500 chars)
        - Target language
        - contentSource: "student_input" (provenance tag)
        │
        ├─ Count 1-2: logged
        ├─ Count 3+: review (enters human review queue)
        ├─ Count 6+: bounty (posted to interpreter marketplace)
        └─ Count 10+: high_priority (urgent escalation)
            │
            └─ Interpreter fulfills bounty:
                - Provides correct translation
                - Records native-speaker audio
                - Replaces Azure placeholder in Lexicon DB
                - LexiconDoc status: auto_generated → approved
```

### TOS Compliance

Azure Translator and Azure Speech output are treated as ephemeral placeholders. The flag/bounty pipeline stores only student-generated input text — Azure-derived content is never forwarded to the interpreter marketplace. When an interpreter provides their translation and audio, it replaces the Azure placeholder with clean IP.

Every flag document carries a `contentSource: 'student_input'` provenance tag documenting the data origin.

---

## Security & Privacy

### FERPA/COPPA Compliance

Zero personally identifiable information is stored anywhere in the system:

- Students are identified by pseudonymous codes generated at onboarding (`LB-7K2M`)
- No names, emails, device IDs, IP addresses, or cookies are stored
- PII rejection is enforced at the API boundary — 16 prohibited fields are scanned recursively (to depth 5) before any database write
- A request containing any PII field receives `400 PII_VIOLATION` and is rejected before processing

### API Security

| Mechanism | Implementation |
|-----------|---------------|
| API key validation | Timing-safe comparison (prevents key-length leakage) |
| Rate limiting | Distributed Cosmos DB counters with TTL auto-cleanup |
| Rate limit fallback | In-memory sliding window when Cosmos is unavailable |
| Teacher auth | Supabase JWT verification with DB-backed permissions |
| School isolation | Teachers can only query schools their pilot IDs map to |
| Super admin | Cosmos DB `isSuperAdmin` field is source of truth |
| Blob URLs | Signed SAS tokens with 1-hour read-only expiry |
| Blob path validation | Regex + path traversal prevention on all blob names |

### Configuration

All required environment variables are validated at startup. Missing variables in production cause an immediate, descriptive error — no silent defaults to wrong databases or missing keys.

---

## Rate Limiting

Rate limiting uses distributed Cosmos DB counters, not in-memory maps. This works correctly across multiple Azure Functions instances.

```
Request arrives → compute window key (studentCode + minute boundary)
    │
    ├─ Cosmos DB: atomic increment on rate_limits/{key}
    │   ├─ count ≤ 100 → allowed
    │   └─ count > 100 → 429 RATE_LIMITED with retryAfterMs
    │
    └─ Cosmos unavailable → in-memory fallback (per-instance, best-effort)
```

Rate limit documents have a 120-second TTL and are automatically garbage-collected by Cosmos DB. No cleanup jobs needed.

---

## Testing

### Test Philosophy

Unit tests mock external dependencies (Cosmos DB, Blob Storage, Azure services) to verify business logic in isolation. Integration tests use in-memory stores simulating Cosmos DB to verify data flows correctly between functions.

### Coverage

| Suite | Tests | What it covers |
|-------|-------|---------------|
| validators | 22 | PII detection, language validation, text limits, student code format, API key timing-safe comparison |
| lexicon-lookup | 8 | Bridge hits, cognate-only, translator fallback, cognate backfill, input validation |
| tts-router | 9 | Cache hit, cache miss → Azure TTS, proprietary fallback, blob upload, metadata write |
| flag-handler | 10 | Create, escalation at all thresholds, 409 conflict retry, rate limit rejection, text length |
| analytics-writer | 7 | PII-first validation, all event types, Cosmos write failures |
| dashboard | 10 | School isolation, super admin access, all 10 query types, date validation |
| onboarding | 8 | School list, enrollment, collision retry, validation |
| auth-layer | 6 | JWT validation, DB-first permissions, super admin bootstrap, 409 race handling |
| **integration** | **7** | **Full student journey: schools → enroll → lexicon → TTS → flag → analytics → bounty escalation** |
| **Total** | **96** | |

### Running Tests

```bash
npx jest --config backend/jest.config.js
```

---

## Deployment

The backend deploys from a staging folder to Azure Functions via the Azure Functions Core Tools.

```bash
bash scripts/deploy-backend.sh
```

The script:
1. Compiles TypeScript to JavaScript
2. Creates a clean staging folder with production dependencies
3. Deploys to Azure Functions
4. Waits 15 seconds for cold start
5. Health-checks the endpoint
6. Cleans up the staging folder

There is no CI/CD pipeline yet — deploys are manual. The deploy script is idempotent and safe to run repeatedly.

---

## Supported Languages (21 live, Haitian Creole in training)

These 21 languages represent the most common home languages of ELL students in U.S. public schools, covering over 95% of the K-12 English learner population. Haitian Creole is in active training — the French Piper model serves as the base, fine-tuned on Creole data — and will ship as the 22nd supported language post-pilot.

| Tier | Languages | Count |
|------|-----------|-------|
| Tier 1 (Piper production) | Arabic, French, Portuguese, Ukrainian, Vietnamese, Spanish, Persian, English | 8 |
| Tier 1.5 (Piper beta) | Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi | 8 |
| Tier 2 (Azure-only) | Burmese, Uzbek, Amharic, Tagalog, Tigrinya | 5 |
| **Total** | | **21 + English** |

To add a new language: add the language code to the `SUPPORTED_LANGUAGES` array in `backend/shared/types.ts`. TypeScript will enforce it everywhere at compile time — every function, every validator, every type definition updates automatically.

---

## Infrastructure

| Service | Resource | Region | Purpose |
|---------|----------|--------|---------|
| Azure Functions | `languagebridge-api` | East US | All 8 API endpoints |
| Cosmos DB | `languagebridge-cosmos` | East US | 9 containers, composite indexed |
| Blob Storage | `languagebridgece8132` | East US | TTS audio cache |
| Azure Speech | `microspee` | East US | Text-to-speech generation |
| Azure Translator | `microtran` | East US | Cognate translation |
| Supabase | External | — | Teacher/admin authentication |

---

## License

Proprietary. Copyright 2026 LanguageBridge LLC. All rights reserved.

---

*LanguageBridge — Building bridges between languages, one word at a time.*
