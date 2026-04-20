# PRD: The LanguageBridge ML Flywheel

**Status:** Draft — Phase 3 (post-pilot)
**Owner:** Justin Bernard
**Last updated:** 2026-04-20
**Strategic priority:** **Defining LanguageBridge IP**

---

## TL;DR

Every translation tool on the market is a thin wrapper around Google or Azure. They have no defensibility — anyone can swap out their LLM tomorrow. LanguageBridge's defensibility comes from a **closed-loop human-in-the-loop ML system** where:

1. Students flag bad translations and audio in real classroom contexts
2. Verified human interpreters fix them through a marketplace
3. Their corrections become training data for our proprietary voice models
4. Each generation of our models is provably better than Azure's stock voices for refugee/immigrant languages
5. Our lexicon and audio quality compounds over time in ways competitors cannot copy without our flag data

**This document specifies the architecture, components, and phased rollout for that flywheel.**

---

## The Problem

### Why this is the IP

After the pilot, the most common question from a discerning investor or competitor is: *"Why can't Google build this in three months?"*

The honest answer is that they can't, because:

- They don't have classroom-validated flag data on which Pashto pronunciations actually confuse Afghan refugee 6th graders
- They don't have a network of vetted bilingual interpreters who specialize in K-12 academic vocabulary
- They don't have a training pipeline that takes interpreter audio and improves Piper voices specifically for educational contexts
- They aren't FERPA-bound to the same data minimization that makes our pipeline trustworthy to schools

LanguageBridge is the only company positioned to build this loop because we're the only ones embedded in K-12 classrooms with refugee-language students at scale. The flag/marketplace/training loop converts that classroom presence into a structural moat.

### What's broken today

The flag-handler captures the input signal correctly (passage + language + flagType), but **everything downstream of capture is missing**:

- No admin terminal to review flagged content
- No interpreter onboarding, verification, or payments
- No marketplace for interpreters to claim and fulfill bounties
- No pipeline that moves interpreter audio into ML training
- No mechanism to update production lexicon/audio with verified human content

Without these, flagged content sits in Cosmos forever and the flywheel never spins.

---

## Vision

