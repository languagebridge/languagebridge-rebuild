# Incident Response Plan

**Document owner:** Justin Bernard, CEO / Data Security Officer (DSO)
**Effective date:** 2026-04-20
**Review cadence:** Annually, or after any incident
**Distribution:** All LanguageBridge personnel and contractors with access to production systems

---

## 1. Purpose

This Incident Response Plan ("IRP") defines how LanguageBridge LLC detects, responds to, contains, eradicates, recovers from, and learns from security incidents affecting Student Data, service availability, or the integrity of LanguageBridge systems.

This plan satisfies obligations under:
- LanguageBridge DPA (Exhibit F: Data Security Requirements > RESPOND)
- Ohio Senate Bill 29 (72-hour breach notification)
- FERPA (34 CFR § 99.32(a)(5))
- COPPA (16 CFR § 312)

---

## 2. Definitions

**Security Incident:** Any actual or suspected event that compromises (or could compromise) the confidentiality, integrity, or availability of Student Data or LanguageBridge production systems.

**Data Breach:** A confirmed Security Incident in which Student Data was, or is reasonably believed to have been, accessed, acquired, modified, or disclosed by an unauthorized party.

**Personally Identifiable Information (PII):** As LanguageBridge's architecture deliberately excludes PII (no names, emails, district IDs, etc.), a "PII incident" for LanguageBridge means unauthorized exposure of pseudonymous student codes (LB-XXXXXX) combined with their associated usage metadata.

---

## 3. Severity Levels

| Severity | Definition | Examples | Response Time |
|---|---|---|---|
| **SEV-1 Critical** | Active or confirmed unauthorized access to Student Data; production service fully unavailable; PII exposure | Cosmos DB credential leak; flag database publicly readable; production API returns student data to wrong user | Acknowledge in 15 min; first response 1 hour; LEA notification 24h verbal |
| **SEV-2 High** | Suspected breach being investigated; significant service degradation affecting >50% of users | Suspicious access pattern; auth bypass under investigation; sustained 5xx errors on critical endpoint | Acknowledge in 1 hour; first response 4 hours; LEA notification within 72h if confirmed |
| **SEV-3 Medium** | Service issue affecting subset of users; vulnerability disclosed but not yet exploited | Single endpoint degraded; medium-severity CVE in dependency requiring patch | Acknowledge in 4 hours; remediation within 7 days |
| **SEV-4 Low** | Cosmetic issues, low-severity vulnerabilities, internal-only systems | Low-severity dependency CVE; documentation gap; non-customer-facing logging issue | Acknowledge in 24 hours; remediation within 30-90 days |

---

## 4. Incident Response Team

LanguageBridge is an early-stage company with a small team. Roles are concentrated and may be held by the same person.

| Role | Holder | Responsibilities |
|---|---|---|
| **Incident Commander (IC)** | Justin Bernard (primary) | Owns the incident from declaration to closure; makes all containment and disclosure decisions |
| **Technical Lead** | Justin Bernard (primary) | Investigates root cause; implements containment and remediation |
| **Communications Lead** | Justin Bernard (primary) | Drafts and delivers all external notifications (LEAs, insurer, legal) |
| **Frontend Lead (consulted)** | Prentice Howard | Consulted for incidents involving the Chrome extension or frontend |
| **Legal Counsel** | TBD — to be retained on retainer before v2 launch | Reviews all external notifications before sending; advises on disclosure obligations |

When the team grows beyond 2 people, this section should be updated to formally separate IC from Technical Lead.

---

## 5. Response Procedures

### Phase 1: DETECTION

Incidents may be detected through any of these channels:

| Detection source | Configuration |
|---|---|
| **Azure Application Insights alerts** | Configured to alert on: 5xx error rate >5% over 5 min; auth failure spike; unusual geographic access patterns |
| **Cosmos DB audit logs** | Reviewed weekly; flagged for unusual queries or access from unexpected IPs |
| **Azure Cost Management alerts** | Alert on unusual cost spikes (potential abuse or compromise) |
| **External report** | `security@languagebridge.app` monitored; 24-hour acknowledgment commitment |
| **LEA report** | LEA designated representatives may report directly to DSO via email or phone |
| **Vendor disclosure** | Subprocessor notifications (Microsoft Azure, Supabase, Stripe) trigger immediate review |

When a potential incident is detected, the detector immediately notifies the IC via:
1. Phone call to (216) 800-6020 (highest priority)
2. Email to justin@languagebridge.app (parallel notification)

### Phase 2: TRIAGE & DECLARATION

Within the response time defined for each severity level, the IC must:

1. **Confirm incident exists** (rule out false positive)
2. **Assign severity** per Section 3
3. **Declare incident in writing** by creating a record with:
   - Incident ID (format: `INC-YYYYMMDD-NNN`)
   - Severity level
   - Detection source and time
   - Initial scope assessment
   - Preliminary affected systems
4. **Notify Communications Lead** if SEV-1 or SEV-2

### Phase 3: CONTAINMENT

For SEV-1 incidents, immediate containment actions may include:

- Rotating compromised API keys (Azure portal → Function App → App Settings)
- Disabling affected endpoints (set `app.http()` registration to off in code, redeploy)
- Revoking Supabase JWT tokens (Supabase admin dashboard → Auth → revoke all sessions)
- Blocking traffic at Azure Front Door (if configured) or Cloudflare (future)
- Isolating affected Cosmos DB containers via firewall rules
- Removing leaked credentials from any code repository (history rewrite + force push)

Document every containment action with timestamp.

### Phase 4: ERADICATION

Identify and remove the root cause:

- Patch vulnerable dependency (`npm audit fix`, redeploy)
- Fix vulnerable code (commit, deploy, verify)
- Reset all potentially compromised credentials
- Remove unauthorized access paths
- Validate that the attack vector is closed (re-test)

