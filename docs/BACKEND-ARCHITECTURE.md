# LanguageBridge Backend Architecture

**LanguageBridge LLC | Confidential | April 2026**

LanguageBridge is an AI-powered Chrome extension that gives K-12 English Language Learners instant, culturally aware translations of academic vocabulary in their native language. The backend is a serverless API running on Azure Functions, backed by Cosmos DB and Azure Blob Storage.

---

## At a Glance

| Metric | Value |
|--------|-------|
| Languages supported | 21 (Haitian Creole in training) |
| Azure Functions | 8 endpoints |
| Cosmos DB containers | 8 |
| Backend source lines | 2,590 |
| Test coverage | 77 tests across 8 suites |
| Lexicon entries | 127,590 bridge definitions |
| Deployment | Azure Functions (Node.js), CI via deploy script |

---

## System Architecture

```
Student (Chrome Extension)
    │
    ├── POST /lexicon-lookup ──────── "What does this word mean?"
    │       ├── Cosmos DB Lexicon ─── 127,590 bridge definitions
    │       └── Azure Translator ──── Fallback for unknown terms
    │
    ├── POST /tts-router ──────────── "Say this out loud"
    │       ├── Proprietary TTS ───── Piper voices (13 languages)
    │       ├── Azure Speech ──────── Fallback (all 21 languages)
    │       └── Blob Storage ──────── Audio cache with SAS URLs
    │
    ├── POST /flag-handler ────────── "This doesn't sound right"
    │       └── Cosmos DB Flags ───── Escalation → interpreter bounty board
    │
    ├── POST /analytics-writer ────── Session event logging
    │       └── Cosmos DB Analytics ─ FERPA-compliant, zero PII
    │
    ├── GET  /onboarding/schools ──── School picker (first install)
    ├── POST /onboarding/enroll ───── Generate pseudonymous student code
    │
Teacher (Dashboard)
    │
    ├── POST /auth-layer ──────────── Supabase JWT verification
    └── POST /dashboard ───────────── 10 analytics queries, school-scoped
```

---

## The 8 Functions

### 1. Lexicon Lookup

**`POST /api/lexicon-lookup`**

The core endpoint. A student highlights a word, and lexicon-lookup returns a bridge definition — a plain-English explanation designed to connect the concept to the student's native language.

- Searches 127,590 curated bridge definitions in Cosmos DB
- Returns two-tier bridges: a short **anchor** (2-5 words) and an expanded **scaffold** (5-15 words)
- Includes grammatical forms (noun, verb, adjective) when available
- Auto-translates the term into the student's native script via Azure Translator
- Cognates are backfilled into the database on first lookup, so subsequent requests are instant
- Falls back to Azure Translator for terms not yet in the lexicon, and caches the result for future curation

**Response types:**
- `"bridge"` — Full bridge definition with cognate, anchor, scaffold, grammatical forms, subject, grade band
- `"cognate"` — Machine translation only (term not yet curated)

---

### 2. TTS Router

**`POST /api/tts-router`**

Converts text to speech with intelligent routing and permanent caching.

- Tries proprietary Piper TTS first (13 languages with custom-trained voices)
- Falls back to Azure Speech Services (all 21 languages)
- Caches every generated audio file in Azure Blob Storage — deduplicated by SHA-256 hash of (text + language)
- Returns a signed URL (1-hour expiry) that the browser plays directly
- Tracks cache hit counts in Cosmos DB for usage analytics

**Voice quality tiers:**
| Tier | Languages | Engine |
|------|-----------|--------|
| Production | Arabic, French, Spanish, Portuguese, Ukrainian, Vietnamese, Persian | Piper (native models) |
| Beta | Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi | Piper (related-language models) |
| Azure-only | Burmese, Uzbek, Amharic, Tagalog, Tigrinya, English | Azure Speech Services |

---

### 3. Flag Handler

**`POST /api/flag-handler`**

Students flag content that sounds wrong or is mistranslated — a single word, a sentence, or up to 500 characters of highlighted text.

- Deduplicates by SHA-256 hash of (flaggedText + language)
- Atomic increment with race condition handling (409 conflict retry)
- Automatic escalation based on community consensus:

| Flag Count | Status | Action |
|-----------|--------|--------|
| 1-2 | `logged` | Recorded, no action |
| 3+ | `review` | Enters human review queue |
| 6+ | `bounty` | Posted to interpreter marketplace |
| 10+ | `high_priority` | Urgent escalation |

**TOS compliance:** Flag documents store only the original student-highlighted text and target language. Azure-generated translations and audio are never stored in the flag pipeline. When a bounty is fulfilled, the interpreter's work replaces the Azure placeholder — ensuring clean IP provenance.

---

### 4. Analytics Writer

**`POST /api/analytics-writer`**

Logs anonymous session events that power the teacher dashboard. Seven event types track the student journey without identifying anyone.

| Event | What it tells us |
|-------|-----------------|
| `session_start` / `session_end` | Extension engagement |
| `term_lookup` | Which words students need help with |
| `scaffold_view` | Students engaging deeply with definitions |
| `tts_play` | Audio usage patterns |
| `flag_event` | Content quality signals |
| `glossary_view` | Self-directed learning behavior |

**FERPA/COPPA enforcement:**
- Rejects any payload containing PII fields (email, name, studentId, phone, address, SSN, etc.)
- 16 prohibited fields scanned recursively to depth 5
- Returns `400 PII_VIOLATION` before any data is written
- Students are identified only by pseudonymous codes (e.g., `LB-7K2M`)

---

### 5. Onboarding

**`GET /api/onboarding/schools`** — Returns the list of active pilot schools with supported grade bands.

**`POST /api/onboarding/enroll`** — Creates a pseudonymous student code.

