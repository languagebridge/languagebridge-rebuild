# Lexicon Flywheel — Open decisions

| # | Decision | Owner | Blocks | Notes |
|---|---|---|---|---|
| 1 | Is Azure Translator / Speech output our customer data under Microsoft's terms, and do the terms restrict using it to build competing models? | Chris | Recognition flags as designed; MASTER-DOCUMENT §7.1 rule 4 | Code stores redacted misheard transcripts to fix them; policy already bars training on machine output (TRAINING-DATA-POLICY §1). If storing is not allowed, turn off the "Misheard me" chip and drop `recognition` flags |
| 2 | Contributor agreement: IP assignment wording, confidentiality | Chris | Phase 2 | Not work-for-hire alone |
| 3 | NDPA clause: usage data improves product; no district claim on entries from teacher flags | Chris | Flagging at any live district | |
| 4 | Raw flag retention window | Chris | Retention job | Context samples are already capped at 10 per candidate |
| 5 | Can district-employed bilingual aides be paid contributors? | Chris | Contributor outreach | Conflict-of-interest risk |
| 6 | Pay rates per accepted unit (entry, sentence, clip, validation, review) and the R&D premium | Justin | Phase 2 | Budget source decided: flag/gap tasks are operating cost; voice-talent contracts and seeding batches are LanguageBridge-funded R&D at a higher rate |
| 7 | First three languages | Justin | Phase 2 | By flag volume once data exists; by bootstrap backlog until then |
| 8 | Build ownership | Justin | — | Proposed: Matt = backend + scripts, Prentice = queue and review UI |
| 9 | Custom Translator per language — whether and when | Justin | Later | Needs a meaningful number of approved sentence pairs per language |
| 10 | Move Azure machine cache out of `lexicon` before first approved entry | Justin / Matt | Phase 2 | Recommended yes |
| 11 | Do teachers flag from the extension with a student code, or from the dashboard with their login? | Justin / Prentice | Teacher seat role | Today only the extension flags, and `seatRole` is client-declared |
| 12 | ✅ **Decided (Justin, 16 Oct):** RBERN word pairs are facts and are used as a starting point only. We evolve them: every entry a contributor reviews or rewrites becomes our own human-verified entry. Guardrail: never redistribute or export the RBERN glossaries as-is | — | — | Glossary rows are served; they join training data once a contributor has verified them (TRAINING-DATA-POLICY §1) |
| 13 | ✅ **Decided (Justin, 16 Oct):** the voice release is part of the contributor terms of service, accepted before anyone contributes. Remaining for Chris: the wording (synthetic-voice use, payment, withdrawal), and making acceptance an explicit, logged step | Chris (wording) | Any Record task | Store accepted version + timestamp per contributor |
| 14 | ✅ **Decided (Justin, 16 Oct):** US-resident diaspora contributors only, paid in the US | — | — | Record a residency attestation at signup |
| 15 | Base-model licences for every model we fine-tune (Piper voices in `voice-config.json`, Kokoro, Whisper; MMS/NLLB are non-commercial) | Matt → Chris | Any model we ship | Table in TRAINING-DATA-POLICY §3 |
| 16 | Dialect data: confirm the "which sounds most like home" framing and small-group suppression satisfy district counsel | Chris | Showing variant in any report | VARIANTS.md §Privacy |
| 17 | Add Mayan languages (Mam, K'iche', Q'anjob'al) as supported languages? | Justin | — | No Azure support; would be 100% our own data |
| 18 | ✅ **Decided (Justin, 16 Oct):** one voice per language for now. First voice Haitian Creole, second Dari | — | — | PRODUCTION-LOOP §6 |
| 19 | Base model for the Haitian Creole voice (French Kokoro vs a Piper French checkpoint) and its licence | Matt → Chris | Haitian Creole training | Never MMS (non-commercial) |
