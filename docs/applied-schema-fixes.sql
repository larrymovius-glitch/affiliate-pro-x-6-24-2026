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

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-23, migration `add_autopilot_columns_to_generated_posts`.
--
-- generated_posts had 11 columns; the autopilot and Ad Tracker wrote 16 more
-- that did not exist, so createAutopilotPack's insert failed outright and
-- optimizeAutopilotPosts could not even filter on autopilot_enabled. The
-- feature had never been able to run.
--
-- The status CHECK also allowed only draft/published/scheduled while the app
-- writes 'posted' and 'archived'. Widening an allowed set cannot invalidate
-- existing rows.
--
-- Verified after applying: 29 columns on generated_posts, CHECK now accepts
-- posted and archived.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-26, migration `add_missing_source_column_to_click_events`.
--
-- Found by the first real smoke test of the click -> conversion chain:
-- api/trackClick.js inserts `source` (and the ClickEvent entity's own schema
-- declares it) into click_events on every single click, but the live table
-- never had that column. PostgREST rejected the insert (PGRST204) on every
-- click since this table existed -- the row count was 0. The click counter on
-- affiliate_links still incremented (a separate update, earlier in the same
-- handler), and trackConversion.js attributes sales by short_code against
-- affiliate_links directly, never touching click_events -- so earnings were
-- never at risk. This only broke the click log/analytics, silently, for as
-- long as the table has existed.
alter table public.click_events add column if not exists source text;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-27, migration `grant_authenticated_update_affiliate_network_ids`.
--
-- Found live: saving any non-ClickBank network id on /networks
-- (src/components/products/NetworkCard.jsx) appeared to succeed in the UI but
-- never persisted -- profiles.affiliate_network_ids stayed `{}` no matter what
-- was saved. Root cause: `authenticated` only has column-level UPDATE granted
-- on a specific allowlist of self-editable profiles columns (avatar_url,
-- clickbank_nickname, epn_campaign_id, full_name -- see
-- docs/secure-veteran-access.sql's `revoke update (...) from authenticated`
-- for the other half of this same allowlist model). affiliate_network_ids was
-- added later by docs/affiliate-network-ids.sql without a matching grant, so
-- every browser-side update to it was silently rejected by Postgres before
-- RLS was ever evaluated.
grant update (affiliate_network_ids) on public.profiles to authenticated;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-27, migration `default_created_by_id_to_auth_uid`.
--
-- The big one. Found live: the "Add Affiliate Link" dialog on /links did
-- nothing on click -- no row appeared, no visible error. Root cause was not
-- specific to that one button: products, affiliate_links, campaigns,
-- generated_posts, ad_assets, ad_reviews, payout_schedules, payouts, and
-- pro_automation_rules all carry a "Users manage own X" RLS policy requiring
-- created_by_id = auth.uid() on insert, and every one of those columns had no
-- default. base44Client.js's generic entities.<X>.create(payload) inserts
-- payload verbatim -- it never set created_by_id -- so every direct
-- browser-side insert into any of these nine tables has been silently
-- rejected by RLS since the policy was created. The only rows that ever
-- existed were created a different way: server-side tool calls (which use
-- the service role and set created_by_id explicitly) or direct SQL. This is
-- almost certainly why "nothing saves" reports kept surfacing across
-- unrelated-looking features -- they were all the same root cause.
--
-- Fix: give the column itself a default of the current session's user, so
-- every insert that omits it -- past call sites and any future one -- is
-- covered without having to find and patch every .create() call site
-- individually. Service-role inserts are unaffected: they already set
-- created_by_id explicitly, and a column default only applies when the
-- insert omits the column.
alter table public.products             alter column created_by_id set default auth.uid();
alter table public.affiliate_links      alter column created_by_id set default auth.uid();
alter table public.campaigns            alter column created_by_id set default auth.uid();
alter table public.generated_posts      alter column created_by_id set default auth.uid();
alter table public.ad_assets            alter column created_by_id set default auth.uid();
alter table public.ad_reviews           alter column created_by_id set default auth.uid();
alter table public.payout_schedules     alter column created_by_id set default auth.uid();
alter table public.payouts              alter column created_by_id set default auth.uid();
alter table public.pro_automation_rules alter column created_by_id set default auth.uid();
-- ---------------------------------------------------------------------------
