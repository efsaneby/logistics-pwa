# Salary scale data

The first migration creates versioned public read-only salary tables and seeds
the TLN January and July 2026 tables. July is stored as a separate effective
period so the app can show the rates that applied to a selected month while
keeping older rates intact.

The second migration creates private driver profiles and assigns work and trip
records to authenticated users. Run migrations in filename order.

## Apply the migration

This project is not linked to the Supabase CLI. In the Supabase dashboard for
the project configured in `.env.local`, open **SQL Editor**, paste and run the
contents of these files in filename order:

`migrations/20261010190000_add_salary_scale_tables.sql`

`migrations/20261010200000_add_profiles_and_user_ownership.sql`

`migrations/20261010210000_add_driver_deductions.sql`

`migrations/20261010220000_add_table_salary_deduction_flag.sql`

`migrations/20261010230000_add_2026_monthly_loonheffing_table.sql`

The app's anonymous browser client can read the salary data after the first
migration runs. Salary table writes are restricted to database administrators.
The second migration grants each signed-in driver access only to their own
profile and records.
The third migration adds private, per-driver payroll deduction settings.
The fourth migration lets each driver mark which deductions reduce their table salary.
The fifth migration adds the official 2026 white monthly loonheffing table and the profile options for loonheffingskorting and AOW category. It includes all wage brackets from the source PDF.

In **Authentication → Providers**, enable Email sign-in. Set the project Site
URL and allowed redirect URLs to the deployed app URL (and the local development
URL if needed). Email confirmation behavior is controlled by the Supabase Auth
settings.

Existing work and trip rows without an owner are preserved, but hidden from
signed-in users. Assign any historical rows that should be kept to the correct
user from an administrator session before or after enabling this migration.

## Add a future rate update

Add a new migration that inserts a `salary_scale_versions` row with its effective
date range, source title, and source URL, then inserts every scale and step for
that version into `salary_scale_rates`. Keep prior versions unchanged so older
months continue to resolve to their original rates.

The app helper `getSalaryScaleRatesForDate()` in
`src/lib/supabase/salary-scales.ts` selects the effective version for a date.
