-- Add private driver profiles and make each driver's work and trip records private.
-- Existing anonymous rows are deliberately retained with user_id = NULL and are
-- hidden by the new authenticated-user policies until an administrator assigns them.

create table public.driver_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text not null check (length(trim(first_name)) > 0),
  last_name text not null check (length(trim(last_name)) > 0),
  scale text not null check (scale in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  step smallint not null check (step between 1 and 10),
  contract_hours_per_week numeric(4, 1) not null check (contract_hours_per_week > 0 and contract_hours_per_week <= 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.driver_profiles enable row level security;
grant select, insert, update, delete on public.driver_profiles to authenticated;

create policy "Drivers can read their own profile"
  on public.driver_profiles for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Drivers can create their own profile"
  on public.driver_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Drivers can update their own profile"
  on public.driver_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Drivers can delete their own profile"
  on public.driver_profiles for delete to authenticated
  using (user_id = (select auth.uid()));

alter table public.work_cards
  add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.trip_cards
  add column if not exists user_id uuid references auth.users(id) on delete cascade;

alter table public.work_cards alter column user_id set default auth.uid();
alter table public.trip_cards alter column user_id set default auth.uid();

create index if not exists work_cards_user_date_idx on public.work_cards (user_id, date);
create index if not exists trip_cards_user_departure_idx on public.trip_cards (user_id, departure_time);

-- Remove any previous permissive policies on these shared tables before enabling
-- owner-only access; PostgreSQL combines permissive policies with OR semantics.
do $$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in ('work_cards', 'trip_cards')
  loop
    execute format('drop policy %I on %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  end loop;
end
$$;

alter table public.work_cards enable row level security;
alter table public.trip_cards enable row level security;

revoke all on public.work_cards, public.trip_cards from anon;
grant select, insert, delete on public.work_cards, public.trip_cards to authenticated;

create policy "Drivers can read their own work records"
  on public.work_cards for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Drivers can create their own work records"
  on public.work_cards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Drivers can delete their own work records"
  on public.work_cards for delete to authenticated
  using (user_id = (select auth.uid()));

create policy "Drivers can read their own trip records"
  on public.trip_cards for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Drivers can create their own trip records"
  on public.trip_cards for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Drivers can delete their own trip records"
  on public.trip_cards for delete to authenticated
  using (user_id = (select auth.uid()));
