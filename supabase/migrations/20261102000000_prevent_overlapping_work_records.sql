create or replace function public.prevent_overlapping_work_records()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  new_start timestamp;
  new_end timestamp;
begin
  if new.user_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.user_id::text));

  new_start := new.date + new.start_time;
  new_end := new.date + new.end_time;
  if new.end_time <= new.start_time then
    new_end := new_end + interval '1 day';
  end if;

  if exists (
    select 1
    from public.work_cards existing
    where existing.user_id = new.user_id
      and existing.id is distinct from new.id
      and existing.date + existing.start_time < new_end
      and existing.date + existing.end_time
        + case
            when existing.end_time <= existing.start_time then interval '1 day'
            else interval '0 day'
          end > new_start
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'Deze werktijd overlapt met een bestaande werktijd.';
  end if;

  return new;
end;
$$;

create trigger prevent_overlapping_work_records
  before insert or update of user_id, date, start_time, end_time
  on public.work_cards
  for each row
  execute function public.prevent_overlapping_work_records();
