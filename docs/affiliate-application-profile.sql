-- Apply in the Supabase SQL Editor.
--
-- Storage for the answers a user retypes on nearly every vendor's affiliate
-- approval form (ClickBank vendors like ProDentim/Femicore gate promotion
-- behind their own Google Form: name, company, Telegram, ClickBank ID,
-- traffic sources, networks used, ClickBank tier). One jsonb column, filled
-- in once, so Maya/Atlas can hand back ready-to-paste answers instead of the
-- user retyping the same things for every new vendor.
--
-- Deliberately does not auto-submit any vendor's form -- every vendor's form
-- is different, and the answers are the user's own claims to a human
-- reviewer. This only saves the user from retyping them.
--
-- Covered by the existing profiles_update_own RLS policy (self-row only),
-- same as every other column a user edits about themselves.
alter table public.profiles
  add column if not exists affiliate_application_profile jsonb not null default '{}'::jsonb;
