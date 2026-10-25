create table public.driver_vehicle_usages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  tractor_identifier text not null check (length(trim(tractor_identifier)) between 1 and 80),
  trailer_identifier text check (trailer_identifier is null or length(trim(trailer_identifier)) between 1 and 80),
  started_at timestamptz not null,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at is null or ended_at > started_at)
);

create index driver_vehicle_usages_user_started_idx
  on public.driver_vehicle_usages (user_id, started_at desc);

create unique index driver_vehicle_usages_one_active_per_user_idx
  on public.driver_vehicle_usages (user_id)
  where ended_at is null;

alter table public.driver_vehicle_usages enable row level security;
grant select on public.driver_vehicle_usages to authenticated;

create policy "Drivers can read their own vehicle usages"
  on public.driver_vehicle_usages for select to authenticated
  using (user_id = (select auth.uid()));

create function public.start_driver_vehicle_usage(
  p_tractor_identifier text,
  p_trailer_identifier text,
  p_started_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_active_started_at timestamptz;
  v_usage_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.';
  end if;
  if p_started_at is null or p_started_at > now() then
    raise exception 'The start time must not be in the future.';
  end if;
  if p_tractor_identifier is null or length(trim(p_tractor_identifier)) not between 1 and 80 then
    raise exception 'A valid tractor identifier is required.';
  end if;
  if p_trailer_identifier is not null and length(trim(p_trailer_identifier)) not between 1 and 80 then
    raise exception 'The trailer identifier is invalid.';
  end if;

  perform 1
  from public.driver_profiles
  where user_id = v_user_id
  for update;

  if not found then
    raise exception 'A driver profile is required.';
  end if;

  select started_at into v_active_started_at
  from public.driver_vehicle_usages
  where user_id = v_user_id and ended_at is null
  for update;

  if found and p_started_at <= v_active_started_at then
    raise exception 'The start time must be later than the current usage.';
  end if;

  update public.driver_vehicle_usages
  set ended_at = p_started_at
  where user_id = v_user_id and ended_at is null;

  insert into public.driver_vehicle_usages (
    user_id,
    tractor_identifier,
    trailer_identifier,
    started_at
  )
  values (
    v_user_id,
    trim(p_tractor_identifier),
    nullif(trim(p_trailer_identifier), ''),
    p_started_at
  )
  returning id into v_usage_id;

  return v_usage_id;
end;
$$;

revoke all on function public.start_driver_vehicle_usage(text, text, timestamptz) from public, anon;
grant execute on function public.start_driver_vehicle_usage(text, text, timestamptz) to authenticated;
