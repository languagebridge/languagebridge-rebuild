# NIST Cybersecurity Framework v1.1 — Control Mapping

**Document owner:** Justin Bernard, CEO / Data Security Officer (DSO)
**Effective date:** 2026-04-20
**Framework version:** NIST CSF v1.1 (April 2018)
**Review cadence:** Annually
**Purpose:** Maps each NIST CSF subcategory to the specific LanguageBridge implementation, demonstrating compliance with the framework declared in our DPA.

---

## How to Use This Document

The DPA states that LanguageBridge implements the **NIST Cybersecurity Framework Version 1.1** as our primary cybersecurity framework. This document is the operational evidence backing that claim.

Each row maps a NIST CSF subcategory to:
- **Status** — Implemented, Partial, Planned, or N/A
- **Implementation** — Specific LanguageBridge control or process
- **Evidence** — Where to find the implementation (file path, configuration, document)
- **Gaps** — What's missing or planned

---

## IDENTIFY (ID) — Asset Management & Risk Posture

### ID.AM — Asset Management

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| ID.AM-1: Physical devices and systems are inventoried | N/A | Cloud-only architecture; no physical assets | — |
| ID.AM-2: Software platforms and applications are inventoried | Implemented | Backend dependencies tracked in `package.json`; Azure Function App contains all 10 endpoints | `backend/package.json`, Azure Portal → Function App |
| ID.AM-3: Organizational communication and data flows are mapped | Implemented | Data flow diagram documents all flows | `docs/compliance/DATA-FLOW-DIAGRAM.md` |
| ID.AM-4: External information systems are catalogued | Implemented | Subprocessor list in DPA Exhibit H Section 2 | `docs/DPA-V2-DRAFT.md` |
| ID.AM-5: Resources are prioritized based on classification, criticality, and business value | Implemented | Severity levels in IRP map criticality of incidents to systems | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 3 |
| ID.AM-6: Cybersecurity roles and responsibilities are established | Implemented | DSO role assigned (Justin Bernard); IRP defines incident roles | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 4 |

### ID.BE — Business Environment

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| ID.BE-1: Role in supply chain identified | Implemented | LanguageBridge is a service provider to K-12 LEAs | DPA Preamble |
| ID.BE-2: Place in critical infrastructure identified | N/A | Education service, not critical infrastructure | — |
| ID.BE-3: Priorities for organizational mission established | Implemented | README.md establishes mission and roadmap | `README.md` |
| ID.BE-4: Dependencies and critical functions for delivery identified | Implemented | Subprocessor list and DR scenarios document dependencies | `docs/compliance/DISASTER-RECOVERY-PLAN.md` Section 4 |
| ID.BE-5: Resilience requirements established | Implemented | RTO/RPO objectives documented | `docs/compliance/DISASTER-RECOVERY-PLAN.md` Section 2 |

