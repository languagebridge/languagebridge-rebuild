# Backend Setup — New Developer

Everything here was checked directly against the code as of the `feat/v2-lexicon-tts-hardening` branch (2026-09-14) — commands, required env vars, and the curl example are all verified against `backend/package.json`, `backend/shared/`, and the actual endpoint handlers, not assumed.

---

## 0. Get on the right branch first

**This file and its companion template (`backend/local.settings.json.example`) only exist on `feat/v2-lexicon-tts-hardening` — not on `main`.** `main` is this repo's default branch, so a plain `git clone` leaves you on it. If you don't switch branches, neither file exists, `backend/local.settings.json` will be missing, and `func start` will fail immediately with something like *"Missing value for FUNCTIONS_WORKER_RUNTIME... falling back to 'None'"* — that's Core Tools unable to tell what language your functions are written in, because it reads that from `local.settings.json`, which doesn't exist yet.

```bash
git fetch origin
git checkout feat/v2-lexicon-tts-hardening
```

Do this before anything else below.

---

## ⚠️ Read this before you configure anything

**Local dev, as currently set up in this repo, points at the real production Cosmos DB and Blob Storage — there is no separate dev instance.** The Cosmos account is literally named `languagebridge-cosmos` with database `languagebridge-prod`, and the storage account is `languagbridgeaudio` (same one production uses). This isn't a guess — it's what's in the (gitignored, un-committed) config files on Justin's machine and baked into the root `.env.example`.

Practically: if you fill in `backend/local.settings.json` with real production credentials and run the backend locally, **you are reading and writing the same database real students use** — flags, analytics, lexicon, rate limits, all of it. There's no `LB_ENV=dev` switch that redirects you elsewhere.

Ask Justin how he wants to handle this before you start hitting endpoints that write data (`flag-handler`, `analytics-writer`, `onboarding`). Read-only exploration (`lexicon-lookup`, `translate`, `tts-router` cache hits) is lower risk, but nothing here is currently sandboxed.

---

## 1. Prerequisites

- **Node.js 20+** (this environment has v22, which works fine)
- **Azure Functions Core Tools v4** — this is separate from `npm install`; it's the CLI that actually runs the Functions runtime locally (`func start`). It is not a project dependency in either `package.json`.

  ```bash
  # macOS
  brew tap azure/functions
  brew install azure-functions-core-tools@4

  # Any OS via npm (global install)
  npm install -g azure-functions-core-tools@4 --unsafe-perm true
  ```

  Verify: `func --version` should print `4.x`.

## 2. Install dependencies

From the repo root (this is an npm-workspaces monorepo — `backend`, `extension`, `pwa`, `ml-pipeline`):

```bash
npm run install-all
```

This runs `npm install --workspaces` per the root `package.json`. If you only care about the backend, `cd backend && npm install` also works.

## 3. Configure local settings

```bash
cp backend/local.settings.json.example backend/local.settings.json
```

`backend/local.settings.json` is already covered by the root `.gitignore` (the bare pattern `local.settings.json` matches it at any depth) — confirmed it has never been committed to this repo's history. You will not accidentally commit real credentials by following this step, but double-check `git status` shows nothing staged before any commit anyway.

The `.example` template already has two keys filled in for you — `FUNCTIONS_WORKER_RUNTIME: "node"` and `AzureWebJobsStorage: "UseDevelopmentStorage=true"`. Those aren't app secrets; they're what Azure Functions Core Tools itself needs to boot at all (they tell it which language worker to launch). If `local.settings.json` is missing entirely — which is exactly what happens on a fresh clone before step 0/this step — Core Tools can't determine the runtime and fails immediately, before any of the actual function code runs. Copying the template fixes that regardless of whether the app-level secrets below are filled in yet.

Fill in every value marked `REQUIRED-...` in the file — **ask Justin directly for these** (Slack/whatever your credential-sharing channel is), not from anything already in the repo. Specifically ask for:

