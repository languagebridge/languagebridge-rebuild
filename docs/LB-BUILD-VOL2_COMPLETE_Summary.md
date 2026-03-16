# LanguageBridge Phase 2 Rebuild: Complete Implementation Summary

**Document Purpose:** This summary ties together the two-part Volume 2 backend rebuild and explains how it connects to Prentice's frontend work in Volume 3.

**Audience:** Justin (primary), Prentice (API integration reference)

**Status:** Ready to execute immediately

---

## What You Now Have

You now have **two complete, unabridged rebuild guides** that take you from zero to deployed backend in one continuous narrative:

### Part 1-2: Foundations & Setup (8,000 words)

- TypeScript mastery (primitives, arrays, objects, functions, async/await)
- Complete project initialization with folder structure
- Root-level configuration (package.json, tsconfig.json, .gitignore, .env)
- Shared types file (the API contract for Prentice)
- Cosmos DB and Blob Storage clients
- Request validators with strict PII checking

**Output:** A GitHub repository (`languagebridge-rebuild`) with the entire project structure ready, and npm dependencies installed.

### Part 3-10: Implementation & Deployment (12,000 words)

- **Part 3:** Cosmos DB setup with 6 collections and Azure Blob Storage containers
- **Part 4:** tts-router function (proprietary model registry → Azure TTS → cache)
- **Part 5:** analytics-writer function (anonymous event logging with PII guards)
- **Part 6:** flag-handler function (threshold-based escalation)
- **Part 7:** auth-layer function (Supabase JWT validation)
- **Part 8:** Local testing with curl and Azure Functions emulator
- **Part 9:** Azure deployment
- **Part 10:** Validation checklist before moving to Volume 3

**Output:** Four deployed Azure Functions accessible at `https://lb-backend-functions.azurewebsites.net/api/*`

---

## The Four Functions You Built

### 1. tts-router
**What it does:** Routes text-to-speech requests through the optimal audio source

**Request:**
```json
{
  "text": "photosynthesis",
  "language": "dari",
  "pilotId": "PCSD-2026",
  "sessionToken": "abc-123"
}
```

**Response:**
```json
{
  "audioUrl": "https://cache.blob.core.windows.net/tts-audio-cache/dari/...",
  "source": "azure_live",
  "durationMs": 2400,
  "cached": false
}
```

**Why Prentice cares:** Every time a student clicks "Play," this is what gets called. It returns an audio URL.

**Design pattern:** Proprietary models first → cached results → Azure TTS fallback

---

### 2. analytics-writer
**What it does:** Logs anonymous user events WITHOUT collecting PII

**Request:**
```json
{
  "sessionToken": "abc-123",
  "pilotId": "PCSD-2026",
  "language": "dari",
  "eventType": "tts_request",
  "timestamp": "2026-03-15T14:30:00Z",
  "extensionVersion": "2.0.0"
}
```

**Response:**
```json
{
  "logged": true,
  "eventId": "EVENT-12345",
  "timestamp": "2026-03-15T14:30:45Z"
}
```

**Why Prentice cares:** Every user interaction is logged for analytics. No student names, emails, or IDs. Ever.

**Design pattern:** Strict PII validation. If `email` field is in the request, returns 400.

---

### 3. flag-handler
**What it does:** Processes pronunciation flags with automatic threshold escalation

**Request:**
```json
{
  "word": "photosynthesis",
  "language": "dari",
  "sessionToken": "abc-123",
  "pilotId": "PCSD-2026",
  "timestamp": "2026-03-15T14:30:00Z"
}
```

**Response:**
```json
{
  "flagId": "FLAG-12345",
  "flagCount": 6,
  "status": "bounty",
  "requiresReview": true
}
```

**Why Prentice cares:** When a student clicks the "Flag" button, this gets called. The response tells the UI whether the flag was logged or escalated.

**Escalation Thresholds:**
- 1-2 flags: `logged` (monitored, no action)
- 3-5 flags: `review` (visible to admin)
- 6-10 flags: `bounty` (interpreter marketplace, Phase 3)
- 10+: `high_priority` (top of queue)

---

### 4. auth-layer
**What it does:** Validates Supabase JWTs and returns user context

