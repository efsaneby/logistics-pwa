-- Let each driver mark which employee deductions reduce the loonheffing table salary.
-- Existing deductions default to false and can be reviewed in the profile.

alter table public.driver_deductions
  add column if not exists reduces_table_salary boolean not null default false;
