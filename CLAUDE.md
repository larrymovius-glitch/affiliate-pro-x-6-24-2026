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
- `vercel.json` rewrites legacy `/functions/<name>` paths (the old Base44 URL shape) to `/api/<name>`, and defines Vercel Cron schedules (`processAutoPayouts`, `dailyPerformanceSummary`, `syncTrendingLinks`). Cron requests authenticate via `CRON_SECRET` (checked by `isCronRequest` in `api/_lib/supabase.js`), not a user token.
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

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VITE_PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV` (optional, `sandbox` for testing), `PAYPAL_MONTHLY_PLAN_ID`, `PAYPAL_YEARLY_PLAN_ID` (PayPal Billing Plan IDs for the Monthly/Yearly subscriptions, see below), `PAYPAL_WEBHOOK_ID` (identifies the webhook subscription `api/paypalWebhook.js` verifies against), `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `RESEND_API_KEY`, `RESEND_FROM`, `CRON_SECRET`, `CONVERSION_SECRET`, `EBAY_DEV_ID`, `EBAY_APP_ID`, `EBAY_CERT_ID`, `EBAY_VERIFICATION_TOKEN`, `CLICKBANK_SECRET_KEY` (ClickBank INS payload decryption, see `api/clickbankNotification.js`), `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET` (shared house-account auto-posting, see `api/instagramConnect.js`), `OPENAI_API_KEY`, `JSON2VIDEO_API_KEY` (AI video ad rendering, see `api/_lib/videoAds.js`).

PayPal (`api/_lib/paypal.js`, `api/createPaypalOrder.js`, `api/capturePaypalOrder.js`, `api/capturePaypalSubscription.js`, `api/paypalWebhook.js`, `api/_lib/paypalSubscriptions.js`) is a second checkout option alongside Stripe on the Pricing page for all three plans. `VITE_PAYPAL_CLIENT_ID` carries the `VITE_` prefix only because it was originally added expecting a client-side SDK; the current implementation is server-to-server, so both PayPal vars are read via `process.env` and neither needs `VITE_` for it to work - the prefix is otherwise harmless since a PayPal Client ID is meant to be public. `PAYPAL_ENV=sandbox` switches `api/_lib/paypal.js` to PayPal's sandbox API for testing with fake money; unset (or any other value) stays on the live API.

Lifetime is a one-time PayPal Order (Checkout Orders v2): `createPaypalOrder.js` creates it, and because that API requires an explicit capture after buyer approval (unlike Stripe Checkout), `src/pages/PaymentSuccess.jsx` detects a `?token=` query param from PayPal's redirect and calls `capturePaypalOrder.js` client-side to finalize and record the `Payment` row.

Monthly/Yearly are PayPal Subscriptions (Billing Subscriptions v1), a different PayPal product that can't be created against an arbitrary price the way an Order can - it requires a pre-existing **Billing Plan**, created once in the PayPal dashboard (Pay & Get Paid → Subscriptions → Plans) the same way Stripe's `priceIds` in `createStripeCheckout.js` are hardcoded from a one-time Stripe dashboard setup. Those plan IDs go in `PAYPAL_MONTHLY_PLAN_ID`/`PAYPAL_YEARLY_PLAN_ID`. `createPaypalOrder.js` branches into `createSubscription()` for these two plan types. `PaymentSuccess.jsx` detects PayPal's subscription redirect shape, `?subscription_id=<id>`, and calls `capturePaypalSubscription.js` to grant access the moment PayPal confirms `ACTIVE` - but a Subscription, unlike an Order, keeps billing on its own afterward, so `stripeWebhook.js`'s durable-source-of-truth role has a real PayPal equivalent here: `api/paypalWebhook.js`, which needs a webhook subscribed once in the PayPal dashboard (Apps & Credentials → your app → Webhooks) pointed at `/api/paypalWebhook`, subscribed to at least `BILLING.SUBSCRIPTION.ACTIVATED`/`.CANCELLED`/`.SUSPENDED`/`.EXPIRED` and `PAYMENT.SALE.COMPLETED` - that webhook's ID is `PAYPAL_WEBHOOK_ID`, which `verifyPaypalWebhookSignature()` in `api/_lib/paypal.js` needs (PayPal verifies webhooks by calling back into its own API with the transmission headers, not a local HMAC check like Stripe's `stripe.webhooks.constructEventAsync`).

PayPal fires both `BILLING.SUBSCRIPTION.ACTIVATED` *and* `PAYMENT.SALE.COMPLETED` for a subscription's first payment, and there's no reliable local way to know whether both will actually arrive for a given subscription - rather than guess, `api/_lib/paypalSubscriptions.js` splits the two concerns so only one path ever writes a charge amount: `activatePaypalSubscription()` (driven by `ACTIVATED`, racing `capturePaypalSubscription.js`'s redirect-path call to the same function) grants the tier and marks the checkout row `completed` at amount 0; `recordPaypalSubscriptionCharge()` (driven solely by `PAYMENT.SALE.COMPLETED`, keyed by that sale's own unique ID) is the only place a nonzero amount is ever recorded, for the first charge and every renewal alike. See `tests/paypal-subscriptions.test.mjs` for what would go wrong without that split.

PayPal subscriptions record through the `Payment` table only, the same as Lifetime - **not** the `Subscription` table, whose schema (`base44/entities/Subscription.jsonc`) is Stripe-specific: `stripe_subscription_id` is a required column with no PayPal equivalent. A PayPal-subscribed user's `subscription_tier` and Payment history are correct and fully functional; they just won't show up in any admin view that reads the `Subscription` table directly (e.g. renewal date, cancel-at-period-end). Widening that table for PayPal is a real Supabase schema migration, not made here.

Subscription payments counting toward lifetime (`grantLifetimeIfEarned` in `stripeWebhook.js`) works the same for PayPal as Stripe, since it sums all completed `Payment` rows regardless of `payment_method` - but it only ever cancels *Stripe* subscriptions it finds in the `Subscription` table (which, per above, never contains PayPal ones). `paypalWebhook.js`'s `PAYMENT.SALE.COMPLETED` handler calls `grantLifetimeIfEarned` for that reason and then separately cancels the PayPal subscription itself via `cancelPaypalSubscription()` when it finds a completed lifetime Payment row for that user right after.

### UI

shadcn/ui (`components.json`, style `new-york`) generates into `src/components/ui`, which is excluded from lint/typecheck. Path alias `@/*` → `src/*` (Vite, jsconfig, and shadcn aliases all agree). Pages live in `src/pages/*.jsx`, routed as top-level app screens (Dashboard, Links, Campaigns, Products, Analytics, Payouts, AutoPilot, Admin, Social Connect, auth pages, etc.); shared feature components are grouped under `src/components/<feature>/` (e.g. `dashboard`, `payouts`, `autopilot`, `social`, `make-money`, `admin`).
