# LanguageBridge Dashboard — build spec for Lovable

> **Lovable: read this whole document before writing code. Build exactly what it specifies, using the exact request/response shapes. Section 2 (privacy) is non-negotiable. Do not invent API fields or endpoints. The backend already exists — you are building the frontend and one Supabase Edge Function.**

## 0. Build instructions (do these in order)

1. **Edge Function `lb-dashboard`** — create it in the connected Supabase project with the code in **Appendix A**, unchanged. It reads two Supabase secrets: `LB_API_BASE` and `LB_DASHBOARD_ORIGIN` (§9). It holds no API key. **Do not host this proxy on Lovable's servers or as an app route** — it must be the Supabase Edge Function.
2. **All backend calls** go through that function with the signed-in user's Supabase access token (`Authorization: Bearer <session.access_token>`). Never call `languagebridge-api.azurewebsites.net` from the browser. Never put any key in frontend code or `VITE_` variables.
3. **Sign-in:** Supabase Auth (email + password). Build the "set your password" screen for invite links (`type=invite`) and password reset (`type=recovery`). After sign-in, call `GET lb-dashboard/auth-layer` and build navigation from `role` (§4).
4. **Route `/dashboard`** with these areas, shown per role (§4): District insights (§5), Data & privacy (§5.1), Audit log (§5.2), My students (§6), LB Operations (§7).
5. **Customization:** create the `dashboard_layouts` table with row-level security (SQL in §5) and save each user's widget layout and filters there.
6. **Health banner bar** (§7.1) on every page for super-admins.
7. **Brand and layout** per §8.

## 1. What we're building

One dashboard at **languagebridge.app/dashboard** with three views, depending on who signs in:

| View | Who | Purpose |
|---|---|---|
| **District insights** | District admins, champion teachers, LB super-admins | Usage, seats, and the value LanguageBridge delivers — the renewal conversation |
| **Data & privacy** | Every dashboard user | What LanguageBridge holds for their schools, retention, subprocessors, who has access (DPA clause 14) |
| **Audit log** | District admins, LB super-admins | Every admin action affecting their district (DPA clause 14) |
| **My students** | Champion teachers (and super-admins) | Activity per student, by LanguageBridge code only |
| **LB Operations** | LanguageBridge super-admins only (today: admin@languagebridge.app) | System health banners, Azure free-tier usage, revenue vs Azure cost per district, add districts and schools, invite staff, pricing settings, flag queue |

It must be **customizable**: users choose which widgets appear, in what order and size, and set date range and school filters; their layout is saved.

---

## 2. Non-negotiable privacy rules (the UI must enforce these too)

LanguageBridge's promise to districts is **zero student PII**. The backend enforces it; the UI must never undo it.

1. **Students have no names in LanguageBridge.** They exist only as codes like `LB-7K2M`. Never add a field, form, import or upload that collects a student name, email, ID number, birthdate or photo.
2. **Teacher nicknames stay on the teacher's device.** On "My students", a teacher may type a nickname next to a code. Store it **only in the browser's `localStorage`**, keyed by code. Never send it to Supabase, the backend, analytics, or any third party. Show a one-line note: "Nicknames are saved only on this device."
3. **District admins see totals only.** Never show the per-student list to a `district_admin`.
4. **Small groups are hidden.** When the API returns `"students": null, "suppressed": true`, show "Fewer than 10 students", never a number, never a computed difference that reveals it.
5. **LanguageBridge's costs and margins appear only in LB Operations**, only for super-admins. The district and teacher views never show Azure cost, margin, or revenue.
6. **No student data in exports beyond what's on screen.** CSV export is aggregate tables only (per-code list export only for champions, codes only).
7. **No third-party trackers** (no analytics pixels, session replay, or chat widgets) on dashboard pages.
8. **Staff emails are fine** — teachers and district admins are adult accounts.

---

## 3. How it connects

```
languagebridge.app (Lovable, React)
   │  Supabase Auth session (email + password, invite links)
   ▼
Supabase Edge Function  lb-dashboard        ← forwards the user's access token; no API key; route whitelist
   ▼
Azure Functions  https://languagebridge-api.azurewebsites.net/api/*   ← verifies the token, scopes every answer
   ▼
Cosmos DB · Azure Monitor · Azure Cost Management
```

