# For School & District Administrators — FAQ

Plain-language answers for EL directors, curriculum leaders, IT, and business offices evaluating LanguageBridge.

---

**What is it, in one sentence?**
A Chrome extension that lets multilingual students understand English schoolwork in their own language — with a plain-English explanation, their home-language translation, and audio — plus a two-way voice tool to talk with their teacher.

**Which languages?**
Sixteen: Arabic, Burmese, Dari, English, French, Nepali, Pashto, Persian, Portuguese, Somali, Spanish, Swahili, Tagalog, Ukrainian, Urdu, and Vietnamese. We prioritize languages mainstream tools serve poorly (Dari, Pashto, Somali, Burmese, Ukrainian).

**What does it cost?**
We price per **English-learner** student per year — not your whole enrollment — starting at $12 and dropping with volume, with a free one-semester pilot to start. Building and district licenses are available. See [PRICING-AND-PACKAGING.md](PRICING-AND-PACKAGING.md). It's designed to be fundable from Title III.

**Can we run a pilot first?**
Yes — a free semester for up to 150 EL students in one building, with a signed DPA and an end-of-pilot usage report. That's how we started with Parma City Schools.

**How do students sign in?**
They don't. On first use a student picks their school, grade band, and home language, and the extension generates an anonymous code on their device. We never see a name, email, or student ID.

**What student data do you collect?**
No personally identifiable information. We collect anonymous usage (which words get looked up, audio plays, session timing) tied only to the on-device code, plus passages a student explicitly flags as wrong. We never collect names, IDs, emails, contact info, grades, attendance, behavior, or special-education status. Talk to Teacher audio is never stored.

**Do you sell data or show ads?**
Never. No sale, no advertising, no non-educational profiling.

**Are you FERPA / COPPA / Ohio SB 29 compliant?**
Designed to meet all three. We collect no PII, follow the NIST Cybersecurity Framework v1.1, and sign a Student Data Privacy Agreement on the ETLA Ohio NDPA V1 standard — the same template Ohio districts already use. See [DPA-TEMPLATE.md](DPA-TEMPLATE.md).

**Are you SOC 2 certified?**
LanguageBridge is not (yet). Our cloud subprocessors — Microsoft Azure and Supabase — are SOC 2 Type II certified, and we implement NIST CSF v1.1 ourselves. We're happy to complete your security questionnaire.

**How is it deployed?**
Chrome Web Store, or pushed to student Chromebooks by your IT via the Google Workspace admin console. It works on any device running Chrome.

**Does it access students' Google accounts, Drive, or browsing?**
No. The extension only acts on text a student selects and only talks to our secure backend. It cannot read Gmail, Drive, Classroom, or browsing history.

**What happens to our data if we leave?**
We delete all student-linked data within 90 days of termination (Ohio SB 29), and you can request an export of your aggregate analytics first.

**Who do we contact?**
Justin Bernard, CEO / Data Security Officer — justin@languagebridge.app, (216) 800-6020.
