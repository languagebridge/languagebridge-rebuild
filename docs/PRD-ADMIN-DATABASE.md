# PRD: LanguageBridge Administrative Database & Customer Transparency

**Status:** Draft — Phase 2 (during pilot)
**Owner:** Justin Bernard
**Last updated:** 2026-04-20
**Strategic priority:** Required for renewal conversations and trust-building with K-12 school districts

---

## TL;DR

LanguageBridge needs two related but distinct admin surfaces:

1. **Customer Transparency Dashboard** — what each pilot school/district sees about their own usage. The contract requires this for FERPA/SB 29 compliance — schools must be able to audit what data we hold and how it's used.

2. **LanguageBridge Internal Admin Database** — what we (the company) see across all pilots and customers. Needed for product decisions, sales conversations, support, and pricing analytics.

Both share infrastructure (Cosmos `sessions` analytics, the existing `/dashboard` endpoint) but have different audiences, access controls, and views.

This PRD specifies both, with strict privacy boundaries that maintain "zero PII" as a core architectural property even as we expose more analytics.

---

## The Problem

### Why customer-facing transparency matters

When a Pickerington Schools curriculum director signs a contract, the first follow-up question from her IT director will be:

> "Show me a dashboard of what data you actually hold about our students."

If we can't answer that quickly and clearly, the renewal is dead. Schools have been burned by ed-tech vendors that promised privacy and delivered surveillance. The dashboard isn't a feature — it's a contract requirement.

Today, we have the `/dashboard` endpoint with 10 analytics queries, but:
- No frontend exists
- No "transparency report" — just usage stats
- No audit log surfacing — we have logs but no admin can see them
- No way for a school admin to export "everything you have on our pilot"

### Why internal admin matters

You and Prentice need answers to questions like:
- Which pilots are growing? Which are dying?
- What languages are most-used? Least-used?
- Which schools generate the most flags? (signals coverage gaps)
- What's the average lookup-to-flag ratio? (quality metric)
- How much Azure budget did we spend on TTS this month, by school?
- Which interpreters are doing the most work?
- What's our cost-per-active-student?

Without this, you'll make pricing, hiring, and roadmap decisions on intuition. Eventually that fails.

---

## Two Audiences, Two Surfaces

### Surface 1: Customer Transparency Dashboard

**Audience:** School/district admins (curriculum directors, IT directors, ELL coordinators)
**Access control:** Supabase JWT with `view_dashboard` permission, scoped to their school(s) only
**Privacy boundary:** Their data only, anonymized at student level

**Required views:**

| View | What it shows |
|---|---|
| **Usage Overview** | Active students per week, total lookups, top languages |
| **Engagement Quality** | Bridge-vs-fallback rate, scaffold view rate, audio play rate |
| **Vocabulary Growth** | New terms looked up over time, retention indicators |
| **Coverage Gaps** | Top flagged terms, terms not in lexicon yet |
| **Privacy Audit** | What data we hold about their pilot, retention policy, who's accessed it |
| **Data Export** | CSV download of all aggregate data (no individual student rows) |

### Surface 2: LanguageBridge Internal Admin

**Audience:** LanguageBridge team (Justin, Prentice, future hires)
**Access control:** Supabase JWT with `super_admin` permission
**Privacy boundary:** All pilots, but still no PII (only pseudonymous codes)

**Required views:**

| View | What it shows |
|---|---|
| **Pilot Health** | Per-pilot active student count, growth rate, churn risk indicators |
| **Cross-Pilot Aggregate** | Total students, lookups, flags, languages across the platform |
| **Cost Tracking** | Azure spend per pilot (TTS, Translator, Cosmos) — for unit economics |
| **Flag Triage** | All flags across all pilots, filterable, exportable to bounty system |
| **Interpreter Analytics** | (Phase 3) Per-interpreter quality, throughput, payment totals |
| **System Health** | Error rates per endpoint, p95 latency, rate-limit hits |
| **Audit Log** | Every admin action (who promoted what flag, who approved what submission) |

---

## Goals

