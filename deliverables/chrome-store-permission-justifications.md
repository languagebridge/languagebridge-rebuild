# Chrome Web Store — Permission Justifications (paste sheet)

Copy each block into the matching box on the **Privacy practices** tab, then **Save Draft**.
All text below is reconciled to the actual `manifest.json` and to 16 supported languages.

---

## Single purpose

LanguageBridge makes English-language schoolwork comprehensible for multilingual K-12 students: it translates text the student selects into their home language with read-aloud audio, explains academic terms in simple English, and enables a two-way student–teacher voice conversation.

---

## `storage`

The "storage" permission allows LanguageBridge to save student preferences locally on their device.

WHAT WE STORE:
- Preferred home/translation language (one of the 16 supported languages)
- Text-to-speech speed and volume settings
- Toolbar visibility preferences

WHY IT'S NECESSARY:
Without storage, students would need to re-select their language every time they open a webpage, creating frustration for students who need consistent language support.

PRIVACY PROTECTION:
All data is stored locally on the student's device. We collect ZERO personally identifiable information — no names, emails, or student IDs. Settings remain private within Chrome's secure storage. This enables personalized language support while maintaining COPPA/FERPA compliance.

---

## `activeTab`

The "activeTab" permission enables LanguageBridge to translate text that users explicitly select on their current webpage or Google Doc.

HOW IT WORKS:
When students highlight text, LanguageBridge reads ONLY that selected text for translation and text-to-speech. The extension activates only when students interact with it.

WHAT WE DO NOT ACCESS:
- Full webpage content (only selected text)
- Other browser tabs or windows
- Browsing history
- Passwords or form data

PRIVACY PROTECTION:
We never track which websites students visit or store translated text. Text is sent for translation and not retained. Translation happens only when students select text. This permission is essential for helping English learners understand classroom materials.

---

## `offscreen`

The "offscreen" permission is used to capture microphone audio for the "Talk to Teacher" feature, a two-way voice translator.

WHY IT'S NECESSARY:
An MV3 offscreen document is required because content scripts cannot reliably access the microphone. The microphone is accessed ONLY while the student is actively recording a message.

PRIVACY PROTECTION:
Recorded audio is sent for transcription and immediately discarded — it is never stored. The microphone is never accessed at any other time.

---

## Host permissions

Host permissions cover only the two services the extension itself connects to:
- https://languagebridge-api.azurewebsites.net/* — the LanguageBridge backend API, which performs translation, text-to-speech, and (for Talk to Teacher) speech-to-text.
- https://storage.blob.core.windows.net/* — cloud storage that serves the generated audio clips the extension plays.

WHY NECESSARY:
The extension does not translate locally. It sends the text the student selects to the LanguageBridge backend over encrypted HTTPS and plays back the audio the backend returns. The backend uses Microsoft Azure Cognitive Services server-side — the extension never contacts Azure directly.

PRIVACY & COMPLIANCE:
Only the text the student selects (and, in Talk to Teacher, the audio they record) is transmitted. No personal information or browsing history is sent. Selected text and audio are processed to produce the translation/transcription and are not stored. Data is handled to maintain COPPA and FERPA compliance.

---

## Broad host access / `<all_urls>` (only if the form asks)

Students encounter assignments on any website — news articles, digital textbooks, the school's LMS, Google Docs — so the translate-on-selection tool must be available wherever they read. The content script does not read or transmit page content on its own; it acts only when the student explicitly selects text or presses the translation hotkey. No page content is collected or sent otherwise.

---

## Data-use disclosures (check these on the same tab)

Declare **collected** for:
- **Website content** — the text the student selects, sent for translation (not stored).
- **User activity** — anonymous usage events (a lookup happened, audio played); no identifiers.
- **Personal communications / audio** — in Talk to Teacher, the student's spoken audio is sent for transcription, then discarded (not stored).

Declare **not collected**: personally identifiable information, health, financial, authentication, location, web history.

Certify all three: (1) not sold to third parties; (2) not used for purposes unrelated to the single purpose; (3) not used to determine creditworthiness/lending.

**Privacy policy URL:** https://languagebridge.app/privacy
