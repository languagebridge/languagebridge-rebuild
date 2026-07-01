# LanguageBridge v2 — Student Data Privacy Agreement (DRAFT)

> **Status:** Internal draft, not yet legally reviewed
> **Last updated:** 2026-04-20
> **Purpose:** Source-of-truth for all future LEA agreements when v2 (Chrome Web Store enterprise version) ships.
> **Template basis:** ETLA Ohio NDPA V1 (same template as the signed Parma MVP DPA)
>
> This document is written to **accurately reflect what the v2 backend actually does**. It will evolve alongside the architecture. Every claim here should be defensible if a school IT auditor inspects the actual deployed system.

---

## ETLA OHIO NDPA V1 — STANDARD STUDENT DATA PRIVACY AGREEMENT

| Field | Value |
|---|---|
| LEA | _[School District Name]_ |
| Provider | LanguageBridge LLC |
| Date | _[Effective Date]_ |

---

## Preamble

This Student Data Privacy Agreement ("DPA") is entered into on the date of full execution (the "Effective Date") and is entered into by and between:

_[LEA Name]_, located at _[LEA Address]_ (the "Local Education Agency" or "LEA")

**and**

LanguageBridge LLC, located at 856 Eastlawn Dr, Highland Heights, OH 44143 (the "Provider").

WHEREAS, the Provider is providing educational or digital services to LEA.

WHEREAS, the Provider and LEA recognize the need to protect personally identifiable student information and other regulated data exchanged between them as required by applicable laws and regulations, such as the Family Educational Rights and Privacy Act ("FERPA") at 20 U.S.C. § 1232g (34 CFR Part 99); the Children's Online Privacy Protection Act ("COPPA") at 15 U.S.C. § 6501-6506 (16 CFR Part 312), applicable state privacy laws and regulations.

WHEREAS, the Provider and LEA desire to enter into this DPA for the purpose of establishing their respective obligations and duties in order to comply with applicable laws and regulations.

NOW THEREFORE, for good and valuable consideration, LEA and Provider agree as follows:

1. A description of the Services to be provided, the categories of Student Data that may be provided by LEA to Provider, and other information specific to this DPA are contained in the Standard Clauses hereto.
2. **Special Provisions:**
   - ☒ Supplemental State Terms attached hereto as Exhibit "G" are hereby incorporated by reference into this DPA in their entirety.
   - ☒ Additional terms set forth in Exhibit "H" are hereby incorporated by reference into this DPA in their entirety.
3. In the event of a conflict between the SDPC Standard Clauses, the State or Special Provisions will control.
4. This DPA shall stay in effect for three (3) years.
5. The services to be provided by Provider to LEA pursuant to this DPA are detailed in Exhibit "A" (the "Services").
6. Notices may be given via e-mail transmission to the designated representatives below.

### Designated Representatives

**LEA Representative:**
_[Name, Title, Address, Phone, Email]_

**Provider Representative:**
- Name: Justin Bernard
- Title: CEO/Founder
- Address: 856 Eastlawn Dr, Highland Heights, OH 44143
- Phone: (216) 800-6020
- Email: justin@languagebridge.app

---

## EXHIBIT "A" — DESCRIPTION OF SERVICES

### Service Name
LanguageBridge (Enterprise Edition v2)

### Service Type
Chrome browser extension for K-12 academic translation, audio pronunciation, and bilingual classroom communication

### Overview

LanguageBridge provides an audio-first translation and conversational tool delivered as a Chrome browser extension for English Language Learners (ELLs), including Students with Limited or Interrupted Formal Education (SLIFE). The service supports 21 languages with custom-curated bridge definitions designed for K-12 academic vocabulary.

### Core Functionality

LanguageBridge provides three integrated features:

**1. Highlight & Hear (Vocabulary Lookup)**
- Student highlights any word on any educational webpage
- Receives a plain-English bridge definition that scaffolds understanding
- Receives the word's cognate in their home language script
- Plays native-speaker audio pronunciation
- Sees grammatical forms (noun, verb, adjective)

**2. Academic Glossary**
- Searchable library of K-12 academic vocabulary terms
- Organized by subject (science, math, social studies, ELA) and grade band
- Same bridge definitions, cognates, and audio as Highlight & Hear

**3. Talk to Teacher (Bilingual Classroom Communication)**
- Student speaks into device microphone in their home language
- Speech is transcribed and translated to English for the teacher
- Teacher types reply in English
- Reply is translated to student's home language with optional audio
- Enables real-time student-teacher communication without an interpreter present