- **Auth:** use the existing Supabase project that the backend's `SUPABASE_URL` points at (the same one the current languagebridge.app uses). The backend validates the Supabase JWT on every request.
- **Proxy:** create the Supabase Edge Function `lb-dashboard` with the exact code in **Appendix A** (copy it as-is). **It must be the Supabase Edge Function — do not host the proxy on Lovable's servers or anywhere else.** Supabase is already a LanguageBridge subprocessor; any other host that sees these requests becomes a new subprocessor, which our district contracts require announcing 30 days ahead. The browser never calls Azure directly (the API has no browser CORS) and never holds any LanguageBridge key.
- **Calling pattern:**
  ```ts
  const { data: { session } } = await supabase.auth.getSession();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/lb-dashboard/insights/summary`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ startDate, endDate }),
  });
  ```
- **On load:** call `GET auth-layer` once. Its response decides navigation (see §4).
- **Freshness:** dashboard answers are cached on the server for 5 minutes. Show "Updated <time>" and a refresh button; don't poll faster than every 5 minutes (health: every 5 minutes while LB Operations or the banner bar is visible).
- **Errors:** every error body is `{ "error": "CODE", "details": "human text" }`. 401 → sign in again. 403 → "You don't have access to this." 429 → wait and retry once. 5xx → "Couldn't load — try again", keep the last good data on screen.

---

## 4. Roles and navigation

`GET auth-layer` returns:

```json
{
  "userId": "b1f0…", "email": "teacher@district.org",
  "isSuperAdmin": false,
  "role": "champion",                       // "super_admin" | "district_admin" | "champion"
  "permissions": ["view_dashboard"],
  "accessiblePilotIds": ["greenbriar"],
  "accessibleSchoolCodes": ["greenbriar"]
}
```

| Role | Nav items | School filter |
|---|---|---|
| `super_admin` | District insights · My students · Data & privacy · Audit log · LB Operations | Any school |
| `district_admin` | District insights · Data & privacy · Audit log | Schools in `accessibleSchoolCodes` |
| `champion` | District insights · My students · Data & privacy | Schools in `accessibleSchoolCodes` |
| no `view_dashboard` | "Your account doesn't have dashboard access yet — contact LanguageBridge." | — |

**Invites:** super-admins invite staff from LB Operations. Supabase emails the person an invite link; it lands on `LB_DASHBOARD_URL` (set to `https://languagebridge.app/dashboard`), where they set a password. Build the "set your password" screen for the invite and password-reset flows (Supabase `type=invite` / `type=recovery` links).

---

## 5. District insights (customizable)

**Controls bar:** date range (This month · Last 30 days · This school year · Custom), school multi-select (from `accessibleSchoolCodes`), "Customize" button, "Export CSV", "Updated <time> ↻".

**Data:** one call drives every widget — `POST insights/summary`.

Request:
```json
{ "startDate": "2026-08-15T00:00:00Z", "endDate": "2026-10-16T23:59:59Z", "schoolCodes": ["greenbriar"] }
```
`schoolCodes` is optional (default: all the user can see). Range at most 400 days.

Response (real shape):
```json
{
  "range": { "from": "…", "to": "…" },
  "schools": [{ "schoolCode": "greenbriar", "schoolName": "Greenbriar Middle School", "seatsPurchased": 150, "seatsUsed": 22, "termEnd": "2027-06-30", "status": "active" }],
  "seats": { "purchased": 150, "used": 22, "overSeat": false },
  "students": { "enrolled": 22, "active": 18 },
  "weeklyActive": [{ "weekOf": "2026-09-28", "students": 14 }],
  "languages": [{ "language": "dari", "students": 12, "suppressed": false }, { "language": "pashto", "students": null, "suppressed": true }],
  "usage": { "wordLookups": 297, "audioPlays": 211, "glossaryViews": 190, "simpleEnglishViews": 38,
             "talkToTeacherTurns": 12, "talkToTeacherMinutes": 30, "problemsReported": 6, "problemsFixed": 2 },
  "topWords": [{ "word": "photosynthesis", "students": 7 }],
  "value": { "interpreterMinutesEquivalent": 30, "interpreterUsdPerHour": 45, "estimatedInterpreterValueUsd": 22.5,
             "note": "Estimate: Talk to Teacher minutes valued at a typical interpreter hourly rate. Not a measured saving." },
  "privacy": { "minGroupSize": 10, "minStudentsPerWord": 3, "studentIdentity": "LanguageBridge codes only — no names are collected" }
}
```

