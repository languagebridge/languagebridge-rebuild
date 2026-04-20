# Data Flow Diagram

**Document owner:** Justin Bernard, CEO / Data Security Officer (DSO)
**Effective date:** 2026-04-20
**Architecture version:** v2 enterprise (post-pilot)
**Review cadence:** Annually, or after any architecture change affecting data flows

---

## Purpose

This document maps the movement of all data through the LanguageBridge system from collection through deletion. It satisfies the DPA Exhibit F requirement for "documented data flow mapping from collection through deletion" and supports auditor inspection.

---

## Actors

| Actor | Role |
|---|---|
| **Student** | K-12 ELL using LanguageBridge Chrome extension on Chromebook |
| **Teacher** | Authenticated district staff member with `view_dashboard` permission |
| **Admin (LEA)** | District IT or curriculum admin with elevated permissions for their school |
| **Admin (LanguageBridge)** | Internal LanguageBridge staff with `super_admin` role |
| **Interpreter** *(post-marketplace)* | Verified bilingual contractor providing translation/audio corrections |
| **Parent/Guardian** | Right of access requestor; never directly interacts with system |

---

## Data Categories

| Category | Examples | Sensitivity | Retention |
|---|---|---|---|
| **Pseudonymous identifiers** | LB-7K2M student codes | Low (no link to real identity) | Active subscription + 90 days |
| **Selected demographics** | School code, grade band, home language | Low | Active subscription + 90 days |
| **Usage metadata** | Term lookups, timestamps, language pairs, session events | Low | Active subscription + 90 days |
| **Flagged passages** | Student-input text up to 500 chars with `flagType` | Medium (contains student-generated text) | Active subscription + 90 days, or until resolved |
| **Curated lexicon** | Bridge definitions, cognates | Not student data | Indefinite |
| **TTS audio cache** | Synthesized audio files, deduplicated by content hash | Not student data | Indefinite |
| **Talk to Teacher audio** | Mic recordings of student speech | High | **Ephemeral — never stored** |
| **Talk to Teacher transcripts** | Transcribed text from student/teacher | High | **Ephemeral — never stored** |
| **Teacher/Admin auth** | Supabase JWT, email | Medium | Per Supabase retention policy |
| **Audit logs** | Admin actions on system | Medium | 7 years (compliance) |
| **Interpreter records** *(post-marketplace)* | Identity verification, payment history | High | 7 years (tax compliance) |

---

## Top-Level Data Flow Diagram (text representation)

