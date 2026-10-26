import { createClient } from "@/lib/supabase/client";

export type StandardPayrollDeductionKey = "pension" | "wia" | "soob" | "wga" | "personnel";

export type StandardPayrollDeduction = {
  deduction_key: StandardPayrollDeductionKey;
  name: string;
  default_amount: number;
  amount: number;
  enabled: boolean;
  reduces_table_salary: boolean;
};

const standardDeductionKeys = new Set<StandardPayrollDeductionKey>([
  "pension",
  "wia",
  "soob",
  "wga",
  "personnel",
]);
const originalStandardDeductionKeys = new Set<StandardPayrollDeductionKey>([
  "pension",
  "wia",
  "soob",
]);
const standardDeductionsStartDate = "2026-10-01";

function isStandardDeductionKey(value: string): value is StandardPayrollDeductionKey {
  return standardDeductionKeys.has(value as StandardPayrollDeductionKey);
}

export function isStandardPayrollDeductionName(name: string) {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized === "pensioen"
    || normalized === "pensioenpremie"
    || normalized.includes("pensioenfonds vervoer")
    || normalized === "wia"
    || normalized.startsWith("wia premie tln cao")
    || normalized === "soob"
    || normalized.includes("stichting opleidings en ontwikkelingsfonds")
    || normalized.includes("soob")
    || normalized.includes("wga")
    || normalized.includes("personeelsvereniging");
}

export async function getStandardPayrollDeductionsForDate(
  date: string,
  userId: string,
): Promise<StandardPayrollDeduction[]> {
  const supabase = createClient();
  const [{ data, error }, { data: preferences, error: preferencesError }] = await Promise.all([
    supabase
      .from("standard_payroll_deductions")
      .select("deduction_key, name, amount, effective_from, effective_to, reduces_table_salary")
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`)
      .order("deduction_key")
      .order("effective_from", { ascending: false }),
    supabase
      .from("driver_standard_payroll_deduction_preferences")
      .select("deduction_key, amount_override, enabled")
      .eq("user_id", userId),
  ]);

  if (error) throw error;
  if (preferencesError) throw preferencesError;
  if (!data?.length) {
    if (date >= standardDeductionsStartDate) {
      throw new Error(`Er zijn geen standaardinhoudingen ingesteld voor ${date}.`);
    }
    return [];
  }

  const preferenceByKey = new Map(preferences?.map((preference) => [
    preference.deduction_key,
    preference,
  ]) ?? []);
  const latestByKey = new Map<StandardPayrollDeductionKey, StandardPayrollDeduction>();
  for (const row of data) {
    if (!isStandardDeductionKey(row.deduction_key)) {
      throw new Error(`Onbekend type standaardinhouding: ${row.deduction_key}.`);
    }
    const key = row.deduction_key;
    if (latestByKey.has(key)) {
      throw new Error(`Er zijn overlappende versies voor de standaardinhouding ${key}.`);
    }

    const defaultAmount = Number(row.amount);
    const preference = preferenceByKey.get(key);
    const amount = preference?.amount_override == null ? defaultAmount : Number(preference.amount_override);
    if (!Number.isFinite(defaultAmount) || defaultAmount < 0
      || !Number.isFinite(amount) || amount < 0
      || !row.name.trim()) {
      throw new Error(`De standaardinhouding ${key} bevat ongeldige gegevens.`);
    }

    latestByKey.set(key, {
      deduction_key: key,
      name: row.name,
      default_amount: defaultAmount,
      amount,
      enabled: preference?.enabled ?? true,
      reduces_table_salary: row.reduces_table_salary,
    });
  }

  const expectedKeys = date >= standardDeductionsStartDate
    ? standardDeductionKeys
    : originalStandardDeductionKeys;
  if (latestByKey.size !== expectedKeys.size
    || [...expectedKeys].some((key) => !latestByKey.has(key))) {
    throw new Error(`Niet alle standaardinhoudingen zijn ingesteld voor ${date}.`);
  }
  return [...latestByKey.values()];
}
