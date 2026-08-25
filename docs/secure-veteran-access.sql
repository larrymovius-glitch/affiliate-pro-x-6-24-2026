-- Apply in the Supabase SQL Editor after reviewing on a staging project.
-- This migration intentionally rebuilds all existing `profiles` policies. The
-- browser client must not be able to assign roles or veteran access directly,
-- but admins still need row-level write access for the rest of the admin panel
-- (role changes, user deletion) -- that access is restored explicitly below
-- instead of being dropped and never replaced.

-- Require authenticated users to see only their own profile, or any profile if
-- they're an admin. Veteran-status decisions are still made only through a
-- Vercel Function using the service-role key, never through this read access.
alter table public.profiles enable row level security;
do $$
declare policy_name text;
begin
  for policy_name in
    select policyname from pg_policies where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy %I on public.profiles', policy_name);
  end loop;
end $$;

create policy profiles_read_own_or_reviewer
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_update_own
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- Restores the admin-wide row access this migration's policy rebuild above
-- would otherwise remove -- the admin panel's role toggle and user deletion
-- both write to other users' profile rows.
create policy profiles_admin_write
on public.profiles for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- RLS controls rows; column privileges prevent browser clients from editing
-- authority-bearing columns on their own profile. Admin writes to these same
-- columns still go through the service-role-backed review endpoint, which
-- bypasses RLS and column grants alike.
revoke update (role, veteran_status, veteran_notes) on public.profiles from authenticated;

create table if not exists public.veteran_status_audit (
  id uuid primary key default gen_random_uuid(),
  subject_user_id uuid not null references public.profiles(id) on delete cascade,
  reviewer_user_id uuid not null references public.profiles(id),
  previous_status text not null,
  new_status text not null,
  reviewer_notes text,
  created_at timestamptz not null default now()
);
alter table public.veteran_status_audit enable row level security;
revoke all on public.veteran_status_audit from anon, authenticated;

-- Keep the status write and audit record atomic. This function is invoked only
-- by a Vercel Function with the Supabase service-role key after it authenticates
-- the reviewer.
create or replace function public.review_veteran_status(
  p_subject_user_id uuid,
  p_reviewer_user_id uuid,
  p_new_status text,
  p_reviewer_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous_status text;
begin
  select veteran_status into v_previous_status
  from public.profiles
  where id = p_subject_user_id
  for update;
  if not found then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set veteran_status = p_new_status,
      veteran_notes = nullif(btrim(p_reviewer_notes), '')
  where id = p_subject_user_id;

  insert into public.veteran_status_audit (
    subject_user_id, reviewer_user_id, previous_status, new_status, reviewer_notes
  ) values (
    p_subject_user_id, p_reviewer_user_id, coalesce(v_previous_status, 'regular'), p_new_status,
    nullif(btrim(p_reviewer_notes), '')
  );
end;
$$;
revoke all on function public.review_veteran_status(uuid, uuid, text, text) from public, anon, authenticated;

create table if not exists public.veteran_verification_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  status text not null default 'pending' check (status in ('pending', 'reviewed', 'rejected')),
  submitted_at timestamptz not null default now()
);
alter table public.veteran_verification_documents enable row level security;
revoke all on public.veteran_verification_documents from anon, authenticated;

-- The bucket is private. Upload URLs are minted only after the authenticated
-- Vercel Function validates file type, size, and the caller's user ID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'veteran-verification',
  'veteran-verification',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- Do not add `storage.objects` policies for this bucket. Signed URLs created by
-- the server are the sole browser upload/download path; raw storage API access
-- remains denied to anon and authenticated roles.
