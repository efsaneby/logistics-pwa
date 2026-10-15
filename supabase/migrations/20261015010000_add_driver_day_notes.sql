-- Store one private note per driver and calendar day.
create table public.driver_day_notes (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  date date not null,
  note text not null check (length(trim(note)) between 1 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table public.driver_day_notes enable row level security;
grant select, insert, update, delete on public.driver_day_notes to authenticated;

create policy "Drivers can read their own day notes"
  on public.driver_day_notes for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Drivers can create their own day notes"
  on public.driver_day_notes for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Drivers can update their own day notes"
  on public.driver_day_notes for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "Drivers can delete their own day notes"
  on public.driver_day_notes for delete to authenticated
  using (user_id = (select auth.uid()));
