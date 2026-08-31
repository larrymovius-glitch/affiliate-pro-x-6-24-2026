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

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-27, migration `create_assistant_conversations`.
--
-- Maya/Atlas had no persistent memory at all. Conversation history lived
-- only in a React ref inside AssistantSessionProvider (src/lib/
-- AssistantSessionProvider.jsx) -- a plain in-memory cache with nothing
-- backing it in the database. A full page reload wiped it, and mobile
-- browsers routinely reload a backgrounded tab on their own to free memory,
-- so switching apps and coming back could silently reset the assistant to a
-- blank conversation with no visible cause. Reported live as "she's not
-- remembering very well."
--
-- New table holds one row per (user, agent, session key) with the full
-- message history as jsonb, read on createConversation and written on every
-- addMessage (see src/api/base44Client.js). Same created_by_id-defaults-to-
-- auth.uid() pattern as the fix above, applied from the start this time.
create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid(),
  agent_name text not null,
  session_key text not null,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by_id, agent_name, session_key)
);

alter table public.assistant_conversations enable row level security;

create policy "Users manage own conversations"
on public.assistant_conversations for all to authenticated
using (auth.uid() = created_by_id)
with check (auth.uid() = created_by_id);

grant select, insert, update, delete on public.assistant_conversations to authenticated;

create trigger set_updated_at
before update on public.assistant_conversations
for each row execute function set_updated_at();
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-30, migration `fix_subscriptions_schema_for_stripe_webhook`.
--
-- api/stripeWebhook.js was writing two columns that do not exist live, so
-- every affected event would have thrown a 500 and Stripe would have retried
-- it forever:
--   * subscriptions.canceled_at -- written on every customer.subscription.*
--     event, declared in base44/entities/Subscription.jsonc, never created on
--     the live table. Added below.
--   * payments.notes -- written on every renewal. The live table has
--     `description` instead, so the code was changed rather than adding a
--     duplicate column.
--
-- Also widened the subscriptions status CHECK. It allowed only
-- active|canceled|past_due|trialing, but Stripe creates a subscription with
-- status "incomplete" whenever the first charge needs authentication (3D
-- Secure) -- that is frequently the very first customer.subscription.created
-- event of a genuine signup, which would have been rejected outright.
--
-- Neither bug had been observed yet only because payments and subscriptions
-- were both still empty -- no checkout had ever completed in production.
alter table public.subscriptions add column if not exists canceled_at timestamptz;

alter table public.subscriptions drop constraint if exists subscriptions_status_check;
alter table public.subscriptions add constraint subscriptions_status_check
  check (status = any (array[
    'active','canceled','past_due','trialing',
    'incomplete','incomplete_expired','unpaid','paused'
  ]));
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-31, migrations `enforce_free_tier_first_ad_limit` and
-- `tighten_free_tier_first_ad_limit`. Full statements in
-- docs/free-tier-first-ad-limit.sql.
--
-- The app's first paywall: free tier gets one live ad, not one connection
-- or one draft. Generating ad copy (createAutopilotPack, PostGenerator.jsx)
-- stays unlimited, and there is no read-side restriction anywhere -- a free
-- user can always see their existing post's clicks/conversions/earnings.
-- The limit is specifically on generated_posts.status reaching "posted": a
-- statement-level AFTER trigger on generated_posts (both INSERT and
-- UPDATE, as two triggers -- Postgres won't allow a transition table on a
-- multi-event or column-list trigger) counts a user's total posted rows
-- after the statement and rejects it if a free-tier user would end up with
-- more than one. Raises with a `FREE_TIER_LIMIT:` prefix so the frontend
-- (src/components/autopilot/PostGenerator.jsx markAsPosted, catching the
-- error from base44.entities.GeneratedPost.update) can tell this apart
-- from any other failure and show PaywallModal instead of a generic toast.
--
-- Statement-level with a transition table, not row-level: db().GeneratedPost
-- .bulkCreate (api/_lib/db.js) issues one multi-row insert() call, and a
-- row-level trigger would see its own statement's earlier rows as already
-- existing, which would have broken the very first legitimate multi-row
-- batch. Uses NEW.created_by_id rather than auth.uid() for the same reason
-- as always in this file: createAutopilotPack.js writes through the
-- service-role connection, where auth.uid() is null.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APPLIED 2026-08-31, migration `fix_affiliate_links_campaign_id_type`.
--
-- Found live: clicking "Start 3-Product Autopilot" on /make-money failed
-- outright with `invalid input syntax for type uuid:
-- "autopilot:<productId>:v1"`. affiliate_links.campaign_id was typed uuid,
-- but base44/entities/AffiliateLink.jsonc declares it a plain string
-- ("Optional campaign reference"), and the only writer
-- (api/createAutopilotPack.js) has only ever written composite label
-- strings like "autopilot:<productId>:v1" or "...:r<n>:v<variant>" -- never
-- a real UUID. 0 existing rows had a value here, confirming this insert had
-- never once succeeded -- the entire 3-Product Autopilot feature was dead
-- on arrival.
alter table public.affiliate_links alter column campaign_id type text using campaign_id::text;
-- ---------------------------------------------------------------------------
