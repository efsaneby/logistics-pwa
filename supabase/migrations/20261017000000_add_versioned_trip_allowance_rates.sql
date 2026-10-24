create table public.trip_allowance_versions (
  id uuid primary key default gen_random_uuid(),
  effective_from date not null unique,
  effective_to date not null,
  source_name text not null,
  source_url text not null default '',
  single_day_minimum_hours numeric(4, 2) not null check (single_day_minimum_hours >= 0),
  single_day_day_rate_per_hour numeric(7, 4) not null check (single_day_day_rate_per_hour >= 0),
  single_day_evening_rate_per_hour numeric(7, 4) not null check (single_day_evening_rate_per_hour >= 0),
  single_day_evening_start_hour smallint not null check (single_day_evening_start_hour between 0 and 23),
  multi_day_intermediate_day_amount numeric(8, 2) not null check (multi_day_intermediate_day_amount >= 0),
  created_at timestamptz not null default now(),
  constraint trip_allowance_versions_valid_period check (effective_to >= effective_from)
);

create table public.trip_allowance_matrix (
  version_id uuid not null references public.trip_allowance_versions(id) on delete cascade,
  day_type text not null check (day_type in ('first', 'last')),
  hour smallint not null check (hour between 0 and 24),
  amount numeric(8, 2) not null check (amount >= 0),
  primary key (version_id, day_type, hour)
);

alter table public.trip_allowance_versions enable row level security;
alter table public.trip_allowance_matrix enable row level security;

grant select on public.trip_allowance_versions to anon, authenticated;
grant select on public.trip_allowance_matrix to anon, authenticated;

create policy "Trip allowance versions are readable by everyone"
  on public.trip_allowance_versions for select
  to anon, authenticated
  using (true);

create policy "Trip allowance matrix is readable by everyone"
  on public.trip_allowance_matrix for select
  to anon, authenticated
  using (true);

with version as (
  insert into public.trip_allowance_versions (
    effective_from,
    effective_to,
    source_name,
    single_day_minimum_hours,
    single_day_day_rate_per_hour,
    single_day_evening_rate_per_hour,
    single_day_evening_start_hour,
    multi_day_intermediate_day_amount
  )
  values (
    '2026-01-01',
    '2026-12-31',
    'Existing TruckLog 2026 trip allowance rates',
    4,
    0.83,
    3.77,
    18,
    65.04
  )
  returning id
)
insert into public.trip_allowance_matrix (version_id, day_type, hour, amount)
select version.id, rates.day_type, rates.hour, rates.amount
from version
cross join (values
  ('first', 0, 52.79), ('first', 1, 52.79), ('first', 2, 51.14),
  ('first', 3, 49.49), ('first', 4, 47.84), ('first', 5, 46.19),
  ('first', 6, 44.54), ('first', 7, 42.89), ('first', 8, 41.24),
  ('first', 9, 39.59), ('first', 10, 37.94), ('first', 11, 36.29),
  ('first', 12, 34.64), ('first', 13, 32.99), ('first', 14, 31.34),
  ('first', 15, 29.69), ('first', 16, 28.04), ('first', 17, 11.55),
  ('first', 18, 9.90), ('first', 19, 8.25), ('first', 20, 6.60),
  ('first', 21, 4.95), ('first', 22, 3.30), ('first', 23, 1.65),
  ('first', 24, 0.00),
  ('last', 0, 0.00), ('last', 1, 1.65), ('last', 2, 3.30),
  ('last', 3, 4.95), ('last', 4, 6.60), ('last', 5, 8.25),
  ('last', 6, 9.90), ('last', 7, 11.55), ('last', 8, 13.20),
  ('last', 9, 14.85), ('last', 10, 16.50), ('last', 11, 18.15),
  ('last', 12, 19.80), ('last', 13, 34.17), ('last', 14, 35.82),
  ('last', 15, 37.47), ('last', 16, 39.12), ('last', 17, 40.77),
  ('last', 18, 42.42), ('last', 19, 46.19), ('last', 20, 49.96),
  ('last', 21, 53.73), ('last', 22, 57.50), ('last', 23, 61.27),
  ('last', 24, 65.04)
) as rates(day_type, hour, amount);