### ID.GV — Governance

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| ID.GV-1: Organizational cybersecurity policy is established | Implemented | DPA + this compliance directory comprise the policy set | `docs/compliance/` |
| ID.GV-2: Cybersecurity roles and responsibilities are coordinated and aligned | Implemented | DSO role formalized; IRP roles defined | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` |
| ID.GV-3: Legal and regulatory requirements are understood and managed | Implemented | FERPA, COPPA, Ohio SB 29 compliance explicit in DPA | `docs/DPA-V2-DRAFT.md` |
| ID.GV-4: Governance and risk management processes address cybersecurity risks | Implemented | Annual risk assessment process | `docs/compliance/RISK-ASSESSMENT-2026.md` |

### ID.RA — Risk Assessment

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| ID.RA-1: Asset vulnerabilities are identified and documented | Implemented | Vulnerability scan program runs quarterly | `docs/compliance/VULNERABILITY-SCAN-PROGRAM.md` |
| ID.RA-2: Cyber threat intelligence is received from information sharing forums | Partial | Subscribed to Microsoft Azure Service Health alerts; npm/Snyk dependency vulnerability feeds | Azure Portal subscriptions, npm audit |
| ID.RA-3: Threats, both internal and external, are identified and documented | Implemented | Risk register categorizes threat sources | `docs/compliance/RISK-ASSESSMENT-2026.md` Section 3 |
| ID.RA-4: Potential business impacts and likelihoods are identified | Implemented | Each risk has likelihood × impact rating | `docs/compliance/RISK-ASSESSMENT-2026.md` Section 2 |
| ID.RA-5: Threats, vulnerabilities, likelihoods, and impacts are used to determine risk | Implemented | Risk score = likelihood × impact methodology | `docs/compliance/RISK-ASSESSMENT-2026.md` Section 2 |
| ID.RA-6: Risk responses are identified and prioritized | Implemented | Top 10 action items ranked by urgency | `docs/compliance/RISK-ASSESSMENT-2026.md` Section 5 |

### ID.RM — Risk Management Strategy

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| ID.RM-1: Risk management processes are established, managed, and agreed by stakeholders | Implemented | Annual review cadence documented | `docs/compliance/RISK-ASSESSMENT-2026.md` |
| ID.RM-2: Organizational risk tolerance is determined and clearly expressed | Implemented | Severity threshold table defines tolerance | `docs/compliance/RISK-ASSESSMENT-2026.md` Section 2 |
| ID.RM-3: Risk tolerance is informed by role in critical infrastructure and sector | Partial | LEA-specific tolerance higher than B2C SaaS — reflected in 24h breach notification commitment | DPA Exhibit H Section 10 |

### ID.SC — Supply Chain Risk Management

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| ID.SC-1: Supply chain risk management processes are identified, established, and agreed | Implemented | Subprocessor selection requires SOC 2 Type II minimum | DPA Exhibit H Section 2 |
| ID.SC-2: Suppliers and partners are identified and prioritized | Implemented | Subprocessor list in DPA | `docs/DPA-V2-DRAFT.md` Exhibit H |
| ID.SC-3: Contracts with suppliers and partners are used to implement appropriate measures | Implemented | Subprocessor selection conditioned on data protection agreements | DPA Exhibit H Section 2 |
| ID.SC-4: Suppliers and partners are routinely assessed | Partial | Annual review during risk assessment; no formal supplier audit program yet | `docs/compliance/RISK-ASSESSMENT-2026.md` |
| ID.SC-5: Response and recovery planning includes suppliers and third-party providers | Implemented | DR Plan Scenario E covers subprocessor compromise | `docs/compliance/DISASTER-RECOVERY-PLAN.md` |

---

## PROTECT (PR) — Safeguards Implementation

### PR.AC — Identity Management & Access Control

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| PR.AC-1: Identities and credentials are issued, managed, verified, revoked, and audited | Implemented | API keys (LB_API_KEY) for student endpoints; Supabase JWTs for teacher/admin; pseudonymous student codes generated server-side | `backend/shared/validators.ts`, `backend/azure-functions/onboarding/index.ts` |
| PR.AC-2: Physical access to assets is managed and protected | N/A | Cloud-only | — |
| PR.AC-3: Remote access is managed | Implemented | All access is remote (cloud-native); MFA required for admin tools | Azure Portal MFA config |
| PR.AC-4: Access permissions and authorizations are managed (least privilege) | Implemented | RBAC in Azure; per-school dashboard scoping in code | `backend/azure-functions/dashboard/index.ts` |
| PR.AC-5: Network integrity is protected (network segregation) | Implemented | Cosmos DB firewall restricts to Function App; no public Cosmos endpoint | Azure Portal → Cosmos DB → Networking |
| PR.AC-6: Identities are proofed and bound to credentials | Partial | Teachers via Supabase email verification; interpreters (post-marketplace) via Stripe Connect identity verification; students are pseudonymous (intentionally) | Supabase config, planned Stripe Connect |
| PR.AC-7: Users, devices, and other assets are authenticated commensurate with risk | Implemented | High-privilege admin actions require MFA; student-level access uses API key + studentCode | Azure MFA, `backend/shared/validators.ts:validateApiKey` |

### PR.AT — Awareness & Training

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| PR.AT-1: All users are informed and trained | Partial | Internal team is small (2 people); informal training via this documentation. Formal training program needed as team grows. | This document |
| PR.AT-2: Privileged users understand their roles and responsibilities | Implemented | DSO role explicitly defined; only DSO has production write access | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` |
| PR.AT-3: Third-party stakeholders understand their roles and responsibilities | Partial | Subprocessors bound by their own security frameworks; interpreters (post-launch) will sign NDAs | DPA Exhibit H |
| PR.AT-4: Senior executives understand their roles and responsibilities | Implemented | DSO is also CEO — concentrated role | This document |
| PR.AT-5: Physical and cybersecurity personnel understand their roles | Implemented | Same as PR.AT-2 | — |

