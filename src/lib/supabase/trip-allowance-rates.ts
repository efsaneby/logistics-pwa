import type { TripAllowanceRates } from "@/lib/calculator/verblijfskosten";
import { createClient } from "@/lib/supabase/client";

interface TripAllowanceVersion {
  id: string;
  effective_from: string;
  effective_to: string;
  single_day_minimum_hours: number;
  single_day_day_rate_per_hour: number;
  single_day_evening_rate_per_hour: number;
  single_day_evening_start_hour: number;
  multi_day_intermediate_day_amount: number;
}

interface TripAllowanceMatrixRow {
  day_type: "first" | "last";
  hour: number;
  amount: number;
}

const ratesByDate = new Map<string, Promise<TripAllowanceRates>>();

export function getTripAllowanceRatesForDate(date: string): Promise<TripAllowanceRates> {
  const cached = ratesByDate.get(date);
  if (cached) return cached;

  const ratesPromise = loadTripAllowanceRates(date);
  ratesByDate.set(date, ratesPromise);
  void ratesPromise.catch(() => ratesByDate.delete(date));
  return ratesPromise;
}

async function loadTripAllowanceRates(date: string): Promise<TripAllowanceRates> {
  const supabase = createClient();
  const { data: version, error: versionError } = await supabase
    .from("trip_allowance_versions")
    .select("id, effective_from, effective_to, single_day_minimum_hours, single_day_day_rate_per_hour, single_day_evening_rate_per_hour, single_day_evening_start_hour, multi_day_intermediate_day_amount")
    .lte("effective_from", date)
    .gte("effective_to", date)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (versionError) throw versionError;
  if (!version) throw new Error(`No trip allowance rates are available for ${date}.`);

  const typedVersion = version as TripAllowanceVersion;
  const { data: matrix, error: matrixError } = await supabase
    .from("trip_allowance_matrix")
    .select("day_type, hour, amount")
    .eq("version_id", typedVersion.id);

  if (matrixError) throw matrixError;
  if (!matrix?.length) {
    throw new Error(`Trip allowance matrix is missing for rates effective on ${date}.`);
  }

  const firstDayAmountByHour: Record<number, number> = {};
  const lastDayAmountByHour: Record<number, number> = {};
  for (const row of matrix as TripAllowanceMatrixRow[]) {
    if (row.day_type === "first") firstDayAmountByHour[row.hour] = Number(row.amount);
    else lastDayAmountByHour[row.hour] = Number(row.amount);
  }

  return {
    single_day_minimum_hours: Number(typedVersion.single_day_minimum_hours),
    single_day_day_rate_per_hour: Number(typedVersion.single_day_day_rate_per_hour),
    single_day_evening_rate_per_hour: Number(typedVersion.single_day_evening_rate_per_hour),
    single_day_evening_start_hour: typedVersion.single_day_evening_start_hour,
    multi_day_intermediate_day_amount: Number(typedVersion.multi_day_intermediate_day_amount),
    first_day_amount_by_hour: firstDayAmountByHour,
    last_day_amount_by_hour: lastDayAmountByHour,
  };
}
