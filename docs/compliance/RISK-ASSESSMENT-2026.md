# Annual Risk Assessment — 2026

**Document owner:** Justin Bernard, CEO / Data Security Officer (DSO)
**Assessment date:** 2026-04-20
**Assessment period:** April 2026 — April 2027
**Review cadence:** Annually, or after material change to architecture, subprocessors, or business circumstances

---

## 1. Purpose

This Annual Risk Assessment identifies, evaluates, and documents the risks to LanguageBridge's Student Data, service availability, business operations, and regulatory compliance. It satisfies the DPA Exhibit F requirement for "annual risk assessments conducted by CEO/Data Security Officer."

---

## 2. Methodology

Each identified risk is rated on:

- **Likelihood** (1-5): How probable is this risk event in the next 12 months?
- **Impact** (1-5): If it occurred, how severe would the consequences be?
- **Risk Score** = Likelihood × Impact (range 1-25)

| Score | Severity | Action |
|---|---|---|
| 20-25 | Critical | Immediate mitigation required; escalate to executive review |
| 12-19 | High | Mitigation plan within 30 days |
| 6-11 | Medium | Mitigation plan within 90 days |
| 1-5 | Low | Monitor; mitigate as resources permit |

Each risk has:
- **Inherent risk** — score before mitigations
- **Residual risk** — score after current mitigations
- **Mitigations** — controls in place
- **Action items** — what's needed to further reduce risk

---

## 3. Risk Register

### Category A: Data Privacy & Security

#### A1. Unauthorized access to Cosmos DB student data

| Aspect | Assessment |
|---|---|
| Description | Attacker obtains Cosmos DB connection string and reads/exfiltrates student records |
| Inherent likelihood | 3 (credentials are high-value targets) |
| Inherent impact | 5 (potential breach of all student data) |
| Inherent score | 15 (High) |
| **Mitigations** | Cosmos DB key stored only in Azure Function App settings (encrypted at rest); MFA required for Azure Portal access; no key in code repository; no key in CI/CD secrets (deploys done from local machine); IP firewall rules restricting Cosmos to Function App only |
| **Residual likelihood** | 2 |
| **Residual impact** | 5 |
| **Residual score** | 10 (Medium) |
| **Action items** | (1) Enable Cosmos DB Defender for Cloud alerts. (2) Rotate Cosmos primary key quarterly. (3) Move to Managed Identity authentication when v2 launches. |

#### A2. Compromised LB_API_KEY enabling student data scraping

| Aspect | Assessment |
|---|---|
| Description | Attacker obtains the API key (perhaps from extension reverse engineering) and floods endpoints to scrape lexicon or generate massive TTS bills |
| Inherent likelihood | 4 (Chrome extensions can be unpacked and inspected) |
| Inherent impact | 3 (lexicon is curated content of low value; TTS abuse causes cost issues) |
| Inherent score | 12 (High) |
| **Mitigations** | Distributed rate limiting via Cosmos DB (per-studentCode and per-endpoint limits); Azure cost alerts; API key is not the only check (PII validation, language validation, schema validation also gate requests) |
| **Residual likelihood** | 4 |
| **Residual impact** | 2 |
| **Residual score** | 8 (Medium) |
| **Action items** | (1) Implement IP-based rate limiting in addition to studentCode-based. (2) Add per-IP TTS quotas. (3) Consider API key rotation mechanism for v2 launch (per-LEA keys instead of global key). |

#### A3. PII inadvertently captured via flagged passages

| Aspect | Assessment |
|---|---|
| Description | A student highlights and flags text that happens to contain a name, email, or other PII, which is then stored in the `flags` container |
| Inherent likelihood | 3 (will happen occasionally with web content containing names) |
| Inherent impact | 3 (limited PII exposure, but technically a FERPA gray area) |
| Inherent score | 9 (Medium) |
| **Mitigations** | 500-character flag limit reduces incidental PII volume; flag pipeline is TOS-clean (only student-input text, no Azure-generated content); pseudonymous student codes mean even if PII appears, it's not linked to a real student identity |
| **Residual likelihood** | 3 |
| **Residual impact** | 2 |
| **Residual score** | 6 (Medium) |
| **Action items** | (1) Add frontend warning before flag submission: "Do not include personal information." (2) Run PII scanner on `flaggedText` field at flag-handler ingestion (extending existing PII scanner). (3) Document this risk in the v2 DPA so LEAs are aware. |

#### A4. Subprocessor (Microsoft Azure or Supabase) breach

