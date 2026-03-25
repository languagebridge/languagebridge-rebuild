# Frontend Integration Guide

**For Prentice | Updated March 22, 2026 | LanguageBridge LLC**

**v2.0 — Major update.** 22 languages (was 9), proprietary TTS voices, two-tier bridge phrases, grammatical forms. All changes are backwards-compatible — old code still works.

This is everything you need to connect the Chrome extension to the backend. The backend is live as Azure Functions. You send JSON, you get JSON back.

All student-facing endpoints require an API key header:
```
x-lb-api-key: <key Justin will provide>
```

If the key is missing or wrong, you get `401 UNAUTHORIZED`.

### What changed in v2.0

| Change | Old | New |
|--------|-----|-----|
| Languages | 9 | 22 |
| Bridge definitions | Single `bridge_definition` | Two tiers: `bridge_anchor` (short) + `bridge_scaffold` (expanded) |
| Grammatical forms | None | `grammatical_forms.noun`, `.verb`, `.adjective` |
| TTS voices | Azure only | Piper first (13 langs), Azure fallback (all 22) |
| Voice quality info | None | `backend` and `quality` fields on TTS response |
| Term metadata | None | `subject`, `grade_band`, `transliteration_difficulty` |

---

## Base URL

```
https://<function-app-name>.azurewebsites.net/api
```

For local dev: `http://localhost:7071/api`

---

## 1. Lexicon Lookup — "What does this word mean?"

This is the main endpoint. Student highlights a word → you call this.

**POST** `/lexicon-lookup`

### Request

