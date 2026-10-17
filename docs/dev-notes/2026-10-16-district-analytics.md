# 2026-10-16 — District analytics, ops health banners, Azure metering

Branch: `feat/district-analytics` (built on `feat/lexicon-flywheel`). PRD for the frontend: `docs/PRD-DISTRICT-ANALYTICS.md`; Lovable hand-off: `deliverables/district-dashboard/`.

## What we found first (read-only, production)
- Azure has billed ~$0.01/month since July: Translator **F0**, Speech **F0**, Cosmos **free tier** (1,000 RU/s + 25 GB; we sit exactly at 1,000), Functions consumption grant. F0 blocks calls at quota instead of billing. Decision: stay free until 1 Jan 2027.
- Translator usage this month: 740 characters, 23 calls, 0 blocked (Azure Monitor `TextCharactersTranslated`).
- The live API has no managed identity and no CORS; the Lovable app reaches Azure through a Supabase Edge Function proxy.
- `LB_SUPERADMIN_EMAILS` is already `admin@languagebridge.app` only (Justin's decision: keep it that way).

## What changed
- **Metering** (`shared/metering.ts`): every Translator / TTS / STT call records units, status and latency — per school per day (`analytics`, `meter:<day>:<school>`, district partition) and system-wide (`health:<day>`, partition `__ops__`). Counts only; no text, no student code. Fire-and-forget.
- **Free tiers, prices, thresholds** (`shared/azure-quotas.ts`), price overrides stored in `pilots` (`__azure_prices__`, `shared/pricing.ts`).
- **Azure Monitor + Cost Management client** (`shared/azure-management.ts`) using the app's managed identity; returns null (→ "monitoring not connected") until the identity is set up.
- **Pure rules** (`shared/ops-calc.ts`): health banners, revenue accrual over license term, metered cost, small-group suppression.
- **`ops` function** (super-admin): `GET ops/health`, `GET ops/overview`, `GET|PUT ops/pricing`, `GET|PUT ops/districts`, `POST ops/invite` (Supabase sends the email).
- **`insights` function** (dashboard users): `POST insights/summary` (no costs; languages <10 students hidden; words shown only if ≥3 students), `POST insights/students` (LB codes; champions + super-admins only).
- **License record** (`SchoolLicenseDoc`, `DistrictDoc`) in `pilots`; `getSchools` and auth now ignore non-school records; district admins scoped by `districtIds`; `role` on the auth context; `inviteStaffUser`.
- 5-minute response cache for dashboard answers (`shared/response-cache.ts`).

## Tested
- Backend: 196 Jest tests (25 new: `ops-calc.test.ts`, `insights-ops.test.ts`); `tsc` clean; `func start` registers 22 routes.
- Every new Cosmos query run read-only against production (13/13 valid; heaviest ~445 RU for a 7-month district summary).
- End-to-end on an isolated test database with real Translator: **34/34** (flywheel + metering written correctly, counts only). Test database deleted afterwards.

## Not tested
- Anything needing a Supabase sign-in (ops/insights over HTTP, invites) — covered by unit tests only.
- Azure Monitor / Cost Management reads from inside the app (needs the managed identity).
- The frontend (not built yet).

## To do
- [ ] Managed identity + Monitoring Reader / Cost Management Reader + the `LB_*_RESOURCE_ID` settings (exact commands in the PRD §9).
- [ ] Enter Greenbriar and the demo school as license records (`PUT ops/districts`) so revenue and seats show.
- [ ] Nightly per-school rollups before districts beyond the pilots (dashboard queries scan raw events).
- [ ] Move Translator to S1 and Speech to S0 on 1 Jan 2027 (banner counts down from mid-November).
