#!/usr/bin/env node
/**
 * Regenerate LOVABLE-BUILD-SPEC.md from the source of truth:
 *   docs/PRD-DISTRICT-ANALYTICS.md  (spec, §1–§8 and §11)
 *   deliverables/district-dashboard/lb-dashboard-proxy.ts  (Appendix A)
 * Run after editing either:  node deliverables/district-dashboard/build-spec.mjs
 * Backend-only sections (§9 Azure setup, §10 known limits) are replaced by
 * Supabase-side setup, since Lovable can't act on them.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const prd = readFileSync(resolve(root, 'docs/PRD-DISTRICT-ANALYTICS.md'), 'utf8');
const proxy = readFileSync(resolve(here, 'lb-dashboard-proxy.ts'), 'utf8');

const section = (from, to) => {
  const i = prd.indexOf(from);
  const j = to ? prd.indexOf(to, i) : prd.length;
  if (i === -1 || j === -1) throw new Error(`PRD section not found: ${from}`);
  return prd.slice(i, j).trimEnd() + '\n';
};

let body = section("## 1. What we're building", '## 9. Setup checklist');
const replacements = [
  ['- **Proxy:** deploy `deliverables/district-dashboard/lb-dashboard-proxy.ts` as the Edge Function `lb-dashboard`.', '- **Proxy:** create the Supabase Edge Function `lb-dashboard` with the exact code in **Appendix A** (copy it as-is).'],
  ['Existing endpoints (see `flywheel/README.md`): ', 'Existing endpoints: '],
  [', "action": "See docs/PRD-DISTRICT-ANALYTICS.md §Setup." }', ' }'],
  [' (MASTER-DOCUMENT §7.1 rule 7)', ''],
  ["Suggest the price from `company/PRICING-AND-PACKAGING.md` tiers (Starter $12, Growth $9, District $6 per EL student; Building $3,000)", "Suggest the price from LanguageBridge's list prices (Starter $12, Growth $9, District $6 per EL student per year; Building license $3,000 per year)"],
];
for (const [a, b] of replacements) body = body.split(a).join(b);
for (const leftover of ['docs/', 'company/', 'flywheel/', 'MASTER-DOCUMENT', 'deliverables/']) {
  if (body.includes(leftover)) throw new Error(`Spec still references internal path "${leftover}" — add a replacement above.`);
}
const accept = section('## 11. Acceptance criteria').replace('## 11. Acceptance criteria', '## 10. Acceptance criteria');

const out = `# LanguageBridge Dashboard — build spec for Lovable

> **Lovable: read this whole document before writing code. Build exactly what it specifies, using the exact request/response shapes. Section 2 (privacy) is non-negotiable. Do not invent API fields or endpoints. The backend already exists — you are building the frontend and one Supabase Edge Function.**

## 0. Build instructions (do these in order)

1. **Edge Function \`lb-dashboard\`** — create it in the connected Supabase project with the code in **Appendix A**, unchanged. It reads two Supabase secrets: \`LB_API_BASE\` and \`LB_DASHBOARD_ORIGIN\` (§9). It holds no API key. **Do not host this proxy on Lovable's servers or as an app route** — it must be the Supabase Edge Function.
2. **All backend calls** go through that function with the signed-in user's Supabase access token (\`Authorization: Bearer <session.access_token>\`). Never call \`languagebridge-api.azurewebsites.net\` from the browser. Never put any key in frontend code or \`VITE_\` variables.
3. **Sign-in:** Supabase Auth (email + password). Build the "set your password" screen for invite links (\`type=invite\`) and password reset (\`type=recovery\`). After sign-in, call \`GET lb-dashboard/auth-layer\` and build navigation from \`role\` (§4).
4. **Route \`/dashboard\`** with these areas, shown per role (§4): District insights (§5), Data & privacy (§5.1), Audit log (§5.2), My students (§6), LB Operations (§7).
5. **Customization:** create the \`dashboard_layouts\` table with row-level security (SQL in §5) and save each user's widget layout and filters there.
6. **Health banner bar** (§7.1) on every page for super-admins.
7. **Brand and layout** per §8.

${body}
---

## 9. Setup (Supabase side)

1. **Secrets** (Supabase → Edge Functions → Secrets):
   - \`LB_API_BASE\` = \`https://languagebridge-api.azurewebsites.net/api\`
   - \`LB_DASHBOARD_ORIGIN\` = \`https://languagebridge.app\`
2. **Deploy** the Edge Function \`lb-dashboard\` (Appendix A).
3. **Auth → URL configuration:** add \`https://languagebridge.app/dashboard\` to the redirect URLs. Enable email invites and configure a custom SMTP provider (Supabase's built-in email only reaches members of the Supabase team).
4. **Database:** create the \`dashboard_layouts\` table and policy from §5.
5. **Sign-in accounts** are created by LanguageBridge super-admins through LB Operations → Invite staff. Do not build public sign-up.

Notes for testing: until LanguageBridge connects Azure monitoring, the Health page shows an info banner "Azure monitoring not connected" and some database/API fields are \`null\` — render them as "—", not errors. Dashboard answers are cached by the server for 5 minutes. Cost figures and the interpreter value are estimates and must be labelled as such.

---

${accept}
---

## Appendix A — Edge Function \`lb-dashboard\` (copy exactly)

File: \`supabase/functions/lb-dashboard/index.ts\`

\`\`\`ts
${proxy.trimEnd()}
\`\`\`
`;
writeFileSync(resolve(here, 'LOVABLE-BUILD-SPEC.md'), out);
console.log(`LOVABLE-BUILD-SPEC.md written (${out.length.toLocaleString('en-US')} characters)`);