```json
{
  "term": "photosynthesis",
  "language": "dari",
  "pilotId": "PCSD-2026",
  "sessionToken": "anonymous-uuid-from-device",
  "domain": "k12_academic",
  "context": "science"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `term` | Yes | The word or phrase the student highlighted |
| `language` | Yes | One of 22 languages — see Supported Languages section below |
| `pilotId` | Yes | Which school pilot this student belongs to (e.g., `"PCSD-2026"`) |
| `sessionToken` | Yes | A random UUID you generate on the device. **Not a login token.** Just a random string for session grouping. |
| `domain` | No | Default `k12_academic`. Options: `k12_academic`, `school_navigation`, `medical`, `legal_immigration`, `social_services` |
| `context` | No | Subject hint for disambiguation: `"science"`, `"social_studies"`, `"math"`, `"ela"` |

### Response — Term Found in Lexicon

```json
{
  "term": "photosynthesis",
  "language": "dari",
  "type": "bridge",
  "cognate": "فوتوسنتز",
  "bridge_anchor": "plants making food from light",
  "bridge_scaffold": "the way green plants turn light, water, and air into food they can use",
  "bridge_definition": "the way green plants turn light, water, and air into food they can use",
  "bridge_definition_en": null,
  "grammatical_forms": {
    "noun": "plant food-making from light",
    "verb": null,
    "adjective": null
  },
  "audio_url": "https://storage.blob.core.windows.net/tts-audio-cache/dari/abc123.wav",
  "audio_source": "proprietary",
  "tts_backend": "piper",
  "subject": "science",
  "grade_band": "6-8",
  "transliteration_difficulty": "high",
  "source": "lexicon"
}
```

**New fields (all optional — check for null):**

| Field | What it is | How to use it |
|-------|-----------|--------------|
| `bridge_anchor` | Short bridge (2-5 words) | **Always show this.** It's the headline definition. |
| `bridge_scaffold` | Expanded bridge (5-15 words) | Show on tap/expand. More detail for students who need it. |
| `bridge_definition` | Same as `bridge_scaffold` | Backwards compat. Use `bridge_scaffold` in new code. |
| `grammatical_forms` | Noun/verb/adjective bridges | Show as tabs or pills if non-null. |
| `tts_backend` | `"piper"` or `"azure"` | Informational. Could log for analytics. |
| `subject` | `"science"`, `"math"`, etc. | Show as context tag below the definition. |
| `grade_band` | `"K-2"`, `"3-5"`, `"6-8"`, `"9-12"` | Show as context tag. |
| `transliteration_difficulty` | `"high"`, `"medium"`, `"low"` | Optional badge. High = this word is especially hard to translate. |

### Response — Term NOT Found (Translator Fallback)

```json
{
  "term": "mitochondria",
  "language": "dari",
  "type": "cognate",
  "cognate": "میتوکندری",
  "bridge_anchor": null,
  "bridge_scaffold": null,
  "bridge_definition": null,
  "bridge_definition_en": null,
  "audio_url": null,
  "audio_source": null,
  "source": "translator_fallback"
}
```

### What to Show the Student

| `source` value | What happened | How to display |
|----------------|---------------|----------------|
| `"lexicon"` | We had this term in our database | Show `bridge_anchor` first. Tap to expand `bridge_scaffold`. Play audio if `audio_url` is set. Show `grammatical_forms` tabs if available. |
| `"translator_fallback"` | We didn't have it — Azure Translator generated a translation on the fly | Show the `cognate`. No bridge phrases. Consider showing "Machine translation — may not be perfect". |

### Errors

```json
{
  "error": "MISSING_FIELDS",
  "details": "Missing required fields: term, language"
}
```

Error codes: `UNAUTHORIZED`, `RATE_LIMITED`, `MISSING_FIELDS`, `INVALID_LANGUAGE`, `TRANSLATOR_ERROR`, `INTERNAL_ERROR`

---

## 2. TTS Router — "Say this out loud"

If lexicon-lookup didn't return audio, or if you want to generate audio for any text.

**POST** `/tts-router`

### Request

```json
{
  "text": "The process where plants make food from sunlight",
  "language": "dari",
  "pilotId": "PCSD-2026",
  "sessionToken": "anonymous-uuid"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `text` | Yes | The text to speak. Max 500 characters. |
| `language` | Yes | Same language list as lexicon-lookup |
| `pilotId` | Yes | Pilot identifier |
| `sessionToken` | Yes | Same anonymous UUID |

### Response

```json
{
  "audioUrl": "https://storage.blob.core.windows.net/tts-audio-cache/dari/a1b2c3d4.wav",
  "source": "proprietary",
  "backend": "piper",
  "quality": "beta",
  "durationMs": 450,
  "cached": false,
  "textHash": "a1b2c3d4e5f6..."
}
```

| `source` value | Meaning |
|----------------|---------|
| `"proprietary"` | Generated by our own TTS (Piper) |
| `"azure_cache"` | Audio was already cached from a previous request |
| `"azure_live"` | Azure TTS fallback (our service was unavailable) |

| `backend` value | What it is |
|-----------------|-----------|
| `"piper"` | Pre-trained voice (Arabic, French, Spanish, Dari, etc.) |
| `"azure"` | Azure Cognitive Services (all 22 languages) |

| `quality` value | Meaning | Suggested UI |
|-----------------|---------|-------------|
| `"production"` | Natural, ship-ready | Normal playback |
| `"beta"` | Good, still improving | Normal playback |
| `"experimental"` | Usable but rough | Show "Voice improving — flag issues" note |

### Playing the Audio

The `audioUrl` is a direct link to a WAV or MP3 file in Azure Blob Storage. Play with HTML5 `<audio>` or Web Audio API. Format may be WAV (proprietary) or MP3 (Azure) — both work in all browsers.

### Errors

Error codes: `UNAUTHORIZED`, `RATE_LIMITED`, `MISSING_FIELDS`, `INVALID_LANGUAGE`, `TEXT_TOO_LONG` (>500 chars), `AZURE_SERVICE_ERROR`, `INTERNAL_ERROR`

---

## 3. Flag Handler — "This doesn't sound right"

When a student flags a pronunciation, you call this. No auth required.

**POST** `/flag-handler`

### Request

```json
{
  "word": "photosynthesis",
  "language": "dari",
  "sessionToken": "anonymous-uuid",
  "pilotId": "PCSD-2026",
  "timestamp": "2026-03-19T14:30:00Z",
  "audioUrl": "https://storage.blob.core.windows.net/cache/dari/a1b2c3.mp3"
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `word` | Yes | The word that was flagged |
| `language` | Yes | Language of the pronunciation |
| `sessionToken` | Yes | Anonymous UUID |
| `pilotId` | Yes | Pilot identifier |
| `timestamp` | Yes | ISO 8601 timestamp |
| `audioUrl` | No | URL of the audio that was flagged (helps reviewers) |

### Response

```json
{
  "flagId": "sha256hash...",
  "flagCount": 3,
  "status": "review",
  "requiresReview": true
}
```

**How flagging works:** Every flag for the same word+language increments a counter. The status escalates automatically:

| Flag Count | Status | What Happens |
|-----------|--------|--------------|
| 1-2 | `logged` | Recorded, no action yet |
| 3+ | `review` | Enters human review queue |
| 6+ | `bounty` | (Future) Posted to interpreter marketplace |
| 10+ | `high_priority` | Urgent — admin notified |

### UI Suggestion

Show a simple flag button (🚩 or thumbs down) next to the audio player. After flagging, show "Thanks — we'll review this" and the current `flagCount` if you want ("3 students have flagged this").

---

## 4. Analytics Writer — "What happened"

Log events for the teacher dashboard. Call this on key user actions.

**POST** `/analytics-writer`

### Request

```json
{
  "sessionToken": "anonymous-uuid",
  "pilotId": "PCSD-2026",
  "language": "dari",
  "eventType": "term_lookup",
  "timestamp": "2026-03-19T14:30:00Z",
  "extensionVersion": "2.0.0",
  "term": "photosynthesis",
  "subject": "science",
  "source": "lexicon",
  "difficulty": "high"
}
```

**Event types you should send:**

| Event | When to Send | Include `term`? |
|-------|-------------|-----------------|
| `session_start` | Extension opens | No |
| `session_end` | Extension closes | No |
| `term_lookup` | Student highlights a word and gets a result | Yes — also send `subject`, `source`, `difficulty` from the lexicon response |
| `scaffold_view` | Student taps "More" to see expanded definition | Yes |
| `tts_play` | Student plays audio | Yes |
| `flag_event` | Student flags bad audio | Yes |
| `glossary_view` | Student opens the glossary/dictionary view | No |

**Why this matters:** These events power the school dashboard. `term_lookup` + `scaffold_view` together tell us if students are engaging with definitions or just glancing. A term looked up in September but not October means the student learned it. This is how we prove ROI to schools without tracking any individual student.

### PII Protection

The backend **rejects** any payload containing these fields: `email`, `name`, `firstName`, `lastName`, `studentId`, `schoolId`, `teacherId`, `userId`, `phone`, `address`, `dob`, `dateOfBirth`, `ssn`, `ipAddress`, `deviceId`.

If you accidentally include any of these, you'll get a `400` with `error: "PII_VIOLATION"`. This is intentional — it's a safety net for FERPA compliance.

---

## 5. Auth Layer — "Who is this teacher?"

**Students never call this.** This is only for the teacher/admin dashboard.

**POST** `/auth-layer`

### Request

Send the Supabase JWT in the Authorization header:

```
Authorization: Bearer <supabase-jwt-token>
```

### Response

```json
{
  "userId": "uuid-from-supabase",
  "email": "teacher@school.edu",
  "accessiblePilotIds": ["PCSD-2026"],
  "isSuperAdmin": false,
  "permissions": ["view_dashboard", "manage_flags"]
}
```

**Permissions:**

| Permission | What It Grants |
|-----------|---------------|
| `view_dashboard` | See analytics and flag data |
| `export_data` | Download CSVs |
| `manage_flags` | Resolve, dismiss, or escalate flags |
| `manage_users` | Add/remove admin users, assign pilots |

**Super admins:** Any `@languagebridge.app` email automatically gets all permissions.

---

## Session Token — How It Works

The `sessionToken` is NOT a login. It's a random UUID that the Chrome extension generates on first install and stores locally. It serves two purposes:

1. **Session grouping** — analytics can show "this session had 12 lookups" without knowing who the student is
2. **Deduplication** — prevents double-counting events

**How to generate it:**
```javascript
const sessionToken = crypto.randomUUID(); // e.g., "550e8400-e29b-41d4-a716-446655440000"
// Store in chrome.storage.local — persist across sessions
```

**Rules:**
- 8-64 characters, alphanumeric + hyphens only
- Never send it to any other service
- Never tie it to a student's identity
- It's fine if the same student gets a different token on a different device

---

## Supported Languages (22)

Use these exact strings for the `language` field:

```
arabic, french, portuguese, ukrainian, vietnamese, spanish, persian, english,
nepali, swahili,
dari, pashto, urdu, burmese, uzbek, amharic, somali, tagalog, kinyarwanda, twi, tigrinya
```

Any other value returns `INVALID_LANGUAGE`.

**Voice quality by language:**

| Quality | Languages |
|---------|-----------|
| Production (Piper native) | Arabic, French, Spanish, Portuguese, Ukrainian, Vietnamese, Persian |
| Beta (Piper proxy) | Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi |
| Azure only | Burmese, Uzbek, Amharic, Tagalog, Tigrinya, English |

Spanish dialect variants (Colombian, Mexican, Peruvian, Puerto Rican, Venezuelan) are handled server-side. Frontend always sends `language: "spanish"`.

---

## Recommended UI Layout

### Collapsed (default when term first appears)

```
┌──────────────────────────────────────┐
│ photosynthesis                    🔊 │
│ plants making food from light        │  ← bridge_anchor
│ ▼ More                               │
└──────────────────────────────────────┘
```

### Expanded (after tapping "More")

```
┌──────────────────────────────────────┐
│ photosynthesis                    🔊 │
│ plants making food from light        │  ← bridge_anchor
│                                      │
│ The way green plants turn light,     │
│ water, and air into food they can    │  ← bridge_scaffold
│ use.                                 │
│                                      │
│ [noun] plant food-making from light  │  ← grammatical_forms.noun
│                                      │
│ فوتوسنتز                             │  ← cognate
│                                      │
│ science · grades 6-8            🚩   │  ← subject + grade_band + flag
└──────────────────────────────────────┘
```

### Key UI Rules

1. **Always show `bridge_anchor`** — short enough for any screen
2. **`bridge_scaffold` behind a tap** — don't overwhelm newcomer students
3. **Audio plays on first tap of 🔊** — no waiting for text to load
4. **Grammatical form tabs only if non-null** — many terms have 1-2 forms
5. **Cognate is secondary** — show below the bridge, not above
6. **Flag button always visible** — one tap to report bad audio
7. **If `quality === 'experimental'`** — show small "Voice improving" note

---

## Quick Start — Minimum Viable Integration

Two API calls get you a working prototype:

```javascript
// 1. Student highlights "photosynthesis" in Dari
const API_KEY = 'key-from-justin'; // Store in chrome.storage.local, never hardcode

const lookup = await fetch('/api/lexicon-lookup', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'x-lb-api-key': API_KEY },
  body: JSON.stringify({
    term: 'photosynthesis',
    language: 'dari',
    pilotId: 'PCSD-2026',
    sessionToken: getOrCreateSessionToken(),
  }),
});
const result = await lookup.json();

