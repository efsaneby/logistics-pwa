create table public.driver_absences (
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  absence_type text not null check (absence_type in ('sick', 'vacation')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

create index driver_absences_user_date_idx
  on public.driver_absences (user_id, date);

alter table public.driver_absences enable row level security;
grant select, insert, update, delete on public.driver_absences to authenticated;

create policy "Drivers can read their own absences"
  on public.driver_absences for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Drivers can create their own absences"
  on public.driver_absences for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Drivers can update their own absences"
  on public.driver_absences for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Drivers can delete their own absences"
  on public.driver_absences for delete to authenticated
  using (user_id = (select auth.uid()));

create function public.prevent_work_absence_overlap()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'work_cards' then
    if exists (
      select 1
      from public.driver_absences
      where user_id = new.user_id
        and date = new.date
    ) then
      raise exception 'A work record and an absence cannot be registered on the same day.';
    end if;
  else
    if exists (
      select 1
      from public.work_cards
      where user_id = new.user_id
        and date = new.date
    ) then
      raise exception 'An absence and a work record cannot be registered on the same day.';
    end if;
  end if;
  return new;
end;
$$;

create trigger prevent_absence_on_work_day
  before insert or update of user_id, date on public.driver_absences
  for each row execute function public.prevent_work_absence_overlap();

create trigger prevent_work_on_absence_day
  before insert or update of user_id, date on public.work_cards
  for each row execute function public.prevent_work_absence_overlap();
