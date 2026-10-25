create table public.standard_payroll_deductions (
  deduction_key text not null check (deduction_key in ('pension', 'wia', 'soob')),
  name text not null check (length(trim(name)) between 1 and 120),
  amount numeric(10, 2) not null check (amount >= 0),
  effective_from date not null,
  effective_to date,
  reduces_table_salary boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (deduction_key, effective_from),
  check (effective_to is null or effective_to >= effective_from)
);

create index standard_payroll_deductions_effective_idx
  on public.standard_payroll_deductions (deduction_key, effective_from, effective_to);

alter table public.standard_payroll_deductions enable row level security;
grant select on public.standard_payroll_deductions to authenticated;

create policy "Drivers can read standard payroll deductions"
  on public.standard_payroll_deductions for select to authenticated
  using (true);

insert into public.standard_payroll_deductions (
  deduction_key,
  name,
  amount,
  effective_from,
  reduces_table_salary
)
values
  ('pension', 'Pensioenfonds Vervoer Wn', 321.33, '2026-10-01', true),
  ('wia', 'WIA Premie TLN CAO Wn', 28.46, '2026-10-01', true),
  ('soob', 'Stichting Opleidings- en Ontwikkelingsfonds Wn', 12.23, '2026-10-01', true);

delete from public.driver_deductions
where lower(trim(name)) in ('pensioen', 'pensioenpremie', 'wia', 'soob')
   or lower(name) like '%pensioenfonds vervoer%'
   or lower(name) like 'wia premie tln cao%'
   or lower(name) like '%stichting opleidings%ontwikkelingsfonds%'
   or lower(name) like '%soob%';