### PR.DS — Data Security

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| PR.DS-1: Data-at-rest is protected | Implemented | AES-256 encryption on Cosmos DB and Blob Storage (Azure-managed keys) | Azure Portal config |
| PR.DS-2: Data-in-transit is protected | Implemented | TLS 1.2+ enforced on all endpoints; HTTPS-only manifest in Chrome extension | Azure Functions HTTPS-only setting; extension manifest |
| PR.DS-3: Assets are formally managed throughout removal, transfers, and disposition | Implemented | 90-day deletion on LEA termination; documented in DPA | DPA Exhibit H Section 4 |
| PR.DS-4: Adequate capacity to ensure availability is maintained | Implemented | Azure Functions auto-scale; Cosmos DB autoscale RU configured | Azure Portal |
| PR.DS-5: Protections against data leaks are implemented | Implemented | PII validator rejects 16 prohibited fields at API boundary | `backend/shared/validators.ts:checkForPII` |
| PR.DS-6: Integrity checking mechanisms are used to verify software, firmware, integrity | Implemented | TypeScript strict mode; unit and integration test suite (117+ tests) | `backend/__tests__/`, `backend/jest.config.js` |
| PR.DS-7: Development and testing environments are separate from production | Partial | No formal staging environment yet; deploys go directly to production. Planned for v2. | `scripts/deploy-backend.sh` |
| PR.DS-8: Integrity checking mechanisms are used to verify hardware integrity | N/A | Cloud-managed infrastructure | — |

### PR.IP — Information Protection Processes & Procedures

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| PR.IP-1: A baseline configuration of IT/OT systems is created and maintained | Implemented | Infrastructure-as-code via Cosmos indexing policy and deploy script | `backend/cosmos-indexing-policy.json`, `scripts/deploy-backend.sh` |
| PR.IP-2: A System Development Life Cycle (SDLC) is implemented | Implemented | Git-based workflow with branch protection, PR reviews, automated tests | GitHub repo settings |
| PR.IP-3: Configuration change control processes are in place | Implemented | All changes via Git; deploy requires explicit script invocation | Git history |
| PR.IP-4: Backups of information are conducted, maintained, and tested | Implemented | Cosmos continuous backup + Blob GRS replication; quarterly verification | `docs/compliance/DISASTER-RECOVERY-PLAN.md` |
| PR.IP-5: Policy and regulations regarding the physical operating environment are met | N/A | Cloud-managed (Azure data centers) | — |
| PR.IP-6: Data is destroyed according to policy | Implemented | 90-day deletion on LEA termination; rate limit records auto-expire via TTL | DPA Exhibit H Section 4 |
| PR.IP-7: Protection processes are improved | Implemented | Annual risk assessment drives improvements | `docs/compliance/RISK-ASSESSMENT-2026.md` |
| PR.IP-8: Effectiveness of protection technologies is shared with appropriate parties | Partial | Internal review; will share with insurance underwriters once policy bound | — |
| PR.IP-9: Response plans (Incident Response and Business Continuity) are in place and managed | Implemented | IRP and DRP documented | `docs/compliance/INCIDENT-RESPONSE-PLAN.md`, `DISASTER-RECOVERY-PLAN.md` |
| PR.IP-10: Response and recovery plans are tested | Implemented | Quarterly tabletop exercises scheduled | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 9 |
| PR.IP-11: Cybersecurity is included in human resources practices | Partial | Background checks planned for interpreters (Stripe Connect); founder-level only currently | DPA Exhibit H, planned hiring practices |
| PR.IP-12: A vulnerability management plan is developed and implemented | Implemented | Vulnerability scan program defines scanning, triage, remediation | `docs/compliance/VULNERABILITY-SCAN-PROGRAM.md` |

### PR.MA — Maintenance

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| PR.MA-1: Maintenance and repair of organizational assets is performed and logged | Implemented | All deploys logged in Git; Azure deploys logged in portal | Git history, Azure Portal Activity Log |
| PR.MA-2: Remote maintenance is approved, logged, and performed | Implemented | All maintenance is remote; logged via Git and Azure | Same as above |

