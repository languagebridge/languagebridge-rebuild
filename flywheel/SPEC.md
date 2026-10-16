# LanguageBridge Lexicon Flywheel — Spec

Owner: Justin Bernard · Build: Matt (backend), Prentice (dashboard UI) · Legal: Chris
Version: 1.0, 16 Oct 2026. Source: "LanguageBridge Lexicon Flag System Spec" (15 Oct 2026), reconciled against the code on branch `feat/lexicon-flywheel`.
Replaces: `docs/PRD-ML-FLYWHEEL.md` (deleted). Where the two disagreed, this document wins; the differences are listed in §12.

Section numbers are referenced from code comments (`flywheel/SPEC.md §2`). Keep them stable.

---

## 1. Purpose and IP thesis

Every bad translation, mispronunciation, or misheard word a teacher or student hits becomes a human-verified entry in the **LanguageBridge Lexicon**, which we own and serve ahead of Azure on every request.

**What we own:** corrected target terms, sense tags, phonetic transcriptions, example sentences, reviewer decisions, flag frequency data, and the compiled Lexicon as a whole.

**What we do not need to own:** Azure's raw output. Under Microsoft's standard terms it is our customer data, not Microsoft's (**Chris to confirm** — see §11). It was never the moat.

**Why it is defensible:** classroom vocabulary in low-resource languages, tagged by subject and grade band and verified by native speakers, does not exist as an off-the-shelf dataset. The existing 127,590-term RBERN lexicon plus 1,080 bridge glosses is the seed — though we do not claim the RBERN terms as ours until their licence is checked (OPEN-DECISIONS #12).

**The hard limit:** a single word pair is a fact and gets almost no copyright protection. The protection is contracts, trade secret, and the compilation (§8).

---

**Production:** fixing flags is one of three streams that build the Lexicon and our voices; the other two are usage gaps and LanguageBridge-funded R&D commissions. See [PRODUCTION-LOOP.md](PRODUCTION-LOOP.md).

---

## 2. Three flag types

Each failure is stored as a flag but fixed in a different place. Counts are kept per type and never merged.

| `flagType` | Student sees | What went wrong | Fixed by | Phase |
|---|---|---|---|---|
| `translation` | "Wrong meaning", "Still in English" | The target term or phrase is wrong | Corrected Lexicon entry / phrase (§5) | 1–2 |
| `pronunciation` | "Wrong sound" | TTS said the right word badly | Phonetic transcription → SSML phoneme / custom lexicon | 3 |
| `recognition` | "Misheard me" (Talk to Teacher only) | Speech-to-text heard a different word, so the input was wrong | Recognition phrase list per language + subject | 3 |

"Misheard" only exists where there is speech, so it appears in Talk to Teacher and not on the lookup card. Each Talk to Teacher bubble offers "Misheard me" (recognition, in the language spoken) and "Wrong meaning" (translation, in the language translated into).

**Built:** all three types are accepted by `flag-handler` and raised by the extension.

---

## 3. Pipeline

```
capture → scrub → group into candidate → admin triage → contributor fix → 2 independent approvals → publish → serve + count
   P1        P1          P1                    P1               P2                   P2                 P2        P1/P2
```

1. **Capture** — `POST /api/flag-handler`. One tap, no free text from the student.
2. **Scrub** — PII in the flagged term → rejected. Context and speech → redacted and trimmed (§9).
3. **Group** — one candidate document per (text + language + subject). Repeat reports increment counts and add up to 10 context samples.
4. **Triage** — `GET /api/flag-queue`, `POST /api/flag-queue/{id}/action` (super-admin only). Actions: `in_review`, `resolved` (requires the fixing entry id), `dismissed`, `reopen`.
5. **Fix** — a contributor proposes the corrected entry for one *sense*. (Phase 2: review UI.)
6. **Gate** — publishes only after **two independent approvals**; a reviewer cannot approve their own work. Rejections loop back to the contributor.
7. **Publish + serve** — the entry's `status` becomes `approved`; `lexicon-lookup` ranks it first and `translate` applies it via Dual Codex. Usage is counted per entry id.

**Re-flagging:** if a resolved candidate is flagged again it re-opens to `review` automatically; the previous resolution stays in `resolutionHistory`. Dismissed and in-review candidates keep their status but keep counting.

**Count-based escalation** (`FLAG_THRESHOLDS`: 3 → `review`, 6 → `bounty`, 10 → `high_priority`) is kept as a priority signal only. `bounty` does **not** mean anything is offered to a marketplace (§6).

---

## 4. Data model

Core rule: **entries are keyed by English sense, not English spelling.** "Table" in a math lesson and "table" in the cafeteria are two senses with two translations. At capture time the subject is the best sense signal we have, so it is part of the candidate key; the reviewer assigns the final `sense_key`.

Full field lists, current and planned containers: [DATA-MODEL.md](DATA-MODEL.md).

Entries, flags and enrollments also carry an optional **variant** (dialect), resolved through a fallback chain such as `es-HN → es-419 → spanish`. Chains never cross languages. Design: [VARIANTS.md](VARIANTS.md).

What may be trained on or claimed as ours (human-verified only, never machine output): [TRAINING-DATA-POLICY.md](TRAINING-DATA-POLICY.md).

---

## 5. Runtime override

Approved entries are applied on every request. Single-term lookups already read the Lexicon before Azure; sentence translation goes through the **Dual Codex** layer. Design and limits: [DUAL-CODEX.md](DUAL-CODEX.md).

**Translation, in order of preference:**
1. **Phrase entries** (`entry_kind: 'phrase'`) — whole classroom phrases. Built for exact whole-utterance matches.
2. **Dynamic dictionary** (`entry_kind: 'fixed_term'`) — proper nouns, named programs, non-inflecting academic terms. Built. Microsoft documents this markup as safe for compound and proper nouns only (Microsoft Learn: Translator dynamic dictionary), so it is never used for ordinary words.
3. **Post-translation substitution** (`entry_kind: 'term'`) — single inflecting words, only in languages where the entry stores inflected forms. Not built: matches are counted, not substituted.
4. **Custom Translator, later** — once we have enough approved sentence pairs. The model lives in Azure; the training pairs stay in our database.

**Pronunciation:** SSML `<phoneme>` injection in `tts-router` `buildSSML`, or a custom lexicon file built from the pronunciations table. (Phase 3.)

**Recognition:** phrase lists per language and subject. **Verify first:** we call Azure's short-audio REST endpoint, which as far as we know does not accept phrase lists; phrase lists may need the Speech SDK or Custom Speech. (Phase 3.)

**Counting:** every lookup logs `entry_id` + `provenance`; every Dual Codex hit logs entry ids only (never text) as `lexicon_override_fired`. These counts drive priority, prove value to districts, and support contributor royalties if we choose that model.

**Rollback:** set an entry's `status` to `deprecated`. Lookup stops serving it immediately; Dual Codex within one cache TTL (5 min default). No deploy.

---

## 6. Contributors (translator marketplace)

**Do not build an open marketplace first.** Two-sided marketplaces usually fail on supply, and for low-resource languages qualified supply is the bottleneck. Start with two or three paid linguists in the highest-volume languages; open onboarding once the review tooling is proven (Phase 5).

**Roles**
- **Contributor** — proposes a correction and writes the target-language example sentence.
- **Reviewer** — verified native speaker; approves or rejects. Cannot review their own work.
- **Language lead** — one per language; breaks ties and sets style rules (register, dialect).

**Gate:** two independent approvals. One bad entry is served to every school using that language.

**Pay:** per accepted entry, never per submission. Contributors whose agreement rate with reviewers drops are demoted.

**Access:** no account activates until the contributor agreement with IP assignment is signed (§8). Contributors see only the term, the scrubbed context, and the sense gloss — never district or school names, never the full Lexicon. The admin queue already strips school codes to a count.

**Sourcing:** refugee resettlement agencies, community language organizations, university language programs, interpreters. Paying district-employed bilingual aides may create a conflict of interest — Chris rules before any outreach.

---

## 7. Example sentences (Phase 4)

AI drafts the English sentence; a human writes the translated sentence. That split is what makes the sentences ownable.

1. When an entry is approved, an LLM drafts two or three English sentences for that sense at the right grade band.
2. The contributor picks one and writes the target-language sentence, or substantially rewrites a machine draft.
3. A reviewer approves it under the same two-approval gate.
4. Each sentence records `authored_by` and `ai_assisted`.

Why: the US Copyright Office's January 2025 report (Part 2) concludes purely AI-generated material is not protected, while human-authored expression and creative modifications are. An auto-generated sentence bank is not a defensible asset.

Used in: Bridge Glossary cards, Highlight & Hear audio, later as training pairs.
**Hard rule:** student text is never used as an example sentence.

---

## 8. IP protection stack

No single legal tool protects a lexicon, so we stack them. The first two matter most and cost least.

1. **Contracts** — founder IP assignments; contributor agreement with present-tense IP assignment (not work-for-hire alone: work-for-hire covers contractors only in narrow statutory categories).
2. **Trade secret** — the full Lexicon is never exposed: contributors see one term at a time, the API returns one entry per request, rate limits cap scraping.
3. **Compilation copyright** — selection, sense structure and tagging of the whole set.
4. **Copyright in human-authored sentences** (§7).
5. **Customer terms** — DPA/NDPA language that usage data improves the product, and no district claim on resulting entries.

What this does not protect: a competitor independently writing the same Somali word for "fraction." The moat is size, coverage, verification quality and speed of correction.

---

## 9. Privacy and compliance

The flag system must not break our no-student-PII position (MASTER-DOCUMENT §7).

| Rule | How it is enforced (built) |
|---|---|
| No identity in a flag | No name, account or student id stored. School and grade band are resolved server-side from the enrollment; client-supplied school codes are ignored. Seat role is `student` or `teacher` only. |
| Scrub before storage | Flagged term with an email / phone / SSN → `400 PII_VIOLATION`. Context → `scrubFlagContext`: emails, phones, SSNs, 3+ digit runs and mid-sentence capitalized words redacted; trimmed to 8 words either side of the term, ≤ 200 chars. |
| Speech is redacted | Recognition flags and anything from Talk to Teacher go through `redactPII` and are capped at 200 chars. |
| No student audio | No audio field exists. Storing audio would need explicit district opt-in under the DPA. |
| No flag text in logs | `flag-handler` logs a 12-char id prefix, type, language, count, status — never text or the student code. |
| Contributors never see districts | Admin queue returns `schoolCount`, never `schoolCodes`. Contributor views (Phase 2) get term + scrubbed context + gloss only. |
| Retention | Context samples are capped at 10 per candidate. Deleting raw samples after aggregation needs a window from Chris (§11). |

**Changed rule (needs Chris):** MASTER-DOCUMENT §7.1 rule 4 used to say Azure output is never stored in a flag because it is not ours. Recognition flags store a misheard transcript, which is Azure speech-to-text output. This spec's premise (§1) is that Azure output is our customer data. The master document now states the new rule, marked pending Chris.

The redaction is defense-in-depth, not a guarantee: it will miss lower-case names and non-Latin-script names.

---

## 10. Build phases

Status and checklists: [PHASES.md](PHASES.md).

| Phase | Scope | Gate |
|---|---|---|
| 0 Legal | Founder IP assignments, contributor agreement, NDPA clause | Chris signs off |
| 1 Capture | Three flag types, context, PII scrub, admin queue, lookup provenance | Flags arriving from one live building — or the bootstrap backlog (below) |
| 2 Correction | 2–3 paid linguists, review UI, two-approval gate, Dual Codex live | Corrected terms stop being re-flagged |
| 3 Sound | Pronunciation + recognition overrides | |
| 4 Sentences | Example sentence workflow → Bridge Glossary | |
| 5 Marketplace | Open onboarding, payouts, quality scoring | |

**No pilots → no flags.** We do not have to wait: we already know about bad data that can enter the pipeline as candidates now — 319 science-only bridge glosses (e.g. producer → "food-maker"), and Dari terms machine-translated as Persian before Oct 2026. `flywheel/scripts/bootstrap-candidates.mjs` produces that backlog.

---

## 11. Open decisions

Tracked with owners in [OPEN-DECISIONS.md](OPEN-DECISIONS.md).

---

## 12. What changed from PRD-ML-FLYWHEEL.md

| Topic | Old PRD | This spec |
|---|---|---|
| First product | Interpreter audio for Piper voice training | Lexicon text corrections; audio is Phase 3 |
| Marketplace | Open marketplace + Stripe Connect in Phase 3 | Paid linguists first; marketplace Phase 5 |
| Contract | Work-for-hire language | IP assignment (work-for-hire alone is too narrow for contractors) |
| Azure output | "Not ours — never store it" | Our customer data (pending Chris); recognition flags store it, redacted |
| Approval | One admin approves | Two independent approvals |
| Flag types | translation, pronunciation | + recognition |

## Sources
- Microsoft Learn — Translator dynamic dictionary
- Akin Gump — summary of US Copyright Office AI Report, Part 2 (Jan 2025)