### Supported Languages

Twenty-one (21) languages: Arabic, French, Portuguese, Ukrainian, Vietnamese, Spanish, Persian, English, Nepali, Swahili, Dari, Pashto, Urdu, Somali, Kinyarwanda, Twi, Burmese, Uzbek, Amharic, Tagalog, Tigrinya. Additional languages may be added with prior written notice to LEA.

### Educational Purpose

LanguageBridge is designed to provide equitable access to digital educational content for English Language Learners, particularly refugee and immigrant students who speak languages underserved by mainstream translation tools. The tool supports student comprehension, enables independent engagement with grade-level content, and facilitates classroom communication across language barriers.

### Technical Implementation

- **Distribution:** Chrome Web Store (publicly listed) and/or Google Workspace admin console push by LEA IT
- **Onboarding:** First-time installation prompts the student to select their school, grade band, and home language. Provider generates a pseudonymous student code (format: `LB-XXXXXX`, e.g. `LB-7K2M`) used solely to associate usage data with an individual pilot participant. **The student code does not contain or link to the student's real name, district ID, or any personally identifiable information.**
- **Cloud Processing:** All translation, speech-to-text, and text-to-speech requests are processed via Microsoft Azure Cognitive Services. Bridge definitions, cognates, and audio are stored in Microsoft Azure infrastructure managed by Provider.
- **Device Compatibility:** All Chromebooks and devices running Google Chrome browser
- **Compliance:** Designed to be compliant with FERPA, COPPA, and Ohio Senate Bill 29 requirements

### Usage Analytics

Provider collects anonymized and aggregated usage analytics accessible to LEA teachers and administrators for the purpose of evaluating program effectiveness and student engagement. Analytics include:
- Translation frequency by language pair
- Term lookup frequency (which words are looked up most)
- Session duration and frequency
- Audio playback engagement
- Flag activity (when students flag content as incorrect)
- Bridge-vs-fallback ratio (quality indicator)

Analytics are presented at the individual pseudonymous-student level (using the LanguageBridge student code) and in aggregate form by school, grade band, and language. **Analytics do not contain student names, emails, real student IDs, or any personally identifiable information.**

### Content Storage Disclosure

Unlike strictly real-time translation tools, LanguageBridge maintains a **curated lexicon and audio cache** to deliver pedagogically scaffolded definitions and reduce latency:

| What is stored | Why | Linked to a student? |
|---|---|---|
| **Bridge definitions** (plain-English scaffolds) | Curated content for K-12 academic vocabulary; same content shown to all students | No |
| **Cognates** (translations into supported languages) | Auto-cached on first lookup of a term, served instantly on subsequent lookups | No (cached at language-pair level, not per student) |
| **Audio files** (TTS pronunciation of cognates) | Cached in Azure Blob Storage, deduplicated by SHA-256 hash of text+language | No (cached by content hash, not per student) |
| **Flagged passages** (text the student highlighted and reported as wrong) | Used to identify content needing correction by verified human interpreters | Linked to pseudonymous student code only, never to real identity |
| **Talk to Teacher audio and transcripts** | Ephemeral — processed in real-time, not stored after response is returned | Not stored |
| **Talk to Teacher translated text** | Ephemeral — returned to teacher/student, not stored | Not stored |

### Interpreter Marketplace (Phase 3 feature, post-pilot)

When five or more students flag the same passage as incorrect, the passage may be promoted to a marketplace where verified bilingual interpreters provide corrected translations and audio recordings. Marketplace participation:

- **Only the original student-highlighted text and target language are sent to interpreters.** No Azure-generated translations or audio are sent.
- **Interpreters are independent contractors (1099)**, vetted via Stripe Connect identity verification and bound by NDAs covering all flagged content they see.
- **Interpreter submissions** (corrected text + audio recordings) replace Azure-generated content in the curated lexicon upon Provider admin approval.
- **Approved interpreter audio** may be retained for use in training Provider's proprietary text-to-speech voice models. This use is solely for improving voice quality in the supported languages and is never linked to individual students.

LEAs may opt out of marketplace participation; flagged content from opted-out LEAs will be reviewed exclusively by Provider's internal staff.

---

## EXHIBIT "B" — SCHEDULE OF DATA

The following data elements are collected or processed by LanguageBridge:

| Category | Collected? | Notes |
|---|---|---|
| **Application Technology Meta Data** (IP addresses, session tokens, browser version, device information) | ☒ YES | IP addresses are NOT stored; only used in real-time for security (rate limiting, abuse detection). Session tokens are pseudonymous (LB-XXXXXX student codes). Browser version logged for compatibility diagnostics. |
| **Application Use Statistics** (timestamps, frequency of use, session duration) | ☒ YES | Aggregated analytics for teacher dashboards and product improvement. Linked only to pseudonymous student code. |
| **Assessment** | ☐ NO | No standardized test scores, observation data, or assessment results collected. |
| **Attendance** | ☐ NO | No attendance data collected. |
| **Communications** (emails, messages, blog entries) | ☐ NO | No general communications captured. **Talk to Teacher transcripts are processed ephemerally and not stored.** |
| **Conduct** | ☐ NO | No behavioral data collected. |
| **Demographics** | ☒ YES (limited) | Native/primary language information collected via student selection during onboarding. NOT collected: date of birth, place of birth, gender, ethnicity, race, religion. |
| **Enrollment** (school, grade level, homeroom) | ☒ YES (limited) | Student selects school code and grade band during onboarding for analytics scoping. NOT collected: homeroom, guidance counselor, curriculum programs. |
| **Parent/Guardian Information** | ☐ NO | No parent or guardian information collected. |
| **Schedule** | ☐ NO | No course schedules, teacher names, or class periods collected. |
| **Special Indicator** (ELL status, low income, IEP/504, disability) | ☐ NO | No special education indicators collected. ELL status is implicit in use of the product but not formally collected. |
| **Student Contact Information** (address, email, phone) | ☐ NO | No contact information collected. |
| **Student Identifiers** | ☒ YES (pseudonymous only) | Pseudonymous LanguageBridge student code (format: LB-XXXXXX) generated during onboarding. NOT collected: student names, district student ID numbers, state student ID numbers, Google Workspace email addresses. The student code is generated by Provider and does not link to any external identifier. |
| **Student Name** | ☐ NO | First and/or last names are not collected. |
| **Student In-App Performance** | ☒ YES | Term lookups, language pairs accessed, session timestamps, audio playback events, flag events. Linked to pseudonymous student code only. |
| **Student Program Membership** | ☐ NO | No academic or extracurricular activity data collected. |
| **Student Survey Responses** | ☐ NO | No surveys or questionnaires deployed. |
| **Student Work / Student-Generated Content** | ☒ YES (limited scope) | **Flagged passages only.** When a student taps the flag icon on highlighted text, that text (up to 500 characters) is stored to support quality improvement. Flagged content is reviewed by Provider admins and, post-pilot, may be sent to verified human interpreters under NDA for correction. **General translation requests are not stored as student-generated content** — only the system's own bridge definitions, cognates, and audio (which are not student-generated). |
| **Transcript** | ☐ NO | No grades, course data, or performance scores collected. |
| **Transportation** | ☐ NO | No bus or transportation data collected. |
| **Other Data Elements** | ☒ YES | Aggregated usage analytics including: term lookup frequency by school/grade/language, audio play rate, scaffold view rate, flag rate, vocabulary breadth metrics. All metrics aggregated to a minimum cohort size of 5 students to prevent re-identification. |

### Summary of Data Collection

**LanguageBridge collects:**
- Pseudonymous LanguageBridge student code (LB-XXXXXX, generated by Provider, no link to real identity)
- Student-selected: school code, grade band, home language
- Usage statistics per pseudonymous student code (frequency, language pairs, timestamps, duration)
- Flagged passages (when student explicitly flags content as incorrect)
- Browser type and version (for compatibility diagnostics)

**LanguageBridge does NOT collect:**
- Student names, photos, or faces
- District student ID numbers or state ID numbers
- Google Workspace email addresses or any external identifiers
- Student or parent contact information
- Teachers' names, schedules, or curriculum data
- Academic performance, grades, or assessment scores
- Attendance, behavior, or special education status
- Date of birth, place of birth, gender, ethnicity, race
- IP addresses (used only for real-time rate limiting, never stored)
- Student keystrokes outside the LanguageBridge extension
- Audio or video from device cameras/microphones except during active "Talk to Teacher" sessions (which are ephemeral and not stored)
- Browsing history, web activity outside the extension, or other application usage

### Technical Implementation Note