- Generates codes like `LB-7K2M` (32^6 = ~1 billion possible codes)
- Collision-resistant with 3-attempt retry
- No student names, emails, or identifying information — ever
- Teacher sees the code and nicknames it on their side

---

### 6. Auth Layer

**`POST /api/auth-layer`**

Authenticates teachers and administrators via Supabase JWTs. Not called by students.

- Verifies JWT signature via Supabase service-role client
- Looks up pilot access and permissions in Cosmos DB
- Super admin auto-detection for `@languagebridge.app` emails
- Four permission levels: `view_dashboard`, `export_data`, `manage_flags`, `manage_users`

---

### 7. Dashboard

**`POST /api/dashboard`**

School-scoped analytics for teachers and administrators. Ten pre-built queries answer the questions schools care about.

| Query | What it answers |
|-------|----------------|
| `usage_by_week` | Is the extension being used? |
| `active_students` | How many students are engaging? |
| `term_retention` | Are students learning vocabulary over time? |
| `student_progress` | Individual growth trajectories |
| `scaffold_engagement` | Are students reading full definitions? |
| `audio_engagement` | Are students using pronunciation features? |
| `student_independence` | Are lookups decreasing over time? (learning signal) |
| `bridge_vs_fallback` | Coverage quality — curated vs. machine translation |
| `vocabulary_breadth` | Range of terms being explored |
| `top_flagged` | Content quality hotspots |

**Multi-tenancy:** Teachers can only query data from their assigned schools. School-level isolation is enforced at the query layer.

---

## Security & Privacy

### Student Privacy (FERPA/COPPA)

- Zero personally identifiable information stored anywhere in the system
- Students are identified by pseudonymous codes generated at onboarding
- PII rejection enforced at the API boundary — 16 prohibited fields are scanned recursively before any write
- No cookies, no device fingerprinting, no IP logging
- Analytics are aggregated by school and grade band, never by individual

### API Security

- All endpoints protected by timing-safe API key comparison
- Per-student rate limiting (sliding window, 100 requests/minute)
- Teacher/admin endpoints require Supabase JWT authentication
- School-level data isolation on dashboard queries
- Blob Storage URLs are signed with 1-hour read-only SAS tokens

### TOS Compliance

- Azure Translator and Azure TTS output are treated as ephemeral placeholders
- Flag/bounty pipeline contains only student-generated input text, never Azure-derived content
- When interpreters fulfill bounties, their work replaces Azure placeholders with clean IP
- Every flag document carries a `contentSource: 'student_input'` provenance tag

---

## Data Architecture

### Cosmos DB (8 containers)

| Container | Document Type | Partition Key | Purpose |
|-----------|--------------|---------------|---------|
| `lexicon` | LexiconDoc | language | 127,590 bridge definitions across 21 languages |
| `sessions` | SessionUsageDoc | language | Anonymous analytics events |
| `flags` | FlagDoc | language | Flagged content with escalation status |
| `enrollments` | EnrollmentDoc | schoolCode | Student code → school mapping |
| `pilots` | PilotDoc | id | School metadata and configuration |
| `admin_users` | AdminUserDoc | id | Teacher/admin permissions |
| `audio_cache_metadata` | AudioCacheMetadataDoc | id | TTS cache hit tracking |
| `analytics` | Event logs | — | Fire-and-forget event stream |

### Azure Blob Storage

| Container | Content | Keying |
|-----------|---------|--------|
| `tts-audio-cache` | MP3/WAV audio files | `{language}/{SHA256(text+language)}.mp3` |
| `flag-data` | Flagged content exports | — |
| `model-weights` | Piper TTS model weights | Per-language directories |

---

## Supported Languages (21 live, Haitian Creole in training)

| Tier | Languages | TTS Engine |
|------|-----------|------------|
| Production | Arabic, French, Spanish, Portuguese, Ukrainian, Vietnamese, Persian, English | Piper native models |
| Beta | Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi | Piper (related-language proxy) |
| Azure-only | Burmese, Uzbek, Amharic, Tagalog, Tigrinya | Azure Speech Services |

These 21 languages represent the most common home languages of ELL students in U.S. public schools, covering over 95% of the K-12 English learner population. Haitian Creole is in active training — the French Piper model serves as the base, fine-tuned on Creole data — and will ship as the 22nd supported language post-pilot.

---

## Interpreter Marketplace (Phase 3)

When enough students flag the same content (6+ flags), it becomes a bounty on the interpreter marketplace:

```
Student flags → community consensus (3+) → review queue → bounty (6+) → interpreter fulfills
                                                                              │
                                                            Interpreter provides:
                                                            - Correct translation
                                                            - Native-speaker audio
                                                                              │
                                                            Replaces Azure placeholder
                                                            in Lexicon DB with human-
                                                            verified content
```

This creates a flywheel: student usage surfaces quality gaps, interpreters fix them, and the lexicon improves for every future student. Azure is the scaffold; the community builds the house.

---

## Testing

- **77 tests** across 8 test suites (one per function + validators)
- Unit tests mock Cosmos DB and external services
- Coverage: input validation, error handling, escalation logic, PII rejection, rate limiting, cognate backfill, text length limits
- CI-ready: `npx jest --config backend/jest.config.js`

---

## Infrastructure

| Service | Resource | Region |
|---------|----------|--------|
| Azure Functions | `languagebridge-api` | East US |
| Cosmos DB | `languagebridge-cosmos` | East US |
| Blob Storage | `languagebridgece8132` | East US |
| Azure Speech | `microspee` | East US |
| Azure Translator | `microtran` | East US |
| Auth | Supabase (external) | — |

---

*LanguageBridge LLC — Building bridges between languages, one word at a time.*
