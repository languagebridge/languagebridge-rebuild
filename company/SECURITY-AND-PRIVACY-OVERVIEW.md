# Security & Privacy Overview

**A trust brief for school IT and legal reviewers.** Answers the questions a vendor security questionnaire (SIG-Lite, CAIQ, state DPA review) asks, at a glance. Fuller operational detail lives in `docs/compliance/`; the binding commitments live in the [DPA](DPA-TEMPLATE.md).

**Security contact:** Justin Bernard, CEO / Data Security Officer · justin@languagebridge.app · (216) 800-6020

---

## The one-paragraph version

LanguageBridge collects **no personally identifiable student information**. Students never create accounts; each is a pseudonymous on-device code (`LB-XXXXXX`) that links to no real identity. Selected text and microphone audio are sent to Microsoft Azure only to produce a translation or transcription and are **not stored**. Data lives in the U.S. (Azure East US), encrypted at rest (AES-256) and in transit (TLS 1.2+). LanguageBridge implements the **NIST Cybersecurity Framework v1.1** and is designed to meet **FERPA, COPPA, and Ohio SB 29**. It is **not itself SOC 2 certified**; its subprocessors (Azure, Supabase, Stripe) are.

## Data handling at a glance

| Question | Answer |
|---|---|
| Do you collect student PII? | No — no names, IDs, emails, contact info, or demographics beyond student-selected home language / grade band / school code. |
| Do you store what students translate? | No. General translations aren't stored. Only **flagged** passages (text a student explicitly reports as wrong) are stored, linked to the pseudonymous code. |
| Do you store voice/audio? | No. Talk to Teacher audio and transcripts are processed in real time and discarded. |
| Do students authenticate? | No. Pseudonymous device code only. |
| Where does data reside? | Microsoft Azure, East US (United States). |
| Do you sell data or advertise? | Never. No sale, no targeted advertising, no non-educational profiling. |
| Do you use student data to train AI? | No. Only interpreter-provided corrections (not student content) may train proprietary voices. |
| Breach notification? | 24-hour verbal notice, 72-hour written notice (Ohio SB 29). |

## NIST CSF v1.1 posture (summary)

| Function | Implemented |
|---|---|
| **Identify** | Asset/data inventory; annual risk assessment; documented data-flow mapping. |
| **Protect** | AES-256 at rest, TLS 1.2+ in transit; RBAC; MFA on all admin consoles; PII rejected at the API boundary (16 prohibited fields, rejected before any write); secure SDLC with automated tests and dependency scanning. |
| **Detect** | Azure Application Insights monitoring; anomaly/rate-limit alerts; `npm audit`/Snyk on dependencies; periodic access-log review. |
| **Respond** | Documented incident-response plan; 24-hr verbal / 72-hr written breach notice; CEO/DSO-led response. |
| **Recover** | Cosmos DB continuous backup with point-in-time restore; geo-redundant blob storage; documented DR plan; 24-hr RTO. |

Supporting documents (available to a district on request): `docs/compliance/` — incident response, data-flow diagram, disaster recovery, annual risk assessment, NIST CSF control mapping, vulnerability-scan program.

## Honest status notes

- **Not yet built (roadmap, do not represent as live):** the LEA transparency/audit dashboard and self-serve data-export tooling described in the DPA. Until they ship, LEA data requests are fulfilled manually by the DSO.
- **Cyber-liability insurance:** carried through **The Hartford**; bind/confirm the policy and have the certificate ready before signing any DPA that commits to it.
- **SOC 2:** planned, not held. State only that subprocessors are SOC 2 certified and that LanguageBridge follows NIST CSF v1.1.
