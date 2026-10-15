-- Allow drivers to update their own work and trip records from the daily detail view.
grant update on public.work_cards, public.trip_cards to authenticated;

create policy "Drivers can update their own work records"
  on public.work_cards for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Drivers can update their own trip records"
  on public.trip_cards for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