**Widget catalog** (all available to every dashboard role; default layout = first six):

| Widget | Source | Display |
|---|---|---|
| Active students | `students.active` / `students.enrolled` | Big number + "of N enrolled" |
| Seats | `seats` | Gauge used / purchased; amber when `overSeat` ("Over seat count — we'll sort it out at renewal; no student is locked out") |
| Weekly active students | `weeklyActive` | Line chart |
| Words looked up | `usage.wordLookups` | Big number |
| Talk to Teacher | `usage.talkToTeacherMinutes`, `talkToTeacherTurns` | Number + "conversations" |
| Estimated interpreter value | `value.*` | "$22.50 estimated" with the note in a tooltip; label always says *estimate* |
| Audio listens | `usage.audioPlays` | Big number |
| Languages | `languages` | Bar chart; suppressed rows render "Fewer than 10 students", no bar length |
| Top words | `topWords` | Ranked list (words only, student counts) |
| Problems reported & fixed | `usage.problemsReported`, `problemsFixed` | "6 reported · 2 fixed by our linguists" |
| Schools | `schools` | Table: school, seats used/purchased, term end, status |
| Simple-English help used | `usage.simpleEnglishViews`, `glossaryViews` | Two numbers |

**Customize mode:** add/remove widgets from the catalog, drag to reorder, resize (1 or 2 columns wide). Save per user in a Supabase table (the frontend's own table — no student data in it):

```sql
create table dashboard_layouts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  layout jsonb not null,            -- [{ "widget": "activeStudents", "w": 1 }, …]
  filters jsonb,                    -- last used date preset + school selection
  updated_at timestamptz default now()
);
alter table dashboard_layouts enable row level security;
create policy "own layout" on dashboard_layouts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

**Export CSV:** one file per visible table/series (schools, weekly active, languages, top words), aggregate only.

### 5.1 Data & privacy page (every role)

`GET insights/data-inventory` → for the caller's schools:

```json
{
  "schools": ["greenbriar"],
  "studentIdentity": "Students are identified only by a random LanguageBridge code (e.g. LB-7K2M). No names, emails, student IDs, birthdates, addresses, photos or device IDs are collected.",
  "categories": [
    { "name": "Enrollments", "count": 22, "holds": "LanguageBridge code, school, grade band, home language, optional dialect, date enrolled", "retention": "Subscription term + 90 days, then deleted" },
    { "name": "Usage events", "count": 4899, "firstAt": "2026-03-16T…", "lastAt": "2026-10-16T…", "holds": "…", "retention": "…" },
    { "name": "Problem reports (flags)", "count": 6, "holds": "…", "retention": "…" },
    { "name": "Talk to Teacher audio and text", "count": null, "holds": "Not retained — processed for transcription and translation, then discarded", "retention": "Not stored" },
    { "name": "Staff accounts", "count": 3, "holds": "…", "retention": "Until access is removed" },
    { "name": "Admin-action audit log", "count": null, "holds": "…", "retention": "7 years" }
  ],
  "staffWithAccess": [{ "email": "teacher@district.org", "role": "champion", "invitedAt": "…" }],
  "languageBridgeAccess": "LanguageBridge super-administrators (admin@languagebridge.app) can see all districts to provide support. Every change they make is in the audit log.",
  "subprocessors": [{ "name": "Microsoft Azure", "purpose": "…" }, { "name": "Microsoft Azure AI services", "purpose": "…" }, { "name": "Supabase", "purpose": "…" }],
  "requests": { "contact": "justin@languagebridge.app", "parentalAccess": "…", "deletion": "…" }
}
```
Show: the identity statement at the top in plain words; a table of categories (name · what it holds · how many · how long we keep it; `count: null` → "—"); "Who can see your data" (staff list + the LanguageBridge access sentence); subprocessors; and how to make a request. Read-only.

### 5.2 Audit log page (district admins and super-admins)

`GET insights/audit` → `{ "districts": ["PCSD-2026"], "entries": [{ "at": "…", "action": "staff.invite", "actorEmail": "admin@languagebridge.app", "actorRole": "super_admin", "pilotId": "PCSD-2026", "target": "teacher@district.org", "details": { "role": "champion" } }], "retention": "Kept 7 years (DPA clause 4)." }` — 403 for champions.

Table: When · Who · What · Target · Details. Plain-language action names: `staff.invite` "Invited staff", `staff.revoke` "Removed staff access", `district.upsert` "Updated district", `school.upsert` "Updated school license", `pricing.update` "Changed pricing settings", `flag.action` "Handled a problem report", `data.view_student_list` "Viewed the student list". Filter by action and date; export CSV.

---

## 6. My students (champion teachers)

`POST insights/students` with `{ "schoolCode": "greenbriar", "startDate": "…", "endDate": "…" }` → 403 for district admins.

```json
{ "schoolCode": "greenbriar", "range": { … },
  "students": [{ "studentCode": "LB-7K2M", "gradeBand": "6-8", "language": "dari", "variant": null,
                 "enrolledAt": "2026-09-01T…", "lastActive": "2026-10-10T10:00:00Z",
                 "wordLookups": 9, "audioPlays": 4, "glossaryViews": 2, "problemsReported": 0 }],
  "note": "Students are identified only by their LanguageBridge code. Nicknames you keep stay on your own device." }
```

Table: Code · Nickname (local only, editable inline) · Grade · Language · Last active · Lookups · Listens · Glossary · Reports. Sort by any column; filter by grade/language; "No activity in this range" chip for zero rows. Export CSV contains **codes only** (never nicknames).

---

## 7. LB Operations (super-admins only)

### 7.1 Health banner bar — every page, super-admins only

Poll `GET ops/health` every 5 minutes. Render `banners` at the top of every page:

| Severity | Style | Dismiss |
|---|---|---|
| `critical` | Red, flashing border for the first 10 seconds, then solid; icon ⚠ | Snooze 1 hour max |
| `warning` | Amber | Snooze 24 hours |
| `info` | Blue/grey | Dismiss until the banner's `id` changes severity |

Store snoozes in `localStorage` keyed by `id` + `severity` (a banner that worsens re-appears). Show `title`, `detail`, and `action` when present; link "Details" → Health page. Example response:

```json
{
  "generatedAt": "2026-10-16T21:00:00Z",
  "banners": [
    { "id": "quota.tts", "severity": "critical", "title": "Text-to-speech free tier 92% used",
      "detail": "460,000 characters of 500,000 characters this month. At 100% Azure blocks calls until 2026-11-01 — students get no audio.",
      "metric": "tts.monthToDate", "value": 460000, "threshold": 500000, "action": "Move this service to the paid tier now, or reduce load." },
    { "id": "monitoring.unavailable", "severity": "info", "title": "Azure monitoring not connected", "detail": "…" }
  ],
  "freeTier": { "translatorChars": { "used": 740, "limit": 2000000, "source": "azure_monitor" },
                "ttsChars": { "used": 0, "limit": 500000, "source": "metered" },
                "sttSeconds": { "used": 0, "limit": 18000, "source": "metered" }, "resetsOn": "2026-11-01" },
  "dependencies": { "translator": { "callsToday": 23, "failuresToday": 0, "latencyBucketsToday": { "lt500": 20, "lt1000": 3 }, "blocked24h": 0 }, "tts": { … }, "stt": { … } },
  "cosmos": { "maxNormalizedRuPct": 12, "throttled1h": 0, "storageGb": 2.04, "provisionedRu": 1000, "availabilityPct": 100 },
  "api": { "requests24h": 812, "failed24h": 3, "executionsMonthToDate": 9400 },
  "tiers": { "translator": "F0", "speech": "F0" },
  "monitoringAvailable": true
}
```

Banners the backend can raise (ids are stable): `quota.translator|tts|stt` (70% warning, 90% critical), `quota.<svc>.projected`, `azure.<svc>.blocked`, `azure.<svc>.errors`, `azure.<svc>.latency`, `cosmos.throttling`, `cosmos.load`, `cosmos.storage`, `cosmos.freetier`, `cosmos.availability`, `api.failures`, `quota.functions`, `plan.paid-tiers` (countdown to the planned **1 January 2027** move off free tiers; critical if still free after), `monitoring.unavailable`.

### 7.2 Health page

- **Free tiers this month:** three gauges (Translator characters, Text-to-speech characters, Speech-recognition hours) with used / limit, % and "resets on". Source label ("from Azure" vs "from our metering").
- **Azure responsiveness today:** per service — calls, failures, failure %, blocked (24 h), latency histogram (bars from `latencyBucketsToday`: <250 ms, <500, <1 s, <2 s, <5 s, 5 s+).
- **Database:** peak load % (last hour), throttled requests (last hour), storage GB of 25 GB free, provisioned RU/s of 1,000 free, availability %.
- **API:** requests and failures (24 h), executions this month of 1,000,000 free.
- **Tiers:** Translator `F0`/`S1`, Speech `F0`/`S0`.

### 7.3 Business overview — revenue vs Azure cost

`GET ops/overview?from=2026-10-01&to=2026-10-16` (defaults: month to date).

```json
{
  "range": { … },
  "totals": { "revenueUsd": 1840.27, "meteredAzureCostUsd": 3.1204, "unattributedAzureCostUsd": 0.04, "activeStudents": 38, "actualAzureBillUsd": 0.01 },
  "actualAzureBill": { "totalUsd": 0.01, "byService": [{ "service": "Storage", "costUsd": 0.0056 }] },
  "notes": ["Metered Azure cost = metered units × list prices … While Translator and Speech are on free tiers the actual bill is ~$0 …"],
  "districts": [{
    "pilotId": "PCSD-2026", "name": "Pickerington City Schools", "isDemo": false,
    "revenueUsd": 1840.27, "azureCostUsd": 3.1204, "marginUsd": 1837.15, "marginPct": 99.83,
    "seatsPurchased": 150, "seatsUsed": 22, "activeStudents": 18, "azureDependencyPct": 41.2,
    "schools": [{ "schoolCode": "greenbriar", "schoolName": "Greenbriar Middle School", "isDemo": false, "status": "active", "tier": "Starter",
                  "seatsPurchased": 150, "seatsUsed": 22, "overSeat": false, "activeStudents": 18, "revenueUsd": 1840.27,
                  "azureCostUsd": 3.1204, "azureCost": { "translator": 0.8, "tts": 2.1, "stt": 0.22 },
                  "usage": { "lookups": 297, "audioPlays": 211, "glossaryViews": 190, "flags": 6, "translatorChars": 80000, "ttsChars": 140000, "talkToTeacherMinutes": 13.2 } }]
  }]
}
```

Show: totals strip (revenue · metered Azure cost · actual Azure bill · margin), a district table (expand → schools), a "Revenue vs Azure cost" bar per district, **Azure dependency %** (share of word lookups answered by Azure instead of our own Lexicon — the flywheel's progress metric; lower is better), seats used vs purchased with over-seat flags. Demo districts greyed and excluded from totals. Show the `notes` under the table — especially that the actual bill is ~$0 while on free tiers.

### 7.4 Districts & schools

`GET ops/districts` → `{ "districts": [{ "pilotId", "district", "schools": [SchoolLicense…], "staff": [{ "email", "role", "displayName", "invitedAt" }] }] }`

**Remove access** (button on each staff row, with a confirmation): `POST ops/revoke` with `{ "email": "…", "all": true }` — or only some access: `{ "email": "…", "schoolIds": ["greenbriar"] }` / `{ "email": "…", "districtIds": ["PCSD-2026"] }` → `{ "email", "remainingSchools": [], "remainingDistricts": [], "allAccessRemoved": true, "signInBlocked": true }`. Removing all access takes effect on the user's next request and blocks their sign-in. Super-admins can't be removed here (400).

Create / edit with `PUT ops/districts`:
```json
{
  "district": { "pilotId": "PCSD-2026", "name": "Pickerington City Schools", "state": "OH", "contractAnnualUsd": null, "isDemo": false },
  "schools": [{
    "schoolCode": "greenbriar", "schoolName": "Greenbriar Middle School", "gradeBands": ["6-8"],
    "seats": 150, "tier": "Starter", "pricingModel": "per_seat", "annualPriceUsd": 1800,
    "termStart": "2026-08-15", "termEnd": "2027-06-30", "status": "active", "dpaRef": "DPA-2026-014"
  }]
}
```
Form fields per school: code (letters/digits/dashes), name, grade bands, seats, tier (Starter/Growth/District/Enterprise/Building/Pilot/Custom), pricing model (free pilot / per seat / building / custom), annual price, term start/end, status (trial/active/expired/suspended), DPA reference, demo toggle. Suggest the price from LanguageBridge's list prices (Starter $12, Growth $9, District $6 per EL student per year; Building license $3,000 per year) but let the admin override. District-level `contractAnnualUsd` replaces the sum of school prices when set.

### 7.5 Invite staff

`POST ops/invite`:
```json
{ "email": "teacher@district.org", "role": "champion", "schoolIds": ["greenbriar"], "displayName": "Ms. Rivera" }
{ "email": "director@district.org", "role": "district_admin", "districtId": "PCSD-2026" }
```
→ `{ "invited": "…", "role": "champion", "alreadyHadAccount": false, "schools": ["greenbriar"], "districts": [] }`. Supabase emails the invite. Champions see only their schools; district admins see every school in the district (including schools added later). Show staff per district with role and invite date.

### 7.6 Pricing settings

`GET ops/pricing` → `{ "prices": { "translatorPerMillionChars": 10, "ttsPerMillionChars": 15, "sttPerAudioHour": 1, "cosmosPer100RuHour": 0.012, "cosmosPerGbMonth": 0.25, "interpreterUsdPerHour": 45, "source": "…", "updatedAt": "…" }, "freeTier": { … } }`
`PUT ops/pricing` with any subset of those numbers (0–1000). The interpreter rate drives the districts' "estimated interpreter value" widget.

### 7.7 Audit log (all districts)

`GET ops/audit?pilotId=&action=&limit=` → `{ "entries": [AuditEntry…], "count": n }` (newest first, up to 1,000). Same table as §5.2 plus a District column and filters.

### 7.8 Flag queue

Existing endpoints: `GET flag-queue?language=&status=&flagType=&limit=`, `POST flag-queue/<id>/action` `{ language, action: in_review|resolved|dismissed|reopen, note?, entryId? }`. Table with filters; school codes appear only as a count.

---

## 8. Look and feel

- languagebridge.app brand: plum `#742a69` → orange `#f37030` → gold `#ffc755`.
- Works on a Chromebook screen (1366×768) and a phone (single column, no horizontal scroll).
- Charts readable in light and dark mode; never encode meaning by colour alone (label values).
- Accessible: keyboard navigation for customize mode, focus states, ARIA labels on charts with a text summary.
- Loading: skeletons per widget. Empty: "No activity in this range yet."

---

---

## 9. Setup (Supabase side)

1. **Secrets** (Supabase → Edge Functions → Secrets):
   - `LB_API_BASE` = `https://languagebridge-api.azurewebsites.net/api`
   - `LB_DASHBOARD_ORIGIN` = `https://languagebridge.app`
2. **Deploy** the Edge Function `lb-dashboard` (Appendix A).
3. **Auth → URL configuration:** add `https://languagebridge.app/dashboard` to the redirect URLs. Enable email invites and configure a custom SMTP provider (Supabase's built-in email only reaches members of the Supabase team).
4. **Database:** create the `dashboard_layouts` table and policy from §5.
5. **Sign-in accounts** are created by LanguageBridge super-admins through LB Operations → Invite staff. Do not build public sign-up.

Notes for testing: until LanguageBridge connects Azure monitoring, the Health page shows an info banner "Azure monitoring not connected" and some database/API fields are `null` — render them as "—", not errors. Dashboard answers are cached by the server for 5 minutes. Cost figures and the interpreter value are estimates and must be labelled as such.

---

## 10. Acceptance criteria

1. A champion signs in from an invite, sees only their school, sees "My students" with LB codes, and can keep device-only nicknames that never leave the browser (verify in the network tab).
2. A district admin sees district totals, never the per-student list (direct call returns 403), never costs.
3. A language with fewer than 10 students shows "Fewer than 10 students".
4. admin@languagebridge.app sees the banner bar on every page; a critical banner flashes, and snoozing it hides it for at most an hour.
5. LB Operations shows revenue, metered Azure cost, actual Azure bill and margin per district; demo districts are excluded from totals.
6. A super-admin can add a district with schools and invite a champion; the invite email arrives and the new user sees the right school.
7. Layout changes persist across sign-ins.
8. No LanguageBridge API key, Azure key or service-role key appears anywhere in the frontend bundle.
9. Every role sees the Data & privacy page; district admins see their district's audit log; champions get 403 on it.
10. Removing a teacher's access (all) shows "Removed staff access" in the audit log, and that teacher's next request fails.
11. Network tab: dashboard requests go only to the Supabase Edge Function `lb-dashboard` — never to Lovable-hosted API routes or azurewebsites.net.

---

## Appendix A — Edge Function `lb-dashboard` (copy exactly)

File: `supabase/functions/lb-dashboard/index.ts`

```ts
// Supabase Edge Function: lb-dashboard
//
// The ONLY path from languagebridge.app's dashboard to the LanguageBridge Azure
// backend. It forwards the signed-in user's Supabase access token; the backend
// verifies it and decides what that user may see. This proxy holds NO API key and
// makes NO access decisions — it only whitelists routes and passes the token on.
//
// Host it ONLY here (Supabase is already a LanguageBridge subprocessor). Hosting this
// proxy anywhere else — e.g. on Lovable's servers — would add a new subprocessor,
// which the district DPA requires announcing 30 days in advance.
//
// Deploy: supabase functions deploy lb-dashboard
// Secrets: supabase secrets set LB_API_BASE=https://languagebridge-api.azurewebsites.net/api
//          supabase secrets set LB_DASHBOARD_ORIGIN=https://languagebridge.app
//
// Frontend calls:  POST|GET|PUT  <SUPABASE_URL>/functions/v1/lb-dashboard/<route>
//   with header   Authorization: Bearer <supabase session access_token>
//   e.g.          GET  …/lb-dashboard/ops/health
//                 POST …/lb-dashboard/insights/summary   { startDate, endDate, schoolCodes? }

const LB_API_BASE = Deno.env.get('LB_API_BASE') ?? '';
const ORIGIN = Deno.env.get('LB_DASHBOARD_ORIGIN') ?? 'https://languagebridge.app';

// Route → allowed methods. Nothing else reaches the backend.
const ALLOWED: Record<string, string[]> = {
  'auth-layer': ['GET'],
  'insights/summary': ['POST'],
  'insights/students': ['POST'],
  'insights/audit': ['GET'],
  'insights/data-inventory': ['GET'],
  'dashboard': ['POST'],
  'flag-queue': ['GET'],
  'ops/health': ['GET'],
  'ops/overview': ['GET'],
  'ops/pricing': ['GET', 'PUT'],
  'ops/districts': ['GET', 'PUT'],
  'ops/invite': ['POST'],
  'ops/revoke': ['POST'],
  'ops/audit': ['GET'],
};
const FLAG_ACTION = /^flag-queue\/[a-f0-9]{64}\/action$/;   // POST

function cors(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, apikey, x-client-info',
    'Content-Type': 'application/json',
  };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: cors() });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors() });
  if (!LB_API_BASE) return json(500, { error: 'PROXY_MISCONFIGURED', details: 'LB_API_BASE not set' });

  const url = new URL(req.url);
  const route = url.pathname.replace(/^.*\/lb-dashboard\/?/, '');
  const allowed = ALLOWED[route] ?? (FLAG_ACTION.test(route) ? ['POST'] : null);
  if (!allowed) return json(404, { error: 'UNKNOWN_ROUTE' });
  if (!allowed.includes(req.method)) return json(405, { error: 'METHOD_NOT_ALLOWED' });

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'MISSING_TOKEN' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const upstream = await fetch(`${LB_API_BASE}/${route}${url.search}`, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: req.method === 'GET' ? undefined : await req.text(),
      signal: controller.signal,
    });
    return new Response(await upstream.text(), { status: upstream.status, headers: cors() });
  } catch (err) {
    const aborted = (err as Error)?.name === 'AbortError';
    return json(aborted ? 504 : 502, { error: aborted ? 'REQUEST_TIMEOUT' : 'PROXY_UPSTREAM_ERROR' });
  } finally {
    clearTimeout(timer);
  }
});
```
