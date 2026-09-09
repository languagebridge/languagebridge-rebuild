# Before You Send This to a District

**The gates to clear before a DPA leaves the building.** The company docs are written and internally consistent; these are the human-owned items that make the packet true and signable. Work top to bottom.

**Deal owner:** Justin Bernard · Last updated: September 2026

---

## Standing gates (clear once, then reuse)

| # | Gate | Status | Owner |
|---|---|---|---|
| 1 | **Counsel sign-off** on the DPA template | ☐ Pending — with **Bob Ellis** | Bob Ellis / Justin |
| 2 | **The Hartford** cyber-liability policy **bound**, certificate on hand | ☐ Pending (carrier confirmed) | Justin |
| 3 | **Transparency dashboard** built, or the clause scoped out of the specific DPA | ☐ Not built | Justin / Prentice |
| 4 | **Data-export + admin audit-log** tooling built, or fulfilled manually and stated as such | ☐ Not built | Justin / Prentice |
| 5 | `docs/compliance/` artifacts current and exportable to PDF (incident response, DR, risk assessment, NIST mapping, vuln scan) | ☐ Verify dates | Justin (DSO) |

**Already confirmed (no action):**
- ✅ **Pricing** — approved list pricing (`PRICING-AND-PACKAGING.md`); do not renegotiate per deal.
- ✅ **Counsel identified** — Bob Ellis.
- ✅ **Insurance carrier identified** — The Hartford (gate #2 is binding the policy).
- ✅ **Language/entity facts** — reconciled to 16 languages (`00-CANONICAL-FACTS.md`).

---

## Per-deal fill-in (every district)

Complete these in `DPA-TEMPLATE.md` before sending:

- [ ] **LEA name + address** — `_[School District Name]_`, `_[LEA Address]_`
- [ ] **Effective date**
- [ ] **LEA designated representative** — name, title, address, phone, email
- [ ] **Attach standard NDPA exhibits** C (Definitions), D (Disposition), E (General Offer), G (Ohio SB 29 terms) — from the ETLA Ohio NDPA V1 template (they're incorporated by reference, not in our file)
- [ ] **Marketplace opt-out box** — confirm the district's choice (Exhibit A / Exhibit H §7)
- [ ] **Child-audience/COPPA posture** — confirm consistent with the Chrome Web Store declaration if the extension is store-listed

---

## Send sequence

1. Confirm gates 1–2 are cleared (counsel + insurance) — these are non-negotiable for a live signature.
2. Fill the per-deal section.
3. Attach the standard exhibits + the current `docs/compliance/` PDFs if the district's security review asks.
4. Send. Log the send in `docs/compliance/DISCLOSURE-EVIDENCE-LOG.md`.

---

## Honesty rule

Never send a DPA that promises a capability that isn't live. If the transparency dashboard or export/audit tooling (gates 3–4) isn't built when a district signs, either build it first or amend those clauses to say the function is fulfilled manually by the DSO on request. A signed promise you can't keep is worse than a smaller true one.