LanguageBridge operates as a Chrome browser extension distributed via the Chrome Web Store and/or pushed by district IT administrators via the Google Workspace admin console. **Students complete a brief onboarding flow on first installation** (selecting school, grade band, and home language) and are issued a pseudonymous student code by Provider. This code is the sole identifier associating usage data with an individual student.

Provider **cannot access** the student's broader Google Workspace data, Gmail contents, Google Drive files, Google Classroom assignments, or other district systems. The Chrome extension operates in isolation and only sends data to Provider's secure backend (`languagebridge-api.azurewebsites.net`) for the explicit purposes described in this Agreement.

---

## EXHIBIT "F" — DATA SECURITY REQUIREMENTS

### Cybersecurity Framework

LanguageBridge LLC implements the **NIST Cybersecurity Framework Version 1.1** as its primary cybersecurity framework. Provider maintains supporting documentation including a NIST CSF control mapping, incident response plan, disaster recovery plan, and annual risk assessment, available to LEA upon request.

### Specific Security Measures Implemented

**1. IDENTIFY**
- Complete inventory of all systems and assets handling Student Data, documented in Provider's internal architecture documentation
- Annual risk assessment conducted by Provider's CEO/Data Security Officer
- Documented data flow mapping from collection through deletion

**2. PROTECT**
- **Encryption:** AES-256 encryption for all data at rest in Microsoft Azure Cosmos DB and Azure Blob Storage; TLS 1.2+ enforced for all data in transit
- **Access Control:** Role-Based Access Control (RBAC) limiting backend data access to authorized Provider personnel only. Pseudonymous student-level access is controlled exclusively by Provider's API key authentication system and Supabase JWT tokens for teacher/admin endpoints.
- **Administrative Authentication:** Multi-factor authentication (MFA) required for all Provider personnel accessing Microsoft Azure portal, Cosmos DB, and Supabase admin consoles
- **Training:** Security awareness training for all Provider employees and contractors with access to backend systems
- **Development:** Secure software development lifecycle (SDLC) practices including code review, automated testing (117+ tests across 11 suites), TypeScript strict mode, and dependency vulnerability scanning
- **PII Boundary Enforcement:** Provider's API rejects any payload containing 16 prohibited PII fields (names, emails, district IDs, IP addresses, device IDs, etc.) before any database write occurs. This is enforced at the API boundary as an architectural property.

**3. DETECT**
- Continuous monitoring of system logs via Microsoft Azure Application Insights
- Automated alerts for unusual access patterns, error rate spikes, and rate-limit anomalies
- Vulnerability scanning via npm audit and Snyk on dependency updates (continuous)
- Quarterly review of access logs

**4. RESPOND**
- Documented incident response plan, reviewed annually
- **72-hour breach notification commitment** to affected LEAs, as required by Ohio SB 29
- **24-hour verbal notification** to LEA designated representative upon discovery of any suspected or confirmed data breach
- Designated security incident response team led by CEO/Data Security Officer
- Post-incident analysis and remediation procedures to prevent recurrence

**5. RECOVER**
- Microsoft Azure Cosmos DB built-in continuous backups with point-in-time restore (Azure-managed, encrypted at rest)
- Microsoft Azure Blob Storage geo-redundant replication
- Documented disaster recovery plan with annual tabletop exercise
- 24-hour Recovery Time Objective (RTO) for critical services
- Business continuity procedures ensuring service availability

### Infrastructure Security

- **Cloud hosting:** Microsoft Azure Functions (SOC 2 Type II certified) and Microsoft Azure Cosmos DB (SOC 2 Type II certified)
- **Geographic data residency:** All Provider-managed data stored in Microsoft Azure East US region (United States)
- **Secure API connections:** All endpoints use HTTPS (TLS 1.2+) with API key authentication
- **Rate limiting:** Distributed rate limiting via Cosmos DB prevents abuse and denial-of-service attacks
- **Regular security patching:** Azure Functions runtime kept current; npm dependencies updated monthly
- **No student authentication system:** Students do not create accounts with Provider; pseudonymous codes are generated server-side and stored locally on the student's device.

### Exclusions and Variations

None at this time. Provider fully implements the NIST Cybersecurity Framework Version 1.1 as described above with no material exclusions or variations.

### Security Contact Information