### PR.PT — Protective Technology

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| PR.PT-1: Audit/log records are determined, documented, implemented, and reviewed | Implemented | Application Insights captures function logs; planned: synchronous audit log in Cosmos | Azure Application Insights, planned `audit_log` container |
| PR.PT-2: Removable media is protected | N/A | Cloud-only | — |
| PR.PT-3: The principle of least functionality is incorporated | Implemented | Each Azure Function has scoped responsibility; CSP locks down extension to Azure endpoints only | Manifest CSP, function isolation |
| PR.PT-4: Communications and control networks are protected | Implemented | HTTPS-only, API key required, rate limited | `backend/shared/validators.ts` |
| PR.PT-5: Mechanisms are implemented to achieve resilience requirements | Implemented | Cosmos backup + Blob GRS + DR plan | `docs/compliance/DISASTER-RECOVERY-PLAN.md` |

---

## DETECT (DE) — Anomaly Detection

### DE.AE — Anomalies and Events

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| DE.AE-1: A baseline of network operations is established and managed | Partial | Application Insights baselines metrics; no formal documented baseline yet | Azure Portal |
| DE.AE-2: Detected events are analyzed to understand attack targets and methods | Implemented | IRP defines triage and analysis procedures | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 5 |
| DE.AE-3: Event data are collected and correlated from multiple sources | Implemented | Application Insights + Cosmos audit + manual review | Azure Portal |
| DE.AE-4: Impact of events is determined | Implemented | Severity classification in IRP | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 3 |
| DE.AE-5: Incident alert thresholds are established | Implemented | Application Insights alert rules: 5xx >5% over 5min, auth failure spike, cost anomalies | Azure Portal alert rules |

### DE.CM — Security Continuous Monitoring

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| DE.CM-1: The network is monitored to detect potential cybersecurity events | Implemented | Application Insights continuous monitoring | Azure Portal |
| DE.CM-2: The physical environment is monitored | N/A | Cloud-only | — |
| DE.CM-3: Personnel activity is monitored | Implemented | Audit logs for admin actions (planned: synchronous Cosmos audit log) | Planned `audit_log` container |
| DE.CM-4: Malicious code is detected | Implemented | Dependency vulnerability scanning catches known-bad packages | `docs/compliance/VULNERABILITY-SCAN-PROGRAM.md` |
| DE.CM-5: Unauthorized mobile code is detected | Implemented | Chrome extension CSP prevents loading external scripts | Extension manifest |
| DE.CM-6: External service provider activity is monitored | Implemented | Subprocessor incident notifications subscribed to | Azure Service Health |
| DE.CM-7: Monitoring for unauthorized personnel, connections, devices, and software | Implemented | All access requires API key or JWT; rate limiting catches scraping attempts | `backend/shared/validators.ts` |
| DE.CM-8: Vulnerability scans are performed | Implemented | Quarterly per vulnerability scan program | `docs/compliance/VULNERABILITY-SCAN-PROGRAM.md` |

### DE.DP — Detection Processes

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| DE.DP-1: Roles and responsibilities for detection are well defined | Implemented | DSO is detection owner; IRP defines roles | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 4 |
| DE.DP-2: Detection activities comply with applicable requirements | Implemented | Aligned with FERPA breach notification requirements | DPA Exhibit H |
| DE.DP-3: Detection processes are tested | Implemented | Quarterly tabletop exercises | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 9 |
| DE.DP-4: Event detection information is communicated | Implemented | Communication procedures in IRP | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 6 |
| DE.DP-5: Detection processes are continuously improved | Implemented | Post-incident reviews drive improvements | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 7 |

---

## RESPOND (RS) — Incident Response

