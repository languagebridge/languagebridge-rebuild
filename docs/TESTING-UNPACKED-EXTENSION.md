# Testing the LanguageBridge Chrome Extension (Unpacked)

**How to load the extension from source and manually verify it works before shipping.** Written for the team; ~20 minutes for a full pass. The redesigned onboarding and Talk to Teacher are the priority targets right now.

**Last updated:** September 2026

---

## 1. Prerequisites

- Google Chrome (or any Chromium browser).
- This repo checked out; the extension lives in **`extension/`**.
- The **backend is live** (`languagebridge-api.azurewebsites.net`) — the extension calls it for translate/TTS/STT/enroll. No local backend needed.
- For the cleanest run, use the **demo path** (below) — it enrolls into the `LB-DEMO` sandbox, so you don't need an active school license.

---

## 2. Load it unpacked

1. Open **`chrome://extensions`**.
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select the **`extension/`** folder (the one containing `manifest.json`).
4. The LanguageBridge icon appears in the toolbar. Pin it (puzzle-piece menu → pin).

**After you change code:** return to `chrome://extensions` and click the **↻ reload** icon on the LanguageBridge card, then **reload the web page** you're testing on. (Content-script changes need both.)

**Microphone (for Talk to Teacher):** the first time you use voice, Chrome prompts for mic access via a one-time permission page. Allow it. If you denied it earlier: `chrome://settings/content/microphone` → remove any block for the extension, or use the in-app "Turn on microphone" button.

---

## 3. Fastest test route — Demo mode

Because Greenbriar's pilot is **expired** and there may be no active school, use the demo:

1. Open any content-heavy page (a news article, a Wikipedia page, a Google Doc).
2. Onboarding appears. On the **language screen**, click **"Try a demo"**, then tap a language.
3. It skips school + grade and enrolls into the `LB-DEMO` sandbox — you're in the tool in ~5 seconds.

Use this for all feature testing so you never touch a real school's data.

---

## 4. Test plan

Check each. Note anything that misbehaves with the page URL + what you did.

### A. Onboarding (redesigned — primary target)
- [ ] Onboarding modal appears on first use (after consent).
- [ ] **Language is the FIRST screen** — a 2-column flag grid, native names, 16 languages incl. **English (last)**.
- [ ] RTL languages (Arabic, Dari, Pashto, Persian, Urdu) show their native name right-aligned.
- [ ] Picking a language → **School** screen. Search filters the list as you type. `Demo (Sandbox)` is **NOT** in the list.
- [ ] Back arrow returns to the previous screen.
- [ ] Picking a school → **Grade** screen showing that school's grade bands. Pick one → brief "Getting things ready…" → **Ready** screen with a class code (`LB-XXXX`).
- [ ] "Start" closes onboarding. Reload the page — onboarding does **not** reappear (you're enrolled).
- [ ] **Demo path**: "Try a demo" → pick language → straight to Ready (no school/grade).

### B. Lookup card + cached audio
- [ ] Highlight a word → tooltip shows the translation + 🔊 button.
- [ ] Tap 🔊 → button **greys out + shows ⏳ while it loads**, audio plays, then the button becomes a **↻ replay** button.
- [ ] Tap ↻ again → it **replays instantly** from cache — open the Network tab and confirm **no new `tts-router` call** on replay.
- [ ] The toolbar's own play/pause still works as the stop control.

### C. session_start analytics (the fix)
- [ ] Reload a page with the extension active, wait a moment, then run:
      `node --env-file=.env backend/scripts/analytics-check.mjs 1`
- [ ] Confirm **`session_start`** now appears (it was previously always 0).

### D. Talk to Teacher (voice — highest risk)
- [ ] Open Talk to Teacher (toolbar / `Alt+Shift+T`).
- [ ] Grant mic when prompted. Tap a side, speak, tap **Stop** → transcript shows your words + the translation, and it's **read aloud** in the other language.
- [ ] Tap the other side, speak in that language → reverse direction works.
- [ ] Error paths: deny mic → friendly "Turn on microphone"; stay silent → "I didn't hear anything."

### E. Per-language spot check
- [ ] In the tool, look up a word in 3–4 languages (incl. **Dari** → confirm audio plays via the Persian fallback). For the full matrix: `node --env-file=.env backend/scripts/lang-smoke-check.mjs`.

### F. Glossary — sorting + cached audio
- [ ] Highlight a sentence with several academic words → open the **Glossary** tab (📖 book button).
- [ ] Words are ordered **hardest-first by syllable count**; multisyllabic words (3+) show a small **"N syl"** badge.
- [ ] Switch grade-band tiers — each tier's words stay syllable-sorted.
- [ ] Tap a word's audio → loads once, then **replays from cache** with no new `tts-router` call (Network tab).

### G. Resilience
- [ ] Reload the extension in `chrome://extensions` but **don't** reload the page → the next action shows a **"LanguageBridge updated — reload this page"** banner with a Reload button, not red console errors.
- [ ] Highlight a whole paragraph → Play translates it as a **phrase** (it is not sent to the lexicon as a single "term").

---

## 5. Not testable yet (pending backend work)

These are known gaps, not bugs — don't file them:
- **Class-code join** on the school screen — needs the enroll endpoint to resolve codes (piece #2).
- **Demo analytics tagging** (`isDemo`) and **seat enforcement** — pending the enroll-endpoint update; demo enrollments currently look like normal ones server-side.
- **Onboarding screens in the student's language** — the flow is language-first, but screens 2–4 render in English until the reviewed translation bundle is added (the localization scaffold is in place).
- **Expired-school block** — the picker still shows expired schools (e.g. Greenbriar) until the endpoint filters by status.
- **Translated definitions** — the audio still speaks the *word* (cognate), not the translated *meaning*; populating `bridge_definition` so the speaker says the meaning is deferred to post-conference.

---

## 6. Reporting

Note: page URL, steps, what you expected vs. saw, and the browser console (right-click → Inspect → Console) for any red errors. Content-script logs are prefixed `LB`.
