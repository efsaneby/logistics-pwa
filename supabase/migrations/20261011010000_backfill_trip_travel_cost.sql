-- Apply each driver's current one-way reimbursement to historical trips that
-- were created before the trip snapshot column existed (and therefore defaulted to 0).
-- This is a one-time backfill; future trips snapshot the profile rate in the app.

update public.trip_cards as trips
set travel_cost_per_one_way = profiles.travel_cost_per_one_way
from public.driver_profiles as profiles
where trips.user_id = profiles.user_id
  and trips.travel_cost_per_one_way = 0
  and profiles.travel_cost_per_one_way > 0;