**Request:**
```
Headers:
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Response:**
```json
{
  "userId": "USER-001",
  "email": "teacher@parma.k12.oh.us",
  "accessiblePilotIds": ["PCSD-2026"],
  "isSuper-Admin": false,
  "permissions": ["view_dashboard", "export_data"]
}
```

**Why Prentice cares:** The React PWA admin dashboard uses this to authenticate users and determine what they can see.

**Design pattern:** Super-admin check (email ends with `@languagebridge.app` = full access)

---

## How Prentice's Frontend Integrates

Prentice will now write code that calls these four endpoints. The integration is straightforward:

### In the Chrome Extension

When a student selects text and clicks "Play":

```javascript
// Prentice's code in extension/src/api/tts-client.js
async function requestAudio(text, language, sessionToken) {
  const response = await fetch('https://lb-backend-functions.azurewebsites.net/api/tts-router', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language,
      pilotId: 'PCSD-2026',
      sessionToken,
    }),
  });

  if (!response.ok) {
    throw new Error('TTS request failed');
  }

  const data = await response.json();
  return data.audioUrl; // Play this URL
}
```

Every user action logs to analytics-writer.
Every flag goes to flag-handler.

### In the React PWA Admin Dashboard

When a teacher logs in:

```javascript
// Prentice's code in pwa/src/hooks/useAuth.js
async function validateToken(jwt) {
  const response = await fetch('https://lb-backend-functions.azurewebsites.net/api/auth-layer', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
  });

  const user = await response.json();
  return user; // Use to determine dashboard permissions
}
```

---

## The Folder Structure You Created

```
~/projects/languagebridge-rebuild/
├── backend/
│   ├── azure-functions/
│   │   ├── tts-router/           ← Prentice calls this
│   │   ├── analytics-writer/      ← Prentice calls this (analytics)
│   │   ├── flag-handler/          ← Prentice calls this (when student flags)
│   │   └── auth-layer/            ← Prentice calls this (PWA login)
│   ├── shared/
│   │   ├── types.ts              ← THE API CONTRACT
│   │   ├── cosmos-client.ts       ← Database
│   │   ├── blob-client.ts         ← File storage
│   │   └── validators.ts          ← Input validation
│   └── __tests__/
│
├── extension/                      ← Prentice builds this
│   ├── src/
│   │   ├── api/                  ← API client (calls your functions)
│   │   ├── ui/                   ← Toolbar UI
│   │   └── content-script.js      ← Injects toolbar into webpages
│   └── manifest.json             ← Chrome MV3 manifest
│
├── pwa/                           ← Prentice builds this
│   ├── src/
│   │   ├── pages/                ← Dashboard, reports
│   │   └── components/           ← React components
│   └── package.json
│
├── ml-pipeline/                   ← Justin builds this later
│   ├── notebooks/                ← Jupyter notebooks
│   ├── scripts/                  ← Python training scripts
│   └── models/                   ← Fine-tuned weights (not committed)
│
└── .env                          ← Your Azure credentials (NOT COMMITTED)
```

**Key insight:** Your `backend/shared/types.ts` is the source of truth for the API. Prentice reads it to understand what to send and what to expect back.

---

## Your Deployment Architecture

```
Student's Chromebook
        ↓
Chrome Extension (Vanilla JS)
        ↓
HTTPS POST → Azure Functions
        ↓
┌─────────────────────────────────┐
│   Azure Functions (lb-backend)  │
├─────────────────────────────────┤
│ • tts-router                    │
│ • analytics-writer              │
│ • flag-handler                  │
│ • auth-layer                    │
└─────────────────────────────────┘
        ↓ ┌─────────────────────┐
        ├→ Cosmos DB (analytics)
        ├→ Blob Storage (audio cache)
        └→ Azure Cognitive Services (TTS)

Teacher's Browser
        ↓
React PWA (languagebridge.app)
        ↓
HTTPS POST → Azure Functions
        ↓
