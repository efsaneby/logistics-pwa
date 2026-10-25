import { createClient } from "@/lib/supabase/client";

export type StandardPayrollDeduction = {
  deduction_key: "pension" | "wia" | "soob";
  name: string;
  amount: number;
  reduces_table_salary: boolean;
};

const standardDeductionKeys = new Set(["pension", "wia", "soob"]);
const standardDeductionsStartDate = "2026-10-01";

export function isStandardPayrollDeductionName(name: string) {
  const normalized = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return normalized === "pensioen"
    || normalized === "pensioenpremie"
    || normalized.includes("pensioenfonds vervoer")
    || normalized === "wia"
    || normalized.startsWith("wia premie tln cao")
    || normalized === "soob"
    || normalized.includes("stichting opleidings en ontwikkelingsfonds")
    || normalized.includes("soob");
}

export async function getStandardPayrollDeductionsForDate(date: string): Promise<StandardPayrollDeduction[]> {
  const { data, error } = await createClient()
    .from("standard_payroll_deductions")
    .select("deduction_key, name, amount, effective_from, effective_to, reduces_table_salary")
    .lte("effective_from", date)
    .or(`effective_to.is.null,effective_to.gte.${date}`)
    .order("deduction_key")
    .order("effective_from", { ascending: false });

  if (error) throw error;
  if (!data?.length) {
    if (date >= standardDeductionsStartDate) {
      throw new Error(`Er zijn geen standaardinhoudingen ingesteld voor ${date}.`);
    }
    return [];
  }

  const latestByKey = new Map<string, StandardPayrollDeduction>();
  for (const row of data) {
    if (!standardDeductionKeys.has(row.deduction_key)) {
      throw new Error(`Onbekend type standaardinhouding: ${row.deduction_key}.`);
    }
    if (latestByKey.has(row.deduction_key)) {
      throw new Error(`Er zijn overlappende versies voor de standaardinhouding ${row.deduction_key}.`);
    }
    const amount = Number(row.amount);
    if (!Number.isFinite(amount) || amount < 0 || !row.name.trim()) {
      throw new Error(`De standaardinhouding ${row.deduction_key} bevat ongeldige gegevens.`);
    }
    latestByKey.set(row.deduction_key, {
      deduction_key: row.deduction_key,
      name: row.name,
      amount,
      reduces_table_salary: row.reduces_table_salary,
    });
  }

  if (latestByKey.size !== standardDeductionKeys.size) {
    throw new Error(`Niet alle standaardinhoudingen zijn ingesteld voor ${date}.`);
  }
  return [...latestByKey.values()];
}
