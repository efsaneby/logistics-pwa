-- Store each driver's optional one-way travel reimbursement and snapshot it per trip.
-- Existing profiles and trips start at EUR 0; no reimbursement is assumed retroactively.

alter table public.driver_profiles
  add column if not exists travel_cost_per_one_way numeric(10, 2) not null default 0
    check (travel_cost_per_one_way >= 0);

alter table public.trip_cards
  add column if not exists travel_cost_per_one_way numeric(10, 2) not null default 0
    check (travel_cost_per_one_way >= 0);
