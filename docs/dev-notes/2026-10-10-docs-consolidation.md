# Dev notes — 10 Oct 2026: documentation consolidation

**Branch:** `docs/master-document` · **Depends on:** PR #2 (this branch is built on top of it)

The engineering docs had drifted apart and contradicted each other. They are now one document: [`docs/MASTER-DOCUMENT.md`](../MASTER-DOCUMENT.md). No code changed.

## What changed

- **New:** `docs/MASTER-DOCUMENT.md` (about 560 lines). Current state, language table, function and API reference, data, the no-PII method, extension reference, local setup, testing, deploy, decisions, history, roadmap, and a cleanup list.
- **Deleted, merged into it:** `TECHNICAL-OVERVIEW.md`, `BACKEND-ARCHITECTURE.md`, `ENGINEERING-FIELD-GUIDE.md`, `NEW-DEV-BACKEND-SETUP.md`, `TESTING-UNPACKED-EXTENSION.md`, `HISTORY.md`. They are still in git history.
- **`README.md`** is now a short entry point that links to the master document.
- **`company/README.md`** points at the master document instead of the deleted field guide.

## What was left alone, on purpose

`company/`, `docs/compliance/`, the two PRDs, `docs/DPA-V2-DRAFT.md`, `docs/dev-notes/` and `deliverables/`. They have different audiences or are formal, standalone documents. Section 18 of the master document explains each.

## How the facts were checked

Function names, routes, handlers, rate limits, containers, environment variables and the language table were read from the source on 10 October. Items carried over from older docs without checking are marked *(not re-checked)* in the document: lexicon counts, Cosmos partition keys and indexes, and Azure storage and Speech resource names.

Corrections the old docs needed:

| Old docs said | The code says |
|---|---|
| "9 endpoints" / "8 endpoints" | 10 HTTP functions in 9 folders (`onboarding` registers two) |
| 8 Cosmos containers | 9 (`rate_limits` was missing from the count) |
| Piper voices are the default | All live audio is Azure; `LB_TTS_SERVICE_URL` is not set on the live app |
| No CI | CI runs on pull requests to `main` |
| 16 prohibited PII fields | 15 |
| `shared/config.ts` exists | It was removed in September |

## Things to act on

- **Client address in the rate limiter.** `getSchools` and `enroll` use the `x-forwarded-for` address as their rate-limit key, and it is stored in `rate_limits` for up to 120 seconds. That conflicts with "we store no IP addresses". Hash it before use, or change the customer wording. See section 7.3.
- **Cleanup list.** Section 17 lists 12 leftover or mismatched items (phantom npm workspaces, the empty `pwa/`, the duplicate `backend/tests/`, a client/server rate-limit mismatch for audio, and others). None are fixed here.
- **Review for accuracy.** Read sections 5, 9 and 11 against what you know of the code and flag anything wrong. From now on, a pull request that changes a function, route, limit, container, environment variable or language should update the master document in the same pull request.
- The field guide page published in September is out of date.