```
┌────────────────────────────────────────────────────────────────────┐
│                    THE LANGUAGEBRIDGE ML FLYWHEEL                  │
│                                                                    │
│  Student          ┌──────────────────┐         Verified            │
│  flags    ──────► │  Flag Database   │ ──────► Interpreter         │
│  passage          │ (per-type counts)│         Marketplace         │
│                   └──────────────────┘                             │
│                            │                            │          │
│                            ▼                            ▼          │
│                   ┌─────────────────┐        ┌──────────────────┐  │
│                   │  Admin Review   │ ◄──────│ Interpreter      │  │
│                   │  & Triage       │        │ submits audio    │  │
│                   └─────────────────┘        │ + correct text   │  │
│                            │                 └──────────────────┘  │
│                            ▼                                       │
│                   ┌──────────────────┐                             │
│                   │ Approved content │                             │
│                   │ replaces Azure   │ ──► Live in Lexicon DB      │
│                   │ in production    │     (cognate + audio)       │
│                   └──────────────────┘                             │
│                            │                                       │
│                            ▼                                       │
│                   ┌──────────────────┐                             │
│                   │ Audio + text     │                             │
│                   │ pair archived to │ ──► ML Training Pipeline    │
│                   │ training corpus  │     (Piper fine-tuning)     │
│                   └──────────────────┘                             │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

Every spin of the wheel:
- Improves a real student's learning experience tomorrow
- Pays a verified bilingual interpreter (revenue for our community)
- Adds training data that no competitor has access to
- Makes the next generation of our voices measurably better

---

## Users & Personas

| Persona | What they do | What they see |
|---|---|---|
| **Student** | Flags content during normal extension use | Just a 🚩 button with two icons — no awareness of what happens after |
| **Interpreter** | Browses bounties in their languages, claims one, submits corrected translation + audio recording | A focused work portal showing only flagged content in languages they're verified for, with payment info |
| **LanguageBridge Admin** | Reviews flagged content, approves submissions, manages interpreter quality, monitors fraud | Internal admin terminal with all flags, all submissions, payment status, interpreter quality scores |
| **School/Pilot Admin** | (no direct interaction with marketplace, but sees results in their dashboard — improved coverage, reduced flags over time) | Anonymized stats showing "X terms in Dari were improved this quarter based on student feedback" |
| **ML Engineer** | Pulls the latest training corpus to retrain voice models | Read-only access to the approved-content blob container with metadata manifest |

---

## Goals

| | Goal |
|---|---|
| G1 | Every flagged passage that reaches `bounty` status (6+ flags) is reviewable by an admin within 24 hours |
| G2 | A verified interpreter can claim, fulfill, and get paid for a bounty in under 7 days |
| G3 | Approved interpreter content replaces Azure placeholders in production lexicon within 1 hour of approval |
| G4 | All interpreter audio is automatically archived to training corpus with metadata for ML pipeline consumption |
| G5 | Year-end 1099-NEC forms are auto-generated for every interpreter paid more than $600 |
| G6 | Interpreter quality is tracked numerically — admins can see who's reliable and who isn't |

## Non-Goals (for v1)

- Real-time interpreter chat (this is async marketplace, not Uber-for-translators)
- Student-facing interpreter selection (students never know who fixed their flag)
- Voice cloning of interpreter voices for other contexts (training corpus is for our voice models only)
- Automatic ML retraining trigger (training is manually kicked off by ML engineer)

---

## System Architecture

### New Cosmos DB Containers

| Container | Partition Key | Purpose |
|---|---|---|
| `interpreters` | `/id` | Interpreter profile: languages, verification status, quality score, payment info ID |
| `bounties` | `/language` | Promoted flags ready for interpreter claim |
| `submissions` | `/bountyId` | Interpreter's submitted text + audio reference, pending admin review |
| `payments` | `/interpreterId` | Payment events for 1099 reporting (no card data — Stripe handles that) |

### New Blob Storage Containers

| Container | Purpose |
|---|---|
| `interpreter-submissions-pending` | Audio uploads awaiting admin approval (auto-deleted after 30 days if rejected) |
| `interpreter-submissions-approved` | Approved audio used in production lexicon |
| `training-audio-corpus` | Approved audio + metadata, ready for ML pipeline ingestion |

### New Endpoints

#### Interpreter-facing (auth: Supabase JWT, role: interpreter)

| Method | Path | Purpose |
|---|---|---|
| POST | `/interpreter/register` | Begin onboarding flow (identity, languages, Stripe Connect handshake) |
| GET | `/interpreter/profile` | Read own profile, payment status, quality score |
| GET | `/interpreter/bounties` | Browse open bounties filtered by interpreter's verified languages |
| POST | `/interpreter/claim` | Lock a bounty for 24 hours |
| POST | `/interpreter/submit` | Upload corrected text + audio (multipart) |
| GET | `/interpreter/submissions` | List own submissions and their status |
| POST | `/interpreter/withdraw` | Release a claimed bounty without submitting (with optional reason) |

#### Admin-facing (auth: Supabase JWT, role: admin/super_admin)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/flags` | List all flags (filter by status, language, age, count, type) |
| POST | `/admin/flags/{id}/promote` | Manually promote a flag to bounty status |
| POST | `/admin/flags/{id}/dismiss` | Mark flag as spam/test, do not promote |
| GET | `/admin/submissions` | List submissions pending review |
| POST | `/admin/submissions/{id}/approve` | Approve, trigger lexicon update + payment + training archive |
| POST | `/admin/submissions/{id}/reject` | Reject with required reason; interpreter is notified |
| GET | `/admin/interpreters` | List interpreters with quality scores and payment totals |
| POST | `/admin/interpreters/{id}/suspend` | Suspend an interpreter for fraud or quality issues |

#### Internal (auth: machine-to-machine token, ML pipeline only)

| Method | Path | Purpose |
|---|---|---|
| GET | `/internal/training-corpus/manifest` | Returns JSON listing every approved audio file + paired text + language + interpreter ID |

---

## Component Specifications

### 1. Interpreter Onboarding & Verification

