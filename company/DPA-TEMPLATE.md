# Student Data Privacy Agreement — LanguageBridge LLC

> **Status:** Template, ready to send to an LEA — **pending final review and sign-off by Bob Ellis (counsel)** before first execution.
> **Template basis:** ETLA Ohio NDPA V1 (the same SDPC-standard template Ohio districts use, and the basis of the signed Parma City Schools MVP DPA).
> **Canonical:** written to match what the deployed system actually does. Language count and features reconciled to [00-CANONICAL-FACTS.md](00-CANONICAL-FACTS.md) — **16 supported languages**. Supersedes `docs/DPA-V2-DRAFT.md`.
> Placeholders in _[brackets]_ are completed per deal. Items marked ⚠ are committed-but-not-yet-built — confirm before promising them to a specific LEA.

| Field | Value |
|---|---|
| LEA | _[School District Name]_ |
| Provider | LanguageBridge LLC |
| Effective Date | _[Effective Date]_ |
| Term | Three (3) years from Effective Date |

---

## Preamble

This Student Data Privacy Agreement ("DPA") is entered into on the date of full execution (the "Effective Date") by and between _[LEA Name]_, located at _[LEA Address]_ (the "Local Education Agency" or "LEA"), and **LanguageBridge LLC**, located at 856 Eastlawn Dr, Highland Heights, OH 44143 (the "Provider").

WHEREAS, the Provider provides educational/digital services to the LEA; and the parties recognize the need to protect personally identifiable student information and other regulated data as required by the Family Educational Rights and Privacy Act ("FERPA"), 20 U.S.C. § 1232g (34 CFR Part 99); the Children's Online Privacy Protection Act ("COPPA"), 15 U.S.C. § 6501–6506 (16 CFR Part 312); and applicable state privacy laws including Ohio Senate Bill 29;

NOW THEREFORE, for good and valuable consideration, the parties agree as follows:

1. The Services, the categories of Student Data provided, and DPA-specific information are described in the Standard Clauses and the Exhibits hereto.
2. **Special Provisions:** ☒ Supplemental State Terms (Exhibit "G") and ☒ Additional Terms (Exhibit "H") are incorporated by reference in their entirety.
3. In a conflict between the SDPC Standard Clauses and the State/Special Provisions, the State/Special Provisions control.
4. This DPA remains in effect for three (3) years.
5. Notices may be given by email to the designated representatives below.

### Designated Representatives

**LEA:** _[Name, Title, Address, Phone, Email]_

**Provider:** Justin Bernard, CEO / Founder — 856 Eastlawn Dr, Highland Heights, OH 44143 — (216) 800-6020 — justin@languagebridge.app

---

## EXHIBIT "A" — Description of Services

**Service:** LanguageBridge — a Chrome browser extension (with a companion web app at `languagebridge.app`) for K-12 academic translation, audio pronunciation, and bilingual classroom communication, for English Language Learners including Students with Limited or Interrupted Formal Education (SLIFE).

**Core features:**
1. **Highlight & Hear** — the student highlights any word on an educational page and receives a plain-English bridge definition, the home-language cognate, native-speaker audio, and grammatical form.
2. **Academic Glossary** — a searchable K-12 vocabulary library organized by subject and grade band.
3. **Talk to Teacher** — the student speaks in their home language; speech is transcribed and translated to English for the teacher; the teacher's English reply is translated back with optional audio. Enables real-time communication without an interpreter present.

**Supported languages (16):** Arabic, Burmese, Dari, English, French, Nepali, Pashto, Persian, Portuguese, Somali, Spanish, Swahili, Tagalog, Ukrainian, Urdu, Vietnamese. Additional languages may be added on prior written notice to the LEA.

**Technical implementation:**
- **Distribution:** Chrome Web Store, and/or Google Workspace admin-console push by LEA IT.
- **Onboarding:** on first install the student selects school, grade band, and home language; Provider generates a pseudonymous student code (`LB-XXXXXX`) used solely to associate usage data with a participant. **The code contains no personally identifiable information and does not link to a real name, district ID, or external identifier.**
- **Cloud processing:** translation, speech-to-text, and text-to-speech are processed via Microsoft Azure Cognitive Services; curated content and audio are stored in Provider-managed Microsoft Azure infrastructure (East US, United States).
- **Isolation:** the extension cannot access the student's Google Workspace data, Gmail, Drive, Classroom, or other district systems. It sends data only to Provider's backend (`languagebridge-api.azurewebsites.net`) for the purposes described here.

**Content storage disclosure** — unlike purely real-time tools, Provider maintains a curated lexicon and audio cache:

| What is stored | Why | Linked to a student? |
|---|---|---|
| Bridge definitions | Curated K-12 content shown to all students | No |
| Cognates (translations) | Cached at the language-pair level on first lookup | No |
| Audio files (TTS) | Cached in Blob Storage, deduplicated by content hash | No |
| Flagged passages | Text a student reported as wrong, for quality correction | Pseudonymous code only |
| Talk to Teacher audio & transcripts | — | **Not stored (ephemeral)** |

---

## EXHIBIT "B" — Schedule of Data

| Category | Collected? | Notes |
|---|---|---|
| Application Technology Meta Data | ☒ Yes | IP **not stored** (used in-request for rate-limiting only); pseudonymous session codes; browser version for diagnostics. |
| Application Use Statistics | ☒ Yes | Aggregated analytics tied only to the pseudonymous code. |
| Assessment | ☐ No | |
| Attendance | ☐ No | |
| Communications | ☐ No | Talk to Teacher transcripts are ephemeral, not stored. |
| Conduct | ☐ No | |
| Demographics | ☒ Limited | Home/primary language (student-selected). **Not** DOB, birthplace, gender, ethnicity, race, religion. |
| Enrollment | ☒ Limited | Student-selected school code + grade band, for analytics scoping only. |
| Parent/Guardian Info | ☐ No | |
| Schedule | ☐ No | |
| Special Indicator (ELL/IEP/504/income) | ☐ No | ELL status is implicit in use but not formally collected. |
| Student Contact Info | ☐ No | |
| Student Identifiers | ☒ Pseudonymous | `LB-XXXXXX` only. **Not** names, district/state IDs, or Workspace emails. |
| Student Name | ☐ No | |
| Student In-App Performance | ☒ Yes | Lookups, language pairs, timestamps, audio events, flags — pseudonymous code only. |
| Student Program Membership | ☐ No | |
| Student Survey Responses | ☐ No | |
| Student-Generated Content | ☒ Limited | **Flagged passages only** (≤500 chars a student explicitly reports). General translations are **not** stored. |
| Transcript / grades | ☐ No | |
| Transportation | ☐ No | |
| Other (aggregated metrics) | ☒ Yes | Lookup/audio/scaffold/flag rates by school/grade/language, aggregated to a **minimum cohort of 5** to prevent re-identification. |

---

## EXHIBIT "F" — Data Security Requirements

Provider implements the **NIST Cybersecurity Framework v1.1** and maintains a control mapping, incident-response plan, disaster-recovery plan, and annual risk assessment, available to the LEA on request.

- **Identify:** asset/data inventory; annual risk assessment by the CEO/DSO; documented data-flow mapping.
- **Protect:** AES-256 at rest (Cosmos DB, Blob Storage); TLS 1.2+ in transit; RBAC limiting backend access to authorized personnel; **MFA** on all admin consoles; security-awareness training; secure SDLC (code review, automated tests, dependency scanning); **PII-boundary enforcement** — the API rejects payloads containing any of 16 prohibited PII fields before any write.
- **Detect:** Azure Application Insights monitoring; anomaly and rate-limit alerts; `npm audit`/Snyk dependency scanning; periodic access-log review.
- **Respond:** documented incident-response plan; **24-hour verbal / 72-hour written breach notification** (Ohio SB 29); CEO/DSO-led response; post-incident remediation.
- **Recover:** Cosmos DB continuous backup with point-in-time restore; geo-redundant Blob replication; documented DR plan; **24-hour RTO**.

**Infrastructure:** hosted on Microsoft Azure (Azure and Azure Cognitive Services are **SOC 2 Type II certified**); all Provider-managed data resides in Azure **East US** (United States); HTTPS/TLS 1.2+ with API-key authentication; distributed rate limiting; regular patching. Students do not authenticate with Provider.

> **Note on certifications:** Provider (LanguageBridge LLC) implements NIST CSF v1.1 but is **not itself SOC 2 certified**. The SOC 2 attestations referenced are those of Provider's subprocessors.

**Security contact:** Justin Bernard, CEO / Data Security Officer — justin@languagebridge.app — (216) 800-6020. Acknowledgment within 24 hours; full response within 72 hours (Ohio SB 29).

---

## EXHIBIT "H" — Additional Terms and Modifications

