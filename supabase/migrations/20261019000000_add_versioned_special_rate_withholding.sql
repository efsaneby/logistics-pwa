-- Keep the special-rate withholding percentage effective-dated with the
-- monthly loonheffing table so annual rate updates do not require code changes.
alter table public.loonheffing_table_versions
  add column special_rate_withholding_rate numeric(6, 5);

update public.loonheffing_table_versions
set special_rate_withholding_rate = 0.5047;

alter table public.loonheffing_table_versions
  alter column special_rate_withholding_rate set not null,
  add constraint loonheffing_special_rate_withholding_range
    check (special_rate_withholding_rate between 0 and 1);