Uses auth-layer to validate JWT
```

---

## Critical Files You Created

### 1. `backend/shared/types.ts` (The Contract)

This is THE file that defines what Prentice can send to your backend and what he gets back. It has:

- `TTSRequest` & `TTSResponse` → for tts-router
- `AnalyticsWriterRequest` & `AnalyticsWriterResponse` → for analytics-writer
- `FlagEventRequest` & `FlagHandlerResponse` → for flag-handler
- `AuthRequest` & `AuthResponse` → for auth-layer
- Constants: `SUPPORTED_LANGUAGES`, `FLAG_THRESHOLDS`, `MAX_TEXT_LENGTH`
- Utility functions: `hasPII()`, `isValidLanguage()`

**Prentice will read this file to understand the API.**

### 2. `backend/shared/validators.ts` (Input Guards)

Every request is validated before processing. If validation fails:

- Missing required fields → 400 `MISSING_FIELDS`
- Contains PII → 400 `PII_VIOLATION`
- Invalid language → 400 `INVALID_LANGUAGE`
- Text too long → 400 `TEXT_TOO_LONG`

This is where your security perimeter is.

### 3. `backend/shared/cosmos-client.ts` (Database Access)

All four functions use this to read/write to Cosmos DB. Methods:

- `initializeCosmosClient()` → create connection
- `getContainer(name)` → get a collection
- `writeDocument(container, doc)` → create
- `readDocument(container, id, partitionKey)` → read
- `updateDocument(...)` → update
- `upsertDocument(...)` → create or update
- `queryDocuments(...)` → query with SQL

### 4. `backend/shared/blob-client.ts` (File Storage)

All audio files are stored in Azure Blob Storage. Methods:

- `uploadBlob(container, blobName, buffer)` → save audio
- `downloadBlob(container, blobName)` → retrieve audio
- `blobExists(...)` → check if cached
- `deleteBlob(...)` → remove file

---

## Testing You Performed

### Local Testing (Part 8)

You tested all four functions locally with curl before deploying:

```bash
# tts-router test
curl -X POST http://localhost:7071/api/tts-router \
  -d '{"text":"hello","language":"dari","pilotId":"PCSD-2026","sessionToken":"test-1"}'

# Result: Audio URL returned
```

### Production Testing (Part 9)

You tested the Azure deployment:

```bash
# Production endpoint
curl -X POST https://lb-backend-functions.azurewebsites.net/api/tts-router \
  -d '{"text":"hello","language":"dari","pilotId":"PCSD-2026","sessionToken":"prod-1"}'

# Result: Audio URL returned from Azure
```

### Validation Checklist (Part 10)

You verified:

- [ ] tts-router returns audio
- [ ] tts-router caches second request
- [ ] analytics-writer rejects PII
- [ ] flag-handler escalates at threshold 3, 6, 10
- [ ] Cosmos DB documents created
- [ ] Production endpoints live

---

## Environment Variables You Set

In your `.env` file (never committed), you configured:

```bash
# Cosmos DB
COSMOS_DB_ENDPOINT=https://languagebridge-cosmos.documents.azure.com:443/
COSMOS_DB_KEY=[your-primary-key]
COSMOS_DB_DATABASE=languagebridge-prod

# Azure Blob Storage
AZURE_STORAGE_ACCOUNT=languagbridgeaudio
AZURE_STORAGE_KEY=[your-key]

# Azure Cognitive Services
AZURE_TTS_KEY=[your-key]
AZURE_TTS_REGION=eastus

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=[your-key]

