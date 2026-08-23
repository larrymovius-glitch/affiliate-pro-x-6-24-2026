-- Schema drift: columns the serverless functions write that did not exist.
--
-- APPLIED 2026-08-23 to project edamfapqpoceywqnjvun, as migration
-- `add_missing_columns_for_payouts_payments_profiles`. Kept here as the record
-- of what changed and why. Re-running is harmless -- every statement is
-- idempotent (`if not exists`).
--
-- Verified after applying: all 14 columns present, all 3 indexes created.
--
-- Deliberately not placed under `supabase/` -- the Supabase GitHub integration
-- watches that directory, and creating it would change how future PRs behave.
--
-- Found by diffing api/*.js payloads against the live schema. Every statement
-- is additive: nullable columns only, drops nothing, rewrites no rows.
--
-- Each block below was one broken write path. Before this ran, PostgREST
-- rejected the insert (PGRST204, "column ... does not exist") and the whole
-- request failed.

-- 1. Payout requests. api/requestPayout.js and api/processAutoPayouts.js both
--    insert `source` and `requested_at`; api/processStripePayout.js sets
--    `paid_at` on completion. None exist, so no payout can be recorded at all.
alter table public.payouts add column if not exists source       text;
alter table public.payouts add column if not exists requested_at timestamptz default now();
alter table public.payouts add column if not exists paid_at      timestamptz;

-- 2. Stripe billing. api/stripeWebhook.js inserts these on
--    checkout.session.completed, and looks payments up by `transaction_id` to
--    stay idempotent. Without them no subscription payment is ever recorded,
--    even though checkout itself succeeds and the customer is charged.
alter table public.payments add column if not exists transaction_id text;
alter table public.payments add column if not exists plan_type      text;
alter table public.payments add column if not exists veteran_status text;

-- Backs the webhook's duplicate check, so a replayed Stripe event cannot
-- record the same payment twice.
create unique index if not exists payments_transaction_id_key
  on public.payments (transaction_id) where transaction_id is not null;

-- 3. Profile fields. Referenced 39 times across src/ and api/ -- payout
--    routing (stripeAccountId, paymentEmail, payoutReady), the tax set-aside
--    card, the referral programme, and premium voice. Quoted identifiers
--    because the code reads them camelCase, carried over from Base44.
alter table public.profiles add column if not exists "stripeAccountId" text;
alter table public.profiles add column if not exists "paymentEmail"    text;
alter table public.profiles add column if not exists "payoutReady"     boolean default false;
alter table public.profiles add column if not exists voice_tier        text default 'standard';
alter table public.profiles add column if not exists tax_set_aside_pct numeric default 0;
alter table public.profiles add column if not exists tax_saved_amount  numeric default 0;
alter table public.profiles add column if not exists referral_code     text;
alter table public.profiles add column if not exists referred_by_code  text;

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code) where referral_code is not null;

-- Guards the money path fixed in api/trackConversion.js: a network that
-- retries its postback must not be able to credit the same sale twice.
-- The handler already checks for a duplicate order_id before crediting; this
-- makes it safe under concurrent retries as well.
create unique index if not exists conversion_events_order_id_key
  on public.conversion_events (order_id) where order_id is not null;

-- Note the reverse drift, left alone deliberately: profiles.subscription_tier
-- ('free' | 'pro' | 'veteran_free') and profiles.epn_campaign_id both exist in
-- the database and are read by no code at all. subscription_tier is the
-- natural place to hang the paywall this app does not yet have.
