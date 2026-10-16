# Dual Codex — Lexicon override layer

Code: `backend/shared/dual-codex.ts`, wired into `backend/azure-functions/translate/index.ts`.
Status: **built, off by default** (`LB_LEXICON_OVERRIDES=on` to enable). With no approved entries it is a no-op.

"Dual Codex" is the name for the layer that holds two codices side by side — Azure's machine translation and our human-verified Lexicon — and decides, per request, which one speaks. Before this branch it existed only as a name; this is the first implementation.

---

## Where overrides apply

| Path | Override today |
|---|---|
| `lexicon-lookup` (single terms, lookup card) | Already served from the Lexicon before Azure. Now ranks `approved` entries first, never serves `deprecated`, returns `entry_id` + `provenance` |
| `translate` (passages, Talk to Teacher) | Dual Codex, english → target only |
| `tts-router` | Phase 3 (pronunciations) |
| `speech-to-text` | Phase 3 (recognition phrases) |

---

## Layers

```
text ──► 1. phrase?  ── exact match ──► human translation (Azure skipped)
           │ no
           ▼
         2. fixed_term found? ──► wrap in <mstrans:dictionary translation="…">term</mstrans:dictionary>
           │
           ▼
         3. term found? ──► counted only (not substituted yet)
           │
           ▼
         Azure Translator ──► response
```

1. **phrase** — the whole utterance, ignoring case and punctuation, equals an approved phrase. Grammar is right because a person wrote the whole phrase. Partial phrase matches inside longer sentences are *not* substituted — that needs alignment (see layer 3).
2. **fixed_term** — Azure dynamic dictionary. Safe only for proper nouns, named programs and non-inflecting academic terms (Microsoft's own guidance). Any `mstrans:dictionary` markup in the caller's text is stripped first so users cannot inject entries.
3. **term** — single inflecting words. Plan: request `includeAlignment=true` from Azure, find the target span aligned to the source term, replace it with the stored inflected form that matches. Only in languages where the entry stores inflected forms. Until then matches are logged as `matched_term_ids` so we know which entries would fire.

Longer entries are tried first, so "line up for lunch" beats "lunch".

---

## Caching and rollback

- Approved override entries are loaded per language, one partition query, cached in the function instance for `LB_LEXICON_OVERRIDE_TTL_MS` (default 300000).
- Retire an entry: set `status: 'deprecated'`. Lookup stops serving it immediately; translate within one TTL. No deploy.
- If the load fails (Cosmos down), translate logs a warning and calls Azure without overrides. Overrides never block a translation.

## Counting

Each hit writes `lexicon_override_fired` to `analytics` with entry ids and layer. **No text, no student code** — `translate` still never stores what was said.

## Environment

| Variable | Default | Effect |
|---|---|---|
| `LB_LEXICON_OVERRIDES` | unset (off) | `on` enables Dual Codex in `translate` |
| `LB_LEXICON_OVERRIDE_TTL_MS` | 300000 | Per-language cache lifetime |

## Before turning it on in production

1. At least one entry with `entry_kind` and `status: 'approved'` that passed the two-approval gate.
2. Manually check a dynamic-dictionary request in each target script (RTL: Arabic, Dari, Pashto, Urdu, Persian).
3. Watch `lexicon_override_fired` volume for a day.

## Not handled (by design, for now)

- target → english direction (student speaks Dari, teacher reads English). Entries are keyed by English source.
- Phrase substitution inside longer sentences.
- Custom Translator models (later; training pairs stay in our DB).
