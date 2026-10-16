# Lexicon Flywheel — Training-data and ownership policy

Status: **adopted for engineering, pending Chris's review** (OPEN-DECISIONS #1, #12–#16).
Applies to: any export, dataset, model, or claim of ownership built from Lexicon, flag, recording, or usage data.

The rule in one line: **store machine output when it helps us fix it; never train on it, sell it, or call it ours.**

---

## 1. What may be stored vs. trained on vs. claimed

| Data | Store? | Train our models on it? | Claim as LanguageBridge IP? |
|---|---|---|---|
| Human entries that passed the two-approval gate (`status: approved`) | Yes | **Yes** | **Yes** |
| Human-authored sentences and recordings from contributors with a signed IP assignment and voice release | Yes | **Yes** | **Yes** |
| Reviewer decisions, sense tags, flag frequency, usage counts | Yes | Yes (as metadata) | Yes (compilation) |
| Azure Translator / Speech output (`provenance: machine`, misheard transcripts in recognition flags) | Yes, to fix it | **No** | **No** |
| RBERN glossary terms (`created_by: rbern_glossary`) | Yes — a starting point | After a contributor verifies them (they become `approved`) | The evolved, verified entries — never the RBERN glossaries as-is (#12) |
| AI-drafted text a human did not substantially rewrite (`ai_assisted: true`, no human edit) | Yes, as a draft | No | No |
| Student text (highlights, flagged context, Talk to Teacher) | Only as scrubbed flag context | **Never** | **Never** |
| Student audio | Not stored | **Never** | **Never** |

Why machine output stays out of training even though we may store it: Microsoft's terms may restrict using service output to build competing services (Chris to confirm, #1), and a model trained on Azure output would inherit Azure's errors and weaken any claim that the result is ours.

## 2. How it is enforced

- Every Lexicon row has a computed `provenance` (`human_verified` · `glossary` · `machine`) — `provenanceOf()` in `lexicon-lookup`.
- **Any training export filters to `provenance === 'human_verified'`** plus contributor recordings with a valid voice release. A glossary row joins once a contributor has verified it, which makes it `human_verified`.
- Exports record, per row: entry id, version, `authored_by`, `ai_assisted`, reviewer ids, approval dates, contributor agreement version. A row missing any of these is dropped, not defaulted.
- Recognition-flag transcripts never leave the `flags` container; they are inputs to a human fix, never examples.

## 3. Base models

A model we train inherits its base model's licence. Before any fine-tune:

| Base | Licence (to verify per release) | Commercial use |
|---|---|---|
| Meta MMS (speech) | CC-BY-NC 4.0 | **No** — evaluation only (already noted in MASTER-DOCUMENT §16) |
| Meta NLLB (translation) | CC-BY-NC 4.0 | **No** |
| OpenAI Whisper (speech recognition) | MIT | Yes |
| Kokoro-82M (voice) | Apache 2.0 | Yes |
| Piper voices | Per voice / dataset — varies | Check each one in `voice-config.json` |

## 4. Contributors' voices

A recording that trains a synthetic voice is the speaker's likeness. Before any recording task:

- A **voice release**, part of the contributor terms of service and accepted before any contribution (decided, #13): consent to synthetic-voice training and commercial use, how they are paid, whether they can withdraw and what withdrawal means for already-trained models. Acceptance is an explicit step, logged with version and timestamp.
- State law applies (e.g. Illinois BIPA for voiceprints, Tennessee ELVIS Act for voice likeness). Chris to scope (#13).
- The recorder (`ml-pipeline/recorder/`) must write `speaker_id`, `release_version`, `authored_by`, `ai_assisted` alongside each clip. It does not yet.

## 5. Privacy limits that shape the data

- **Children's speech:** COPPA treats a child's voice recording as personal information. We keep no student audio, so speech-recognition training uses adult contributor speech only. This is a known quality gap for children's speech; closing it would need district opt-in plus parental consent and is not planned.
- **Dialect is a language preference, not national origin.** See [VARIANTS.md](VARIANTS.md) §Privacy.

## 6. Paying contributors

- Independent-contractor agreement, tax reporting, per accepted unit (SPEC §6).
- **US-resident only (decided, #14).** LanguageBridge recruits and pays US-resident diaspora contributors only. Record a residency attestation at signup. This also keeps us clear of sanctions rules on paying people in Cuba or Afghanistan.
- Contributor personal data (tax, payment, identity) lives in contributor systems only — never alongside student data, never in the Lexicon.
