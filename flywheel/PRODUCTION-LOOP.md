# Production loop — how the Lexicon and our voices get built

Decided 16 Oct 2026 (Justin). Companion to [SPEC.md](SPEC.md): the spec covers *fixing* what students flag; this covers *producing* the assets that make LanguageBridge independent of Azure except as a fallback.

**Decisions this rests on**
- Contributors are US-resident diaspora only, paid in the US.
- Voice release + IP assignment are part of the contributor terms of service, accepted before any contribution.
- LanguageBridge-funded **R&D commissions** (voice-talent contracts and seeding batches) pay more than standard tasks.
- **One voice per language** for now.
- **First voice: Haitian Creole. Second: Dari.** (Until Dari has its own voice, Iranian Persian is the stopgap. Pashto is a different language and is never used for Dari.)

---

## 1. The loop

```
 1. FLAGS (district usage)    wrong meaning / wrong sound / misheard        → Fix tasks
 2. GAPS  (our usage logs)    Azure-served lookups, unverified RBERN terms  → Verify / Author tasks
 3. R&D   (LB-funded)         new languages + dialects, voice scripts       → Author + Record batches (premium)
                                        │
                                        ▼
    Author/Fix ─► Review ×2 ─► PUBLISH ─► Record ─► Validate ─► AUDIO PUBLISHED
                               (served             (2nd speaker   (the term's own audio,
                                at once)            + auto QC)     served before any model)
                                                        │
                                                        ▼
                                        Hours ledger per speaker and dialect
                                                        │  8–10 validated hours, one speaker
                                                        ▼
                         Train our voice ─► blind test vs Azure ─► ship that language
                                                        │
                                students flag "wrong sound" ──► back to stream 1
```

Streams 1 and 2 are demand-driven and scale with usage. Stream 3 is how we build what no district has asked for yet: languages without pilots, dialects nobody has flagged, and the 6,000-sentence scripts a voice needs.

---

## 2. The sense card — the unit we own

One English meaning, in one language and dialect:

| Part | Made by | Task |
|---|---|---|
| Target term (or phrase), `sense_key`, `sense_gloss` | Contributor | Author / Fix / Verify |
| 2–3 example sentences (AI drafts English; human writes the target) | Contributor | Author |
| Two independent approvals | Reviewers | Review |
| Recording of the term and each sentence | Native speaker | Record |
| Listen-through check | A second speaker | Validate |

Every card feeds five things at once: the lookup card, the translation memory (Dual Codex phrases), term audio, voice-training audio, and later translation-model pairs. One flag can therefore yield a corrected entry, sentences, audio, and ~30 seconds of training data.

**RBERN evolves through Verify tasks.** The contributor sees the RBERN translation and accepts, edits, or rewrites it for one sense. The result is a new human-verified entry; the RBERN row stays only as history.

---

## 3. Task types

| Task | Input | Output | Who | Stream | Paid per |
|---|---|---|---|---|---|
| **Fix** | Flag candidate + scrubbed context | Corrected entry for one sense | Contributor | 1 | Accepted entry |
| **Verify** | Unverified glossary or machine entry, ranked by usage | Same, now human-verified | Contributor | 2 | Accepted entry |
| **Author** | Term + sense gloss (+ AI English drafts) | Target sentences | Contributor | 2, 3 | Accepted sentence |
| **Review** | Any proposal | Approve / reject + note | Reviewer (not the author) | all | Review |
| **Record** | Approved text | WAV + metadata | Contributor, or the voice talent | 2, 3 | Accepted clip / finished hour |
| **Validate** | A recording + its text | Pass / fail + reason | Second native speaker | all | Validation |

Pay is per *accepted* unit, never per submission (SPEC §6). R&D tasks carry a higher rate. Rates: OPEN-DECISIONS #6.

**Generators**
- Stream 1: a flag candidate reaching `review` creates a Fix task (the admin queue can also create one by hand).
- Stream 2: a nightly job ranks `lexicon_hit` events with `provenance: machine` or `glossary` by usage per language and dialect, and opens Verify tasks for the top N not already queued.
- Stream 3: an admin creates a batch (e.g. "Haitian Creole voice script, sessions 1–50").
- Any newly approved entry opens Author (sentences) and Record tasks for itself.

---

## 4. R&D commissions

**Voice-talent contract (one per language).** One native speaker records the whole voice script, so the model learns one consistent voice.
- Target: 8–10 validated hours. At ~6 s per sentence that is ~6,000 sentences, or ~50 sessions of the current 120-sentence recorder script; expect ~30 hours of the talent's recording time.
- Same microphone, room and distance every session. The recorder already rejects silent or clipped takes.
- Paid per validated finished hour (or per accepted clip), from the R&D budget.