| Aspect | Assessment |
|---|---|
| Description | Microsoft Azure or Supabase suffers a breach exposing customer data including LanguageBridge's |
| Inherent likelihood | 2 (these are SOC 2 Type II certified providers with strong security) |
| Inherent impact | 5 (could expose all LanguageBridge data; significant LEA notification obligations) |
| Inherent score | 10 (Medium) |
| **Mitigations** | Subprocessor selection limited to SOC 2 certified providers; data minimization (no PII in any system); encryption at rest and in transit; Azure data residency in US East only |
| **Residual likelihood** | 2 |
| **Residual impact** | 4 |
| **Residual score** | 8 (Medium) |
| **Action items** | (1) Subscribe to subprocessor security notification feeds. (2) Maintain subprocessor incident playbook in IRP. (3) Verify cyber liability insurance covers subprocessor incidents. |

### Category B: Service Availability & Reliability

#### B1. Azure Functions cold-start performance impacting Talk to Teacher latency

| Aspect | Assessment |
|---|---|
| Description | Cold starts on Azure Functions can add 2-5 seconds to first request; Talk to Teacher requires sub-3-second total latency to feel conversational |
| Inherent likelihood | 5 (will happen with low-traffic pilot conditions) |
| Inherent impact | 2 (poor UX but not data risk) |
| Inherent score | 10 (Medium) |
| **Mitigations** | Azure Functions Premium plan (avoids cold starts, but expensive); pre-warming via scheduled health-check pings every 5 minutes |
| **Residual likelihood** | 3 |
| **Residual impact** | 2 |
| **Residual score** | 6 (Medium) |
| **Action items** | (1) Implement pre-warming health checks. (2) Consider Premium plan upgrade if pilot user feedback shows latency complaints. (3) Frontend optimistic UI to mask latency. |

#### B2. Azure region outage (East US)

| Aspect | Assessment |
|---|---|
| Description | Azure East US region experiences extended outage; LanguageBridge unavailable until recovery |
| Inherent likelihood | 2 (Azure regional outages occur 1-2x/year, typically <4h) |
| Inherent impact | 4 (full service disruption) |
| Inherent score | 8 (Medium) |
| **Mitigations** | Cosmos DB geo-replication available (paired West region); Blob Storage GRS replication; documented DR plan with scenario B procedures |
| **Residual likelihood** | 2 |
| **Residual impact** | 3 |
| **Residual score** | 6 (Medium) |
| **Action items** | (1) Test geo-failover procedure quarterly. (2) Establish multi-region active-active for v2 if pilot growth justifies cost. (3) Status page for transparent communication. |

#### B3. Azure Cognitive Services rate limit / quota exhaustion

| Aspect | Assessment |
|---|---|
| Description | Hit Azure Translator or Speech Services rate limits/quotas during peak class periods, causing user-facing failures |
| Inherent likelihood | 3 (Azure quotas are subscription-tier dependent) |
| Inherent impact | 3 (some lookups/audio generation fails for affected period) |
| Inherent score | 9 (Medium) |
| **Mitigations** | Lexicon caching reduces Translator load (most lookups hit cache); TTS deduplication by content hash dramatically reduces synthesis calls; rate limit monitoring on backend |
| **Residual likelihood** | 2 |
| **Residual impact** | 2 |
| **Residual score** | 4 (Low) |
| **Action items** | (1) Monitor Azure quota usage; request quota increases ahead of v2 launch. (2) Implement graceful degradation messaging when external service hits limits. |

### Category C: Compliance & Legal

#### C1. DPA non-compliance — actual architecture diverges from signed DPA

| Aspect | Assessment |
|---|---|
| Description | Code changes introduce data flows or storage that contradict signed DPA commitments |
| Inherent likelihood | 4 (active development; documentation tends to lag code) |
| Inherent impact | 4 (LEA contract violation; possible termination) |
| Inherent score | 16 (High) |
| **Mitigations** | DPA-V2-DRAFT.md kept in repo as source of truth; data flow diagram documented; READMEs reference DPA commitments |
| **Residual likelihood** | 3 |
| **Residual impact** | 4 |
| **Residual score** | 12 (High) |
| **Action items** | (1) Add DPA review to PR template — every PR touching `backend/` requires explicit answer to "Does this change any data flow described in the DPA?" (2) Quarterly architecture-vs-DPA reconciliation review. (3) Engage ed-tech attorney on retainer for ongoing review. |

#### C2. Conflict of interest — employee piloting product to own students

