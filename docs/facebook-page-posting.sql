-- Facebook Page auto-posting (api/facebookConnect.js, api/facebookAutoPost.js).
-- Applied to the live project 2026-10-15.
--
-- A Facebook connection is a Page, not the person: the token stored is the
-- Page's own, and posting needs the Page's id. account_id / account_name hold
-- that (and are left empty for Instagram and LinkedIn, which don't need them).

alter table public.social_connections
  drop constraint if exists social_connections_platform_check;
alter table public.social_connections
  add constraint social_connections_platform_check
  check (platform = any (array['linkedin', 'instagram', 'facebook']));

alter table public.social_connections
  add column if not exists account_id text,
  add column if not exists account_name text;