// 2. Show bridge phrases (v2 — two tiers)
if (result.bridge_anchor) {
  showAnchor(result.bridge_anchor);         // Always visible
  showScaffold(result.bridge_scaffold);     // Behind "More" tap
}
if (result.grammatical_forms) {
  showForms(result.grammatical_forms);      // Noun/verb/adj tabs
}
if (result.cognate) {
  showCognate(result.cognate);              // Native script
}

// 3. Play audio (if available from lexicon) or generate it
if (result.audio_url) {
  playAudio(result.audio_url);
} else {
  const tts = await fetch('/api/tts-router', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-lb-api-key': API_KEY },
    body: JSON.stringify({
      text: result.cognate || result.bridge_anchor || result.term,
      language: 'dari',
      pilotId: 'PCSD-2026',
      sessionToken: getOrCreateSessionToken(),
    }),
  });
  const audio = await tts.json();
  playAudio(audio.audioUrl);

  // Optional: show quality hint
  if (audio.quality === 'experimental') {
    showNote('Voice quality improving — help us by flagging issues');
  }
}
```

That's it. Flagging, analytics, and auth are optional for the first prototype.

---

## Types

All TypeScript types are defined in `backend/shared/types.ts`. Import directly:

```typescript
import type {
  LexiconLookupRequest,
  LexiconLookupResponse,
  TTSRequest,
  TTSResponse,
  SupportedLanguage,
} from '../../backend/shared/types';
```

TypeScript enforces the contract. If a field exists in the type, you can use it. If it's optional (`?`), check for null before rendering.