| Aspect | Assessment |
|---|---|
| Description | Founder is also employed by school district where pilot is running; potential exposure under Ohio Revised Code 2921.42 (unlawful interest in a public contract), ORC 102.03 (state ethics law), or district conflict-of-interest policy |
| Inherent likelihood | 4 (active situation; pilot paused for legal review) |
| Inherent impact | 4 (could result in pilot termination, employment consequences, IP claims by district, ethics referral) |
| Inherent score | 16 (High) |
| **Mitigations** | **Substantial documented disclosure record (see [DISCLOSURE-EVIDENCE-LOG.md](./DISCLOSURE-EVIDENCE-LOG.md)):** (1) **Jan 9, 2026 pilot-deployment request email** — Justin wrote to Dan Gedeon (Technical Systems Manager, Parma CO-DIS), CC'ing Principal Schissler, Dr. Dobransky (EL Lead), and Deb Vanek: "LanguageBridge, a Chrome extension **I've built** specifically for our preliterate English Language Learners." Opened with "With Principal Schissler's approval," confirming prior principal approval. Dr. Dobransky replied enthusiastically; Dan Gedeon routed Justin to the curriculum approval form and introduced Jason Smith. (2) **Jan 9, 2026 (or shortly after) Google Form** — Instructional Technology Approval Form naming LanguageBridge, approved by Principal Schissler, monitored by Dr. Kristine Dobransky; $0 cost. (3) **Jan 30, 2026 in-office demo** — live demonstration of LanguageBridge to office leadership team; attendee subsequently shared onward with additional office leadership. (4) **Feb 27, 2026 grand prize announcement email** — sent to 9 district administrators including Superintendent Scott J. Hunt, EdD, explicitly identifying Justin as "Founder & CEO, LanguageBridge LLC" and stating $5,000 prize for startup; Superintendent replied "Congratulations! What a great honor!" (5) **Feb 27, 2026 continuing-contract conversation** — Principal Jill Schissler showed Justin her written recommendation for a continuing contract the same day Justin informed her of the Accelerate win, demonstrating employer endorsement of continued employment with contemporaneous knowledge of the outside business. (6) **March 3, 2026 signed DPA** — Parma CFO/Treasurer Sean Nuccio countersigned DPA in which Justin signed as "CEO/Founder, LanguageBridge LLC," creating bilateral awareness at CFO level. (7) **March 5-13, 2026 Jason Smith (IT) email chain** — Justin wrote "In order for my app to work I need to access my server," disclosing ownership through official IT channels; IT whitelisted the Netlify URL. **Structural mitigations:** pilot was $0 (no public-contract dollars exchanged); Justin had no approval authority over the pilot procurement; planned resignation from Parma before any paid v2 contract. |
| **Residual likelihood** | 2 (disclosure record is dense, bilateral, and preserved; primary remaining risk is procedural — whether ORC 2921.42 applies to a $0 pilot and whether Parma policy required a separate written COI disclosure beyond these touchpoints) |
| **Residual impact** | 3 (worst realistic case is pilot termination and mandated resignation; ethics referral remains possible but defensible given documented disclosure) |
| **Residual score** | 6 (Medium) |
| **Action items** | (1) **Preserve all disclosure evidence** — forward the Feb 27 announcement email, Jason Smith IT chain, Google Form confirmation, and signed DPA to personal email and encrypted cloud storage; maintain as legal records per [DISCLOSURE-EVIDENCE-LOG.md](./DISCLOSURE-EVIDENCE-LOG.md). (2) Engage employment/education attorney for a targeted review of (a) ORC 2921.42 applicability to zero-dollar pilots, (b) any Parma written-disclosure requirement the documented disclosures do not already satisfy, (c) IP/outside-employment clauses in the 19-CON-01-0493 contract agreement. (3) Confirm resignation date precedes any v2 paid procurement; structure resignation to avoid implying misconduct. (4) For v2 launch: procurement through formal RFP with founder fully disengaged from Parma; no employee-vendor overlap. (5) Inventory any LanguageBridge work that touched district resources (devices, network, time); maintain clean separation going forward. |

#### C3. New regulatory requirement (FERPA, COPPA, state law) emerges mid-pilot

| Aspect | Assessment |
|---|---|
| Description | Federal or state regulator issues new guidance requiring architectural or contractual changes |
| Inherent likelihood | 3 (active regulatory environment; states enacting student privacy laws) |
| Inherent impact | 3 (variable scope of required changes) |
| Inherent score | 9 (Medium) |
| **Mitigations** | Architecture is privacy-by-design (zero PII, pseudonymous codes, data minimization); already exceeds many regulatory baselines |
| **Residual likelihood** | 3 |
| **Residual impact** | 2 |
| **Residual score** | 6 (Medium) |
| **Action items** | (1) Subscribe to ed-tech regulatory news feeds (Future of Privacy Forum, NSPRA). (2) Annual review of state-by-state student privacy laws when LanguageBridge expands beyond Ohio. |

