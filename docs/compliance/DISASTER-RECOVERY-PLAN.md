# Disaster Recovery Plan

**Document owner:** Justin Bernard, CEO / Data Security Officer (DSO)
**Effective date:** 2026-04-20
**Review cadence:** Annually, with quarterly tabletop exercises
**Distribution:** All LanguageBridge personnel with production access

---

## 1. Purpose

This Disaster Recovery Plan ("DRP") defines procedures for restoring LanguageBridge service and data integrity following major outages, infrastructure failures, or data loss events. It complements the Incident Response Plan (which covers security incidents) by addressing **operational continuity** during availability and reliability disasters.

Satisfies DPA Exhibit F: Data Security Requirements > RECOVER:
- Documented disaster recovery plan with regular testing
- Daily encrypted backups with 24-hour Recovery Time Objective (RTO)
- Business continuity procedures ensuring service availability

---

## 2. Recovery Objectives

| Metric | Target | Definition |
|---|---|---|
| **Recovery Time Objective (RTO)** | 24 hours | Maximum acceptable time from incident to service restoration |
| **Recovery Point Objective (RPO)** | 1 hour | Maximum acceptable data loss measured in time |
| **Mean Time to Detect (MTTD)** | 15 minutes | Time from incident occurrence to detection by monitoring |
| **Mean Time to Acknowledge (MTTA)** | 1 hour | Time from detection to incident commander acknowledgment |

These objectives apply to **production student-facing services**. Internal admin tools may have longer recovery times.

---

## 3. Backup & Replication Architecture

### Cosmos DB

| Container | Backup mechanism | Retention | Restore method |
|---|---|---|---|
| All 9 containers | **Continuous backup** (Azure-managed) | 30 days point-in-time restore | Azure Portal → Cosmos DB → Restore |
| All 9 containers | **Periodic backup** (Azure-managed) | 90 days | Microsoft Support request |

Continuous backups capture every operation and allow restore to any second within the retention window. Backups are stored in geo-redundant Azure-managed storage and are encrypted at rest with Microsoft-managed keys.

### Azure Blob Storage

| Container | Replication | Retention |
|---|---|---|
| `tts-audio-cache` | GRS (geo-redundant — replicated to West US region) | Indefinite |
| `flag-data` | GRS | Per data retention policy |
| `model-weights` | GRS | Indefinite |

Soft delete is enabled with 30-day retention to recover from accidental deletion.

### Code & Configuration

| Asset | Backup |
|---|---|
| Backend source code | GitHub (`languagebridge/languagebridge-rebuild`), branch protection on `main` |
| Chrome extension source | GitHub, separate branch managed by frontend team |
| Azure Function App configuration | Exported quarterly to encrypted storage; documented in `docs/infrastructure/` |
| Cosmos DB indexing policy | Version-controlled at `backend/cosmos-indexing-policy.json` |
| API keys & secrets | Stored in 1Password; emergency recovery via account admin |

### What is NOT backed up

- Talk to Teacher audio (ephemeral by design — never written to disk)
- Rate limit records (TTL-managed — recreated on next request)
- Application Insights telemetry (90-day Azure retention; no separate backup needed)

---

## 4. Disaster Scenarios & Response Procedures

### Scenario A: Single Azure Function endpoint failure

**Symptoms:** One endpoint returns 500 errors; others healthy.
**Likely cause:** Bad deploy, unhandled exception, dependency issue.
**Detection:** Application Insights alert on 5xx rate >5% for 5 minutes.

**Recovery steps:**
1. Acknowledge alert (target: 15 min)
2. Check Application Insights for stack trace
3. If recent deploy: roll back via `git revert HEAD && bash scripts/deploy-backend.sh`
4. If not recent deploy: investigate dependency or external service
5. Verify with curl smoke test against affected endpoint
6. Monitor for 30 minutes post-fix

**RTO:** 1 hour
**RPO:** 0 (no data loss for endpoint failures)

---

### Scenario B: Cosmos DB regional outage

**Symptoms:** All endpoints return 500; Application Insights shows Cosmos timeouts.
**Likely cause:** Azure East US region outage; verify at status.azure.com.
**Detection:** Spike in 5xx errors across all endpoints + Cosmos health alert.

