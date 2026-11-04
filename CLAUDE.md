# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — start the Vite dev server
- `npm run build` — production build (outputs to `./dist`, per `vercel.json`)
- `npm run lint` / `npm run lint:fix` — ESLint (scoped to `src/components`, `src/pages`, `src/Layout.jsx`; `src/lib` and `src/components/ui` are excluded)
- `npm run typecheck` — `tsc -p ./jsconfig.json` (JS type-checking via `checkJs`, not a real TS build; same include/exclude scope as lint)
- `npm test` — Node's built-in runner over `tests/*.test.mjs` (`node --test`).

Frontend env vars go in `.env.local` (gitignored): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Serverless functions (Vercel) read server-side env vars directly via `process.env` — see "Environment variables" below.

## Architecture

This app was originally built on **Base44** (a low-code platform: React frontend + Deno-based cloud functions + built-in entity/auth system) and is **mid-migration to a self-hosted stack: Vite/React frontend on Vercel + Supabase (Postgres + Auth) + Vercel serverless functions**. Understanding this migration is essential — the same logic now exists in two places:

- `base44/` — the **original Base44 project definition**: entity schemas (`base44/entities/*.jsonc`), agent configs (`base44/agents/*.jsonc`), and the original Deno cloud functions (`base44/functions/*/entry.ts`, using `npm:@base44/sdk` and `Deno.serve`). This is legacy/reference — kept in sync with the Base44 builder, but **not what runs in production**.
- `api/` — the **live Vercel serverless functions** (Node, one file per route, default-exported `handler(req, res)`). Each one is a rewritten port of the matching `base44/functions/*/entry.ts`, now calling Supabase directly instead of the Base44 SDK. This is the real backend.
- `api/_lib/` — shared server-side helpers:
  - `db.js` + `tables.js`: a `db()` proxy that mimics `base44.asServiceRole.entities.X` (`.list()`, `.filter()`, `.get()`, `.create()`, `.update()`, `.delete()`, `.bulkCreate()`, `.deleteWhere()`) but backed by Supabase tables via `TABLES` (entity name → Postgres table name mapping, e.g. `User` → `profiles`).
  - `supabase.js`: `adminClient()` (service-role client) and `getAuthedUser(req)`, which verifies the `Authorization: Bearer <supabase-access-token>` header and hydrates the `profiles` row — the server-side equivalent of the old `base44.auth.me()`.
  - `agents.js` / `llm.js`: Anthropic API integration (`ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`) backing the Maya/Atlas assistants and `invokeLLM`.
  - `email.js`: Resend-based email sending.
