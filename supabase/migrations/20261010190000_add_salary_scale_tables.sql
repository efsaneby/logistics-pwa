-- TLN salary scales, versioned by the date each rate becomes effective.
-- Public salary data is readable by app users; only database administrators can edit it.

create table public.salary_scale_versions (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  effective_to date not null,
  full_time_hours_per_week numeric(4, 1) not null default 40,
  source_name text not null,
  source_url text not null,
  created_at timestamptz not null default now(),
  constraint salary_scale_versions_valid_period check (effective_to >= effective_from),
  constraint salary_scale_versions_valid_hours check (full_time_hours_per_week > 0)
);

create table public.salary_scale_rates (
  version_id uuid not null references public.salary_scale_versions(id) on delete cascade,
  scale text not null check (scale in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  step smallint not null check (step between 1 and 10),
  monthly_gross numeric(10, 2) not null check (monthly_gross >= 0),
  hourly_rate_100 numeric(7, 2) not null check (hourly_rate_100 >= 0),
  hourly_rate_130 numeric(7, 2) not null check (hourly_rate_130 >= 0),
  hourly_rate_150 numeric(7, 2) not null check (hourly_rate_150 >= 0),
  primary key (version_id, scale, step)
);

create index salary_scale_rates_scale_step_idx
  on public.salary_scale_rates (scale, step);

alter table public.salary_scale_versions enable row level security;
alter table public.salary_scale_rates enable row level security;

grant select on public.salary_scale_versions to anon, authenticated;
grant select on public.salary_scale_rates to anon, authenticated;

create policy "Salary scale versions are readable by everyone"
  on public.salary_scale_versions for select
  to anon, authenticated
  using (true);

create policy "Salary scale rates are readable by everyone"
  on public.salary_scale_rates for select
  to anon, authenticated
  using (true);

-- January rates from the supplied 1 January 2026 TLN table.
with version as (
  insert into public.salary_scale_versions
    (effective_from, effective_to, full_time_hours_per_week, source_name, source_url)
  values
    ('2026-01-01', '2026-06-30', 40, 'TLN Functieloonschalen per 1 januari 2026',
     'https://www.fnv.nl/getmedia/102c82ac-e8a3-4c7d-afb4-bfe4cea23736/498-tln-loontabel-per-1-januari-2026.pdf')
  returning id
)
insert into public.salary_scale_rates
  (version_id, scale, step, monthly_gross, hourly_rate_100, hourly_rate_130, hourly_rate_150)
select version.id, rates.scale, rates.step, rates.monthly_gross, rates.hourly_rate_100, rates.hourly_rate_130, rates.hourly_rate_150
from version
cross join (values
  ('A', 1, 2559.54, 14.71, 19.12, 22.07),
  ('A', 2, 2573.49, 14.80, 19.24, 22.20),
  ('A', 3, 2676.41, 15.39, 20.01, 23.09),
  ('A', 4, 2783.46, 16.00, 20.80, 24.00),
  ('A', 5, 2894.81, 16.64, 21.63, 24.96),
  ('A', 6, 3010.60, 17.31, 22.50, 25.97),
  ('B', 1, 2604.97, 14.98, 19.47, 22.47),
  ('B', 2, 2709.15, 15.58, 20.25, 23.37),
  ('B', 3, 2817.50, 16.20, 21.06, 24.30),
  ('B', 4, 2930.20, 16.85, 21.91, 25.28),
  ('B', 5, 3047.43, 17.52, 22.78, 26.28),
  ('B', 6, 3169.34, 18.22, 23.69, 27.33),
  ('C', 1, 2717.80, 15.63, 20.32, 23.45),
  ('C', 2, 2826.50, 16.25, 21.13, 24.38),
  ('C', 3, 2939.55, 16.90, 21.97, 25.35),
  ('C', 4, 3057.12, 17.58, 22.85, 26.37),
  ('C', 5, 3179.39, 18.28, 23.76, 27.42),
  ('C', 6, 3306.57, 19.01, 24.71, 28.52),
  ('D', 1, 2893.55, 16.64, 21.63, 24.96),
  ('D', 2, 3009.29, 17.30, 22.49, 25.95),
  ('D', 3, 3129.65, 17.99, 23.39, 26.99),
  ('D', 4, 3254.83, 18.71, 24.32, 28.07),
  ('D', 5, 3385.00, 19.46, 25.30, 29.19),
  ('D', 6, 3520.40, 20.24, 26.31, 30.36),
  ('E', 1, 3034.77, 17.45, 22.69, 26.18),
  ('E', 2, 3156.17, 18.15, 23.60, 27.23),
  ('E', 3, 3282.44, 18.87, 24.53, 28.31),
  ('E', 4, 3413.75, 19.63, 25.52, 29.45),
  ('E', 5, 3550.32, 20.41, 26.53, 30.62),
  ('E', 6, 3692.32, 21.23, 27.60, 31.85),
  ('E', 7, 3840.02, 22.08, 28.70, 33.12),
  ('F', 1, 3171.82, 18.24, 23.71, 27.36),
  ('F', 2, 3298.70, 18.97, 24.66, 28.46),
  ('F', 3, 3430.66, 19.73, 25.65, 29.60),
  ('F', 4, 3567.88, 20.51, 26.66, 30.77),
  ('F', 5, 3710.58, 21.34, 27.74, 32.01),
  ('F', 6, 3859.02, 22.19, 28.85, 33.29),
  ('F', 7, 4013.38, 23.08, 30.00, 34.62),
  ('F', 8, 4173.91, 24.00, 31.20, 36.00),
  ('G', 1, 3350.79, 19.27, 25.05, 28.91),
  ('G', 2, 3484.84, 20.04, 26.05, 30.06),
  ('G', 3, 3624.23, 20.84, 27.09, 31.26),
  ('G', 4, 3769.19, 21.67, 28.17, 32.51),
  ('G', 5, 3919.94, 22.54, 29.30, 33.81),
  ('G', 6, 4076.73, 23.44, 30.47, 35.16),
  ('G', 7, 4239.78, 24.38, 31.69, 36.57),
  ('G', 8, 4409.35, 25.35, 32.96, 38.03),
  ('G', 9, 4585.71, 26.37, 34.28, 39.56),
  ('H', 1, 3530.40, 20.30, 26.39, 30.45),
  ('H', 2, 3671.63, 21.11, 27.44, 31.67),
  ('H', 3, 3818.50, 21.96, 28.55, 32.94),
  ('H', 4, 3971.25, 22.83, 29.68, 34.25),
  ('H', 5, 4130.08, 23.75, 30.88, 35.63),
  ('H', 6, 4295.26, 24.70, 32.11, 37.05),
  ('H', 7, 4467.05, 25.68, 33.38, 38.52),
  ('H', 8, 4645.75, 26.71, 34.72, 40.07),
  ('H', 9, 4831.58, 27.78, 36.11, 41.67),
  ('H', 10, 5024.85, 28.89, 37.56, 43.34)
) as rates(scale, step, monthly_gross, hourly_rate_100, hourly_rate_130, hourly_rate_150);

-- July rates from the TLN update following the statutory minimum-wage increase.
with version as (
  insert into public.salary_scale_versions
    (effective_from, effective_to, full_time_hours_per_week, source_name, source_url)
  values
    ('2026-07-01', '2026-12-31', 40, 'TLN Functieloonschalen per 1 juli 2026',
     'https://www.fnv.nl/getmedia/84ea4380-581d-4158-aa70-584cf3da09ae/TLN-loontabellen-1-juli-2026.pdf')
  returning id
)
insert into public.salary_scale_rates
  (version_id, scale, step, monthly_gross, hourly_rate_100, hourly_rate_130, hourly_rate_150)
select version.id, rates.scale, rates.step, rates.monthly_gross, rates.hourly_rate_100, rates.hourly_rate_130, rates.hourly_rate_150
from version
cross join (values
  ('A', 1, 2608.26, 14.99, 19.49, 22.49),
  ('A', 2, 2608.26, 14.99, 19.49, 22.49),
  ('A', 3, 2676.41, 15.39, 20.01, 23.09),
  ('A', 4, 2783.46, 16.00, 20.80, 24.00),
  ('A', 5, 2894.81, 16.64, 21.63, 24.96),
  ('A', 6, 3010.60, 17.31, 22.50, 25.97),
  ('B', 1, 2608.26, 14.99, 19.49, 22.49),
  ('B', 2, 2709.15, 15.58, 20.25, 23.37),
  ('B', 3, 2817.50, 16.20, 21.06, 24.30),
  ('B', 4, 2930.20, 16.85, 21.91, 25.28),
  ('B', 5, 3047.43, 17.52, 22.78, 26.28),
  ('B', 6, 3169.34, 18.22, 23.69, 27.33),
  ('C', 1, 2717.80, 15.63, 20.32, 23.45),
  ('C', 2, 2826.50, 16.25, 21.13, 24.38),
  ('C', 3, 2939.55, 16.90, 21.97, 25.35),
  ('C', 4, 3057.12, 17.58, 22.85, 26.37),
  ('C', 5, 3179.39, 18.28, 23.76, 27.42),
  ('C', 6, 3306.57, 19.01, 24.71, 28.52),
  ('D', 1, 2893.55, 16.64, 21.63, 24.96),
  ('D', 2, 3009.29, 17.30, 22.49, 25.95),
  ('D', 3, 3129.65, 17.99, 23.39, 26.99),
  ('D', 4, 3254.83, 18.71, 24.32, 28.07),
  ('D', 5, 3385.00, 19.46, 25.30, 29.19),
  ('D', 6, 3520.40, 20.24, 26.31, 30.36),
  ('E', 1, 3034.77, 17.45, 22.69, 26.18),
  ('E', 2, 3156.17, 18.15, 23.60, 27.23),
  ('E', 3, 3282.44, 18.87, 24.53, 28.31),
  ('E', 4, 3413.75, 19.63, 25.52, 29.45),
  ('E', 5, 3550.32, 20.41, 26.53, 30.62),
  ('E', 6, 3692.32, 21.23, 27.60, 31.85),
  ('E', 7, 3840.02, 22.08, 28.70, 33.12),
  ('F', 1, 3171.82, 18.24, 23.71, 27.36),
  ('F', 2, 3298.70, 18.97, 24.66, 28.46),
  ('F', 3, 3430.66, 19.73, 25.65, 29.60),
  ('F', 4, 3567.88, 20.51, 26.66, 30.77),
  ('F', 5, 3710.58, 21.34, 27.74, 32.01),
  ('F', 6, 3859.02, 22.19, 28.85, 33.29),
  ('F', 7, 4013.38, 23.08, 30.00, 34.62),
  ('F', 8, 4173.91, 24.00, 31.20, 36.00),
  ('G', 1, 3350.79, 19.27, 25.05, 28.91),
  ('G', 2, 3484.84, 20.04, 26.05, 30.06),
  ('G', 3, 3624.23, 20.84, 27.09, 31.26),
  ('G', 4, 3769.19, 21.67, 28.17, 32.51),
  ('G', 5, 3919.94, 22.54, 29.30, 33.81),
  ('G', 6, 4076.73, 23.44, 30.47, 35.16),
  ('G', 7, 4239.78, 24.38, 31.69, 36.57),
  ('G', 8, 4409.35, 25.35, 32.96, 38.03),
  ('G', 9, 4585.71, 26.37, 34.28, 39.56),
  ('H', 1, 3530.40, 20.30, 26.39, 30.45),
  ('H', 2, 3671.63, 21.11, 27.44, 31.67),
  ('H', 3, 3818.50, 21.96, 28.55, 32.94),
  ('H', 4, 3971.25, 22.83, 29.68, 34.25),
  ('H', 5, 4130.08, 23.75, 30.88, 35.63),
  ('H', 6, 4295.26, 24.70, 32.11, 37.05),
  ('H', 7, 4467.05, 25.68, 33.38, 38.52),
  ('H', 8, 4645.75, 26.71, 34.72, 40.07),
  ('H', 9, 4831.58, 27.78, 36.11, 41.67),
  ('H', 10, 5024.85, 28.89, 37.56, 43.34)
) as rates(scale, step, monthly_gross, hourly_rate_100, hourly_rate_130, hourly_rate_150);
