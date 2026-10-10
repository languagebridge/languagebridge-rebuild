# LanguageBridge

LanguageBridge helps K-12 English learners understand grade-level schoolwork. A student selects text on any webpage and gets it in their home language, with read-aloud audio and a simple-English aid for academic terms. A two-way voice feature, Talk to Teacher, lets a student and teacher talk across two languages.

It is a Chrome extension (`extension/`) and a web app at languagebridge.app, both backed by Azure Functions (`backend/`). Students never create accounts and no student identity is stored.

## Start here

**[docs/MASTER-DOCUMENT.md](docs/MASTER-DOCUMENT.md)** is the single current reference: what is built, the function and API reference, data, privacy rules, setup, testing, deployment, decisions, history and roadmap.

| If you need | Go to |
|---|---|
| How it works, and how to run and test it | [docs/MASTER-DOCUMENT.md](docs/MASTER-DOCUMENT.md) |
| What changed recently | [docs/dev-notes/](docs/dev-notes/) |
| Facts we may state to customers, pricing, the DPA | [company/](company/), starting with `00-CANONICAL-FACTS.md` |
| Compliance plans | [docs/compliance/](docs/compliance/) |
| Specs for what is not built yet | `docs/PRD-ADMIN-DATABASE.md`, `docs/PRD-ML-FLYWHEEL.md`, `company/PROVISIONING-AND-LICENSING.md` |
| Every API request and response shape | `backend/shared/types.ts` |

## Quick start

```bash
npm install                 # repo root
npm run test:backend        # 120 backend tests, no credentials needed
npx vitest run              # root unit and integration tests
```

To run the backend locally or load the extension in Chrome, follow sections 11 and 12 of the master document. Read the warning there first: local development uses the production database.

## Repo layout

| Path | What it is |
|---|---|
| `backend/` | Azure Functions (TypeScript). The production system |
| `extension/` | Chrome extension, Manifest V3 |
| `deliverables/` | Chrome Web Store copy and the Talk to Teacher web hand-off package |
| `ml-pipeline/` | Voice training and inference research. Not deployed |
| `data/` | Glossary seed data and the standards pipeline |
| `scripts/` | Deploy and data-loading scripts |
| `tests/` | Root Vitest suites |
| `docs/`, `company/` | Documentation |

## Rules that do not bend

1. Never store student PII. Students are pseudonymous codes only.
2. Only student-written text enters the flag pipeline, never Azure output.
3. Service keys stay server-side, never in a public web page.
4. Missing configuration fails loudly. No silent defaults.

The reasoning is in section 7 of the master document.

## Team

- **Justin Bernard** — CEO, backend. justin@languagebridge.app
- **Prentice Howard** — front end, extension

Proprietary. Copyright 2026 LanguageBridge LLC. All rights reserved.
