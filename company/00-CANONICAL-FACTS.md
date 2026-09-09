# Canonical Facts — LanguageBridge LLC

**The single source of truth.** Every other document, deck, DPA, and questionnaire answer must match these values. If something you're writing disagrees with this page, this page is right.

**Last reconciled:** September 2026 · **Owner:** Justin Bernard

---

## 1. The company

| Field | Value |
|---|---|
| Legal entity | LanguageBridge LLC |
| Principal address | 856 Eastlawn Dr, Highland Heights, OH 44143 |
| Founder / CEO / Data Security Officer | Justin Bernard |
| Contact | justin@languagebridge.app · (216) 800-6020 |
| Stage | Early-stage ed-tech; pilot / pre-scale |
| Signed customers | Parma City Schools (MVP DPA, 2026-03-03) |

## 2. The product

LanguageBridge makes grade-level English schoolwork comprehensible for K-12 multilingual learners — especially refugee and immigrant students, including Students with Limited or Interrupted Formal Education (SLIFE). It is delivered as:

- a **Chrome extension** (the primary surface — where students read), and
- **`languagebridge.app`** — the teacher/admin dashboard, the `/teacher` companion app, and marketing.

(An earlier separate marketing domain, `pierlearning.com`, is no longer pursued.)

**Three features:** (1) Highlight & Hear vocabulary lookup with a plain-English "bridge" scaffold, native-language cognate, and audio; (2) an Academic Glossary; (3) Talk to Teacher, a two-way voice translator for real-time student↔teacher conversation.

## 3. The 16 supported languages (canonical)

Arabic · Burmese · Dari · English · French · Nepali · Pashto · Persian · Portuguese · Somali · Spanish · Swahili · Tagalog · Ukrainian · Urdu · Vietnamese

- **15 are fully native** for translation + audio.
- **Dari** works via **Persian** for both speech synthesis and recognition (shared script, ~80% mutual intelligibility).
- **Do not list** Kinyarwanda, Twi, Uzbek, Amharic, or Tigrinya as supported — they were removed. Older docs that list 21–22 languages are stale.

## 4. The technology (customer-safe summary)

| Layer | What |
|---|---|
| Backend | 9 stateless Azure Functions (TypeScript), serverless |
| Data | Azure Cosmos DB (`languagebridge-prod`), Azure Blob Storage (audio cache) |
| AI services | Azure Translator, Azure Speech (TTS + STT); proprietary Piper/Kokoro voices (rolling out) |
| Auth | Supabase (teacher/admin JWTs only; students never create accounts) |
| Data residency | Microsoft Azure, East US (United States) |
| Encryption | AES-256 at rest; TLS 1.2+ in transit |

**Student identity model:** students never sign in. A pseudonymous code (`LB-XXXXXX`) is generated on device at onboarding and is the only link between usage data and an individual. It contains no personal information and cannot be reversed to a real identity.

## 5. Subprocessors

| Subprocessor | Purpose | Their compliance |
|---|---|---|
| Microsoft Azure | Cloud infra, Cosmos DB, Blob, Application Insights | SOC 2 Type II, ISO 27001 |
| Microsoft Azure Cognitive Services | Translation, TTS, STT | SOC 2 Type II |
| Supabase | Teacher/admin authentication (JWTs only — no student data) | SOC 2 Type II |
| Stripe Connect | *(post-marketplace only)* interpreter identity + 1099 payments; no student data | PCI DSS L1, SOC 1, SOC 2 |

> **Compliance posture, stated honestly:** LanguageBridge implements the **NIST Cybersecurity Framework v1.1** and maintains the supporting documents in `docs/compliance/`. LanguageBridge itself is **not** SOC 2 certified; the SOC 2 attestations above belong to the named subprocessors. Never imply LanguageBridge holds a certification it does not.

## 6. Data we collect / never collect

**Collect:** pseudonymous student code; student-selected school code, grade band, home language; anonymous usage events (lookups, audio plays, session timing, flags); flagged passages (text a student explicitly reports as wrong); browser version.

**Never collect:** student names, photos, faces; district/state student IDs; emails or any external identifier; contact info; grades, attendance, behavior, IEP/504/special-ed status; DOB, gender, ethnicity, race; stored IP addresses (used only in-request for rate limiting); browsing history outside the extension. Talk to Teacher audio and transcripts are **ephemeral** — processed and discarded, never stored.

## 7. Cost basis (for pricing; see COST-MODEL)

| Scale | Monthly infra cost |
|---|---|
| Pilot — 1 school, 100 students | ~$41 |
| District — 10 schools, ~1,000 students (with proprietary TTS) | ~$180 |

Implied cost of goods: **~$2–5 per active student per year.** This is the floor pricing must clear.

## 8. Lexicon & IP

- ~**127,590** bilingual terms seeded from NYU Steinhardt RBERN glossaries, plus ~**1,080** hand-authored bridge glosses (inline 1–3 word scaffolds).
- IP strategy: database copyright on the lexicon compilation, trademark on "The LanguageBridge Lexicon" (planned), proprietary TTS model weights, and a forward "dialect quality database" built from flag data.
