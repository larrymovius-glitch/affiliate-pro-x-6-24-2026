-- Apply in the Supabase SQL Editor.
--
-- Storage for the affiliate id/tag a user has on any network beyond
-- ClickBank (profiles.clickbank_nickname) and the house Digistore24 id.
-- One jsonb column instead of one new column per network -- src/lib/
-- affiliateNetworks.js's catalog is expected to grow, and this needs no
-- migration each time it does. Shape: { "amazon": "mytag-20", "impact": "..." }.
--
-- Covered by the existing profiles_update_own RLS policy (self-row only),
-- same as every other column a user edits about themselves -- no new policy
-- needed.
alter table public.profiles
  add column if not exists affiliate_network_ids jsonb not null default '{}'::jsonb;
