alter table public.work_cards
  add column if not exists is_overnight boolean not null default false;

alter table public.trip_cards
  add column if not exists generated_start_work_id uuid
    references public.work_cards(id) on delete cascade,
  add column if not exists generated_end_work_id uuid
    references public.work_cards(id) on delete cascade;

alter table public.trip_cards
  add constraint trip_cards_user_generated_start_key
  unique (user_id, generated_start_work_id);