- `COSMOS_DB_KEY`
- `AZURE_BLOB_CONN_STRING`
- `AZURE_STORAGE_KEY`
- `AZURE_TTS_KEY`
- `AZURE_TRANSLATOR_KEY` and `AZURE_TRANSLATOR_REGION`
- `SUPABASE_SERVICE_ROLE_KEY`

(As of 2026-09-15, these are placeholder/`ROTATE_ME` or entirely absent even in Justin's own local file — so if he can't hand you a working value immediately, that's expected; he needs to pull current ones from Azure Portal / Supabase Dashboard first.)

See the warning above before deciding what those values point at.

**What's actually required vs. optional**, verified by reading `backend/shared/env-validation.ts` and every place each variable is used:

| Variable | Required? | What happens if it's missing |
|---|---|---|
| `COSMOS_DB_ENDPOINT`, `COSMOS_DB_KEY` | **Hard-required** | `backend/shared/cosmos-client.ts` throws the moment any function touches Cosmos. No fallback. |
| `COSMOS_DB_DATABASE` | **Hard-required** | Same file, separate throw: `"COSMOS_DB_DATABASE must be set — refusing to use a hardcoded default"`. **Note:** this one isn't in `env-validation.ts`'s `REQUIRED_VARS` list, so a cold start won't fail loud on it — it only surfaces the first time a request actually hits Cosmos. That's a real gap between what the startup check validates and what the code actually needs. |
| `AZURE_BLOB_CONN_STRING` | **Hard-required** | `backend/shared/blob-client.ts` throws on first blob access. |
| `LB_API_KEY` | **Required** (or explicit bypass) | Every function calls `validateApiKey()`. Without this set, all requests get a 500 *"API key not configured on server"* — unless you also set `LB_ALLOW_INSECURE_DEV=true`, which bypasses auth entirely. Requests must send this value in the `x-lb-api-key` header. |
| `AZURE_STORAGE_ACCOUNT`, `AZURE_STORAGE_KEY` | **Required for any audio URL** | Listed as "optional" in `env-validation.ts`, but `blob-client.ts`'s `generateSasUrl()` throws without both — this breaks `tts-router` and the audio URL in `lexicon-lookup`. Treat as required. |
| `AZURE_TTS_KEY` | **Required for `tts-router` / `speech-to-text`** | Both return a 500 *"...service not configured"* without it. `AZURE_TTS_REGION` defaults to `eastus` if unset. |
| `AZURE_TRANSLATOR_KEY`, `AZURE_TRANSLATOR_REGION` | **Required for `translate` / `lexicon-lookup` fallback** | 500 *"Translator service not configured"* without both — no fallback on region. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | **Required for `auth-layer` / `dashboard`** | Without both, the Supabase client never initializes and those two endpoints 500. |
| `LB_TTS_SERVICE_URL` | Optional | Proprietary TTS container; if unset, `tts-router` just falls straight through to Azure TTS. Fine to leave blank locally. |
| `LB_SUPERADMIN_EMAILS` | Optional | Comma-separated bootstrap admin allowlist. Leave empty unless you need dashboard/admin access. |
| `LB_ALLOW_INSECURE_DEV` | Optional, dev-only | Bypasses API-key auth. Never set this outside your own machine. |

**Vars you'll see in the root `.env` / `.env.example` that the backend code does not read at all** (verified — zero matches for these in `backend/shared/` or `backend/azure-functions/`): `COSMOS_DB_CONN_STRING`, `AZURE_TTS_ENDPOINT`, `SUPABASE_ANON_KEY`, `SUPABASE_JWT_SECRET`, `ADMIN_API_KEY`, `AZURE_STORAGE_CONTAINER_FLAGS`, `PILOT_ID_*` / `PILOT_NAME_*` / `PILOT_TIMEZONE`, and all four `ENABLE_*` flags. They may be vestigial or reserved for something outside the Functions runtime — either way, you don't need them for local backend dev, and I'm flagging rather than guessing at their purpose.

## 4. Build and run

```bash
cd backend
npm run build   # tsc --project ../tsconfig.backend.json
func start      # reads backend/host.json + local.settings.json
```

Or in one step — `npm start` in `backend/` runs `build` then `func start` for you. Either way, run it **from inside `backend/`**, since that's where `host.json` and `local.settings.json` live.

On success, Core Tools prints each registered function and a local URL. `host.json` sets `routePrefix: "api"`, so with the default port, every endpoint is at:

```
http://localhost:7071/api/<function-name>
```

## 5. Verify it's working

`translate` is the simplest endpoint to sanity-check — no audio encoding involved. Verified against `backend/azure-functions/translate/index.ts` and the `TranslateRequest`/`TranslateResponse` types in `backend/shared/types.ts`:

```bash
curl -X POST http://localhost:7071/api/translate \
  -H "Content-Type: application/json" \
  -H "x-lb-api-key: <the LB_API_KEY value from your local.settings.json>" \
  -d '{
    "text": "Where is the library?",
    "fromLanguage": "english",
    "toLanguage": "spanish",
    "studentCode": "LB-TEST99"
  }'
```

Expected success (`200`):

```json
{
  "translatedText": "¿Dónde está la biblioteca?",
  "fromLanguage": "english",
  "toLanguage": "spanish"
}
```

Notes on the request shape (don't deviate from these — the handler validates strictly):
- `studentCode` must match `^LB-[A-HJ-NP-Z2-9]{4,8}$` (excludes `I`, `O`, `0`, `1` to avoid ambiguous codes) — `LB-TEST99` is a valid-shaped fake code; it doesn't need to exist in the `enrollments` container for this endpoint.
- `fromLanguage`/`toLanguage` must be one of the 16 supported language keys (lowercase English names: `arabic`, `burmese`, `dari`, `english`, `french`, `nepali`, `pashto`, `persian`, `portuguese`, `somali`, `spanish`, `swahili`, `tagalog`, `ukrainian`, `urdu`, `vietnamese`).
- If `AZURE_TRANSLATOR_KEY`/`AZURE_TRANSLATOR_REGION` aren't set, you'll get `500 {"error":"INTERNAL_ERROR","details":"Translator service not configured"}` instead — that's expected until real credentials are in place.
- If `LB_API_KEY` doesn't match what you sent in the header, you'll get `401 {"error":"UNAUTHORIZED","details":"Invalid or missing API key"}`.

This endpoint does **not** require Cosmos to be reachable — `checkRateLimit()` in `backend/shared/validators.ts` catches any Cosmos failure and falls back to an in-memory limiter. So a working `translate` call only proves your Translator credentials are good, not that Cosmos is configured. Use an endpoint like `onboarding` if you need to confirm Cosmos connectivity — but see the warning at the top before writing anything there.

## 6. Run the test suite

```bash
npm run test:backend   # from repo root, or:
cd backend && npm test
```

This runs Jest against the 11 suites in `backend/__tests__/` (`jest.config.js` points `testMatch` there). **Confirmed this needs no live credentials or network access**: every test file that touches Cosmos, Blob, Supabase, or an outbound `axios` call explicitly mocks it (`jest.mock('../../shared/cosmos-client', ...)`, `jest.mock('axios')`, etc. — checked every `.test.ts` file). The only thing `backend/__tests__/setup.ts` does is set a fake `LB_API_KEY` so handlers pass auth. You can run the full suite before you've filled in a single real credential.

---

## Doc mismatches found while writing this (flagging, not fixing)

- `docs/ENGINEERING-FIELD-GUIDE.md`'s "At a Glance" table says **8** Cosmos DB containers. Counting the actual accessor functions in `backend/shared/cosmos-client.ts` (`sessions`, `flags`, `pilots`, `admin_users`, `audio_cache_metadata`, `lexicon`, `enrollments`, `analytics`, `rate_limits`) gives **9**.
- `backend/azure-functions/translate/index.ts` has a stale comment above `TRANSLATOR_LANGUAGE_MAP`: *"Azure Translator language codes — all 21 languages supported"*. The map has 16 entries, matching the actual supported-language list post-cull. Harmless (comment only, doesn't affect behavior) but worth a one-line fix next time someone's in that file.
