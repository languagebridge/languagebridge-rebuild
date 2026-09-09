# LanguageBridge — Company Document Set

**The canonical, uniform source of truth for LanguageBridge LLC.** These documents are reverse-engineered from the working system and reconciled against the engineering reality (see `docs/ENGINEERING-FIELD-GUIDE.md`). When any older document in `docs/` disagrees with a fact here, **this set wins** — and the older doc should be updated.

**Maintained by:** Justin Bernard, CEO / Founder / Data Security Officer · justin@languagebridge.app · (216) 800-6020
**Last reconciled:** September 2026

---

## What's in here

| Document | Audience | Purpose |
|---|---|---|
| [00-CANONICAL-FACTS.md](00-CANONICAL-FACTS.md) | Everyone (internal) | The single source of truth: entity, product, the 16 languages, subprocessors, the numbers everyone must quote. Start here. |
| [COMPANY-OVERVIEW.md](COMPANY-OVERVIEW.md) | Sales / partners | The one-pager: what we do, who it's for, why we win. |
| [PRICING-AND-PACKAGING.md](PRICING-AND-PACKAGING.md) | Schools / districts | Tiered pricing and the justification behind every number. |
| [COST-MODEL-AND-UNIT-ECONOMICS.md](COST-MODEL-AND-UNIT-ECONOMICS.md) | Internal / finance | What the stack costs us, margins, and how pricing is derived. Do not distribute. |
| [SECURITY-AND-PRIVACY-OVERVIEW.md](SECURITY-AND-PRIVACY-OVERVIEW.md) | School IT / legal | Trust brief answering a vendor security questionnaire at a glance. |
| [DPA-TEMPLATE.md](DPA-TEMPLATE.md) | School legal / procurement | Ready-to-send Student Data Privacy Agreement (ETLA Ohio NDPA V1 basis). Draft for legal review. |
| [SCHOOL-ADMIN-FAQ.md](SCHOOL-ADMIN-FAQ.md) | School administrators | Plain-language answers to procurement and rollout questions. |
| [BEFORE-YOU-SEND-CHECKLIST.md](BEFORE-YOU-SEND-CHECKLIST.md) | You (deal owner) | The gates to clear before sending the DPA to a district. |

Supporting operational compliance artifacts already live in `docs/compliance/` (incident response, DR, risk assessment, NIST CSF mapping, vulnerability scanning). This set references them; it does not replace them.

---

## Reconciliation notes (read before trusting any older doc)

These are the known contradictions between older `docs/` files and the current reality. The canonical value is what this set uses.

| Fact | Older docs say | **Canonical (verified 2026-09)** |
|---|---|---|
| Supported languages | 21 (`DPA-V2-DRAFT`, `TECHNICAL-OVERVIEW`, `BACKEND-ARCHITECTURE`) or 22 (`MASTER-BLUEPRINT`) | **16.** Kinyarwanda, Twi, Uzbek, Amharic, Tigrinya were removed (endpoints didn't work). |
| Azure Functions | "7 functions" / "8 endpoints" | **9** (`analytics-writer, auth-layer, dashboard, flag-handler, lexicon-lookup, onboarding, speech-to-text, translate, tts-router`). |
| Live API resource group | `.env` implies `languagebridge-rg` | **`languagebridge-ce`** (the app `languagebridge-api`). `languagebridge-rg` holds a stale app. |
| SOC 2 | Ambiguous phrasing near "SOC 2 certified" | LanguageBridge is **not** SOC 2 certified. Its **subprocessors** (Azure, Supabase, Stripe) are. Never claim otherwise. |

---

## Status honesty (so these survive a legal read)

Some capabilities referenced in the DPA and compliance materials are **committed but not yet built**. Represent them accurately in any customer conversation:

- **Built & live:** the extension, the 9-function backend, the 16-language lexicon + audio, anonymous analytics, one signed MVP DPA (Parma City Schools, 2026-03-03).
- **In progress:** `languagebridge.app/teacher` (PWA Talk to Teacher), Chrome Web Store submission.
- **Committed / roadmap (do not describe as shipped):** the LEA transparency dashboard, the LEA data-export/audit-log tooling, the interpreter marketplace, proprietary TTS voice deployment, and cyber-liability insurance via **The Hartford** (bind before signing a DPA that promises it).

**Confirmed (September 2026):** pricing is approved list pricing (see PRICING-AND-PACKAGING.md); legal review/sign-off is with **Bob Ellis** (counsel); cyber-liability carrier is **The Hartford**.