- **Name:** Justin Bernard
- **Title:** CEO / Data Security Officer
- **Email:** justin@languagebridge.app
- **Phone:** (216) 800-6020
- **Response Time:** All security incidents will receive acknowledgment within 24 hours and full response within 72 hours per Ohio SB 29 requirements.

---

## EXHIBIT "H" — ADDITIONAL TERMS AND MODIFICATIONS

LEA and Provider agree to the following additional terms and modifications to the Standard Student Data Privacy Agreement:

### 1. Data Minimization and Content Storage

Provider commits to collecting only the minimum data necessary to provide the contracted services. Provider's storage policies are explicitly disclosed in **Exhibit A: Description of Services > Content Storage Disclosure**, and include:

- **Bridge definitions and cognates** are curated/cached at the language-pair level, not per individual student
- **Audio files** are cached in Azure Blob Storage, deduplicated by content hash, not associated with any student
- **Flagged passages** (student-input text only) are stored to enable quality improvement; pseudonymous student code is the only identifier
- **Talk to Teacher audio and transcripts** are ephemeral — processed in real-time and not retained after the request returns

Only pseudonymous usage metadata (timestamps, language pairs, session events) is associated with the LanguageBridge student code and retained for service analytics and program evaluation purposes.

### 2. Subprocessors

Provider currently utilizes the following subprocessors for service delivery, all of whom are bound by data protection agreements consistent with this DPA:

| Subprocessor | Purpose | Compliance |
|---|---|---|
| **Microsoft Azure** | Cloud infrastructure, Cosmos DB, Blob Storage, Application Insights | SOC 2 Type II, ISO 27001, FERPA-aligned |
| **Microsoft Azure Cognitive Services** | Real-time translation (Translator), text-to-speech (Speech Services), speech-to-text (Speech Services) | SOC 2 Type II |
| **Supabase** | Teacher and administrator authentication (JWTs only — no student data) | SOC 2 Type II |
| **Stripe Connect** *(post-pilot, only after marketplace launch)* | Identity verification and 1099 payment processing for verified bilingual interpreters. **No student data is shared with Stripe.** | PCI DSS Level 1, SOC 1, SOC 2 |

Provider will notify LEA within 30 days of adding any new subprocessors. LEA may object to the use of a new subprocessor within 15 days of notification, and the parties will work in good faith to resolve any concerns.

### 3. Pseudonymous Student Identification

LanguageBridge uses a pseudonymous identifier system. During first-time installation, the student selects their school, grade band, and home language. Provider then generates a random alphanumeric code in the format `LB-XXXXXX` (using a 32-character alphabet excluding visually confusing characters: I, O, 0, 1).

This student code:
- Is generated using cryptographically secure random sampling
- Does not contain or derive from any personal information
- Cannot be reverse-engineered to identify the student
- Is the sole identifier linking usage data to an individual pilot participant
- Is stored locally on the student's device in Chrome's extension storage

Teachers may nickname the student code on their side for classroom roster purposes. Provider never sees or stores the nickname.

### 4. Data Retention and Deletion Timeline

Usage analytics, lexicon entries derived from student lookups, and metadata will be retained as follows:

| Data Type | Retention |
|---|---|
| Pseudonymous usage metadata (sessions, timestamps, language pairs) | Duration of active LEA subscription, plus 90 days |
| Flagged passages (student-input text) | Duration of active LEA subscription, plus 90 days; or until resolved by interpreter correction |
| Cognates and bridge definitions (curated/cached, not student-linked) | Indefinite (these are not student data) |
| Audio cache (TTS files, deduplicated by content hash) | Indefinite (not student data) |
| Talk to Teacher audio and transcripts | Not retained — ephemeral processing only |
| Audit logs of LEA admin actions | 7 years (compliance requirement) |
| Interpreter marketplace records (post-pilot) | 7 years (tax compliance for 1099 payments) |

Upon termination of this DPA or the underlying service agreement, Provider will delete all student-linked data within **90 days** as required by Ohio Senate Bill 29, unless otherwise directed by LEA via the Directive for Disposition of Data (Exhibit D).

### 5. No Sale of Student Data

Provider explicitly commits that it will **never sell Student Data to any third party** for any purpose. Provider will not use Student Data for targeted advertising, marketing, or any commercial purpose beyond providing the contracted translation services and the related quality improvement activities (interpreter marketplace) disclosed in Exhibit A.

### 6. No Creation of Student Profiles for Non-Educational Purposes