```
┌─────────────────┐
│  STUDENT        │
│  (Chromebook)   │
└────────┬────────┘
         │
         │ 1. First install: pick school + grade + language
         │ 2. Highlight word → POST /lexicon-lookup
         │ 3. Tap audio → POST /tts-router
         │ 4. Tap flag → POST /flag-handler
         │ 5. Talk-to-Teacher → POST /speech-to-text + /translate
         ▼
┌────────────────────────────────────────────────────────┐
│  CHROME EXTENSION (LanguageBridge)                     │
│                                                        │
│  Local Storage (chrome.storage.local):                 │
│   • studentCode (LB-XXXXXX)                           │
│   • language preference                                │
│   • toolbar/UI preferences                             │
│                                                        │
│  All API requests:                                     │
│   • HTTPS only (TLS 1.2+)                             │
│   • Header: x-lb-api-key                              │
│   • Body: JSON                                         │
└────────┬───────────────────────────────────────────────┘
         │
         │ HTTPS to languagebridge-api.azurewebsites.net
         ▼
┌────────────────────────────────────────────────────────┐
│  AZURE FUNCTIONS (10 endpoints)                        │
│                                                        │
│  [In-memory only — never persisted]                   │
│   • API key validation (timing-safe)                  │
│   • Rate limit check                                   │
│   • PII scan on request body                          │
│   • Request routing                                    │
└──┬──────┬──────┬──────┬──────┬──────────────────────┘
   │      │      │      │      │
   │      │      │      │      │
   ▼      ▼      ▼      ▼      ▼
┌─────────────────────────────────────────────────────────────┐
│ COSMOS DB (9 containers, partitioned, indexed)              │
│                                                             │
│  • lexicon (bridges, cognates) — partition: /language       │
│  • sessions (analytics events) — partition: /language       │
│  • flags (flagged passages) — partition: /language          │
│  • enrollments (student code → school) — partition: /school │
│  • pilots (school metadata) — partition: /id                │
│  • admin_users (teacher/admin perms) — partition: /id       │
│  • audio_cache_metadata (TTS cache info) — partition: /id   │
│  • analytics (event log) — partition: /id                   │
│  • rate_limits (TTL 120s) — partition: /partitionKey        │
│                                                             │
│  Encryption: AES-256 at rest (Azure-managed)                │
│  Backup: Continuous backup with point-in-time restore       │
│  Geo-replication: East US primary, paired West region       │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AZURE BLOB STORAGE (3 containers)                           │
│                                                             │
│  • tts-audio-cache — MP3 files, keyed by SHA-256(text+lang) │
│  • flag-data — Future exports for marketplace               │
│  • model-weights — Piper TTS models (post-pilot)            │
│                                                             │
│  Encryption: AES-256 at rest                                │
│  Access: SAS URLs with 1-hour read-only expiry              │
│  Geo-redundancy: GRS replication                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ AZURE COGNITIVE SERVICES (subprocessors, US East region)    │
│                                                             │
│  • Translator API (microtran)                               │
│    Used for: cognate fallback, /translate endpoint          │
│    Data sent: text only (no student identifier)             │
│                                                             │
│  • Speech Services TTS (microspee)                          │
│    Used for: /tts-router endpoint                           │
│    Data sent: text only                                     │
│    Audio returned: cached in Blob Storage                   │
│                                                             │
│  • Speech Services STT (microspee)                          │
│    Used for: /speech-to-text endpoint                       │
│    Data sent: audio bytes (base64)                          │
│    Text returned: ephemeral, returned to caller             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ SUPABASE (subprocessor — teachers/admins ONLY)              │
│                                                             │
│  • JWT issuance for teacher/admin authentication            │
│  • Email/password storage (teachers and admins ONLY)        │
│  • No student data ever                                     │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ STRIPE CONNECT (subprocessor — post-marketplace)            │
│                                                             │
│  • Interpreter identity verification (W-9, ID)              │
│  • 1099-NEC payment processing                              │
│  • No student data ever sent to Stripe                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Flow by Endpoint

### Flow 1: Student Onboarding

```
Student opens extension first time
    │
    ▼
GET /onboarding/schools (returns list of pilot schools)
    │
    ▼
Student selects: schoolCode, gradeBand, language
    │
    ▼
POST /onboarding/enroll
    │  Body: { schoolCode, gradeBand, language }
    ▼
Azure Functions:
    │  • Validate schoolCode exists in `pilots` container
    │  • Generate cryptographically random LB-XXXXXX code (rejection sampling)
    │  • Write to `enrollments` container { id: studentCode, schoolCode, gradeBand, language }
    ▼
Response: { studentCode } → stored in chrome.storage.local

DATA RETAINED:
    • Cosmos `enrollments` container: { LB-XXXXXX, schoolCode, gradeBand, language, createdAt }
    • Browser local storage: studentCode

DATA NOT RETAINED:
    • Student name (never collected)
    • IP address (used for rate limit only, not persisted)
```

### Flow 2: Highlight & Hear (Lexicon Lookup + TTS)

```
Student highlights "photosynthesis"
    │
    ▼
POST /lexicon-lookup { term, language, studentCode, context? }
    │
    ▼
Azure Functions:
    │  • Validate API key (timing-safe)
    │  • Check rate limit (300/min per studentCode)
    │  • Query `lexicon` container for term+language
    │
    ├─ Found with bridge? → return bridge definition
    │       │
    │       ├─ Has cognate? → return immediately
    │       └─ Cognate null? → call Azure Translator → backfill cognate to Cosmos → return
    │
    └─ Not found? → call Azure Translator → cache result in `lexicon` → return as cognate-only
    │
    ▼
Response includes audio_url (or null)
    │
    ▼
If audio_url null:
    POST /tts-router { text, language, studentCode }
        │
        ▼
    Azure Functions:
        │  • Check `tts-audio-cache` blob for SHA-256(text+lang).mp3
        │  • Cache miss → call Azure TTS → upload audio → write metadata
        │  • Return signed SAS URL (1-hour expiry)

