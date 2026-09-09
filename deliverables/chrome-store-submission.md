# Chrome Web Store submission package — LanguageBridge

Everything needed to fill out the Developer Dashboard for the `languagebridge` extension
(manifest v2.0.0). Copy-paste ready. Grounded in the actual `extension/manifest.json` and the
backend PII rules in `backend/shared/validators.ts`.

> **Two things still gate approval (not written here):**
> 1. **Publish the microphone-capture paragraph** on `languagebridge.app/privacy` — the store
>    rejects a mic-permission extension whose policy doesn't disclose voice capture.
> 2. **Decide the child-audience question** (see §6) — this is a COPPA/FERPA call for a K-12
>    tool; loop in whoever owns `docs/compliance/`.

---

## 1. Single purpose

> LanguageBridge helps multilingual students understand English-language schoolwork. A student
> selects any text on a page and sees it translated into their home language with audio, gets
> simple-English scaffolding for hard academic terms, and can hold a two-way spoken conversation
> with their teacher. One purpose: making grade-level content comprehensible for English learners.

Keep it to that one purpose in the listing — the store rejects "does many unrelated things."

---

## 2. Listing copy

**Name:** `LanguageBridge — Real-Time Translation for Students`

**Summary (132 char max):**
> Instant translation, read-aloud audio, and teacher voice chat for multilingual students — in 16 languages, on any page.

**Detailed description** (this is the current live-listing copy — keep it in sync with the actual Chrome Web Store listing):
```
LanguageBridge helps English learners succeed in their classrooms with real-time translation and text-to-speech in 16 languages.

🌍 FEATURES:
• Real-time translation — Arabic, Burmese, Dari, French, Nepali, Pashto, Persian, Portuguese, Somali, Spanish, Swahili, Tagalog, Ukrainian, Urdu, Vietnamese, and English
• Text-to-Speech — Natural voice synthesis in every supported language
• Academic Vocabulary — Plain-English definitions for hundreds of academic terms, tiered by grade level
• Talk to Teacher — Two-way voice conversation translator (uses the microphone only while you're actively recording)
• Google Docs Support — Works on Google Docs and any webpage

🔒 PRIVACY & COMPLIANCE:
• COPPA Compliant — No personal data collected from children; students are pseudonymous (no names, emails, or IDs)
• FERPA Compliant — No education records stored
• OHIO SB 29 Compliant
• Privacy-First — Only the text you select is sent for translation. In Talk to Teacher, recorded audio is transcribed and immediately discarded — never stored.
• No Browsing History — The extension does not track your browsing
• Limited Permissions — Storage (saves your language choice), activeTab (reads the text you select), and microphone (Talk to Teacher only)

👨‍🎓 DESIGNED FOR EDUCATION:
Built specifically for English Language Learner (ELL) students in K-12 classrooms — including newcomers and students with limited or interrupted formal education. Empowers students to understand lessons in real time while building English proficiency.

📚 HOW IT WORKS:
1. Select any text on a webpage or Google Doc
2. See the translation in your language instantly
3. Tap the speaker icon to hear it read aloud
4. Open Talk to Teacher for a two-way spoken conversation

Perfect for students, teachers, and families supporting English learners.
```

> **Consistency check:** the "Limited Permissions" line names `storage`, `activeTab`, and the microphone (`offscreen`) — this must match `manifest.json` and the Data-use disclosure (§4). The previous listing's "only storage and activeTab" was inaccurate once Talk to Teacher shipped.

**Category:** Education
**Language:** English

---

## 3. Permission justifications

Paste each into the matching "why do you need this?" box.

| Permission | Justification |
|---|---|
| `storage` | Saves the student's chosen language, enrollment code, and reading-speed/preferences locally so the tool remembers them between pages and sessions. |
| `activeTab` | Reads the text the student has selected on the current tab when they invoke a translation. Only the active tab, only on user action. |
| `offscreen` | Captures microphone audio for the "Talk to Teacher" voice feature. An MV3 offscreen document is required because content scripts cannot reliably access the microphone. The mic is used only while the student is actively recording. |
| **host** `languagebridge-api.azurewebsites.net` | The extension's own backend API — handles translation, text-to-speech, speech-to-text, and anonymous usage logging. |
| **host** `storage.blob.core.windows.net` | Fetches the generated audio clips that the text-to-speech service returns. |

**`<all_urls>` content-script justification (the one reviewers scrutinize):**
> Students encounter assignments on any website — Google Docs, news articles, digital textbooks,
> the school's LMS. The translate-on-selection tool must therefore be available wherever a student
> reads. The content script does not read or transmit page content on its own: it acts only when
> the student explicitly selects text or presses the translation hotkey. No page content is
> collected or sent otherwise.

---

## 4. Data-use disclosures (Developer Dashboard "Data usage")

Declare **collected** for these categories; everything else = **not collected**:

| Category | Collected? | What / why |
|---|---|---|
| Website content | **Yes** | The text the student selects is sent to Azure to translate/define it. Not stored. |
| User activity | **Yes** | Anonymous feature-usage events (a lookup happened, audio played) for aggregate reporting. No identifiers. |
| Personal communications | **Yes** | In "Talk to Teacher," the student's spoken audio is sent to Azure for transcription, then discarded. Not stored. *(Declared conservatively because it is voice input; it is transient and never retained.)* |
| Personally identifiable information | **No** | The backend rejects names, emails, IDs, phone, address, DOB, SSN, IP, and device IDs — by field name and by value pattern (`validators.ts`). The enrollment code is a random string, not identifying. |
| Location · Health · Financial · Authentication · Web history | **No** | None collected. Browsing history is not tracked — only explicitly selected text is ever sent. |

**Three required certifications — all true, check all three:**
- ✅ I do not sell or transfer user data to third parties (outside approved use cases).
- ✅ I do not use or transfer user data for purposes unrelated to the item's single purpose.
- ✅ I do not use or transfer user data to determine creditworthiness or for lending.

**Privacy policy URL:** `https://languagebridge.app/privacy`  *(must include the mic paragraph before submitting — see top).*

---

## 5. Screenshots (1280×800 or 640×400 — provide at least 1, ideally 5)

Shot list, in order:
1. **Lookup card** — a word selected on a real assignment page, showing the translation + 🔊 listen button.
2. **Toolbar + language picker** — the toolbar open with the 16-language list.
3. **Talk to Teacher** — the two-sided conversation mid-exchange (English ↔ a target language).
4. **Glossary tab** — tiered simple-English scaffolding for an academic term.
5. **Onboarding** — the language-selection welcome screen.

Capture on a clean, real-looking student page (a science or social-studies article works well).
Avoid any real student names on screen.

---

## 6. Open item — child-audience declaration (decide before submitting)

The Developer Dashboard asks whether the extension is **directed to children**. LanguageBridge is
a K-12 tool, so this is a genuine COPPA question, not a formality — and it interacts with your
FERPA/DPA posture. This package does **not** pre-answer it. Route it to whoever owns
`docs/compliance/` and your `DPA.pdf` and answer it deliberately. It does not block drafting
anything above, but it must be answered on the submission form.

---

## Submission order (so nothing bounces)
1. Publish the mic paragraph on the privacy page.
2. Answer the child-audience question (§6).
3. Take the 5 screenshots.
4. Fill listing (§2), permissions (§3), data usage (§4).
5. Upload the packaged ZIP of `extension/` and submit.