**Stripe Connect** handles the heavy lifting:
- Identity verification via Stripe Identity (passport, driver's license)
- W-9 collection during onboarding
- 1099-NEC generation at year end (Stripe issues these)
- Bank account linkage for payouts (we never see card/account numbers)

**LanguageBridge tracks separately:**
- Languages spoken (must be one of our 21 supported)
- Self-declared specializations (medical, education, legal, social services)
- Optional: educator credentials (TESOL cert, bilingual education degree, etc.)
- Quality score (computed from approval rate + admin ratings)

**Verification gates:**
- Stripe Connect approval → interpreter can claim bounties
- First 3 submissions are "probationary" — auto-routed to senior admin review
- Quality score drops below 0.7 → automatic suspension pending admin review

### 2. Bounty Promotion

A flag becomes a bounty when:
- Either: `flagCount >= 6` (auto-promotion at the existing threshold)
- Or: An admin manually promotes it via `/admin/flags/{id}/promote` (covers urgent low-count flags from trusted teachers)

When promoted, a `BountyDoc` is created with:
- Reference to original `FlagDoc`
- The full `flaggedText`
- `language` of the target translation
- `pronunciationFlagCount` and `translationFlagCount` to guide interpreter focus
- `bountyValue` (USD amount — TBD by language scarcity, default $5/flag)
- `status: 'open'` (other states: `claimed`, `submitted`, `approved`, `rejected`)
- `expiresAt` (24h after creation; if not claimed, returns to flag pool)

### 3. Claim/Lock System

When an interpreter claims a bounty:
- Cosmos atomic patch: `status: 'open' → 'claimed'`, `claimedBy: interpreterId`, `claimedAt: now`
- 409 conflict means another interpreter beat them to it (same race-condition pattern as flag-handler)
- Lock expires after 24 hours; cron-style function reverts unclaimed bounties

### 4. Submission Format

```
POST /interpreter/submit
multipart/form-data:
  bountyId: string
  correctedText: string (the translation)
  audio: file (audio/wav or audio/webm, max 60 seconds, max 5MB)
  notes: string (optional, for admin context)
```

Audio gets uploaded to `interpreter-submissions-pending/{bountyId}/{interpreterId}.{ext}`.
Submission doc created with status `pending_review`.

### 5. Admin Review & Production Update

When an admin approves a submission:

1. Audio file copies from `interpreter-submissions-pending` → `interpreter-submissions-approved`
2. `LexiconDoc` for the original flagged term is updated:
   - `cognate` → interpreter's `correctedText` (replaces Azure's)
   - `audio_blob_path` → new approved audio path (replaces Azure-generated)
   - `audio_source` → `'interpreter'`
   - `created_by` → interpreter's ID
   - `status` → `'approved'`
3. Bounty closes, `FlagDoc.status` → `'resolved'`
4. Audio + text + metadata copied to `training-audio-corpus/{language}/{timestamp}-{interpreterId}.json`
5. Stripe payment triggered for `bountyValue` USD
6. Interpreter quality score updated (approval = +1 to numerator)

When an admin rejects:

1. Submission marked `rejected` with required reason
2. Bounty returns to `open` state
3. Audio held in `pending` container for 30 days then auto-deleted
4. No payment
5. Interpreter notified via email
6. If interpreter has 3+ rejections in 30 days, automatic suspension pending review

### 6. Training Corpus & ML Pipeline Integration

Each approved submission produces a manifest entry:

```json
{
  "id": "2026-04-20-LB-INT-7K2M-001",
  "language": "dari",
  "audioBlobPath": "training-audio-corpus/dari/2026-04-20-LB-INT-7K2M-001.wav",
  "text": "فتوسنتز",
  "originalEnglish": "photosynthesis",
  "interpreterId": "LB-INT-7K2M",
  "approvedAt": "2026-04-20T14:30:00Z",
  "duration_ms": 1840,
  "sampleRate": 22050
}
```

The `ml-pipeline/` directory in the repo gains a new script:
- `pull-training-corpus.py` — fetches manifest, downloads new audio since last training run
- Existing Piper fine-tuning scripts read from the local mirror

This stays manual for now (ML engineer kicks off training), but the pipeline is automation-ready.

---

## Compliance & Legal Considerations

### Interpreter classification

Interpreters are **independent contractors (1099)**, not employees. Stripe Connect's standard terms cover this. No benefits, no withholding. Each interpreter signs:

- Independent Contractor Agreement (specifies they own no IP in the audio they record — work-for-hire clause)
- Code of Conduct (no slurs, no PII in submissions, accuracy standards)
- NDA covering flagged passages they see (FERPA chain-of-custody requirement)

### IP ownership

The Independent Contractor Agreement must include explicit work-for-hire language so:
- LanguageBridge owns the recorded audio outright
- LanguageBridge can use it for ML training in perpetuity
- LanguageBridge can use it in production audio playback

This needs a lawyer review. Standard work-for-hire boilerplate from a startup attorney.

### FERPA chain-of-custody