### Category D: Business Continuity

#### D1. Founder incapacitation or departure

| Aspect | Assessment |
|---|---|
| Description | Justin (sole technical and business decision-maker) is unable to operate the business |
| Inherent likelihood | 1 (single point of failure but low individual probability) |
| Inherent impact | 5 (catastrophic — single point of all knowledge and access) |
| Inherent score | 5 (Low) |
| **Mitigations** | None formalized; Prentice has frontend access but no backend or business operations access |
| **Residual likelihood** | 1 |
| **Residual impact** | 5 |
| **Residual score** | 5 (Low) |
| **Action items** | (1) Document credentials in 1Password with emergency access enabled for trusted individual (spouse/lawyer). (2) Document business operations runbook. (3) Per DPA Section 11, notify LEAs of significant business changes within 60 days when possible. (4) Consider succession planning when team grows. |

#### D2. Pilot loss before reaching breakeven

| Aspect | Assessment |
|---|---|
| Description | Parma pilot terminates without payment, no other pilots in pipeline |
| Inherent likelihood | 2 (current legal review pause is concerning but not terminal) |
| Inherent impact | 4 (revenue runway compressed) |
| Inherent score | 8 (Medium) |
| **Mitigations** | Build v2 enterprise version that can be sold to multiple LEAs; develop pipeline of interested districts |
| **Residual likelihood** | 2 |
| **Residual impact** | 4 |
| **Residual score** | 8 (Medium) |
| **Action items** | (1) Diversify pilot pipeline — outreach to 5+ Ohio districts for v2 launch. (2) Document Parma pilot results regardless of outcome — case study material. |

#### D3. Cost overrun on Azure services during scale-up

| Aspect | Assessment |
|---|---|
| Description | Azure costs grow faster than revenue as more LEAs sign up; cash flow problem |
| Inherent likelihood | 3 (inevitable at some scale curve) |
| Inherent impact | 3 (manageable with monitoring) |
| Inherent score | 9 (Medium) |
| **Mitigations** | Azure cost alerts; per-pilot cost tracking (planned in admin database PRD); cognate caching reduces Translator costs; TTS deduplication reduces Speech costs |
| **Residual likelihood** | 3 |
| **Residual impact** | 2 |
| **Residual score** | 6 (Medium) |
| **Action items** | (1) Implement per-LEA cost attribution in admin database. (2) Set per-LEA Azure budget alerts. (3) Per-seat pricing model that ensures unit economics make sense. |

### Category E: Product Quality & Adoption

#### E1. Low flag volume during pilot — ML flywheel doesn't get bootstrapped

| Aspect | Assessment |
|---|---|
| Description | Students don't flag content during pilot; bounty marketplace cannot launch without flag inventory |
| Inherent likelihood | 3 (kids are low-effort with optional UX) |
| Inherent impact | 4 (the entire defining IP depends on flag volume) |
| Inherent score | 12 (High) |
| **Mitigations** | Simplified one-tap flag UX; ear/mouth icons make flagging effortless |
| **Residual likelihood** | 3 |
| **Residual impact** | 4 |
| **Residual score** | 12 (High) |
| **Action items** | (1) Define minimum flag rate target before pilot resumes. (2) A/B test different flag UX prompts. (3) Teacher training to encourage flag use. (4) Consider gamification (e.g., "students who flag are helping classmates") if rates are low. |

#### E2. Translation quality complaints from native speakers

| Aspect | Assessment |
|---|---|
| Description | Refugee parents/community members object to Azure-generated translations as inaccurate or culturally inappropriate |
| Inherent likelihood | 4 (Azure has known weaknesses in Pashto, Twi, Kinyarwanda) |
| Inherent impact | 3 (reputation damage; parent withdrawal from program) |
| Inherent score | 12 (High) |
| **Mitigations** | Bridge definitions are curated, not machine-translated (mitigate scaffolding quality); flag system surfaces specific complaints; community-driven correction is the IP thesis |
| **Residual likelihood** | 4 |
| **Residual impact** | 2 |
| **Residual score** | 8 (Medium) |
| **Action items** | (1) Engage native speakers from each refugee community for pre-pilot review of curated content. (2) Be transparent in product UI: "this is a draft translation — flag if it sounds wrong." (3) Move to interpreter-corrected content as quickly as marketplace launches. |

---

