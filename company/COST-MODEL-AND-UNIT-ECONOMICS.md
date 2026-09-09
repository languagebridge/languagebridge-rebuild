# Cost Model & Unit Economics (Internal)

**Do not distribute.** This is the math behind [PRICING-AND-PACKAGING.md](PRICING-AND-PACKAGING.md). Infrastructure figures are anchored to the measured cost structure in `docs/LANGUAGEBRIDGE-MASTER-BLUEPRINT.md`; everything labeled *(assumption)* is a planning input to validate against real invoices.

**Owner:** Justin Bernard · Last updated: September 2026

---

## 1. Measured infrastructure cost (cost of goods)

From the current stack, per month:

| Item | Pilot (100 students) | District (~1,000 students, proprietary TTS) |
|---|---|---|
| Azure Functions | ~$0 (free tier) | ~$30 |
| Cosmos DB | ~$25 (400 RU/s) | ~$120 (2,000 RU/s) |
| Blob Storage | ~$1 | ~$5 |
| Azure Speech (TTS/STT) | ~$15 | $0 (proprietary voices) |
| Supabase | free | ~$25 |
| **Total / month** | **~$41** | **~$180** |
| **Per student / year (COGS)** | **~$4.92** | **~$2.16** |

**Takeaway:** COGS is **~$2–5 per active student per year**, and it *falls* with scale as fixed infra amortizes and proprietary TTS removes the Azure Speech line. This is the floor all pricing must clear.

Cost drivers to watch: Cosmos RU/s provisioning (the largest line), Azure Speech usage before proprietary TTS is fully deployed, and the proprietary TTS Container App (2 CPU / 4Gi, scales 0–3) once it's always-on.

## 2. Fully-loaded cost per student (assumptions layered on COGS)

| Layer | Per EL student / year | Basis |
|---|---|---|
| Infrastructure (COGS) | $2 – $5 | measured above |
| Support + onboarding + PD (allocated) | $1 – $2 *(assumption)* | email support + self-serve training, amortized |
| R&D + G&A + reserve (allocated) | variable *(assumption)* | small team; not yet meaningful per-student at pilot scale |
| **Fully-loaded delivery cost** | **~$3 – $7** | |

## 3. Margin at the proposed tiers

| Tier | Price / student / yr | COGS | Gross margin |
|---|---|---|---|
| Starter | $12 | ~$5 | ~58% |
| Growth | $9 | ~$3.5 | ~61% |
| District | $6 | ~$2.5 | ~58% |
| Enterprise | $4 | ~$2.2 | ~45% |

Gross margin against **fully-loaded** cost stays roughly **45–65%** across tiers; against raw infra COGS it's ~60–85%. Margin holds at the low end because per-student cost falls as fast as price does with volume.

## 4. Break-even sketch *(assumption-driven)*

- The two-person team's real cost is founder time, not infrastructure. Infra is near-noise (<$200/mo) until many thousands of students.
- At **Growth pricing ($9)** with ~65% contribution after delivery cost, roughly **5,000–8,000 paid EL students** (~$45K–$72K ARR) covers a modest operating baseline — reachable within a handful of mid-size districts.
- Every district after that is high-margin because infra scales sublinearly.

## 5. What changes the model

| Lever | Effect |
|---|---|
| Proprietary TTS fully deployed | Removes the Azure Speech line entirely — the biggest variable cost at pilot scale. Priority. |
| Cosmos RU/s right-sizing | Largest infra line; serverless/autoscale keeps it matched to load. |
| Interpreter marketplace (Phase 3) | New COGS (1099 interpreter payouts) but tied to flagged-content volume, and a quality moat — price marketplace-backed corrections as premium if needed. |
| Offline top-200-term cache | Cuts per-lookup backend calls, lowering Cosmos/Azure cost per student. |

## 6. Honest caveats

- The $41 / $180 figures are the documented estimates, not a finance-audited P&L. Validate against actual Azure and Supabase invoices before quoting margin externally.
- Support/PD/G&A allocations are assumptions at current scale; revisit once headcount grows, because founder time is the real cost today.
- Cyber-liability insurance through **The Hartford** (promised in the DPA) is a fixed annual cost not yet in this model — fold in the premium once the policy is bound.