**Seeding batches.** Commissioned Author work that writes the voice script and seeds a language's Lexicon before any district uses it.
- Script mix: classroom sentences from approved sense cards (our domain) + general sentences chosen to cover every sound of the language (so the voice can say anything).
- AI drafts, native speaker rewrites; each sentence stores `authored_by` and `ai_assisted` (copyright: SPEC §7).
- Two approvals before a sentence enters the script. The talent may still correct while recording; the corrected text is what is saved (the recorder already does this).

---

## 5. From hours to a voice we own

| Validated hours (one speaker) | Step |
|---|---|
| 1 | Sanity fine-tune: does the pipeline produce intelligible speech? |
| 4–5 | Internal listening by the language lead; fix script gaps (missing sounds) |
| 8–10 | Full fine-tune → blind test |

- **Base model:** fine-tune from a commercially licensed base. Meta MMS is non-commercial and cannot be used. For Haitian Creole a French base is the natural start (French-lexified, overlapping sounds) — the Kokoro French voice (Apache 2.0) or a Piper French checkpoint whose model card allows commercial use. Verify the licence before training (OPEN-DECISIONS #15).
- **What we own:** the recordings outright and the fine-tuned voice. The base stays under its own licence, which these licences permit.
- **Ship gate:** native speakers rate our voice against the current option without knowing which is which. Ship only if ours wins. For Haitian Creole and Dari, Azure has no voice, so the bar is intelligibility and naturalness.
- **Ship:** behind `LB_TTS_SERVICE_URL`, per language, with Azure (or for Dari, Iranian Persian) as fallback.
- **Training data:** human-only export (TRAINING-DATA-POLICY). Public crowd datasets already on the MLTraining SSD (Common Voice, FLEURS) are not ours to own and make poor single voices; they may help only where their licence allows and must be tagged as such in the manifest.

---

## 6. First voice: Haitian Creole

| Item | State |
|---|---|
| Product support | Not yet a supported language. Azure has Haitian Creole translation (`ht`) but no voice. The voice can be trained first; adding the language follows MASTER-DOCUMENT §3 "Adding a language" |
| Script | Session 1 exists: 120 sentences (100 definitions from bridge glosses + 20 classroom), AI-drafted, not yet reviewed by a native speaker |
| Recorder | `ml-pipeline/recorder/` works locally. Needs per-clip `speaker_id`, `release_version`, `authored_by`, `ai_assisted` before the talent's first session |
| Talent | To recruit: one US-resident native speaker; terms of service with voice release accepted first |
| Next | Write sessions 2–50 as a seeding batch; native review; record; validate; ledger to 10 h |

**Second voice: Dari.** Same plan. Until it ships, Dari audio uses Iranian Persian voices.

---

## 7. What gets built (Matt)

| # | Piece | Notes |
|---|---|---|
| 1 | `contributors` container + signup | Terms of service (voice release + IP assignment) acceptance logged with version/time; US-residency attestation; roles: contributor, reviewer, voice talent, language lead |
| 2 | `tasks` container + generators | Fields: type, stream, language, variant, sense_key, input refs, assignee, status, rate tier (standard / R&D), accepted_at. Generators per §3 |
| 3 | Review gate | Two approvals, no self-review; on approval write/upgrade the Lexicon entry (`status: approved`, version + 1) and resolve any flag with its entry id |
| 4 | Hosted recorder | The existing recorder behind contributor sign-in; uploads to a `recordings-pending` blob container; auto QC (clipping, silence, duration vs text length); opens a Validate task |
| 5 | `recordings` container + hours ledger | Per clip: speaker_id, language, variant, text id, duration, QC result, validation result, release version. Ledger: validated hours per speaker per language/dialect |
| 6 | Training export | Human-only manifest (`wavs/` + `metadata.csv`, the Piper/recorder layout) → `ml-pipeline/` → blind test → `LB_TTS_SERVICE_URL` |
| 7 | Term audio serving | Approved term recordings set `audio_blob_path` on the Lexicon entry (lookup already serves it) |

Containers follow DATA-MODEL.md conventions; accessors go in `backend/shared/cosmos-client.ts`.

## 8. Measures

- **Azure dependency rate** per surface and language: share of lookups, translations and audio served by Azure (provenance logging already exists for lookups).
- Per language: approved sense cards, sentences, validated hours (talent), validated term recordings.
- Per contributor: acceptance rate (demotion below threshold, SPEC §6).