**Recovery steps:**
1. Acknowledge incident (target: 15 min)
2. Check Azure status page: `https://status.azure.com`
3. If confirmed regional outage:
   - Notify all active LEAs of service disruption (per IRP Section 5)
   - Wait for Azure recovery (typically 1-4 hours)
4. If Cosmos-specific issue (account compromised, deletion):
   - Open Microsoft Support ticket (Severity A)
   - Restore from continuous backup to point-in-time before incident
5. Verify integration test passes post-recovery
6. Send all-clear notification to LEAs

**RTO:** 24 hours (worst case if waiting for regional recovery)
**RPO:** 1 hour (continuous backup granularity)

---

### Scenario C: Accidental data deletion

**Symptoms:** Discovery that production data is missing or corrupted.
**Likely cause:** Operator error during admin operation; bug in data migration.
**Detection:** Manual discovery, audit log inspection, or LEA report.

**Recovery steps:**
1. **STOP all writes to affected container.** Disable write paths via code change + redeploy if necessary.
2. Identify deletion timestamp from audit log
3. Open Azure Portal → Cosmos DB → restore continuous backup to point-in-time **30 minutes before** deletion
4. Restore creates a new account; manually copy affected container back to production account
5. Re-enable writes
6. Audit log entry recording the recovery
7. Post-incident review per IRP Section 7

**RTO:** 4-8 hours (manual restore process)
**RPO:** 30 minutes (one-time restore granularity for safety)

---

### Scenario D: Azure Functions deployment corruption

**Symptoms:** Service deploying but returning unexpected errors after deploy.
**Likely cause:** Incomplete deploy, dependency mismatch, runtime version issue.
**Detection:** Smoke test failure post-deploy, or LEA report.

**Recovery steps:**
1. Identify last known good commit: `git log --oneline | head -10`
2. Roll back: `git checkout <good-commit>`
3. Redeploy: `bash scripts/deploy-backend.sh`
4. Run integration test: `npx jest --config backend/jest.config.js`
5. Verify with curl against critical endpoints (lexicon-lookup, tts-router, flag-handler)

**RTO:** 30 minutes
**RPO:** 0

---

### Scenario E: Subprocessor compromise (Azure, Supabase, Stripe)

**Symptoms:** Notification from subprocessor of breach affecting their service.
**Likely cause:** Subprocessor's own incident.
**Detection:** Subprocessor notification, news report, or Azure Service Health alert.

**Recovery steps:**
1. Trigger Incident Response Plan (this is also a security incident)
2. Assess which LanguageBridge data may be affected
3. If credentials may be compromised: rotate all keys with affected subprocessor
4. If data was exfiltrated: per IRP, notify LEAs within 24h verbal / 72h written
5. Document subprocessor's response and remediation

**RTO:** Per subprocessor; LanguageBridge service should not be unavailable due to subprocessor incident unless Azure itself is down
**RPO:** N/A (no data loss in our systems)

---

### Scenario F: GitHub repository loss or compromise

**Symptoms:** Cannot access code repository; suspicious commits appear.
**Likely cause:** GitHub outage; account compromise.

**Recovery steps:**
1. **If outage:** wait. Local clones contain full history. Deploys can proceed from local code.
2. **If compromise:**
   - Contact GitHub support immediately
   - Rotate all credentials referenced in commit history
   - Audit recent commits for malicious changes
   - Force-push verified clean state once access restored
3. **Long-term:** Consider mirror repository at GitLab as belt-and-suspenders

**RTO:** 24 hours (depends on GitHub support)
**RPO:** 0 (local clones preserve history)

---

### Scenario G: Total LanguageBridge LLC operational failure

**Symptoms:** LanguageBridge cannot continue operations (founder incapacitation, business closure, etc.).
**Likely cause:** Catastrophic business event.

**Recovery steps:**
1. Per DPA Exhibit H Section 11 (Startup Business Continuity): notify all active LEAs of cessation of operations as soon as feasible
2. Honor 60-day advance notice when possible
3. Provide each LEA with their data export within the 30-day grace period
4. Per Ohio SB 29: complete deletion of all Student Data within 90 days of service termination
5. Hand off Stripe Connect interpreter records to chosen successor entity (or wind down per legal counsel)

