# LanguageBridge Compliance Documentation

This directory contains the operational compliance documents referenced by the LanguageBridge Data Privacy Agreement (DPA) and the LanguageBridge Security Policy. These documents must exist and be current — auditors will ask to see them.

## Document Index

| Document | Purpose | Last reviewed | Owner |
|---|---|---|---|
| [INCIDENT-RESPONSE-PLAN.md](INCIDENT-RESPONSE-PLAN.md) | Procedures for detecting, responding to, and recovering from security incidents | 2026-04-20 | CEO/DSO |
| [DATA-FLOW-DIAGRAM.md](DATA-FLOW-DIAGRAM.md) | Mapping of student data movement through the LanguageBridge system from collection to deletion | 2026-04-20 | CEO/DSO |
| [DISASTER-RECOVERY-PLAN.md](DISASTER-RECOVERY-PLAN.md) | Procedures for restoring service and data after major outages | 2026-04-20 | CEO/DSO |
| [RISK-ASSESSMENT-2026.md](RISK-ASSESSMENT-2026.md) | Annual identification and assessment of risks to student data and service availability | 2026-04-20 | CEO/DSO |
| [NIST-CSF-CONTROL-MAPPING.md](NIST-CSF-CONTROL-MAPPING.md) | Mapping of NIST Cybersecurity Framework v1.1 controls to LanguageBridge implementations | 2026-04-20 | CEO/DSO |
| [VULNERABILITY-SCAN-PROGRAM.md](VULNERABILITY-SCAN-PROGRAM.md) | Quarterly vulnerability scanning procedures, tools, and remediation timelines | 2026-04-20 | CEO/DSO |

## Review Cadence

| Document | Review frequency | Trigger for ad-hoc review |
|---|---|---|
| Incident Response Plan | Annually | After any incident |
| Data Flow Diagram | Annually | After any architecture change affecting data flows |
| Disaster Recovery Plan | Annually | After major infrastructure change; tabletop exercise quarterly |
| Risk Assessment | Annually | After any new subprocessor, new feature with privacy implications, or incident |
| NIST CSF Control Mapping | Annually | After any control implementation change |
| Vulnerability Scan Program | Quarterly | After any critical vulnerability disclosure affecting our stack |

## Audit Posture

These documents are designed to be produced on demand to:

- LEA (school district) IT auditors invoking annual audit rights under the DPA
- Cyber liability insurance underwriters
- Prospective customers conducting vendor security questionnaires (SIG-Lite, CAIQ)
- Future SOC 2 auditors

## How to Use These Documents

**For day-to-day operations:** Refer to the Incident Response Plan when an alert fires; refer to the DR Plan during outages; reference the Risk Assessment when evaluating new subprocessors or features.

**For external requests:** Export the relevant document(s) as PDF and provide via email or shared drive. Markdown source remains the canonical version.

**For amendments:** Update the document, increment the "Last reviewed" date in this index, commit with a clear message describing what changed and why.

## Contact

**Data Security Officer / CEO:**
- Justin Bernard
- justin@languagebridge.app
- (216) 800-6020

For security incident reports or compliance questions: Use the email above. Acknowledgment within 24 hours per Ohio SB 29 commitment.
