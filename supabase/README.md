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

`migrations/20261011000000_add_trip_travel_cost.sql`

`migrations/20261011010000_backfill_trip_travel_cost.sql`

`migrations/20261015000000_allow_record_updates.sql`

`migrations/20261015010000_add_driver_day_notes.sql`

`migrations/20261016000000_add_overnight_work_and_generated_trips.sql`

`migrations/20261017000000_add_versioned_trip_allowance_rates.sql`

The app's anonymous browser client can read the salary data after the first
migration runs. Salary table writes are restricted to database administrators.
The second migration grants each signed-in driver access only to their own
profile and records.
The third migration adds private, per-driver payroll deduction settings.
The fourth migration lets each driver mark which deductions reduce their table salary.
The fifth migration adds the official 2026 white monthly loonheffing table and the profile options for loonheffingskorting and AOW category. It includes all wage brackets from the source PDF.
The sixth migration adds an optional one-way travel reimbursement to each driver profile and stores the rate used on each trip. Existing trips default to €0. The seventh migration fills zero-valued historical trip rates from each driver's current profile rate, once. A trip adds one one-way amount on its departure date and one on its return date; these may fall in different months.

The eighth migration allows drivers to update their own work and trip records from the daily detail view.
The ninth migration adds private, per-driver notes for each calendar day.
The tenth migration adds an overnight flag to work records and links automatically
generated trips to their first and last work records. Apply it after the previous
migrations before using automatic trip creation.
The eleventh migration creates effective-dated trip allowance versions and the
first-day/last-day multi-day allowance matrix. It seeds the existing 2026 rates.
Apply it before deploying code that reads the versioned trip allowance tables.

For future annual trip allowance updates, add a new `trip_allowance_versions`
row with its effective date range and source, then insert its first-day and
last-day hourly rows into `trip_allowance_matrix`. Keep prior versions intact:
trips use the rate version effective on their departure date.

If the first five migrations have already been applied, run `migrations/20261011000000_add_trip_travel_cost.sql` and then `migrations/20261011010000_backfill_trip_travel_cost.sql` for this change. If the sixth migration has already run, run only the seventh migration to populate historical trips.

Run `migrations/20261015000000_allow_record_updates.sql` to enable editing saved work and trip records.

Run `migrations/20261015010000_add_driver_day_notes.sql` to enable private daily notes.

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