1. **Data minimization & storage** — Provider collects only the minimum necessary. Bridge definitions, cognates, and audio are curated/cached (not per student); flagged passages carry the pseudonymous code only; Talk to Teacher audio/transcripts are ephemeral.
2. **Subprocessors** — Microsoft Azure (infra/Cosmos/Blob/App Insights); Microsoft Azure Cognitive Services (translation, TTS, STT); Supabase (teacher/admin auth — JWTs only, no student data); Stripe Connect *(post-marketplace only; identity + 1099 payments; no student data)*. Provider notifies the LEA within **30 days** of adding a subprocessor; the LEA may object within 15 days and the parties will resolve in good faith.
3. **Pseudonymous identification** — `LB-XXXXXX` generated on device via cryptographically secure random sampling (32-char alphabet excluding I, O, 0, 1); no personal information; not reversible; the sole link between usage data and a participant. Teacher-side nicknames are never seen or stored by Provider.
4. **Retention & deletion** — pseudonymous usage metadata and flagged passages: duration of active subscription + 90 days; cognates/definitions/audio cache: indefinite (not student data); Talk to Teacher: not retained; LEA-admin audit logs and marketplace 1099 records: 7 years (compliance). On termination, all student-linked data deleted within **90 days** (Ohio SB 29) unless the LEA directs otherwise (Exhibit "D").
5. **No sale of Student Data** — Provider will **never** sell Student Data or use it for targeted advertising or any commercial purpose beyond the contracted services and the disclosed quality-improvement activities.
6. **No non-educational profiling** — no student profiles beyond providing the Services and evaluating effectiveness.
7. **Flagged content for improvement** — flagged passages may be reviewed by Provider admins and, post-pilot, corrected by verified interpreters under NDA. **Student-generated content is never used to train AI models;** only interpreter-provided corrections train proprietary voices. The LEA may opt out of marketplace participation.
8. **Parental access** — fulfilled through the LEA within **30 days** (or sooner if law requires), via usage reports keyed to the LanguageBridge student code.
9. **Annual audit rights** — the LEA may audit annually, or after any suspected breach, with **10 business days' notice**; Provider cooperates fully.
10. **Enhanced breach notification** — 24-hour verbal + 72-hour written, with full cooperation in response.
11. **Startup business-continuity** — Provider will notify the LEA of material ownership, infrastructure, subprocessor, or security-framework changes, or insolvency — **60 days in advance** where feasible, immediately otherwise. The LEA may terminate if it disapproves.
12. **Ohio SB 29 location/recording restrictions** — no location tracking beyond in-request IP for rate-limiting (not retained); no camera/microphone access except during student-initiated Talk to Teacher sessions (ephemeral); no keystroke logging or browsing surveillance.
13. **Insurance & liability** — Provider carries cyber-liability insurance through **The Hartford** (or will bind such coverage with The Hartford prior to execution) and will provide a certificate of insurance to the LEA upon request, maintained throughout the term. ⚠ *Confirm the policy is bound before executing.*
14. **LEA transparency dashboard** — ⚠ *Committed, not yet built.* Provider will provide LEA administrators access to real-time usage, a data inventory, the subprocessor list, an admin-action audit log, and export tools. Until available, requests are fulfilled manually by the DSO.
15. **Right to data return at termination** — within a 30-day grace period the LEA may request export of aggregate analytics and the admin audit log; deletion completes within the 90-day post-termination window.
16. **Entire agreement modification** — these terms supplement and, where applicable, supersede conflicting Standard Clauses; all other terms remain in force.

---

## Standard Exhibits (Incorporated by Reference)

From the ETLA Ohio NDPA V1 template: **Exhibit "C" Definitions**; **Exhibit "D" Directive for Disposition of Data**; **Exhibit "E" General Offer of Privacy Terms** *(Provider will extend this once ≥3 Ohio LEAs have signed)*; **Exhibit "G" Supplemental State Terms for Ohio (SB 29)**; and the **Standard Clauses (Articles I–VII)**.

---

## In Witness Whereof

**LEA: _[School District Name]_**
By: __________________________  Date: __________
Printed Name: ____________________  Title: __________

**Provider: LanguageBridge LLC**
By: __________________________  Date: __________
Printed Name: Justin Bernard  Title: CEO / Founder

---

## Internal notes (NOT part of the agreement)

**Before sending to an LEA:**
- [ ] Bob Ellis (counsel) review + sign-off on the full DPA.
- [ ] The Hartford cyber-liability policy bound; certificate on hand (clause 13).
- [ ] Confirm the referenced `docs/compliance/` artifacts are current.
- [ ] Build the transparency dashboard + export/audit tooling before representing clause 14 as live.

**Open questions for legal:** (1) strength of the "interpreter audio used for TTS training" disclosure — some districts may want explicit opt-out; (2) whether to add a Special-Education/IEP disclosure given EL/IEP overlap (we collect none); (3) confirm 7-year audit-log retention for Ohio K-12; (4) keep the forward-looking Stripe/marketplace disclosure now vs. amend later; (5) lawyer confirmation of the "bridge definitions & cognates are not student data" framing.
