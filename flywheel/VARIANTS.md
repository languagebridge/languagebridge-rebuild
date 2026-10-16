# Language variants (dialects)

Code: `backend/shared/variants.ts` (registry + fallback chains), used by `lexicon-lookup`, `translate` (Dual Codex), `tts-router`, `speech-to-text`, `flag-handler`, `onboarding`. Extension: Settings → "Which sounds most like home?", attached to API calls by `extension/background.js` `withVariant`.

---

## Languages vs. variants

| Situation | How we model it |
|---|---|
| Dari and Pashto | **Two separate supported languages.** Never variants of each other |
| Dari and Iranian Persian | Two separate supported languages. Dari **never** falls back to Persian content. (Azure has no Dari voice or recognizer, so both currently use Iranian Persian locales — a gap only our recordings close) |
| Honduran vs. Cuban Spanish | Variants of `spanish`: `es-HN`, `es-CU`, both with parent `es-419` |
| Southern vs. Northern Pashto | Approximated by `ps-AF` / `ps-PK`; the Pashto language lead refines this |
| Levantine vs. Iraqi vs. Sudanese Arabic | Variants of `arabic`: `ar-SY`, `ar-LB`, `ar-IQ`, `ar-SD`, … |
| Mam, K'iche', Q'anjob'al (many Guatemalan/Honduran students) | **Separate languages**, not Spanish variants. Not supported yet — a candidate for new languages, and a gap nobody serves |

## Fallback chain

```
es-HN  →  es-419  →  spanish (core)  →  Azure
ar-SD  →  arabic (core)  →  Azure
```

- Content (Lexicon entries, Dual Codex overrides) is resolved most specific first. Entries of a **sibling** variant are never served (a Cuban word never reaches a Honduran student).
- Ranking order in lookup: **sense (subject) → dialect → provenance**. A wrong meaning is worse than a non-local word.
- Most entries stay core. Store a variant entry only where the variant genuinely differs. That is also where the IP value is highest: Azure Translator has one Spanish.

## Voices and recognizers

`azureVoice` / `sttLocale` are set only where Microsoft publishes the locale (checked against Microsoft Learn, 16 Oct 2026). Otherwise the core voice/locale is used.

| Has Azure voice + recognizer | No Azure locale (our recordings are the only option) |
|---|---|
| es-MX, es-GT, es-HN, es-SV, es-CU, es-DO, es-PR, es-VE, es-CO; es-419 → es-US | **Dari** (any), **ps-PK**, ar-SD, fr-CD, pt-AO |
| ar-SY, ar-LB, ar-IQ, ar-EG, ar-YE; ps-AF; fr-CA | pt-PT (recognizer only) |

Audio cache: core-language audio keeps its original key; a variant with its own voice gets a separate key, so cached audio never crosses dialects.

Core changes made with this work: core Spanish speech recognition moved from Spain (`es-ES`) to US Spanish (`es-US`); Piper voices from the wrong language were removed (Pashto had a Persian model, Urdu Arabic, Somali Swahili; Spanish had Argentine).

## Where the variant comes from

| Surface | Source |
|---|---|
| Enrollment | Optional `variant` on `POST /onboarding/enroll`; invalid values rejected |
| Extension calls | Settings choice, attached by `withVariant` only to calls in the student's own language; an explicit value wins |
| Flags | Client value, else the enrollment's variant when the flag is in the student's language. Part of the candidate key |
| Reviewers | Must be native speakers of that variant; a language lead per language group sets which variants exist |

`GET /api/onboarding/variants?language=spanish` returns the choices, so clients never keep their own list.

## Privacy

A dialect can act as a stand-in for national origin, and families may fear it reveals immigration status (*Plyler v. Doe* bars schools from probing it).

- The question is "Which sounds most like home?", optional, default "Not sure / standard", changeable any time. Never "Where are you from?"
- Variant is never shown per student in district dashboards.
- Any report that groups by variant must suppress small groups (fewer than 10 students) so one student cannot be singled out. No dashboard query groups by variant today; add suppression before one does.

## Adding a variant

1. Add it to `LANGUAGE_VARIANTS` with `parent` (same language only). Set `azureVoice` / `sttLocale` only after confirming the locale on Microsoft Learn.
2. Run `npx jest __tests__/unit/variants.test.ts`. It fails if a parent crosses languages or a language is unsupported.
3. Recruit at least one native-speaker reviewer for it before any variant entry is approved.
