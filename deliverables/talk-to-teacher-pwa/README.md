# Talk to Teacher — PWA package (`languagebridge.app/teacher`)

A self-contained **clone** of the extension's "Talk to Teacher" feature, rebuilt as a React
component for the Lovable PWA. The extension keeps its own copy — nothing in `extension/`
changes. This is a drop-in `/teacher` route.

One computer, two people: each taps **their** language, speaks, and the app transcribes →
translates → shows it in the transcript and reads it aloud in the other language. Manual
turn-taking, kid-friendly errors, all 16 supported languages.

---

## What changed vs. the extension (and why)

| Concern | Extension | PWA (this package) |
|---|---|---|
| **Mic capture** | Offscreen document + background worker (content scripts can't use the mic reliably) | `getUserMedia` **directly in the page** — a secure-context page just works. The whole offscreen/background layer disappears. |
| **WAV transcode** | `offscreen.js`: decode → 16 kHz mono → 16-bit PCM WAV + level stats | **Carried over verbatim** in `lib/audioWav.ts`. Azure STT needs exactly this format; the level stats power the "didn't hear you / too noisy" messages. |
| **Backend calls** | `chrome.runtime` → `background.js` injects `x-lb-api-key` → Azure Functions | **A proxy** injects the key server-side (`proxy/lb-proxy.ts`). The browser never sees the key. |
| **TTS playback** | Fetch bytes via background (CORS dodge) → WebAudio | `<audio>` element plays the SAS URL — cross-origin playback needs no CORS. |
| **UI shell** | Fixed bottom-right floating card | Centered full-height card, suited to a route/page. |

**The one thing you must not skip:** a public web app **cannot embed the shared API key**
(view-source leaks it and the backend gets drained). The client here talks to a proxy that
holds the key — same design as your alpha demo's Netlify proxy.

---

## Files

```
src/
  TalkToTeacher.tsx     ← the component (the /teacher screen)
  TalkToTeacher.css     ← styling (self-contained, no Tailwind needed)
  languages.ts          ← the 16 supported languages
  lib/
    audioWav.ts         ← mic capture + 16 kHz WAV transcode + level diagnostics
    api.ts              ← speech-to-text / translate / tts-router client (calls the proxy)
    tts.ts              ← spoken playback of the translated line (chunked)
proxy/
  lb-proxy.ts           ← reference server-side proxy (holds the key) + host adapters
```

No dependencies beyond **React 18+**. TypeScript. All browser-native otherwise.

---

## Integrate (Lovable / Vite + React)

1. Copy `src/` into the app (e.g. `src/features/talk-to-teacher/`).
2. Add the route:

   ```tsx
   // e.g. in your router
   import TalkToTeacher from './features/talk-to-teacher/TalkToTeacher';
   import { configureApi } from './features/talk-to-teacher/lib/api';

   configureApi('/api/lb'); // your proxy base — same-origin avoids CORS entirely

   <Route path="/teacher" element={
     <TalkToTeacher
       studentCode={currentStudentCode}   // enrolled code, format LB-XXXX
       studentLanguage={studentLang}       // e.g. 'dari' — the student's language
     />
   } />
   ```

3. Deploy the proxy (`proxy/lb-proxy.ts`) — pick the adapter at the bottom of that file
   (Vercel / Netlify / Supabase Edge). Set env:
   - `LB_API_KEY` — the backend shared key (same value the extension's `background.js` uses)
   - `LB_API_BASE` — `https://languagebridge-api.azurewebsites.net/api`
   - `LB_PWA_ORIGIN` — `https://languagebridge.app` (CORS allow-list)

   Host it same-origin at `/api/lb/*` so there's **no browser CORS** at all. (If you host it
   on a different origin, the CORS headers it already sets must name your PWA origin.)

---

## PWA / platform requirements

- **HTTPS is mandatory** — `getUserMedia` only works in a secure context. `languagebridge.app`
  already qualifies; `localhost` also counts for dev.
- **Mic permission** is prompted by the browser on first record; the "Turn on microphone"
  button re-triggers it after a denial. No separate permission page (that was extension-only).
- **Installability** is already handled by the existing languagebridge.app PWA shell (manifest
  + service worker). Just make sure `/teacher` is reachable offline-shell-wise; the feature
  itself needs the network (STT/translate/TTS are all live calls).

---

## Backend contract (unchanged — the proxy forwards these as-is)

- `POST /speech-to-text` → `{ audioBase64, audioFormat:'wav', language, studentCode }` → `{ text }`
- `POST /translate` → `{ text, fromLanguage, toLanguage, studentCode }` → `{ translatedText }`
- `POST /tts-router` → `{ text, language, studentCode }` → `{ audioUrl }`

All 16 languages have Azure STT coverage, so every one works as a spoken input side.
**Dari note:** Dari STT and TTS both route through **Persian** server-side (shared script,
~80% mutually intelligible). `lib/api.ts` also retries Dari TTS as Persian if the backend
returns `AZURE_SERVICE_ERROR`, matching the extension. So Dari works end-to-end.

---

## Manual test checklist (needs a real mic + the live backend)

1. Load `/teacher` on **https** (or localhost). Grant the mic prompt.
2. Side A = English, Side B = a target language. Tap A, say a sentence, tap **Stop**.
   → transcript shows English + the translation, and it's **read aloud** in language B.
3. Tap B, speak in that language → reverse direction works.
4. Denied-mic path: block the mic → friendly error + "Turn on microphone" re-prompts.
5. Silence path: tap, say nothing, Stop → "I didn't hear anything."
6. Switch each side's language via the chip picker; confirm RTL languages render right-aligned.
