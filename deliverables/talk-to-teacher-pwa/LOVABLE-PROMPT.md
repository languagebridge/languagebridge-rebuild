# Paste-into-Lovable instruction

Attach the 8 files from `deliverables/talk-to-teacher-pwa/` to the Lovable chat
(drag them in), then paste the prompt below.

> **Before you paste:** in Supabase → Project → Edge Functions → Secrets, the API key
> gets set as `LB_API_KEY`. Never let it touch frontend code. The prompt tells Lovable this,
> but double-check the generated diff to confirm the key is only referenced inside the edge
> function.

---

## The prompt

```
Add a new "Talk to Teacher" feature at the route /teacher. I'm attaching the source files —
use them as-is; do not rewrite the logic. It's a two-person voice translator: each person taps
their language, speaks, and the app transcribes → translates → shows it and reads it aloud in
the other language.

FILES (place under src/features/talk-to-teacher/):
- TalkToTeacher.tsx, TalkToTeacher.css, languages.ts
- lib/audioWav.ts, lib/api.ts, lib/tts.ts

ROUTE:
- Add a route /teacher that renders <TalkToTeacher studentCode={...} studentLanguage={...} />.
- studentCode is the enrolled student's code (format LB-XXXX) from the current session/auth.
  If you don't have one yet, use "LB-TEST7" as a temporary placeholder so the page runs.
- studentLanguage is the student's language code, e.g. "dari" (default is fine).
- Call configureApi('/api/lb') once at app startup (import from lib/api).

CRITICAL SECURITY CONSTRAINT — do not violate:
- The frontend must NEVER contain the LanguageBridge API key. Do not hardcode it, do not put
  it in an env var that ships to the browser (no VITE_ prefix for it).
- Create a Supabase Edge Function named "lb-proxy" that is the ONLY place the key is used.
  It reads the secret LB_API_KEY (from Supabase secrets), reads LB_API_BASE
  (= https://languagebridge-api.azurewebsites.net/api), and forwards POST requests to exactly
  three upstream routes: speech-to-text, translate, tts-router. For each, it POSTs the JSON
  body straight through to `${LB_API_BASE}/<route>` with headers
  { "Content-Type": "application/json", "x-lb-api-key": LB_API_KEY } and returns the upstream
  JSON and status unchanged. Reject any other route with 404. Use the logic in the attached
  proxy/lb-proxy.ts as the reference implementation (Deno/Supabase adapter at the bottom).
- Wire the app so requests to /api/lb/<route> reach this edge function (e.g. via the Supabase
  functions URL or a rewrite), so the frontend's configureApi('/api/lb') calls land on it.
  Same-origin is ideal so there's no CORS.

REQUIREMENTS THIS FEATURE DEPENDS ON:
- It uses the microphone via getUserMedia, so it only works over HTTPS (Lovable preview and the
  deployed site are both HTTPS — fine). No Chrome-extension APIs are used.
- Do not add any other backend calls. STT/translate/TTS all go through /api/lb.
- The styling is self-contained in TalkToTeacher.css — import it, don't convert it to Tailwind.

ACCEPTANCE:
- Visiting /teacher shows the Talk to Teacher card.
- Tapping a language, allowing the mic, speaking, and tapping "Stop & translate" produces a
  transcript line with the translation and plays it aloud in the other language.
- The API key appears nowhere in the frontend bundle — only in the lb-proxy edge function.
```

---

## After Lovable generates it

1. Set the Supabase secret: `LB_API_KEY` = the backend shared key (the same value the
   extension's `background.js` uses — ask Justin).
2. Confirm the edge function reads `LB_API_BASE` =
   `https://languagebridge-api.azurewebsites.net/api` (set as a secret or inline constant).
3. Open the preview on **/teacher**, allow the mic, and run the 6-step test in README.md.
4. Verify in the built bundle (view-source / network tab) that the key is never present and
   every call goes to `/api/lb/*`.
