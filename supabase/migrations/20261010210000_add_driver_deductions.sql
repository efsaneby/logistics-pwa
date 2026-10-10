-- Store each driver's configurable payroll deductions.
-- Percentage values are stored for later payroll calculations; this migration
-- does not define their calculation base or apply them to net pay.

create table public.driver_deductions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  calculation_type text not null check (calculation_type in ('fixed', 'percentage')),
  value numeric(10, 3) not null check (value >= 0),
  created_at timestamptz not null default now()
);

create index driver_deductions_user_created_idx
  on public.driver_deductions (user_id, created_at);

alter table public.driver_deductions enable row level security;
revoke all on public.driver_deductions from anon;
grant select, insert, update, delete on public.driver_deductions to authenticated;

create policy "Drivers can read their own deductions"
  on public.driver_deductions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Drivers can create their own deductions"
  on public.driver_deductions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Drivers can update their own deductions"
  on public.driver_deductions for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Drivers can delete their own deductions"
  on public.driver_deductions for delete to authenticated
  using (user_id = (select auth.uid()));
