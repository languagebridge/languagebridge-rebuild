# Dev notes — 10 Oct 2026: Dari voice and translation

**Branch:** `fix/dari-voice-and-translation` · Built on `main` after PR #2 merged.

Two backend changes for Dari. Neither is deployed yet.

## Context: the smoke check after deploying PR #2

`main` was deployed on 10 October and the language smoke check ran against the live API:

- Translation: 18 of 18 pass. **Amharic and Uzbek are live.**
- Audio: 17 of 18 pass. Dari failed with `502 AZURE_SERVICE_ERROR`, as it did in July.

The smoke check covers translation and audio only. Speech recognition for Amharic and Uzbek is still untested.

## 1. Dari audio no longer asks for a voice that does not exist

`backend/shared/voice-config.json` pointed Dari at `fa-AF-HasanNeural`. Microsoft's voice list has no `fa-AF` voices, which is why every Dari audio request failed on the backend and the extension had to retry with Persian.

Dari now uses `fa-IR-FaridNeural` (Persian, male). The student hears the same Persian accent as before, without the failed first request. The extension's Dari-to-Persian retry in `lb-tts-service.js` is left in place as a safety net.

Azure has no Dari voice and no Dari speech recognition. A real Dari voice means training our own; that is not part of this change.

## 2. Dari translation uses Azure's Dari, not Persian

Azure Translator lists Dari as its own language (`prs`). We were sending Dari as Persian (`fa`). Changed in:

- `backend/azure-functions/translate/index.ts`
- `backend/azure-functions/lexicon-lookup/index.ts`

Side effects:

- **Dari ↔ Persian is now a real translation.** Both used to map to `fa`, so the request was returned unchanged. The same-language short-circuit still exists for identical source and target.
- **Old cached Dari translations are still Persian.** Lookups that missed the glossary were machine-translated as Persian and saved in the `lexicon` container under `dari`. They keep being served until they are cleared. Clearing them is a production database write and needs Justin's go-ahead; it is not done here.
- **The difference has not been seen.** There is no working Translator key locally, so `prs` and `fa` output have not been compared. After deploy, run a set of classroom sentences both ways and have a Dari speaker judge them.

Speech recognition for Dari stays on `fa-IR`.

## Tests

Two tests added to `backend/__tests__/unit/translate.test.ts` (Dari is sent as `prs`; Dari to Persian calls the translator). The old "dari→persian short-circuit" test now checks Persian to Persian. Jest: 122 pass. Vitest: 39 pass. Type-check and lint clean.

## Still to do

- [ ] Deploy, then rerun `backend/scripts/lang-smoke-check.mjs`; Dari audio should pass
- [ ] Compare Dari (`prs`) and Persian (`fa`) output on real sentences with a Dari speaker
- [ ] Decide whether to clear the cached Persian rows stored under `dari`
- [ ] Update the Dari row in `docs/MASTER-DOCUMENT.md` (section 3) once PR #3 merges: translator `prs`, voice `fa-IR-FaridNeural`
- [ ] Customer-facing language count is still 16; Amharic and Uzbek now pass live, so it can move to 18
