grant delete on public.driver_vehicle_usages to authenticated;

create policy "Drivers can delete their own vehicle usages"
  on public.driver_vehicle_usages for delete to authenticated
  using (user_id = (select auth.uid()));
