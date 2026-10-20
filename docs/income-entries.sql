-- Tax Year Income Report (Payouts page): money a member received, typed in
-- from each network's payment statement. Networks pay members directly and
-- most never report back to APX, so conversion_events alone would show $0
-- for a year that had real income. Applied to production on 2026-10-19.

create table if not exists public.income_entries (
  id uuid primary key default gen_random_uuid(),
  created_by_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  received_on date not null,
  source text not null check (char_length(source) between 1 and 80),
  amount numeric(12, 2) not null check (amount >= 0),
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);

create index if not exists income_entries_owner_date on public.income_entries (created_by_id, received_on);

alter table public.income_entries enable row level security;

create policy "Users manage own income entries" on public.income_entries
  for all
  using ((select auth.uid()) = created_by_id)
  with check ((select auth.uid()) = created_by_id);