- `vercel.json` rewrites legacy `/functions/<name>` paths (the old Base44 URL shape) to `/api/<name>`, and defines nine Vercel Cron schedules: `autoFindProductImages` every 5 minutes (a picture for every newly added product, plus a nightly retry 06:00–10:00 UTC for those still missing one — see `api/_lib/autoProductImages.js`), the hourly `reconcilePaypalPayments` (top of every hour), plus six daily ones — `refreshInstagramToken` (04:00 UTC), `syncTrendingLinks` (06:00), `syncEbayTrending` (07:00), `optimizeAutopilotPosts` (09:00), `dailyPerformanceSummary` (12:00) and `processAutoPayouts` (13:00) and `facebookAutoPost` (14:00, one product a day to each connected Facebook Page — eligibility rules in `api/_lib/facebookPosts.js`). The 5-minute and hourly jobs rely on the project being on Vercel Pro; Hobby only allows daily crons. The README's Deployment section says what each one needs to do anything useful. Cron requests authenticate via `CRON_SECRET` (checked by `isCronRequest` in `api/_lib/supabase.js`), not a user token — and note that `isCronRequest` returns false when `CRON_SECRET` is unset, so an unconfigured deploy fails closed rather than leaving the jobs open.
- `src/api/base44Client.js` — a **drop-in shim** matching the old `@base44/sdk` client's call shape (`base44.entities.X.list/filter/create/...`, `base44.auth.me/updateMe/logout`, `base44.functions.invoke(name, payload)`, `base44.integrations.Core.UploadFile/InvokeLLM/GenerateSpeech`, `base44.agents.*`) so the ~30 pages/components that still `import { base44 } from "@/api/base44Client"` didn't need to change during the migration. Internally it talks straight to Supabase (`src/lib/supabaseClient.js`) for entities/auth, and calls `/api/<name>` (Vercel functions, with the user's Supabase access token as a bearer header) for anything needing server-side secrets (LLM, speech, functions).
  - Entity → table mapping lives only in `api/_lib/tables.js` (`TABLES`); `src/api/base44Client.js` imports it (Vite inlines it into the browser bundle). Add new entities there and nowhere else.
- `src/lib/api.js` (`authAPI`, `productsAPI`, `linksAPI`, `campaignsAPI`, `analyticsAPI`, `payoutsAPI`, `paymentsAPI`) is a leftover REST-style wrapper around a `base44.integrations.custom.call("affiliate-pro-api", ...)` path that only actually resolves for one endpoint (`get:/api/links`); it's unused dead code from an earlier iteration — don't build on it, and prefer `base44.entities.*` / `base44.functions.invoke` directly.
- `src/lib/AuthContext.jsx` — the real auth/session source of truth for the frontend (`useAuth()`), talking to Supabase directly (not through `base44Client`): hydrates `auth.users` + `public.profiles` into one `user` object, applies pending referral codes from `sessionStorage`, and loads `app_settings` for public app config.

### Adding or changing a backend entity/route

Because of the dual `base44/` + `api/` structure, changes to data shape or business logic typically touch multiple places:
1. `base44/entities/<Name>.jsonc` (schema, if the Base44 side still needs to match)
2. `api/_lib/tables.js` `TABLES` map (the only table-name mapping; `src/api/base44Client.js` imports it)
3. `api/<functionName>.js` (the live handler) — and its `base44/functions/<functionName>/entry.ts` counterpart if it should stay in sync
4. Any Supabase-side schema/migration (not tracked in this repo — managed in the Supabase project directly)

### Environment variables (server-side, Vercel)

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_PAYPAL_CLIENT_ID` (read server-side too, despite the `VITE_` prefix — a PayPal client ID is public), `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MONTHLY_PLAN_ID`, `PAYPAL_YEARLY_PLAN_ID`, `PAYPAL_TEST_PLAN_ID` (admin-only $1/month test subscription plan, see `docs/test-subscription.md`), `PAYPAL_ENV` (optional; `sandbox` switches the API host, anything else is live — see `api/_lib/paypal.js`), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`, `CONVERSION_SECRET`, `EBAY_DEV_ID`, `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_VERIFICATION_TOKEN`, `CLICKBANK_SECRET_KEY` (ClickBank INS payload decryption, see `api/clickbankNotification.js`), `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (shared house-account auto-posting, see `api/instagramConnect.js`), `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, `FACEBOOK_LOGIN_CONFIG_ID` (optional, only for Facebook Login for Business apps) (per-user Facebook Page auto-posting, see `api/facebookConnect.js` and `api/facebookAutoPost.js`), `APP_ORIGIN` (optional; the public address put in auto-posted links, default `https://apx.amhere4utoday.com`), `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET` (per-user LinkedIn posting; 60-day tokens with no refresh, see `api/linkedinConnect.js`), `OPENAI_API_KEY`, `JSON2VIDEO_API_KEY` (AI video ad rendering, see `api/_lib/videoAds.js`), `GOOGLE_API_KEY` (Drive API key, restricted to the Drive API, for importing vendors' official creatives folders, see `api/_lib/driveCreatives.js`).

Two checkouts are live: Stripe and PayPal, for all three plans. PayPal Lifetime is a one-time Order (`createPaypalOrder.js` → `capturePaypalOrder.js` on `/payment-success`); Monthly and Yearly are PayPal Subscriptions against the plan IDs above (`capturePaypalSubscription.js`, with `paypalWebhook.js` as the durable record of activations, renewals and cancellations). `createPaypalOrder` writes a `pending` `Payment` row before redirecting; the hourly `reconcilePaypalPayments` cron captures or abandons any still pending after 15 minutes, so a buyer who closed the tab is not lost. `grantLifetimeIfEarned` and `downgradeIfEligible` in `stripeWebhook.js` count every completed `Payment` row regardless of `payment_method`, and `paypalWebhook.js` reuses them — so never delete or rewrite a completed PayPal row, or that buyer can lose access.

### Automation policy — read before building anything that acts on a user's behalf

`docs/policies-and-procedures.md` is binding for any agent, bot, or automated
flow in this app. Read it before adding one. The three rules that decide most
design questions:

1. **Three branches, never two.** Every enforcement check returns permitted,
   prohibited, or *escalate to the human*. Vendor terms that are open to
   interpretation are a guess, and guesses are not permitted — the third branch
   is mandatory, not a fallback. A check that can only allow or deny is
   incomplete.
2. **The credential boundary is absolute.** Account creation, logins,
   passwords, API keys, tax and bank details belong to the human. Automation
   inherits an environment it did not create and never crosses that line. The
   block is structural (`checkVendorBotAction()`), not a prompt instruction.
3. **A rule in a prompt is a preference; a rule in a function that refuses is a
   policy.** Anything that matters is enforced in code before the side effect,
   and pinned by a test that fails if the refusal stops working.

Vendor terms are the source of truth — this app does not invent policy.

### UI

shadcn/ui (`components.json`, style `new-york`) generates into `src/components/ui`, which is excluded from lint/typecheck. Path alias `@/*` → `src/*` (Vite, jsconfig, and shadcn aliases all agree). Pages live in `src/pages/*.jsx`, routed as top-level app screens (Dashboard, Links, Campaigns, Products, Analytics, Payouts, AutoPilot, Admin, Social Connect, auth pages, etc.); shared feature components are grouped under `src/components/<feature>/` (e.g. `dashboard`, `payouts`, `autopilot`, `social`, `make-money`, `admin`).
