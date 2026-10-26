alter table public.standard_payroll_deductions
  drop constraint if exists standard_payroll_deductions_deduction_key_check;

alter table public.standard_payroll_deductions
  add constraint standard_payroll_deductions_deduction_key_check
  check (deduction_key in ('pension', 'wia', 'soob', 'wga', 'personnel'));

insert into public.standard_payroll_deductions (
  deduction_key,
  name,
  amount,
  effective_from,
  reduces_table_salary
)
values
  ('wga', 'WGA', 25.63, '2026-10-01', true),
  ('personnel', 'Personeelsvereniging', 7.00, '2026-10-01', true);

create table public.driver_standard_payroll_deduction_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  deduction_key text not null check (deduction_key in ('pension', 'wia', 'soob', 'wga', 'personnel')),
  amount_override numeric(10, 2) check (amount_override is null or amount_override >= 0),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, deduction_key)
);

alter table public.driver_standard_payroll_deduction_preferences enable row level security;
grant select, insert, update, delete on public.driver_standard_payroll_deduction_preferences to authenticated;

create policy "Drivers can read their standard deduction preferences"
  on public.driver_standard_payroll_deduction_preferences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Drivers can create their standard deduction preferences"
  on public.driver_standard_payroll_deduction_preferences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Drivers can update their standard deduction preferences"
  on public.driver_standard_payroll_deduction_preferences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Drivers can delete their standard deduction preferences"
  on public.driver_standard_payroll_deduction_preferences for delete to authenticated
  using (user_id = (select auth.uid()));

with matched_deductions as (
  select distinct on (deductions.user_id, mapped.deduction_key)
    deductions.user_id,
    mapped.deduction_key,
    deductions.value
  from public.driver_deductions as deductions
  cross join lateral (
    select case
      when lower(deductions.name) like '%pensioenfonds vervoer%'
        or lower(trim(deductions.name)) in ('pensioen', 'pensioenpremie') then 'pension'
      when lower(deductions.name) like 'wia premie tln cao%'
        or lower(trim(deductions.name)) = 'wia' then 'wia'
      when lower(deductions.name) like '%stichting opleidings%ontwikkelingsfonds%'
        or lower(deductions.name) like '%soob%' then 'soob'
      when lower(deductions.name) like '%wga%' then 'wga'
      when lower(deductions.name) like '%personeelsvereniging%' then 'personnel'
    end as deduction_key
  ) as mapped
  where mapped.deduction_key is not null
    and deductions.calculation_type = 'fixed'
  order by deductions.user_id, mapped.deduction_key, deductions.created_at desc
)
insert into public.driver_standard_payroll_deduction_preferences (
  user_id,
  deduction_key,
  amount_override,
  enabled
)
select user_id, deduction_key, value, true
from matched_deductions
on conflict (user_id, deduction_key) do nothing;

delete from public.driver_deductions
where lower(trim(name)) in ('pensioen', 'pensioenpremie', 'wia', 'soob')
   or lower(name) like '%pensioenfonds vervoer%'
   or lower(name) like 'wia premie tln cao%'
   or lower(name) like '%stichting opleidings%ontwikkelingsfonds%'
   or lower(name) like '%soob%'
   or lower(name) like '%wga%'
   or lower(name) like '%personeelsvereniging%';