### Phase 5: RECOVERY

Restore normal operations:

- Re-enable disabled endpoints
- Validate service health (run integration test suite, manual smoke test)
- Monitor for recurrence over 24-48 hours
- Restore data from backups if integrity was compromised (see Disaster Recovery Plan)

### Phase 6: NOTIFICATION

#### LEA Notification (per DPA Exhibit H Section 10)

| Severity | Notification timeline |
|---|---|
| **Confirmed Data Breach** | **Verbal notification to LEA designated representative within 24 hours of confirmation.** Written notification within 72 hours. |
| Suspected Breach (under investigation) | LEA notified within 72 hours of suspicion if Student Data could be involved |
| Service outage affecting LEA usage | Email to LEA within 24 hours if outage exceeds 4 hours |

Notification must include:
- Description of incident
- Date and time of discovery
- Categories of Student Data affected
- Number of pseudonymous student codes affected
- Containment actions taken
- Recommended actions for LEA (if any)
- Provider contact for follow-up questions

**Notification template:** Stored in `docs/compliance/templates/breach-notification.md` (to be created).

#### Other Required Notifications

| Recipient | Trigger | Timeline |
|---|---|---|
| Cyber liability insurance carrier | Any SEV-1 or confirmed breach | Per policy terms (typically 24-48h) |
| Ohio Attorney General | Breach affecting >500 Ohio residents | Per Ohio Revised Code 1349.19 |
| US Department of Education (FERPA) | Breach involving educational records | Best practice: as soon as practicable |
| Affected interpreters (post-marketplace launch) | If interpreter PII compromised | 72 hours per applicable state law |

### Phase 7: POST-INCIDENT REVIEW

Within 14 days of incident closure, the IC conducts a written post-incident review documenting:

1. **Timeline:** Detection → declaration → containment → eradication → recovery → closure
2. **Root cause:** Technical and procedural causes
3. **Impact:** Systems affected, students affected (count of pseudonymous codes), duration
4. **What worked:** Effective controls, fast detection, good decisions
5. **What didn't:** Detection gaps, procedural failures, knowledge gaps
6. **Action items:** Specific changes to architecture, monitoring, runbook, or this IRP. Each action item has an owner and due date.
7. **Disclosure record:** All external notifications sent, with timestamps and recipients

Post-incident reviews are stored in `docs/compliance/incidents/INC-YYYYMMDD-NNN-review.md`.

---

## 6. Communication Protocols

### Internal communication during active incident

- Primary channel: Phone calls between IC and Technical Lead
- Secondary channel: Slack DM (when team grows)
- Documentation channel: Single Google Doc per incident, updated in real-time as investigation progresses

### External communication

All external communications about active incidents must be:
1. Reviewed by Legal Counsel (when retained) before sending
2. Sent only by the Communications Lead (IC if no separate role)
3. Preserved as evidence (saved to `docs/compliance/incidents/INC-YYYYMMDD-NNN/`)

**No employee or contractor is permitted to discuss an active incident with parties outside LanguageBridge except as authorized by the IC.**

### Public statements

If a public statement becomes necessary (e.g., social media inquiry, press contact):
- Drafted by IC with Legal Counsel review
- Posted only on official channels (languagebridge.app, official email)
- Holding statement template: *"We are aware of [issue] and are investigating. We will provide an update by [time]. Affected LEAs will be notified directly per our Data Privacy Agreements."*

---

## 7. Tooling

| Tool | Purpose | Access |
|---|---|---|
| Azure Portal | Service status, log review, credential rotation | MFA-required |
| Azure Application Insights | Error tracking, alerting | Read-only access for non-DSO team |
| Cosmos DB Data Explorer | Database query and inspection | Audit-logged |
| GitHub | Code rollback, history rewrite for credential leaks | MFA-required |
| Supabase Dashboard | Auth token revocation | MFA-required |

All admin tool access requires MFA. Credentials for breakglass access are stored in 1Password and rotated quarterly.

---

## 8. Annual Review

This document is reviewed annually by the DSO. Each review:
- Validates that the response team roster is current
- Validates that all tool access procedures still work
- Incorporates lessons from any incidents in the prior year
- Updates severity definitions or response timelines if architecture has changed materially
- Tabletop exercise: simulate a SEV-1 incident with the team and time the response

Last reviewed: 2026-04-20 (initial draft)
Next review due: 2027-04-20

---

## 9. Tabletop Exercise Schedule

Tabletop exercises simulate incidents to validate the IRP without affecting production:

| Quarter | Scenario |
|---|---|
| Q1 (annual) | Confirmed Cosmos DB credential leak — full SEV-1 walkthrough including LEA notification |
| Q2 | Subprocessor breach (e.g., Azure compromise notification) — review forwarding procedures |
| Q3 | Sustained DDoS or rate-limit abuse — recovery and customer communication |
| Q4 | Insider threat scenario (departing employee, revoked access timing) |

Each exercise is documented in `docs/compliance/exercises/YYYY-QN-tabletop.md`.

---

## 10. Contact Reference

| Role | Contact |
|---|---|
| **DSO / CEO (primary IC)** | Justin Bernard — justin@languagebridge.app — (216) 800-6020 |
| **Frontend Lead (consulted)** | Prentice Howard — prentice@languagebridge.app |
| **Security incident reports** | security@languagebridge.app (forwards to DSO) |
| **Cyber liability insurance** | TBD (to be added when policy is bound) |
| **Legal counsel** | TBD (to be added when retainer is established) |
| **Microsoft Azure support** | Azure portal → Help + support → New support request (Severity A for production-down) |
| **Supabase support** | support@supabase.com |