**RTO:** N/A — service ends
**RPO:** N/A

---

## 5. Backup Verification

| Backup type | Verification method | Frequency |
|---|---|---|
| Cosmos continuous backup | Test restore to staging account | Quarterly |
| Cosmos point-in-time restore | Tabletop walkthrough of restore steps | Quarterly |
| Blob soft-delete | Restore a test blob from soft-deleted state | Quarterly |
| Configuration export | Verify export file is current and decryptable | Quarterly |
| Code repository | Clone fresh on different machine, deploy to staging | Annually |

Verification results recorded in `docs/compliance/dr-tests/YYYY-QN-verification.md`.

---

## 6. Tabletop Exercise Schedule

DR tabletop exercises run quarterly (one quarter overlaps with IRP exercises):

| Quarter | DR scenario tested |
|---|---|
| Q1 | Scenario C — Accidental data deletion + point-in-time restore |
| Q2 | Scenario B — Cosmos regional outage simulation (read from Azure status post-mortems) |
| Q3 | Scenario D — Bad deploy rollback procedure |
| Q4 | Scenario G — Business continuity walkthrough (stakeholder communication) |

Each exercise documented at `docs/compliance/dr-tests/YYYY-QN-tabletop.md`.

---

## 7. Communication During Disaster

### Internal

- Phone call between IC and Technical Lead (Justin → Prentice or vice versa)
- Real-time updates in single Google Doc per disaster
- Post-recovery summary in `docs/compliance/incidents/`

### External — LEAs

For service disruptions affecting LEA usage:

| Disruption duration | Notification |
|---|---|
| <1 hour | None required (internal log only) |
| 1-4 hours | Status page update if/when public status page exists |
| >4 hours | Email to LEA designated representatives |
| Suspected data integrity issue | Per IRP — verbal within 24h, written within 72h |

### External — Public

A public status page (e.g., status.languagebridge.app) should be established before v2 enterprise launch in August 2026. For now, communication is direct email to LEA designated representatives.

---

## 8. Roles & Responsibilities

| Role | Responsibilities during disaster |
|---|---|
| **Incident Commander** (Justin) | Declares disaster severity, coordinates response, makes restore decisions, owns external communication |
| **Technical Lead** (Justin or Prentice) | Executes technical recovery procedures, validates recovery, runs smoke tests |
| **Communications Lead** (Justin) | Drafts and sends LEA notifications |
| **Microsoft Azure Support** | Engaged for Severity A tickets when needed |
| **GitHub Support** | Engaged for repo access issues |
| **Supabase Support** | Engaged for auth-related issues |

---

## 9. Insurance & Continuity Funding

| Coverage | Status | Provider |
|---|---|---|
| Cyber liability insurance | **TBD** — to be bound before v2 enterprise launch | Hiscox/Coalition/Embroker (quoting) |
| Errors & omissions (E&O) | TBD — paired with cyber policy | Same |
| Business continuity reserve | TBD — operating capital sufficient for 90-day wind-down | Founder commitment |

Cyber liability is a prerequisite for v2 enterprise customer contracts.

---

## 10. Plan Maintenance

| Trigger | Action |
|---|---|
| Annual review (April each year) | Full review and update by DSO |
| After any disaster | Update relevant scenario based on lessons learned |
| New subprocessor added | Add new scenario for that subprocessor |
| Architecture change affecting data flow | Update affected scenarios |
| Quarterly tabletop exercise | Update procedures based on findings |

Last reviewed: 2026-04-20 (initial draft)
Next review due: 2027-04-20

---

## 11. Quick Reference Card

**Service down? Start here:**

```
1. Acknowledge (call IC)            → 15 min
2. Check Azure status page          → 5 min
3. Check Application Insights       → 10 min
4. Identify scenario (A-G above)    → 10 min
5. Execute scenario procedure       → variable
6. Smoke test post-recovery         → 15 min
7. Notify LEAs if >4h               → 30 min
8. Post-incident review (within 14d) → async
```

**Critical contact numbers:**
- Justin Bernard (DSO/IC): (216) 800-6020
- Microsoft Azure Support: portal.azure.com (Severity A)
- Status page: status.azure.com