The flagged passage shown to an interpreter contains student-highlighted text. This text could in theory contain PII (a student's own name, an address mentioned in a textbook). We mitigate by:

- Frontend warning before flag submission: *"Do not include personal information in your flag"*
- Backend PII scanner runs on `flaggedText` at submission time (already exists for analytics-writer, extend to flag-handler)
- Interpreters sign NDAs covering all content they see
- Audit log records every interpreter's access to every bounty

### Data retention

- Pending submissions: 30 days (auto-delete if rejected, indefinite if approved)
- Rejected submissions: deleted immediately on reject
- Approved submissions: retained indefinitely (training data)
- Bounty records: 7 years (tax compliance)
- Payment records: 7 years (tax compliance)

---

## Phased Rollout

### Phase 1 — Manual Operations (Weeks 1-4 of pilot)

**No new code.** During the pilot, you and any partners manually:
- Query `flags` container directly: `SELECT * FROM flags WHERE status IN ('bounty', 'high_priority')`
- Email 1-2 trusted interpreters with the flagged passages
- Receive corrected text + audio via email/Drive
- Manually update `lexicon` container in Cosmos
- Manually upload audio to blob via Azure Portal
- Pay interpreters via existing channels (Venmo, PayPal, check)

This is the cheapest way to validate that flags are meaningful and interpreters can deliver useful corrections. It's also the only honest way to set bounty pricing — you'll know what real interpreters charge.

### Phase 2 — Admin Terminal (Weeks 5-8)

Build only the admin side:
- `/admin/flags` endpoint with filtering
- `/admin/flags/{id}/promote` and `/admin/flags/{id}/dismiss`
- Simple web UI (could be a single-page React app or even a Streamlit dashboard for v1)
- No interpreter portal yet — admin still emails interpreters manually

This unlocks 10x faster admin review and is the first piece anyone outside engineering can use.

### Phase 3 — Interpreter Marketplace (Months 3-4)

Full marketplace:
- Stripe Connect onboarding
- All 7 interpreter endpoints
- Submission upload and admin review workflow
- Automatic lexicon update on approval

### Phase 4 — Training Pipeline Integration (Month 5)

- Approved audio copies to training corpus container
- Manifest generation
- ML pipeline pull script
- First retraining run with real interpreter data

### Phase 5 — Quality & Scale (Month 6+)

- Interpreter quality scoring & dashboards
- Automatic fraud detection (audio similarity, accent verification)
- Bounty pricing optimization based on language scarcity and turnaround time
- Payment audit reports

---

## Success Metrics

| Metric | Target by end of Phase 3 |
|---|---|
| Time from flag-promotion to interpreter claim | < 4 hours median |
| Time from claim to submission | < 48 hours median |
| Time from submission to admin review | < 24 hours |
| Approval rate (submissions approved / submitted) | > 70% |
| Interpreter retention (still active 90 days after first payment) | > 60% |
| % of pilot lexicon entries with interpreter audio (vs Azure) | > 15% in pilot languages |
| Cost per approved correction | < $10 all-in (interpreter pay + Stripe fees + ops) |

| Metric | Target by Phase 5 |
|---|---|
| Voice quality (MOS score) for interpreter-trained languages vs Azure baseline | +0.5 MOS or better |
| Per-language coverage (% of K-12 academic vocab with interpreter audio) | 50%+ for top 5 pilot languages |

---

## Open Questions

1. **Bounty pricing.** $5/flag is a placeholder. Real pricing depends on language scarcity (Pashto interpreters are scarcer than Spanish). Pilot phase should collect real data on what interpreters charge.

2. **Interpreter recruitment.** How do we find verified bilingual interpreters at scale? Pre-existing networks (refugee resettlement orgs, university bilingual education programs, court interpreter registries) are the obvious starting point — but each has its own onboarding friction.

3. **Quality control at scale.** If we have 200 interpreters, manual admin review of every submission becomes a bottleneck. At what point do we add a peer-review tier or automated quality checks (audio length, signal-to-noise, accent verification against reference samples)?

4. **Language gaps.** Azure STT doesn't support Twi, Kinyarwanda, or Tigrinya. For these languages, interpreter audio is the *only* source — there's no Azure fallback to compare against. How do we evaluate quality?

5. **Conflict of interest.** What if an interpreter is also a teacher in a pilot school? They could see flags from their own students. Policy needed.

6. **Multi-correction submissions.** Can one interpreter submit corrections for 50 bounties at once (batch upload)? Probably yes, but UX and approval workflow needs design.

---

## Appendix: Why this is the right architecture

**Why a marketplace and not in-house translators?**
- Scales linearly with demand without our headcount
- 1099 contractors give us flexibility on cost structure
- Diverse interpreter pool gives us better dialect coverage (Afghan Dari vs Iranian Persian, etc.)

**Why approved content also goes to training corpus, not just lexicon?**
- Production audio update fixes today's problem for one term
- Training corpus addition fixes future problems for the entire language
- Same interpreter recording delivers both — no extra cost

**Why human review on every submission instead of crowdsourced approval?**
- Schools require accountability — a single bad approval that goes live is reputational damage
- Human admin is the FERPA compliance checkpoint
- Reviewer count grows much slower than submission count, so this is sustainable

**Why not just use Azure for everything and skip the marketplace entirely?**
- Azure has no native Pashto, no Twi, weak Tigrinya — these are exactly the languages our customers care about
- Even where Azure exists, its TTS doesn't sound like an Afghan refugee parent — sounds Iranian, which Afghan kids notice and reject
- Without proprietary voices, we have no defensibility — this is the moat
