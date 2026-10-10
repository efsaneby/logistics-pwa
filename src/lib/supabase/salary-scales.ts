import { createClient } from "@/lib/supabase/client";

export interface SalaryScaleVersion {
  id: string;
  effective_from: string;
  effective_to: string;
  full_time_hours_per_week: number;
  source_name: string;
  source_url: string;
}

export interface SalaryScaleRate {
  version_id: string;
  scale: string;
  step: number;
  monthly_gross: number;
  hourly_rate_100: number;
  hourly_rate_130: number;
  hourly_rate_150: number;
}

/** Fetches the salary table that applies on the supplied YYYY-MM-DD date. */
export async function getSalaryScaleRatesForDate(date: string) {
  const supabase = createClient();
  const { data: version, error: versionError } = await supabase
    .from("salary_scale_versions")
    .select("id, effective_from, effective_to, full_time_hours_per_week, source_name, source_url")
    .lte("effective_from", date)
    .gte("effective_to", date)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) throw versionError;
  if (!version) throw new Error(`No salary scale table is available for ${date}.`);

  const { data: rates, error: ratesError } = await supabase
    .from("salary_scale_rates")
    .select("version_id, scale, step, monthly_gross, hourly_rate_100, hourly_rate_130, hourly_rate_150")
    .eq("version_id", version.id)
    .order("scale", { ascending: true })
    .order("step", { ascending: true });

  if (ratesError) throw ratesError;
  return { version: version as SalaryScaleVersion, rates: (rates ?? []) as SalaryScaleRate[] };
}
