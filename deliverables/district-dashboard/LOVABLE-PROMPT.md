# Paste-into-Lovable instruction

Attach `docs/PRD-DISTRICT-ANALYTICS.md` and `deliverables/district-dashboard/lb-dashboard-proxy.ts` to the Lovable chat, then paste the prompt below. Do step 1 of the PRD's §9 "Frontend" setup (Supabase secrets) first.

---

```
Build the LanguageBridge dashboard at /dashboard exactly as specified in the attached
PRD-DISTRICT-ANALYTICS.md. Read the whole PRD first; §2 (privacy rules) is non-negotiable.

1. Supabase Edge Function "lb-dashboard": use the attached lb-dashboard-proxy.ts as-is.
   It reads secrets LB_API_BASE and LB_DASHBOARD_ORIGIN. It holds no API key.
2. Every backend call goes through that function with the user's Supabase access token
   (Authorization: Bearer <session.access_token>). Never call languagebridge-api.azurewebsites.net
   from the browser. Never put any key in frontend code or VITE_ env vars.
3. On sign-in, call GET lb-dashboard/auth-layer and build navigation from role
   (super_admin | district_admin | champion) per PRD §4. Build the invite / password-set screen.
4. District insights (§5): one POST insights/summary call drives a customizable widget grid.
   Save layouts in a new Supabase table dashboard_layouts (SQL in §5, with row-level security).
5. My students (§6): champions and super-admins only. Nicknames are stored ONLY in localStorage —
   never sent anywhere.
6. LB Operations (§7): super-admins only — health banner bar on every page (poll ops/health every
   5 minutes; critical banners flash, snooze max 1 hour), health page, business overview,
   districts & schools forms, invite staff, pricing settings, flag queue.
7. Suppressed values ("students": null, "suppressed": true) render "Fewer than 10 students".
8. Brand: plum #742a69 → orange #f37030 → gold #ffc755. Must work at 1366×768 and on a phone.
Use the exact request/response shapes in the PRD; don't invent fields.
```