Provider will not create or maintain student profiles for any purpose other than providing the translation services described in Exhibit A and evaluating pilot program effectiveness. Usage analytics collected are limited to the metrics disclosed in Exhibit B and are used solely for service improvement and reporting to LEA teachers and administrators.

### 7. Use of Flagged Content for Service Improvement

When students flag content as incorrect (using the in-product flag icon), the flagged passage is stored and may be:
- Reviewed by Provider's internal admin team for quality assessment
- Promoted to the interpreter marketplace (post-pilot) for correction by verified bilingual interpreters under NDA
- Used to update Provider's curated lexicon with verified human-corrected translations and audio
- Used to train Provider's proprietary text-to-speech voice models (interpreter-recorded audio only, not student-generated content)

LEA may opt out of marketplace participation, in which case flagged passages from LEA's students will only be reviewed by Provider's internal admin team. **Student-generated content (the flagged text itself) is never used to train any AI models.** Only interpreter-provided corrections are used for model training.

### 8. Parental Access Rights

Provider will cooperate with all LEA requests for parent or legal guardian access to Student Data within **30 days of request**, or within the timeframe required by applicable state or federal law, whichever is sooner. All requests for parental access must be directed through LEA, not directly to Provider.

Given the pseudonymous nature of data collection, parental access requests will be fulfilled by providing usage reports for the specified student (via the LEA-supplied LanguageBridge student code) showing translation frequency, language pairs, timestamps, and any flagged content submitted.

### 9. Annual Audit Rights

LEA may audit Provider's data privacy and security practices annually, or following any suspected data breach or unauthorized access incident, with **10 business days' written notice**. Provider will cooperate fully with such audits and provide reasonable access to relevant documentation, systems, and personnel. All parties will execute appropriate confidentiality agreements prior to audit commencement.

### 10. Enhanced Breach Notification

In addition to the requirements set forth in the Standard Clauses and Ohio SB 29, Provider commits to providing LEA with **immediate verbal notification (within 24 hours)** upon discovery of any suspected or confirmed data breach, followed by written notification within 72 hours as required by law. Provider will cooperate fully with LEA in all breach response activities.

### 11. Startup Business Continuity Provision

Provider acknowledges its status as an early-stage educational technology company. Provider commits to notifying LEA of any significant changes to its business operations, including but not limited to:

- Ownership structure changes, mergers, or business acquisitions
- Material changes to data hosting infrastructure or subprocessor arrangements
- Material changes to security practices or cybersecurity framework
- Business insolvency, bankruptcy, or cessation of operations

Such notifications will be provided at least **60 days in advance** when possible, or immediately when advance notice is not feasible. LEA retains the right to terminate this DPA if it disapproves of any such changes.

### 12. Ohio-Specific Location and Recording Restrictions

In compliance with Ohio Senate Bill 29, Provider confirms that LanguageBridge:

- **Does not utilize location-tracking features** beyond Azure Functions' standard request logging (which captures IP for rate-limiting only and is not retained beyond the request lifecycle)
- **Does not access, activate, or record audio or visual features of school-issued devices** except during active "Talk to Teacher" sessions explicitly initiated by the student via the in-product mic button. Such audio is processed ephemerally for transcription and is not stored.
- **Does not monitor student interactions beyond usage of the LanguageBridge extension itself.** No keystroke logging, no web-browsing surveillance, no monitoring of other applications.

### 13. Insurance and Liability

Provider maintains or will obtain appropriate cyber liability insurance coverage and will provide certificate of insurance to LEA upon request. Provider agrees to maintain such coverage throughout the term of this agreement.

### 14. LEA Transparency Dashboard

Provider will provide LEA-designated administrators with access to a transparency dashboard accessible at `dashboard.languagebridge.app` (or successor URL) showing:

- Real-time usage statistics for LEA's pilot
- Complete data inventory (what Provider holds about LEA's pilot)
- Subprocessor list and last-modified date
- LEA admin action audit log (every action Provider admins have taken on LEA's pilot data)
- Data export tools (CSV/JSON download of all aggregate data)

This transparency dashboard is intended to satisfy LEA's right of audit and parental Right of Access (FERPA) without requiring formal audit invocation.

### 15. Right to Data Return at Termination

Upon termination of this DPA, LEA may, within a 30-day grace period, request Provider to:
- Export all aggregate analytics data for LEA's pilot in CSV/JSON format
- Provide the complete LEA admin audit log
- Provide a final transparency report

After the 30-day grace period, Provider will permanently delete all LEA-linked Student Data within an additional 60 days, totaling the 90-day post-termination deletion required by Ohio SB 29.

### 16. Entire Agreement Modification

These additional terms supplement and, where applicable, supersede conflicting provisions in the Standard Clauses. All other terms of the Standard Student Data Privacy Agreement remain in full force and effect.

---

## STANDARD EXHIBITS (Incorporated by Reference)

The following standard exhibits from the ETLA Ohio NDPA V1 template are incorporated into this agreement by reference:

- **Exhibit "C": Definitions** — Standard SDPC legal definitions, no modifications
- **Exhibit "D": Directive for Disposition of Data** — Form to be completed by LEA upon termination
- **Exhibit "E": General Offer of Privacy Terms** — Optional; allows Provider to extend these same terms to other Ohio LEAs. *Provider will offer this once at least three (3) Ohio LEAs have signed the v2 DPA.*
- **Exhibit "G": Supplemental State Terms for Ohio** — Ohio Senate Bill 29 requirements, incorporated in their entirety
- **Standard Clauses (Articles I-VII)** — Govern data ownership, authorized access, duties of LEA and Provider, data provisions, general offer of terms, and miscellaneous provisions

---

## IN WITNESS WHEREOF

LEA and Provider execute this DPA as of the Effective Date.

**LEA: _[School District Name]_**

By: _________________________________________ Date: ____________

Printed Name: ________________________________ Title: ____________

**Provider: LanguageBridge LLC**

By: _________________________________________ Date: ____________

Printed Name: Justin Bernard      Title: CEO / Founder

---

## END OF DRAFT

*This agreement consists of the signature pages plus Exhibits A, B, F, and H as completed above, together with Exhibits C, D, E, and G and the Standard Clauses from the ETLA Ohio NDPA V1 template incorporated by reference.*

---

## INTERNAL NOTES (NOT PART OF AGREEMENT)

### Differences from MVP DPA (signed with Parma 3/3/2026)

| Section | MVP DPA Said | v2 DPA Says |
|---|---|---|
| Identifier model | "Google Workspace identifier ONLY" | Pseudonymous LB-XXXXXX codes generated during onboarding |
| Content storage | "Does NOT store the actual text content" | Discloses lexicon, audio cache, flagged passages with retention policies |
| Native language | "Inferred from translation usage patterns" | Explicitly selected by student during onboarding |
| Subprocessors | Azure, Netlify, Azure Translator | Azure (consolidated), Supabase, Stripe Connect (post-marketplace) |
| Backups | "Daily encrypted backups" | Azure Cosmos DB built-in continuous backups + point-in-time restore |
| Talk to Teacher | Not mentioned (didn't exist) | Disclosed with ephemeral-processing commitment |
| Marketplace | Not mentioned (didn't exist) | Fully disclosed including interpreter audio retention for ML training |
| Transparency dashboard | Not mentioned | Committed to as part of LEA right-of-audit |

### Open questions for legal review

1. Is the "approved interpreter audio used for ML training" disclosure strong enough? Some districts may want explicit opt-out language for this use.
2. Should we add a "Special Education / IEP" disclosure given that ELL students often have IEPs? We don't collect IEP status, but we should make sure the architecture is defensible if that becomes a question.
3. The 7-year audit log retention is from compliance instinct. Need to confirm this is correct for Ohio K-12 records.
4. Stripe Connect disclosure — should we include this now (forward-looking) or only when the marketplace actually launches? Including it now means we don't have to amend later.
5. The "Bridge definitions and cognates are not student data" framing needs a lawyer to confirm. The argument: these are curated/cached content shown to all students, like a dictionary, not records about a student.

### Action items before this can be sent to a real LEA

- [ ] Have an Ohio-licensed ed-tech attorney review the full DPA
- [ ] Confirm cyber liability insurance is in place (not just promised)
- [ ] Create the supporting documents this DPA references:
  - [ ] Incident response plan
  - [ ] Data flow diagram
  - [ ] Disaster recovery plan
  - [ ] Annual risk assessment
  - [ ] NIST CSF control mapping spreadsheet
  - [ ] Vulnerability scan schedule
- [ ] Build the transparency dashboard (`dashboard.languagebridge.app`) before claiming it
- [ ] Implement the data export functionality for LEAs
- [ ] Implement the audit log infrastructure
