# Dev notes — 10 Oct 2026: language count moves to 18

**Branch:** `chore/language-count-18` · Built on `main` after PRs #2 and #4.

Wording only. No behaviour changes.

## Why now

PR #4 was merged and deployed on 10 October, and the language smoke check then passed for every language: 18 of 18 on translation and 18 of 18 on audio, including Amharic, Uzbek and (for the first time on the backend) Dari. The rule is that customer-facing copy changes only after a language passes live, and that is now met.

## What changed

Every place that said 16 languages now says 18, and every language list gains Amharic and Uzbek:

- `extension/manifest.json` description, and a comment in `lb-azure-core.js`
- `deliverables/chrome-store-submission.md` and `chrome-store-permission-justifications.md`
- `deliverables/talk-to-teacher-pwa/README.md` and `src/languages.ts` (comments)
- `scripts/build-packet.sh` tagline
- `company/`: `00-CANONICAL-FACTS.md`, `DPA-TEMPLATE.md`, `SCHOOL-ADMIN-FAQ.md`, `COMPANY-OVERVIEW.md`, `README.md`, `BEFORE-YOU-SEND-CHECKLIST.md`

`00-CANONICAL-FACTS.md` section 3 was rewritten. It now says 17 languages are fully native, and that Dari is translated as Dari but uses Persian for audio and speech recognition.

## Dari versus Persian, checked live

Six classroom sentences were translated into both through the live API after the PR #4 deploy. Four of six differed. The clearest case: "The teacher will help you after class" came back formal in Dari and in casual spoken Iranian style in Persian. A Dari speaker has not yet reviewed the output.

## Things to know

- **The DPA template's language list changed.** That affects future agreements only. The signed Parma agreement is unchanged.
- **The district packet export is stale.** `company/exports/LanguageBridge-District-Packet.html` and `.pdf` are generated files (gitignored) and still say sixteen. Regenerate them with `scripts/build-packet.sh` before sending the packet to anyone.
- **The Chrome Web Store still has version 2.0.4**, which does not show Amharic or Uzbek in the picker. The manifest description here ships with the next upload. Do not publish "18 languages" on the store listing before that upload.
- **Speech recognition for Amharic and Uzbek is still untested.** The smoke check covers translation and audio only, and the PWA hand-off README now says all 18 have Azure speech recognition on the strength of Microsoft's language table, not a test.
- **Found, not fixed:** `company/SECURITY-AND-PRIVACY-OVERVIEW.md` says 16 prohibited PII fields. The code has 15.
- The old engineering docs and the long README still say 16 on `main`; PR #3 replaces them.