# Application
NODE_ENV=production
```

These are injected into the Azure Function App settings, so each function can access them without committing secrets to GitHub.

---

## What Happens Next

### Volume 3: Frontend Rebuild (Prentice's Track)

Prentice will build:

1. **Chrome Extension** (Vanilla JS, Manifest V3)
   - Content script that detects text selection
   - Toolbar UI with language selector and buttons
   - API client that calls your four functions
   - Session token generation and storage

2. **React PWA** (Admin Dashboard)
   - Login page with Supabase Google SSO
   - Dashboard showing analytics and flags
   - Pilot management panel
   - PDF export functionality

**All of Prentice's code will import types from your `backend/shared/types.ts`.**

### Volume 4: ML Pipeline (Justin's Track - Later)

Later, you will build:

1. Kokoro-82M fine-tuning pipeline (Python + PyTorch)
2. Model registry in Cosmos DB with SHA-256 hashes
3. Local model inference on your MacBook
4. Weights storage in Azure Blob Storage

**For now, tts-router falls back to Azure TTS. Phase 4 changes this to use proprietary models first.**

### Volume 5: Integration & Deployment (Both)

You will:

1. Test the entire system end-to-end (extension → backend → database)
2. Swap Greenbriar pilot from old backend to new backend
3. Prepare investor pitch materials
4. Deploy to production

---

## How to Use These Documents

### Option 1: Linear Reading (Recommended)

1. Read Part 1-2 (foundations)
2. Follow every command line by line
3. Read Part 3-10 (implementation)
4. Follow every command line by line
5. You are done

**Estimated time:** 8-12 hours spread over 2-3 days

### Option 2: Reference Mode

- Use Part 1-2 to understand the setup
- Refer to Part 3-10 when building each function
- Jump to specific section (e.g., "Part 4: tts-router") when needed

### Option 3: Pairing with Prentice

1. You execute Part 1-2 and Part 3-7 (foundations + three functions)
2. Prentice reads Part 2 and Part 4 to understand the API
3. You complete Part 8-10 (testing and deployment)
4. Prentice starts Volume 3 with full backend knowledge

---

## How These Documents Connect to Prentice's Work

### Types are Shared

When Prentice needs to call tts-router, he reads:

```typescript
// From backend/shared/types.ts
export type TTSRequest = {
  text: string;
  language: string;
  pilotId: string;
  sessionToken: string;
};

export type TTSResponse = {
  audioUrl: string;
  source: 'proprietary' | 'azure_cache' | 'azure_live';
  durationMs: number;
  cached: boolean;
};
```

Then he writes:

```javascript
// In extension/src/api/tts-client.js
async function requestAudio(text, language, sessionToken) {
  const response = await fetch(TTS_ROUTER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      language,
      pilotId: 'PCSD-2026',
      sessionToken,
    }),
  });

  const data = await response.json();
  return data.audioUrl;
}
```

### Error Handling is Specified

When Prentice gets a 400 response, the types tell him what errors to expect:

```typescript
// From backend/shared/types.ts
export type TTSErrorResponse = {
  error: 'MISSING_FIELDS' | 'INVALID_LANGUAGE' | 'TEXT_TOO_LONG' | 'RATE_LIMITED';
  details: string;
};
```

So Prentice handles it in his code:

```javascript
if (!response.ok) {
  const error = await response.json();
  if (error.error === 'TEXT_TOO_LONG') {
    // Show UI message: "Text is too long. Max 500 characters."
  } else if (error.error === 'INVALID_LANGUAGE') {
    // Show UI message: "That language is not supported."
  }
}
```

---

## Summary: What You've Accomplished

You have successfully completed the entire backend rebuild:

✓ Created a monorepo with proper folder structure
✓ Set up TypeScript with strict type checking
✓ Created Cosmos DB with 6 collections and proper indexing
✓ Created Azure Blob Storage for caching
✓ Implemented tts-router (core audio routing)
✓ Implemented analytics-writer (PII-safe logging)
✓ Implemented flag-handler (threshold escalation)
✓ Implemented auth-layer (Supabase JWT validation)
✓ Tested all functions locally
✓ Deployed to Azure Functions
✓ Validated production endpoints

**Your backend is ready for Prentice's frontend integration.**

---

## Next Steps

1. **Commit Part 2 completion:**
   ```bash
   cd ~/projects/languagebridge-rebuild
   git add .
   git commit -m "feat: complete Phase 2 backend rebuild with four production Azure Functions"
   git push origin main
   ```

2. **Share with Prentice:**
   Send Prentice the link to `backend/shared/types.ts` in your GitHub repository. Tell him: "This is the API contract. Read this file and understand every type."

3. **Start Volume 3:**
   When you're both ready, Prentice starts building the Chrome extension and PWA using Volume 3. He will reference your types constantly.

4. **Prepare for Volume 5:**
   In the meantime, you can start Part 4 (ML Pipeline) or prepare for Greenbriar cutover.

---

**LanguageBridge LLC | Phase 2 Backend Rebuild | Complete**

Justin Bernard (CEO, Backend) - justin@languagebridge.app

Prentice Howard (CTO, Frontend) - prentice@languagebridge.app

**Contact:** 216-800-6020
