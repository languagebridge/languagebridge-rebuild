# LanguageBridge — Build History

**How we actually got here**, reconstructed from the git log (170+ commits, `170ad5c` → present). The [Engineering Field Guide](ENGINEERING-FIELD-GUIDE.md) and [`company/00-CANONICAL-FACTS.md`](../company/00-CANONICAL-FACTS.md) are the authority on *current* state; this document is the authority on *how we arrived at it* — read it when you need to know why something is shaped the way it is, or why an old doc/comment says something that's no longer true.

---

## Phase 0 — Monorepo scaffold

`170ad5c` set up an npm-workspaces monorepo with four packages: `backend/`, `extension/`, `pwa/`, `ml-pipeline/`. This is also the **last commit that ever touched `pwa/`** — see [The PWA that wasn't](#the-pwa-that-wasnt) below.

## Phase 1 — Backend core

The Azure Functions backend was built incrementally, function by function, on top of shared infrastructure landed first: API contract types, then Cosmos/Blob clients and validators. Functions were added in this order: `tts-router` → `analytics-writer` → `flag-handler` → `auth-layer`, followed by a fix to lazy-initialize DB clients and register everything through a single `index.ts` entry point for Azure Functions v4.

## Phase 2 — ML pipeline attempt #1: Kokoro, and a 22-language push

`c077ce2` added a custom TTS fine-tuning pipeline based on Kokoro-82M ("Volume 4"). The following ~25 commits are a real debugging trail on Apple Silicon (MPS) training:

- NaN losses fixed via decoder-output clamping and stable mel normalization
- OOM fixed by disabling data-loader workers and reducing batch size
- A 23x speedup from capping mel-spectrogram frames at 200
- A gradient bug rewrite that yielded a 100x training speedup

In parallel, language coverage was pushed hard: the RBERN glossary pipeline and Cosmos seed script landed, Somali data was added, a script split Common Voice's Farsi (`fa`) data into Dari vs. Iranian Persian, phoneme coverage was chased from 19 to 20 languages, and a sequential training script targeted a full **22 languages**.

## Phase 3 — The pivot away from custom voices

Two refactor commits reversed course: `c47d5a7` stripped Kokoro out of the inference service and hardened it for production, and `170303d` deleted the Kokoro training code entirely, replacing it with auth + rate limiting on all endpoints. Custom voice training wasn't pilot-ready — `ml-pipeline/` became a parked research track, and **Azure TTS became the real production voice path**. This is why `ml-pipeline/` still exists in the repo but isn't deployed.

## Phase 4 — Production hardening + Talk to Teacher v1

A long run of hardening work: multi-tenancy, dashboard endpoint, distributed rate limiting (Cosmos-backed, because in-memory limiters don't work across multiple Function instances), a TOS-clean flag pipeline (`ed04fb2` — only student-authored text is ever stored in the flag/bounty system; Azure-derived output never enters it, which is what keeps the future interpreter marketplace defensible), cognate auto-backfill via Azure Translator on lexicon misses, and pseudonymous student onboarding. Talk to Teacher's backend landed here too: `e94e31b` added `speech-to-text` and `translate`.

## Phase 5 — The language correction, twice

`2c5bcb1` updated the docs to say **21 languages** (with Haitian Creole noted as a 22nd, in training). Later, `dfe4efc` **dropped 5 of those languages** — Kinyarwanda, Twi, Tigrinya, Amharic, Uzbek — after they proved non-working in production, landing on the current **16**. `company/00-CANONICAL-FACTS.md` and the field guide reflect this; several older docs (`BACKEND-ARCHITECTURE.md`, `LANGUAGEBRIDGE-MASTER-BLUEPRINT.md`) still carry an explicit "partly superseded" banner pointing back at canonical facts rather than being rewritten line-by-line — the README lacked that banner until this history doc's companion cleanup pass, which is what prompted writing this file.

## Phase 6 — The extension becomes part of this repo

`0867e38` integrated Prentice Howard's Chrome extension, realigned to the (by-then) 16-language backend. From here, extension development has continued **directly on the backend branch** (not only on `feat/prentice-extension-rebuild`) in a long, active sequence: a bug-kill pass with real consent and an options page, the Talk to Teacher rebuild with a genuine offscreen-mic + 16kHz WAV pipeline (`fc32e98`), a translation-first lookup card redesign with honest one-tap flagging (`1a2fc1a`), language-first onboarding with a demo path, a syllable-sorted glossary with cached-replay audio and phrase lookups, school provisioning and per-school licensing, and Chrome Web Store listing copy corrected to 16 languages (`c1580dc`).

**Practical implication:** `feat/prentice-extension-rebuild` and this branch have diverged histories — extension work is *copied in*, not merged. Don't attempt a git merge between them.

## Phase 7 — Docs & compliance pass

`e3a2f47` added the canonical company doc set (`company/00-CANONICAL-FACTS.md`), the Engineering Field Guide, and reconciled several stale documents by adding "superseded" banners rather than rewriting them wholesale. The same commit added `deliverables/talk-to-teacher-pwa/` — see below.

---

## The PWA that wasn't (and the one that is)

Two different things share the word "PWA" in this repo, and it's easy to conflate them:

1. **`pwa/` (the npm workspace)** — scaffolded in the very first commit (`170ad5c`) and never touched again. `pwa/src/{components,hooks,pages,utils}` are empty directories today. Nothing was ever built here.

2. **`languagebridge.app`** — the actual teacher/admin dashboard and `/teacher` companion app referenced in the field guide and canonical facts. This is being built **outside this repo**, in a separate Lovable-generated project. What lives in *this* repo is a handoff package at `deliverables/talk-to-teacher-pwa/`: a self-contained React clone of the extension's Talk to Teacher feature (mic capture, WAV transcode, API client, a reference server-side proxy that hides the shared API key from the browser), written as a drop-in `/teacher` route with integration instructions and a `LOVABLE-PROMPT.md`. As of this writing it's a **spec/reference implementation waiting to be copied into the Lovable project** — it has not been confirmed integrated or deployed.

If you're a new engineer looking for the dashboard's source, it isn't in this repo.

---

## Where things stand now

For current state (not history), see:
- [`README.md`](../README.md) — start here
- [`docs/ENGINEERING-FIELD-GUIDE.md`](ENGINEERING-FIELD-GUIDE.md) — architecture, decisions, roadmap
- [`company/00-CANONICAL-FACTS.md`](../company/00-CANONICAL-FACTS.md) — single source of truth for customer-facing facts