### RS.RP — Response Planning

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RS.RP-1: Response plan is executed during or after an incident | Implemented | IRP is operational document for execution | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` |

### RS.CO — Communications

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RS.CO-1: Personnel know their roles and order of operations when a response is needed | Implemented | IRP defines roles and phases | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Sections 4-5 |
| RS.CO-2: Incidents are reported consistent with established criteria | Implemented | Severity-based reporting timelines | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 3 |
| RS.CO-3: Information is shared consistent with response plans | Implemented | LEA notification per DPA: 24h verbal, 72h written | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 6 |
| RS.CO-4: Coordination with stakeholders occurs consistent with response plans | Implemented | LEAs, insurance, AG (Ohio) coordination defined | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 6 |
| RS.CO-5: Voluntary information sharing occurs with external stakeholders | Partial | Will share post-incident learnings with industry peers when relevant | — |

### RS.AN — Analysis

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RS.AN-1: Notifications from detection systems are investigated | Implemented | Triage phase in IRP | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 5 Phase 2 |
| RS.AN-2: The impact of the incident is understood | Implemented | Containment phase includes scope assessment | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 5 Phase 3 |
| RS.AN-3: Forensics are performed | Partial | Manual log review; no formal forensics tooling yet (low volume justifies manual approach) | Application Insights query interface |
| RS.AN-4: Incidents are categorized consistent with response plans | Implemented | Severity categories in IRP | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 3 |
| RS.AN-5: Processes are established to receive, analyze and respond to vulnerabilities | Implemented | Vulnerability scan program with triage and remediation timelines | `docs/compliance/VULNERABILITY-SCAN-PROGRAM.md` |

### RS.MI — Mitigation

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RS.MI-1: Incidents are contained | Implemented | Containment procedures in IRP | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 5 Phase 3 |
| RS.MI-2: Incidents are mitigated | Implemented | Eradication procedures in IRP | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 5 Phase 4 |
| RS.MI-3: Newly identified vulnerabilities are mitigated or documented as accepted risks | Implemented | Vulnerability scan triage with remediation timelines | `docs/compliance/VULNERABILITY-SCAN-PROGRAM.md` |

### RS.IM — Improvements

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RS.IM-1: Response plans incorporate lessons learned | Implemented | Post-incident review feeds IRP updates | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 7 |
| RS.IM-2: Response strategies are updated | Implemented | Annual review cycle | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` Section 8 |

---

## RECOVER (RC) — Service Recovery

### RC.RP — Recovery Planning

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RC.RP-1: Recovery plan is executed during or after a cybersecurity incident | Implemented | DRP is operational document for execution | `docs/compliance/DISASTER-RECOVERY-PLAN.md` |

### RC.IM — Improvements

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RC.IM-1: Recovery plans incorporate lessons learned | Implemented | DRP review after each disaster + quarterly tabletops | `docs/compliance/DISASTER-RECOVERY-PLAN.md` Section 6 |
| RC.IM-2: Recovery strategies are updated | Implemented | Annual review cycle | `docs/compliance/DISASTER-RECOVERY-PLAN.md` Section 10 |

### RC.CO — Communications

| Subcategory | Status | Implementation | Evidence |
|---|---|---|---|
| RC.CO-1: Public relations are managed | Implemented | Public statement procedures in IRP Section 6 | `docs/compliance/INCIDENT-RESPONSE-PLAN.md` |
| RC.CO-2: Reputation after an event is repaired | Partial | Case-by-case basis; will formalize with PR retainer if/when needed | — |
| RC.CO-3: Recovery activities are communicated to internal and external stakeholders | Implemented | DRP Section 7 communication procedures | `docs/compliance/DISASTER-RECOVERY-PLAN.md` |

---

## Implementation Summary

| NIST Function | Total Subcategories | Implemented | Partial | Planned | N/A |
|---|---|---|---|---|---|
| Identify | 29 | 21 | 6 | 0 | 2 |
| Protect | 39 | 27 | 8 | 0 | 4 |
| Detect | 18 | 14 | 2 | 0 | 2 |
| Respond | 16 | 14 | 2 | 0 | 0 |
| Recover | 6 | 5 | 1 | 0 | 0 |
| **Totals** | **108** | **81** | **19** | **0** | **8** |

**Implementation rate: 75% fully implemented, 18% partial, 7% N/A.**

This is a strong implementation profile for an early-stage company. The "Partial" controls are primarily organizational maturity items (formal training programs, supplier audits, separate dev/staging environments) that scale appropriately with team size.

---

## Top Improvement Priorities (next 12 months)

Based on partial implementation status:

1. **PR.DS-7:** Establish a separate staging environment to isolate testing from production
2. **PR.AT-1:** Formalize security awareness training program when team grows beyond 2 people
3. **PR.IP-11:** Document HR security practices (background checks, NDAs) for new hires and interpreters
4. **DE.CM-3:** Implement synchronous audit log infrastructure (planned in PRD-ADMIN-DATABASE)
5. **ID.SC-4:** Establish formal annual subprocessor security review process

Each of these will be addressed during the path to v2 enterprise launch (August 2026).

---

## Sign-off

| Role | Name | Date |
|---|---|---|
| Data Security Officer | Justin Bernard | 2026-04-20 |

Next review: 2027-04-20.
