# Provisioning & Licensing

**How schools get into LanguageBridge, how students join them, and how we keep licenses honest.** This is the model that connects onboarding to billing — read it before building school selection, the enroll endpoint, or the admin terminal.

**Owner:** Justin Bernard · Last updated: September 2026 · Status: spec (pre-build)

---

## 1. The principle: provisioned, not discovered

LanguageBridge does **not** carry a directory of all schools. A school exists in the system **only after it becomes a customer** — a signed DPA plus purchased seats (or a trial). We provision schools when they sign; we never let students discover-and-join arbitrary schools.

Why this matters: pricing is per **EL student per school** (see [PRICING-AND-PACKAGING.md](PRICING-AND-PACKAGING.md)). If any student at any school could self-select into it, students at non-customers would use the product for free — the accountability model would leak. Provisioned-only closes that.

---

## 2. The license record (per school)

Home: the existing Cosmos **`pilots`** container (extend it; no new store needed). One record per provisioned school:

| Field | Meaning |
|---|---|
| `schoolCode` | Stable ID (e.g. `PARMA-TP`). Also the analytics scope key. |
| `schoolName`, `district` | Display + grouping. |
| `gradeBands` | Which bands this school offers (drives the Grade step). |
| `dpaRef` | Link to the signed DPA (accountability + audit). |
| `seats` | EL-student seats purchased (the billable unit). |
| `term` | `startDate` → `endDate`. |
| `status` | `trial` · `active` · `expired` · `suspended`. |
| `tier` | Pricing tier applied (Starter/Growth/District…). |
| `isDemo` | `true` only for the sandbox school (see §6). |

**Seats consumed** are not stored on the record — they're *derived*: count distinct active `studentCode`s enrolled under the `schoolCode` in the **`enrollments`** container. Source of truth stays the enrollment data; the license record holds what was *sold*.

---

## 3. How a student joins their school (in priority order)

1. **IT-push preset (default).** When a district pushes the extension via the Google Workspace admin console, it ships a managed config naming the `schoolCode`. The student **skips school selection entirely** and goes straight from language to the tool. Aim for this everywhere possible.
2. **Enrollment code.** The school gets a short code (`PARMA-TP`) or a join link. The student enters it once; it binds them to that school's license. No picker, no other schools exposed.
3. **Search over provisioned schools (fallback).** Only your customers appear — never a national list. Small list, so search is a convenience, not a necessity, until you have 100+ schools.

The current `onboarding` function returns *all* schools; that changes to return only provisioned schools, and to accept a code / honor a preset.

---

## 4. Seat enforcement (the accountability gate)

`onboarding/enroll` checks entitlement **before** issuing a `studentCode`:

- School `status` must be `active` or `trial`; `expired`/`suspended` → block with a clear message (route the teacher to renew).
- If distinct-enrolled `studentCode`s ≥ `seats`: **grace, don't hard-fail** — issue the code but flag the school `over_seat` for the admin/dashboard and the renewal conversation. (Locking a newcomer student out mid-lesson is the wrong failure; flag it for billing instead.)
- Demo school (`isDemo`) skips all seat checks.

The dashboard surfaces **seats used vs purchased per school** — that is the accountability report for renewals and invoicing, and it's a core screen of the admin terminal on the roadmap (`docs/PRD-ADMIN-DATABASE.md`).

---

## 5. Lifecycle

`trial` → `active` (on payment) → `expired` (term ends) → renew back to `active`, or `suspended` (non-payment / DPA lapse). At `expired`/`suspended`, existing students see a friendly "your school's access has paused" state rather than a broken tool. Data retention on termination follows the DPA (90 days, Ohio SB 29).

---

## 6. Demo mode

A dedicated **demo school** solves two problems: evaluating/booth-demoing without a real license, and keeping test traffic out of real schools' numbers.

- **Record:** `schoolCode: LB-DEMO`, `isDemo: true`, unlimited seats, no DPA required.
- **Entry:** a "Try a demo" launcher that **skips school (and optionally grade + consent)**, picks a language, and drops straight into the tool with a demo `studentCode`. Fast — no clicking through schools you aren't part of.
- **Non-billable + non-polluting:** every event from a demo session is tagged `isDemo: true` in the `sessions` container, and is **excluded from all per-school dashboards, seat counts, and reports**. (This is also what keeps QA/smoke-test traffic — e.g. the Wikipedia-article "terms" seen in analytics — out of real metrics.)
- **Uses:** the OHIO TESOL booth, sales evaluations, and internal QA (including the backend smoke scripts).

---

## 7. Data-model touchpoints (summary)

| Container | Change |
|---|---|
| `pilots` | Extend to the license record in §2 (seats, term, status, dpaRef, isDemo). |
| `enrollments` | Unchanged; becomes the seat-consumption source (distinct studentCodes per school). |
| `sessions` | Add/honor an `isDemo` tag so demo/test data is filterable out of reporting. |
| `onboarding` fn | Return provisioned schools only; accept enrollment code / preset; enforce §4 at enroll. |
| `dashboard` fn | Add a seats-used-vs-purchased view per school. |

---

## 8. Settled decisions (September 2026)

1. **Enrollment-code format — human-friendly, per building.** Short and readable (e.g. `PARMA-TP`), **case-insensitive** on entry, drawn from an alphabet that excludes visually ambiguous characters (no `I`, `O`, `0`, `1` — same discipline as the `LB-XXXX` student code). One code per building, revocable/rotatable by an admin.
2. **Over-seat policy — grace-and-flag.** Never lock a newcomer out mid-lesson. Past the seat count, still issue the code, but mark the school `over_seat` for the dashboard and the renewal conversation. Billing is a back-office correction, not a student-facing wall.
3. **Provisioning — seed script now, admin terminal later.** A small script writes the license record to `pilots` in the interim; the self-serve admin terminal (`docs/PRD-ADMIN-DATABASE.md`) supersedes it once built. Same schema either way, so no rework.
4. **English is included** as a home-language option — kept last in the grid, never the default (the current `onboarding.js` omits English; implementation must add it).