DATA SENT TO AZURE COGNITIVE SERVICES:
    • Text content (the term being translated/spoken)
    • Target language code
    • NO student identifier

DATA STORED IN COSMOS:
    • Lexicon entry (cognate, bridge, audio_blob_path) — keyed by language, not student
    • Usage event in `sessions` (when analytics-writer is called separately)

DATA STORED IN BLOB:
    • TTS audio file, deduplicated by content hash
```

### Flow 3: Talk to Teacher

```
Student taps mic → records audio (MediaRecorder, webm)
    │
    ▼
POST /speech-to-text { audioBase64, audioFormat, language, studentCode }
    │
    ▼
Azure Functions:
    │  • Validate API key, rate limit (30/min — STT is expensive)
    │  • Decode base64 → audio buffer
    │  • POST to Azure Speech-to-Text with audio bytes
    ▼
Response: { text }
    │
    │  AUDIO IS DISCARDED. NOT STORED ANYWHERE.
    │  TEXT IS RETURNED TO CALLER. NOT STORED.
    ▼
Extension calls POST /translate { text, fromLanguage: <student-lang>, toLanguage: 'english', studentCode }
    │
    ▼
Azure Functions:
    │  • POST to Azure Translator
    │  • Return translated text
    │
    │  TRANSLATED TEXT IS RETURNED TO CALLER. NOT STORED.
    ▼
Teacher reads translated text in extension UI

[Reverse flow for teacher reply uses the same /translate endpoint]
```

### Flow 4: Flag

```
Student highlights passage, taps flag, picks ear or mouth icon
    │
    ▼
POST /flag-handler { flaggedText, language, studentCode, timestamp, flagType }
    │
    ▼
Azure Functions:
    │  • Validate (PII scan, rate limit)
    │  • SHA-256 hash (flaggedText + language) → flagId
    │  • Atomic patch to `flags` container:
    │     - increment flagCount
    │     - increment pronunciationFlagCount OR translationFlagCount
    │     - update lastFlaggedAt, status, requiresReview
    │  • If new doc: create with contentSource: 'student_input'
    ▼
Response: { flagId, flagCount, status, requiresReview }

DATA STORED:
    • `flags` container: { flaggedText (≤500 chars), language, flagCount, type-counts, status }
    • Linked to studentCode? NO — flag is keyed by content hash, deduplicated across all students
    • The studentCode is used only for rate limiting, not stored on the flag doc

DATA NOT STORED:
    • Audio URL (architecturally rejected, even if student tried to send one)
    • Azure-derived translations (architecturally separate from flag pipeline)
```

### Flow 5: Analytics

```
Extension fires event (term_lookup, scaffold_view, tts_play, etc.)
    │
    ▼
POST /analytics-writer (fire-and-forget)
    │  Body: { studentCode, language, eventType, timestamp, extensionVersion, ...optional }
    │
    ▼
Azure Functions:
    │  • PII scan (rejects 16 prohibited fields)
    │  • Rate limit (300/min)
    │  • Read `enrollments` container to resolve schoolCode + gradeBand from studentCode
    │  • Write to `sessions` container
    ▼
Response: { logged: true, eventId, timestamp }

DATA STORED:
    • `sessions` container: { studentCode (LB-XXXXXX), schoolCode, gradeBand, language, eventType, timestamp, ...event-specific }
```

### Flow 6: Teacher Dashboard

```
Teacher logs in via Supabase frontend
    │
    ▼
Supabase issues JWT (email + role)
    │
    ▼
Teacher requests dashboard view
    │
    ▼
POST /dashboard with Authorization: Bearer <jwt>
    │
    ▼
Azure Functions:
    │  • Validate JWT via auth-helpers
    │  • Resolve teacher's accessibleSchoolCodes from admin_users container
    │  • Validate requested schoolCode is in their accessible list (multi-tenancy)
    │  • Validate query name is in whitelist (10 queries, no SQL injection)
    │  • Validate date range, grade band
    │  • Execute parameterized SQL against `sessions` container (composite-indexed)
    │  • Cap results at 5,000 rows (DoS prevention)
    ▼
Response: { results: [...], count, truncated: bool }
    │
    │  AUDIT LOG WRITTEN: who queried what, when (synchronous, not fire-and-forget)
