# Dev notes — 10 Oct 2026

**Branch:** `feat/v2-lexicon-tts-hardening` · **Commits:** `f5dc163`, `94411cf`, `8a34223`, plus the CI dependency fix · **PR:** #2

Three things changed: two languages were restored, the seven items on the QA bug sheet were worked through, and the translation card now highlights each word as it is read aloud.

**Nothing here has been run in Chrome or against live Azure yet.** The backend is not deployed. Everything passed type-check, the unit tests, and Node-level checks, but the manual testing in the last section is still to do.

## 1. Amharic and Uzbek are back (18 languages in code)

Both were dropped in June (`dfe4efc`) with the note "endpoints not working". Azure supports both natively for translation, text-to-speech and speech-to-text, so they are wired back in as Azure-only languages, the same way Burmese and Tagalog work.

| Language | Translator | Voice | STT locale | Commit |
|---|---|---|---|---|
| Amharic | `am` | `am-ET-AmehaNeural` | `am-ET` | `f5dc163` |
| Uzbek | `uz` | `uz-UZ-SardorNeural` | `uz-UZ` | `94411cf` |

Files touched for each language:

- `backend/shared/types.ts` (`SUPPORTED_LANGUAGES`) and `backend/shared/voice-config.json`
- the language maps in `translate`, `lexicon-lookup` and `speech-to-text`
- extension: `lb-azure-core.js`, `options.js`, `onboarding.js` (tile + flag chip), `lb-translation-service.js` (passage auto-detect)
- `deliverables/talk-to-teacher-pwa/src/languages.ts`
- `tests/unit/validators.test.ts` and `backend/scripts/lang-smoke-check.mjs`

Things to know:

- **The June failure was never diagnosed.** Amharic's old config was essentially what is restored now, so it may fail again for the same unknown reason. Uzbek's old config pointed at an English voice (`en-US-AndrewNeural`), which is a likely cause for that one and is now fixed.
- **Not deployed.** Run `bash scripts/deploy-backend.sh`, then `node backend/scripts/lang-smoke-check.mjs` and check the Amharic and Uzbek rows.
- **No glossary data** for either language on disk, so lookups go through the translator fallback.
- **Customer-facing copy still says 16 languages** (manifest description, `company/00-CANONICAL-FACTS.md`, the Chrome Web Store listing, README). Leave it until both languages pass the smoke check on the live API.

### Azure coverage for the other requested languages

| Language | Translation | TTS voice | STT |
|---|---|---|---|
| Haitian Creole | Yes (`ht`) | No | No |
| Kinyarwanda | Yes (`rw`) | No | No |
| Tigrinya | Yes (`ti`) | No | No |
| Hmong Daw | Yes (`mww`) | No | No |
| Twi | No | No | No |

Translation was checked against the live Translator languages endpoint. Voice and STT come from Microsoft's published language tables.

## 2. QA bug sheet

All fixes are in `8a34223`.

| # | Issue | What changed | Where |
|---|---|---|---|
| 1 | Help doesn't open on a new tab or the Web Store | Help falls back to a help page bundled in the extension when the tab can't show the in-page guide | `popup/popup.js`, new `help/help.html` + `help/help.js` |
| 2 | Toggles don't move on those pages | Toggles keep the state the user set; the popup shows a "can't run on this page" note | `popup/popup.js`, `popup/popup.html` |
| 3 | Support opens the email app | Support opens the help page's `#support` section, which offers email from there | `popup/popup.js`, `help/help.html` |
| 4 | Toolbar help icon contrast | Plum icon on a white chip (it was gold on the gold end of the gradient) | `content/toolbar.css` (`.lb-help-btn`) |
| 5 | Glossary flag icon contrast | Darker red flag on a white chip; darker green check when flagged | `content/toolbar.css` (`.lb-vocab-flag`), `content/toolbar-tooltip.js` |
| 6 | "Glossary viewed" stays in the toolbar | The real text is "Glossary shown"; closing the card now resets the status to "Active" | `content/toolbar-tooltip.js` (`hideTranslationTooltip`) |
| 7 | Reader mode | **Not fixed.** If the extension can't load there, the popup now shows the note from item 2 | — |

Root cause of 1 and 2: Chrome does not inject content scripts into the new-tab page, the Web Store or `chrome://` pages, so the popup's message to the tab failed. Help swallowed the error; the toggles reverted themselves.

How the popup now knows: it sends `lb-ping` to the active tab when it opens. `content/toolbar.js` answers `{ ok: true }`. No answer means the page is unreachable. A tab that was open before the extension was installed or updated also counts as unreachable until it is reloaded.

Also changed:

- The popup version label reads from the manifest (it was hard-coded to `v2.0.0`).
- The help tips live in one file, `utils/help-content.js`, used by both the in-page overlay and the help page. It is loaded as a content script, so it is listed in `manifest.json`.

Item 6 still needs proper repro steps on the sheet to confirm this was the case the tester saw.

## 3. Read-along glow

When audio plays, the word being spoken in the translation card glows: brand gold background, orange halo, deep-plum text. Glossary words glow when their play buttons are tapped.

How it works:

1. `content/lb-read-along.js` (new, `window.LBReadAlong`) rebuilds the translation text as one `<span class="lb-ra-word">` per word. It uses `Intl.Segmenter`, so scripts without spaces between words (Burmese) still split into words.
2. `LBTTSService` tells it when a clip starts, passing the text being spoken, the clip length, the playback rate, and how much silence sits at the start and end of the audio (`_speechBounds`).
3. The backends return audio with no word timestamps, so timing is **estimated**: the speech between the silences is shared across the words by character count, with extra time after punctuation. A `requestAnimationFrame` loop moves the `lb-ra-glow` class along.
4. It re-syncs at every sentence or chunk, so error does not build up over a long passage.

Behaviour worth knowing:

- If the spoken text cannot be matched to the words on screen, nothing glows.
- Pause and stop clear the glow. Resume replays the current sentence from its start.
- `LBTTSService.play(audioUrl, gen, text)` has a new optional third argument. Without it the clip plays with no glow.
- `LBReadAlong.attach(el, text)` registers the card's translation. `LBReadAlong.focus(el)` aims the next clip at one element (used for glossary words).
- The glow is drawn with `box-shadow`, not padding, so text does not reflow. The transition is switched off under `prefers-reduced-motion`.

Known limit: because timing is estimated, long words and unusual pacing can make the glow run slightly ahead of or behind the voice within a sentence. Exact sync would need word timings from the backend (Azure can supply them through its Speech SDK; our own voices would need forced alignment). That is not built.

## 4. Sentence splitting fixes

In `content/toolbar-audio.js` (`splitSentences`) and `content/services/lb-tts-service.js` (`_chunkText`):

- A final sentence with no closing punctuation was silently dropped and never read. It is now kept.
- A `.` between two digits is treated as a decimal point, so "3.5 grams." is sent to the voice as one sentence instead of "3." and "5 grams.". The voice then reads the number in its own language.

Not handled: abbreviations such as "U.S." or "e.g." still split.

## 5. Voice models downloaded for evaluation (local only)

Meta's MMS text-to-speech models for Haitian Creole (`facebook/mms-tts-hat`) and Kinyarwanda (`facebook/mms-tts-kin`) are in `ml-pipeline/models/mms/` on Justin's machine, with one test WAV each in `ml-pipeline/models/mms/samples/`. The folder is gitignored, so they are not in the repo.

- **Licence: CC-BY-NC 4.0 (non-commercial).** Fine for demos and judging quality. They cannot ship in the paid product.
- Output is 16 kHz.
- Loading them with the venv's `transformers` 4.40 prints a "weights not used / newly initialized" warning. It is cosmetic: the audio is identical with the weights mapped by hand.

## 6. CI fix: dependency audit

The first CI run on the pull request failed at the "Security audit" step (`npm audit --audit-level=high`) before lint or tests ran. It was not caused by the code changes: new advisories had been published against existing dependencies (1 critical, 36 high).

What changed:

- Non-breaking updates in `package-lock.json` for `axios`, `handlebars`, `js-yaml`, `nanoid`, `postcss`, `source-map-js`, `browserslist` and `brace-expansion`.
- **Jest upgraded from 29 to 30** in `backend/package.json` (`jest`, `@jest/globals`, `@types/jest`). The remaining high-severity flags all came from `braces`, which Jest 29 pulls in and which has no patched release. `ts-jest` 29.4 supports Jest 30, so it stays.

Result: 0 high, 0 critical. 22 moderate advisories remain, all in test tooling; the production dependency audit (`npm audit --omit=dev`) is clean. Lint, type-check, build, Jest (120) and Vitest (39) pass on a clean `npm ci`.

Two things to know:

- `npm audit fix` crashes on this repo (`Cannot read properties of null (reading 'edgesOut')`). Use `npm update <package>` for targeted fixes instead. The root `package.json` lists `extension`, `pwa` and `ml-pipeline` as workspaces, but none of them has a `package.json`; that is a likely cause and is on the cleanup list.
- This check will fail again whenever a new advisory lands on a dev tool. If that becomes a nuisance, the option is to gate CI on production dependencies only (`--omit=dev`). Not changed here.

## 7. Still to do

Manual testing in Chrome (reload the unpacked extension, then reload the page):

- [ ] New tab and Chrome Web Store: popup shows the note, toggles move and stay, Help opens the help page
- [ ] Normal webpage: no note, Help opens the in-page guide, toggles show and hide the toolbar
- [ ] Support link opens the help page at the support section
- [ ] Help button and glossary flag are easy to see on the gradient
- [ ] Open the glossary, close the card: status returns to "Active"
- [ ] Play a multi-sentence passage: the glow follows the voice, clears on pause, and resumes correctly
- [ ] Glow in an RTL language (Arabic or Dari) and in Burmese
- [ ] Glow at reading speeds other than 1.0
- [ ] A sentence containing "3.5": read as one number, in English and at least one other language
- [ ] Check whether the extension loads at all in Chrome's reading mode, and record the answer on the sheet

Backend and release:

- [ ] Deploy the backend and run the language smoke check for Amharic and Uzbek
- [ ] If both pass, update the "16 languages" copy to 18
- [ ] Bump the extension version for the next Chrome Web Store upload
- [ ] The local `AZURE_TTS_KEY` in `backend/local.settings.json` was rejected by Azure (401). Check whether it is stale