| | Goal |
|---|---|
| G1 | A school admin can see their pilot's usage, flag activity, and data inventory in one dashboard |
| G2 | A school admin can export all data we hold about them (FERPA Right of Access) in under 5 minutes |
| G3 | Justin can see at-a-glance which pilots are healthy and which are at risk |
| G4 | Every admin action (promote, approve, reject, suspend) is logged with timestamp and actor |
| G5 | Audit logs are queryable for at least 7 years (compliance requirement) |
| G6 | "Zero PII" remains a true architectural property — adding analytics never adds personal identifiers |

## Non-Goals

- Individual-student tracking dashboards (violates "zero PII" principle even for school admins)
- Real-time streaming dashboards (batch-refreshed every 5 minutes is fine)
- Custom report builders for end users (predefined views only, exports for the rest)
- Public/shared dashboards (every view requires authenticated session)

---

## System Architecture

### Existing infrastructure we build on

- `/dashboard` endpoint — already has 10 SQL queries, school-scoped
- `sessions` Cosmos container — already partitioned by language with composite indexes
- `pilots` Cosmos container — pilot metadata
- `admin_users` Cosmos container — permissions
- `flags` Cosmos container — flag activity
- `auth-layer` — Supabase JWT validation with role mapping

### New Cosmos containers

| Container | Partition Key | Purpose |
|---|---|---|
| `audit_log` | `/actorId` | Every admin action: who did what, when, on what resource |
| `pilot_costs` | `/pilotId` | Daily cost snapshots from Azure billing API (TTS, Translator, Cosmos RU) |

### New endpoints

#### Customer Transparency (auth: school admin JWT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/dashboard/transparency` | What data we hold about your pilot, retention policies, last-accessed timestamps |
| GET | `/dashboard/export` | CSV/JSON export of all aggregate data for the requesting school |
| GET | `/dashboard/coverage-gaps` | Terms students looked up that fell back to translator (your curriculum needs these) |
| GET | `/dashboard/audit-log` | Every action LanguageBridge admins took on your pilot data |

#### Internal Admin (auth: super_admin JWT)

| Method | Path | Purpose |
|---|---|---|
| GET | `/admin/pilots/health` | Per-pilot health scorecard with growth/churn signals |
| GET | `/admin/aggregate` | Cross-pilot platform stats |
| GET | `/admin/costs` | Azure spend per pilot, per service |
| GET | `/admin/audit-log` | All admin actions across all pilots, filterable |
| GET | `/admin/system-health` | Endpoint error rates, p95 latencies, rate-limit hits |

#### Audit logging (internal — no public endpoint)

Every existing admin endpoint (`/admin/flags/{id}/promote`, `/admin/submissions/{id}/approve`, etc.) writes to `audit_log` synchronously — not fire-and-forget. If audit write fails, the action fails too. This is a compliance requirement.

---

## Data Model

### AuditLogEntry

```typescript
{
  id: string;              // UUID
  actorId: string;         // Supabase user ID of admin
  actorEmail: string;      // For human readability
  actorRole: 'super_admin' | 'admin' | 'school_admin';
  action: string;          // 'flag.promote' | 'submission.approve' | 'interpreter.suspend' | etc.
  targetType: string;      // 'flag' | 'submission' | 'interpreter' | 'pilot' | 'lexicon'
  targetId: string;
  targetSchoolCode?: string;  // For school-scoped audit views
  metadata: Record<string, unknown>;  // Action-specific context (e.g., reason for rejection)
  timestamp: string;       // ISO 8601
  ipHash: string;          // SHA-256 of source IP (for fraud detection without storing IP)
  // NEVER stored: actor's full IP, student data, PII
}
```

### TransparencyReport (computed on-demand, not stored)

```typescript
{
  pilotId: string;
  schoolCode: string;
  generatedAt: string;

  dataInventory: {
    enrollments: { count: number; oldestRecord: string; newestRecord: string };
    sessions: { count: number; oldestEvent: string; newestEvent: string };
    flags: { count: number; resolved: number; pending: number };
  };

  retentionPolicy: {
    sessions: '7 years (educational records)';
    flags: '7 years';
    enrollments: 'indefinite during active pilot, 30 days after termination';
    auditLog: '7 years';
  };

  piiInventory: 'NONE — zero personally identifiable information stored';
  pseudonymousIdentifiers: ['studentCode (LB-XXXXXX format, no link to real identity)'];

  thirdPartyDataSharing: {
    azureTranslator: 'Anonymous text only, no student identifiers';
    azureTTS: 'Anonymous text only, no student identifiers';
    azureSpeechToText: 'Anonymous audio only, no student identifiers (Talk to Teacher)';
    supabase: 'Teacher/admin emails only, no student data';
  };

  lastAdminAccess: {
    actor: string;     // email of last LanguageBridge admin who accessed this pilot's data
    timestamp: string;
    action: string;
  };
}
```