## 4. Risk Heat Map (Residual Risk)

```
              Impact →
              1     2     3     4     5
   1  Low    .     .     .     .     D1
              
   2          .     .     C2    B2,A4 .
   Likelihood
   3          .     B1    A3,B3,C3 D2,D3 A1
              
   4          .     A2    E2    C1    .
              
   5  High   .     .     E1    .     .
```

**High-priority residual risks (score ≥12):**
- C1 — DPA non-compliance through architecture drift
- E1 — Low flag volume (ML flywheel bootstrap)

These two risks dominate the priority list for the next 12 months.

**Notable reduction this cycle:** C2 (Conflict of interest) dropped from 16 (High) to 6 (Medium) after cataloging the disclosure evidence record (Jan 9, 2026 pilot-deployment email thread to Dan Gedeon with CC chain; Jan 9+ Google Form approval; Jan 30 in-office demo; Feb 27 announcement email to Superintendent Hunt + same-day continuing-contract conversation with Principal Schissler; March 3 signed DPA with CFO Nuccio; March 5-13 Jason Smith IT email chain). The disclosure record is dense, bilateral across five levels of district hierarchy (principal, EL lead, technical systems manager, superintendent, CFO), and preserved — see [DISCLOSURE-EVIDENCE-LOG.md](./DISCLOSURE-EVIDENCE-LOG.md).

---

## 5. Top Action Items (next 90 days)

Aggregated from individual risks, ranked by urgency:

| # | Action | Risk addressed | Owner | Due |
|---|---|---|---|---|
| 1 | **Preserve all C2 disclosure evidence to personal + encrypted cloud; maintain [DISCLOSURE-EVIDENCE-LOG.md](./DISCLOSURE-EVIDENCE-LOG.md)** | C2 | DSO | This week |
| 2 | **Targeted attorney review of ORC 2921.42 applicability, Parma written-disclosure requirements, and 19-CON-01-0493 IP/outside-employment clauses** | C2 | DSO | Next 2 weeks |
| 3 | **Confirm Parma resignation date precedes any v2 paid procurement; document resignation structure** | C2 | DSO | Before v2 procurement |
| 4 | **Add DPA review to PR template** | C1 | DSO | Next 2 weeks |
| 5 | **Implement frontend "no personal info" flag warning** | A3 | Frontend Lead | Next sprint |
| 6 | **Add per-IP rate limiting alongside per-studentCode** | A2 | DSO | Next month |
| 7 | **Bind cyber liability insurance** | A4, A1 | DSO | Before v2 launch |
| 8 | **Define minimum flag rate target for pilot success** | E1 | DSO | Before pilot resumes |
| 9 | **Recruit native speaker reviewers for top languages** | E2 | DSO | Next month |
| 10 | **Set Azure budget alerts per pilot** | D3 | DSO | Next month |
| 11 | **Document business operations runbook (succession enablement)** | D1 | DSO | Next quarter |

---

## 6. Risks Accepted Without Mitigation

These risks are acknowledged but no further mitigation is planned:

| Risk | Reason |
|---|---|
| D1 — Founder incapacitation | Single-founder reality of early-stage startups; mitigated by 1Password emergency access and DPA Section 11 notification commitment to LEAs |
| Some level of E2 — Quality complaints | Inevitable with machine translation; the entire marketplace strategy is the long-term mitigation |

---

## 7. Compared to Last Assessment

This is the **first formal annual risk assessment** for LanguageBridge LLC. Prior to this document, risks were tracked informally in conversations and code comments. This assessment establishes the baseline.

Future assessments (April 2027 and beyond) will compare year-over-year changes in:
- Number of risks identified
- Distribution of severity
- Action item completion rate
- New risk categories emerging

---

## 8. Sign-off

| Role | Name | Signature | Date |
|---|---|---|---|
| Data Security Officer | Justin Bernard | _[signed digitally upon final review]_ | 2026-04-20 |
| CEO | Justin Bernard | _[same as DSO — concentrated role at startup stage]_ | 2026-04-20 |

This assessment is reviewed annually by the DSO and made available to LEAs upon request per DPA Exhibit H Section 9 (Annual Audit Rights).

---

## Appendix: Risk Categories Excluded from Scope

This assessment focuses on risks to Student Data, service availability, and business continuity. The following adjacent risks are excluded as out of scope:

- General product-market fit risk (covered in business plan, not security risk register)
- Macroeconomic risks (interest rates, education funding cuts) — environmental, not actionable here
- Personal employment risks for individual contributors (HR matters)

These should be tracked in business operations documents, not this security-focused assessment.
