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

## Second pass (17 Oct) — DPA clause 14 gaps
- **Audit log** (`shared/audit.ts`): district/school edits, staff invites and removals, pricing changes, flag actions, and every view of the per-student list are recorded (who, what, which district; never student data). Stored in `analytics` (type `audit`, partition = district) — no new container, to stay inside the Cosmos free tier. Kept 7 years per DPA clause 4.
- **Remove access**: `POST ops/revoke` (some schools, a district, or all; all → permissions stripped + Supabase sign-in banned). Super-admins can't be removed here.
- **District-facing**: `GET insights/audit` (district admins), `GET insights/data-inventory` (everyone: identity statement, live counts, retention per DPA, staff with access, subprocessors, request contact).
- **Email alerts**: `azure-microtran-blocked-calls`, `azure-microspee-blocked-calls` (RG languagebridge-ce) → `lb-cosmos-alerts` → admin@languagebridge.app when Azure blocks any call.
- **Subprocessors**: Supabase's description updated in `company/00-CANONICAL-FACTS.md` and `company/DPA-TEMPLATE.md` (it now relays dashboard requests); DPA checklist now says to notify LEAs within 30 days. Clause 14 marked "in development" — not live until the dashboard ships.
- **Proxy hosting**: the spec now requires the Supabase Edge Function only; hosting it on Lovable would add a new subprocessor.
- `deliverables/district-dashboard/build-spec.mjs` regenerates `LOVABLE-BUILD-SPEC.md` from the PRD + proxy.
- Found: production `admin_users` is empty — admin@ works only via the allowlist; the API has **no `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`**, so every dashboard sign-in currently fails.

## Tested
- Backend: 201 Jest tests (30 new: `ops-calc.test.ts`, `insights-ops.test.ts`); `tsc` clean; `func start` registers 26 routes.
- Second-pass queries (audit, inventory) validated read-only on production: 7/7, 2–5 RU each.
- Every new Cosmos query run read-only against production (13/13 valid; heaviest ~445 RU for a 7-month district summary).
- End-to-end on an isolated test database with real Translator: **34/34** (flywheel + metering written correctly, counts only). Test database deleted afterwards.

## Not tested
- Anything needing a Supabase sign-in (ops/insights over HTTP, invites) — covered by unit tests only.
- Azure Monitor / Cost Management reads from inside the app (needs the managed identity).
- The frontend (not built yet).

## To do
- [ ] Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` on `languagebridge-api` (project `izllwaookbvebqutmnlo`) — blocker for every sign-in.
- [ ] Custom SMTP in Supabase so invites reach teachers.
- [ ] Notify LEAs with signed DPAs of the Supabase description change (clause 2, 30 days).
- [ ] Termination deletion tooling (DPA: deletion within 90 days of contract end) — not built.
- [ ] Managed identity + Monitoring Reader / Cost Management Reader + the `LB_*_RESOURCE_ID` settings (exact commands in the PRD §9).
- [ ] Enter Greenbriar and the demo school as license records (`PUT ops/districts`) so revenue and seats show.
- [ ] Nightly per-school rollups before districts beyond the pilots (dashboard queries scan raw events).
- [ ] Move Translator to S1 and Speech to S0 on 1 Jan 2027 (banner counts down from mid-November).