```

---

## Cross-Border / Cross-Region Data Flows

| Flow | Region | Justification |
|---|---|---|
| Student → Azure Functions API | US East | Closest to majority of US-based pilots |
| Azure Functions → Cosmos DB | US East | Same region as Functions for low latency |
| Azure Functions → Blob Storage | US East with GRS to West region | Geo-redundancy for disaster recovery |
| Azure Functions → Translator/Speech | US East | Same region, no cross-border |
| Azure Functions → Supabase | US (Supabase US region) | All teachers/admins are US-based |

**No data leaves the United States.** Azure East US region is in Virginia. Azure Cognitive Services calls go to the same region. Supabase is configured for US data residency.

---

## Data Deletion Flows

### Routine deletion

| Data | Trigger | Mechanism |
|---|---|---|
| Rate limit records | 120 seconds after creation | Cosmos TTL (automatic) |
| Talk to Teacher audio | Immediately after STT response returns | Never written to disk |
| Talk to Teacher transcripts | Immediately after caller receives | Never written to disk |
| TTS audio (cache hit) | N/A — kept indefinitely as it's content, not student data | — |
| Bridge definitions | N/A — kept indefinitely (curated content) | — |

### LEA termination deletion (per Ohio SB 29)

```
LEA terminates DPA
    │
    ▼
30-day grace period: LEA may request data export
    │
    ▼
Day 30: Provider runs deletion script:
    • Delete all enrollments with schoolCode = LEA's
    • Delete all sessions with schoolCode = LEA's
    • Delete all flags submitted by students from this LEA*
    • Audit log entry recording the deletion
    ▼
Day 90: Deletion complete (within 90 days post-termination per SB 29)

* Flags are deduplicated across LEAs by content hash. If the same flagged
  passage was submitted by students from other active LEAs, the flag
  document remains but the LEA's contribution is removed from any
  per-LEA tracking.
```

### Parent Right of Access (FERPA)

```
Parent request → submitted via LEA, not direct to Provider
    │
    ▼
LEA forwards to Provider with student's LB-XXXXXX code
    │
    ▼
Provider runs query:
    • All sessions where studentCode = LB-XXXXXX
    • All flags submitted with this studentCode
    • The enrollment record (school, grade, language)
    ▼
Provider exports as PDF/CSV → returns to LEA → LEA forwards to parent
    │
    ▼
Provider response within 30 days of LEA request (per DPA Section 8)
```

---

## Subprocessor Data Boundary Summary

| Subprocessor | Receives student data? | Receives student PII? |
|---|---|---|
| Microsoft Azure (Cosmos, Blob, Functions) | YES — pseudonymous codes + content | NO |
| Azure Cognitive Services (Translator, Speech) | YES — text/audio content | NO — no identifier sent |
| Supabase | NO — only teacher/admin emails | NO student data ever |
| Stripe Connect (post-marketplace) | NO — only interpreter PII | NO student data ever |

---

## Architecture Properties That Enforce This Data Flow

These are not promises — they are properties of the code that make violations difficult by design:

| Property | Where enforced | Why it matters |
|---|---|---|
| API rejects 16 PII field names | `backend/shared/validators.ts:checkForPII` | Even if frontend bug sends a name, backend refuses before write |
| Student codes generated server-side | `backend/azure-functions/onboarding/index.ts:generateStudentCode` | Student cannot self-assign an identifier that contains PII |
| Flag handler rejects audioUrl in request | `backend/azure-functions/flag-handler/index.ts` (no `audioUrl` in `requireFields`) | Azure-generated content cannot enter the flag/bounty pipeline |
| Talk to Teacher endpoints don't write to Cosmos | `backend/azure-functions/speech-to-text/index.ts` and `translate/index.ts` (no Cosmos imports for storage) | Architecturally impossible to retain conversation content |
| Cosmos DB key required at startup | `backend/shared/config.ts:assertConfig` | Service refuses to start without proper credentials configured |
| Composite indexes on sessions container | `backend/cosmos-indexing-policy.json` | Per-school queries are efficient and bounded |

---

## Review Log

| Date | Reviewer | Changes |
|---|---|---|
| 2026-04-20 | Justin Bernard | Initial document created for v2 architecture |