### PilotHealthScore (internal, computed)

```typescript
{
  pilotId: string;
  schoolCode: string;
  asOf: string;

  signals: {
    activeStudents7d: number;
    activeStudents30d: number;
    growthRate7d: number;       // % change vs previous 7 days
    avgLookupsPerStudent: number;
    flagRate: number;           // flags per 100 lookups (lower is better quality)
    audioPlayRate: number;      // % of lookups where student played audio
    scaffoldViewRate: number;   // % of lookups where student expanded scaffold
  };

  costMetrics: {
    monthlySpend: number;       // USD, all Azure services
    costPerActiveStudent: number;
    projectedAnnual: number;
  };

  riskFlags: string[];          // 'declining_usage', 'high_flag_rate', 'no_admin_login_30d', etc.
  healthScore: number;          // 0-100, composite
}
```

---

## ROI Metrics — How They're Computed

The transparency dashboard exists in part to prove ROI to schools. ROI here is not "students learned X% more" (that requires academic study). It's about engagement quality and cost-per-outcome.

### Per-pilot ROI scorecard (visible to school admin)

| Metric | Formula | Why it matters |
|---|---|---|
| **Adoption Rate** | active_students_7d / total_enrolled | Are students actually using it? |
| **Engagement Depth** | scaffold_views / term_lookups | Are they reading the full definition or just glancing? |
| **Independence Trend** | weekly_lookups across the semester (declining is good) | Are they learning the vocabulary? |
| **Coverage Quality** | bridge_hits / total_lookups | Are we serving them rich content or fallback translations? |
| **Flag-to-Improvement Cycle** | flags_received / flags_resolved | Are we actually fixing what they flag? |
| **Cost per Active Student** | total_pilot_cost_USD / active_students_30d | Is this affordable to scale? |

### Internal ROI (visible to LanguageBridge team)

| Metric | Formula |
|---|---|
| **CAC payback** | revenue_per_pilot / cost_to_acquire (sales + onboarding hours × hourly cost) |
| **Gross margin per pilot** | (revenue - azure_cost - support_cost) / revenue |
| **NPS-style proxy** | flag_rate inverted, weighted by audio play rate |
| **Expansion potential** | (potential_students_in_district - current_active) × per_seat_price |

---

## Random Aggregate Information (the "show schools cool stats" feature)

You mentioned wanting random aggregate insights to share with schools. These should be:
- Computed from anonymous session data only
- Refreshed weekly (not real-time, no value in real-time)
- Curated — we pick the most interesting ones, not auto-generated

**Examples worth surfacing:**

> *"Students at your school looked up 'photosynthesis' 47 times this month — third most-looked-up science term district-wide."*

> *"Dari is the second-most-used language in your 6th grade ELL cohort (231 lookups), behind Spanish (542)."*

> *"On Tuesdays at 10am, your students average 18 lookups per minute — the highest weekly engagement spike."*

> *"83% of vocabulary lookups in social studies happen in the first 2 minutes of class — students are using LanguageBridge to get oriented."*

These work because:
- Schools love feeling "seen" and getting non-obvious insights
- They reinforce that we're paying attention without being creepy
- They're sticky — schools forward them to colleagues

**Implementation:** A weekly batch job (`generate-pilot-insights.ts`) runs Sunday night, computes 5-10 candidate insights per pilot, picks the top 3 by interestingness heuristic, stores in `pilot_insights` Cosmos container, surfaces in the dashboard.

---

## Privacy Boundaries (non-negotiable)

These rules apply equally to school admin views and internal admin views:

1. **No individual student rows.** Every query aggregates by school + grade band + language minimum.
2. **Minimum aggregation cohort = 5.** If a query would return data on fewer than 5 students, return "Not enough data" instead. Prevents re-identification.
3. **Time bucket minimum = 1 day.** No per-minute or per-second timelines that could correlate with class schedules.
4. **No cross-pilot leakage.** A school admin querying their pilot can never see another pilot's data, even by side-channel.
5. **Audit every read.** Every dashboard query writes a row to `audit_log` so we can prove who saw what.
6. **PII still rejected.** The PII validator that protects analytics-writer also protects audit log entries — even our own admins can't accidentally write a name into the system.

---

## Phased Rollout

### Phase 1 — Internal Admin First (Weeks 1-3 of pilot)

You and Prentice need this immediately to monitor the pilot. Build:
- `/admin/pilots/health` endpoint
- `/admin/aggregate` endpoint
- `/admin/audit-log` endpoint (read-only — audit writes already happening from new dashboard)
- A simple internal-only React page (no public deploy — VPN/Tailscale gated)

This is a "good enough" v1 — not pretty, but functional.

### Phase 2 — Audit Log Infrastructure (Weeks 4-5)

- New `audit_log` Cosmos container with composite index on `(actorId, timestamp)` and `(targetSchoolCode, timestamp)`
- Audit middleware that wraps every admin endpoint
- Synchronous write (not fire-and-forget — compliance requires this)
- 7-year retention enforced via Cosmos TTL exemption (no TTL on this container)

### Phase 3 — School Admin Dashboard (Weeks 6-10)

The customer-facing piece:
- `/dashboard/transparency` endpoint
- `/dashboard/export` endpoint (returns CSV/JSON with all aggregated data)
- `/dashboard/coverage-gaps` endpoint
- React dashboard at `dashboard.languagebridge.app` — Supabase auth, school-scoped views
- "Privacy Audit" tab showing the TransparencyReport
- "Export" button that downloads a zip of CSVs

### Phase 4 — Random Aggregate Insights (Weeks 11-12)

- `pilot_insights` container
- Weekly cron job to compute candidate insights
- Surface in school admin dashboard as a rotating "Did you know?" panel
- A/B test which insight types schools engage with most

### Phase 5 — Cost Tracking & Unit Economics (Month 4)

- Daily Azure billing API pull → `pilot_costs` container
- Per-pilot cost attribution (TTS calls × seconds × $/sec, etc.)
- Unit economics dashboard for internal team
- Pricing model validation: are we losing money on any pilot?

---

## Open Questions

1. **Where does the school admin dashboard live?** Could be:
   - Subdomain of languagebridge.app (own auth, own React app)
   - Embedded in existing learning management systems via LTI (more work, more reach)
   - Inside the Chrome extension as an admin-only view (simplest, most awkward)

2. **Who pays for what data exports?** A district requesting "all data on our 500-student pilot" might generate a 200MB CSV. Trivial cost, but worth deciding policy: free, capped, or rate-limited?

3. **How long do we hold rejected/dismissed flags?** Currently flags are kept indefinitely. Should rejected flags be deleted after 90 days to honor data minimization?

4. **What happens to a pilot's data when their contract ends?** Default policy needs to be in the contract:
   - 30-day grace period for re-export
   - Then permanent deletion (Cosmos hard delete + audit log entry recording the deletion)

5. **Insight generation algorithm.** "Interesting" is subjective. Start with simple rules (longest streak, highest concentration, biggest week-over-week change) and iterate based on which insights schools actually click on.

6. **Should we expose interpreter quality data to school admins?** Schools might want to know "who fixed the Dari translations my students flagged?" Probably not — interpreter identity is internal. But maybe an aggregate "X corrections were made by verified interpreters this month" is fine.

---

## Why This is Required, Not Optional

You can technically run a pilot without any of this. Schools won't audit the system in week one. But:

- **Renewal conversations require it.** Year 2 contracts get scrutinized by procurement. "Show us your transparency dashboard" is a standard ask.
- **Sales conversations require it.** Other districts will ask "what does your dashboard look like?" before signing.
- **Compliance requires it.** SB 29 has audit requirements; FERPA gives parents and districts Right of Access. Building this reactively after a request takes 4x longer than building it proactively.
- **Internal sanity requires it.** Without health metrics, you'll spend the pilot guessing whether things are going well.

The investment is 6-12 weeks of focused work. The cost of not building it is losing the renewal that funds the company.
