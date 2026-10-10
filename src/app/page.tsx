"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TripCard from "@/components/TripCard";
import WorkCard from "@/components/WorkCard";
import { createClient } from "@/lib/supabase/client";
import AccountGate from "@/components/AccountGate";
import { MEERDAAGSE_MATRIX_2026 } from "@/lib/calculator/verblijfskosten";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Truck, Wallet } from "lucide-react";
import { getSalaryScaleRatesForDate } from "@/lib/supabase/salary-scales";
import type { SalaryScaleRate } from "@/lib/supabase/salary-scales";

type DayRecord = { date: string; hours: number; overtimeHours: number; allowance: number };
type PayrollSummary = {
  monthlyBase: number;
  overtimePay: number;
  fixedDeductions: { name: string; value: number; reducesTableSalary: boolean }[];
  percentageDeductionCount: number;
  tableSalary: number;
  loonheffingTable: number;
  scale: string;
  step: number;
  error?: string;
};
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const btWithholdingRate = 0.3756 + 0.1291;
const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function CalendarHome() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<"work" | "trip" | null>(null);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [payroll, setPayroll] = useState<PayrollSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCalendar = useCallback(async () => {
    const supabase = createClient();
    const [workResult, tripResult] = await Promise.all([
      supabase.from("work_cards").select("date, normal_hours, overtime_130"),
      supabase.from("trip_cards").select("departure_time, return_time, is_multi_day, calculated_allowance"),
    ]);
    const byDate = new Map<string, DayRecord>();
    for (const item of workResult.data ?? []) {
      const row = byDate.get(item.date) ?? { date: item.date, hours: 0, overtimeHours: 0, allowance: 0 };
      const overtime = Number(item.overtime_130 || 0);
      row.hours += Number(item.normal_hours || 0) + overtime;
      row.overtimeHours += overtime;
      byDate.set(item.date, row);
    }
    for (const item of tripResult.data ?? []) {
      const departure = new Date(item.departure_time);
      const returnTime = new Date(item.return_time);
      if (Number.isNaN(departure.getTime()) || Number.isNaN(returnTime.getTime())) continue;

      const firstDay = new Date(departure.getFullYear(), departure.getMonth(), departure.getDate());
      const lastDay = new Date(returnTime.getFullYear(), returnTime.getMonth(), returnTime.getDate());
      const dayCount = Math.round((lastDay.getTime() - firstDay.getTime()) / 86_400_000) + 1;
      const dailyAmounts = item.is_multi_day && dayCount > 1
        ? Array.from({ length: dayCount }, (_, index) => {
            if (index === 0) return MEERDAAGSE_MATRIX_2026.eersteDag[departure.getHours() as keyof typeof MEERDAAGSE_MATRIX_2026.eersteDag] || 0;
            if (index === dayCount - 1) return MEERDAAGSE_MATRIX_2026.laatsteDag[returnTime.getHours() as keyof typeof MEERDAAGSE_MATRIX_2026.laatsteDag] || 0;
            return MEERDAAGSE_MATRIX_2026.tussenliggendeDag;
          })
        : [Number(item.calculated_allowance || 0)];

      dailyAmounts.forEach((amount, index) => {
        const date = new Date(firstDay);
        date.setDate(date.getDate() + index);
        const key = toDateKey(date);
        const row = byDate.get(key) ?? { date: key, hours: 0, overtimeHours: 0, allowance: 0 };
        row.allowance += amount;
        byDate.set(key, row);
      });
    }
    setRecords([...byDate.values()]);

    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) {
      setPayroll(null);
      return;
    }
    const [{ data: profile, error: profileError }, { data: deductions, error: deductionsError }] = await Promise.all([
      supabase.from("driver_profiles").select("scale, step, contract_hours_per_week, apply_loonheffingskorting, aow_category, single_elderly_credit").eq("user_id", authData.user.id).maybeSingle(),
      supabase.from("driver_deductions").select("name, calculation_type, value, reduces_table_salary").eq("user_id", authData.user.id),
    ]);
    if (profileError || deductionsError || !profile) {
      setPayroll({ monthlyBase: 0, overtimePay: 0, fixedDeductions: [], percentageDeductionCount: 0, tableSalary: 0, loonheffingTable: 0, scale: "", step: 0, error: profileError?.message ?? deductionsError?.message ?? "Complete your driver profile to see the estimate." });
      return;
    }
    const effectiveDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
    try {
      const salaryTable = await getSalaryScaleRatesForDate(effectiveDate);
      const rate = (salaryTable.rates as SalaryScaleRate[]).find((item) => item.scale === profile.scale && item.step === profile.step);
      if (!rate) throw new Error(`No salary rate found for ${profile.scale}${profile.step}.`);
      const monthPrefix = effectiveDate.slice(0, 7);
      const monthOvertime = [...byDate.values()].filter((row) => row.date.startsWith(monthPrefix)).reduce((sum, row) => sum + row.overtimeHours, 0);
      const monthlyBase = Number(rate.monthly_gross) * (Number(profile.contract_hours_per_week) / Number(salaryTable.version.full_time_hours_per_week));
      const fixedDeductions = (deductions ?? []).filter((item) => item.calculation_type === "fixed").map((item) => ({ name: item.name, value: Number(item.value), reducesTableSalary: item.reduces_table_salary }));
      const tableSalary = Math.max(0, monthlyBase - fixedDeductions.filter((item) => item.reducesTableSalary).reduce((sum, item) => sum + item.value, 0));
      const { data: taxVersion, error: taxVersionError } = await supabase.from("loonheffing_table_versions")
        .select("id")
        .lte("effective_from", effectiveDate)
        .gte("effective_to", effectiveDate)
        .maybeSingle();
      if (taxVersionError) throw taxVersionError;
      if (!taxVersion) throw new Error(`No loonheffing table is available for ${effectiveDate}.`);
      const { data: taxRow, error: taxRowError } = await supabase.from("loonheffing_table_rows")
        .select("tabelloon, under_aow_no_credit, under_aow_with_credit, aow_before_1946_no_credit, aow_before_1946_credit_excl_single, aow_before_1946_credit_incl_single, aow_1946_or_later_no_credit, aow_1946_or_later_credit_excl_single, aow_1946_or_later_credit_incl_single")
        .eq("version_id", taxVersion.id)
        .lte("tabelloon", tableSalary)
        .order("tabelloon", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (taxRowError) throw taxRowError;
      if (!taxRow) throw new Error("No loonheffing table bracket was found for this table salary.");
      const taxColumn = profile.aow_category === "under_aow"
        ? (profile.apply_loonheffingskorting ? "under_aow_with_credit" : "under_aow_no_credit")
        : profile.aow_category === "aow_before_1946"
          ? (!profile.apply_loonheffingskorting ? "aow_before_1946_no_credit" : profile.single_elderly_credit ? "aow_before_1946_credit_incl_single" : "aow_before_1946_credit_excl_single")
          : (!profile.apply_loonheffingskorting ? "aow_1946_or_later_no_credit" : profile.single_elderly_credit ? "aow_1946_or_later_credit_incl_single" : "aow_1946_or_later_credit_excl_single");
      setPayroll({
        monthlyBase,
        overtimePay: monthOvertime * Number(rate.hourly_rate_130),
        fixedDeductions,
        percentageDeductionCount: (deductions ?? []).filter((item) => item.calculation_type === "percentage").length,
        tableSalary,
        loonheffingTable: Number(taxRow[taxColumn]),
        scale: profile.scale,
        step: profile.step,
      });
    } catch (loadError) {
      setPayroll({ monthlyBase: 0, overtimePay: 0, fixedDeductions: [], percentageDeductionCount: 0, tableSalary: 0, loonheffingTable: 0, scale: profile.scale, step: profile.step, error: loadError instanceof Error ? loadError.message : "Could not load the salary table." });
    }
  }, [month]);

  useEffect(() => {
    const timer = setTimeout(() => { void loadCalendar(); }, 0);
    return () => clearTimeout(timer);
  }, [loadCalendar, refreshKey]);

  useEffect(() => {
    const refreshProfile = () => setRefreshKey((value) => value + 1);
    window.addEventListener("driver-profile-updated", refreshProfile);
    return () => window.removeEventListener("driver-profile-updated", refreshProfile);
  }, []);

  const calendarDays = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month]);
  const recordMap = useMemo(() => new Map(records.map((record) => [record.date, record])), [records]);
  const monthRecords = useMemo(() => records
    .filter((record) => record.date.startsWith(`${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`))
    .sort((a, b) => a.date.localeCompare(b.date)), [records, month]);
  const today = toDateKey(new Date());
  const monthAllowance = monthRecords.reduce((sum, record) => sum + record.allowance, 0);
  const fixedDeductionTotal = payroll?.fixedDeductions.reduce((sum, deduction) => sum + deduction.value, 0) ?? 0;
  const btWithholding = (payroll?.overtimePay ?? 0) * btWithholdingRate;
  const netEstimate = payroll
    ? payroll.monthlyBase + payroll.overtimePay + monthAllowance - payroll.loonheffingTable - btWithholding - fixedDeductionTotal
    : 0;
  const currency = (value: number) => new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" }).format(value);
  const chooseDay = (day: number) => {
    setSelectedDate(toDateKey(new Date(month.getFullYear(), month.getMonth(), day)));
    setEntryType(null);
  };
  const saved = () => {
    setRefreshKey((value) => value + 1);
    setEntryType(null);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold text-slate-900">Logistics Assistant 2026</h1>
          <p className="mt-1 text-xs text-slate-500">Work hours and trip allowance</p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-5 w-5" /></button>
            <h2 className="text-base font-semibold text-slate-900">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            <button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekdays.map((day) => <div key={day} className="pb-2 text-[11px] font-medium text-slate-400">{day}</div>)}
            {calendarDays.map((day, index) => {
              if (day === null) return <div key={`empty-${index}`} />;
              const key = toDateKey(new Date(month.getFullYear(), month.getMonth(), day));
              const record = recordMap.get(key);
              const active = selectedDate === key;
              return <button key={key} onClick={() => chooseDay(day)} aria-label={`${month.toLocaleDateString("en-US", { month: "long" })} ${day}`} className={`flex min-h-16 flex-col items-center justify-start gap-0.5 rounded-xl px-0.5 pt-1.5 text-xs transition ${active ? "bg-slate-900 font-semibold text-white" : key === today ? "bg-amber-50 font-semibold text-slate-900" : "text-slate-700 hover:bg-slate-100"}`}>
                <span>{day}</span>
                {record && record.hours > 0 && <span className={`w-full truncate text-[9px] leading-3 ${active ? "text-amber-200" : "text-amber-700"}`}>{`${Math.floor(record.hours)}h${String(Math.round((record.hours % 1) * 60)).padStart(2, "0")}`}</span>}
                {record && record.allowance > 0 && <span className={`w-full truncate text-[9px] leading-3 ${active ? "text-emerald-200" : "text-emerald-700"}`}>€{record.allowance.toFixed(0)}</span>}
              </button>;
            })}
          </div>
          <div className="mt-4 flex justify-center gap-5 text-[11px] text-slate-500">
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" /> Hours worked</span>
            <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Trip allowance</span>
          </div>
        </section>

        {selectedDate && <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800"><CalendarDays className="h-4 w-4 text-amber-500" />{new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
          {!entryType ? <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setEntryType("work")} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:border-amber-400 hover:bg-amber-50"><Clock3 className="h-4 w-4 text-amber-500" /> Add work hours</button>
            <button onClick={() => setEntryType("trip")} className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-medium text-slate-700 hover:border-emerald-400 hover:bg-emerald-50"><Truck className="h-4 w-4 text-emerald-600" /> Add trip</button>
          </div> : <>
            <button onClick={() => setEntryType(null)} className="mb-3 text-xs text-slate-500 underline">Back</button>
            {entryType === "work" ? <WorkCard key={`work-${selectedDate}`} initialDate={selectedDate} onWorkSaved={saved} /> : <TripCard key={`trip-${selectedDate}`} initialDate={selectedDate} onTripSaved={saved} />}
          </>}
        </section>}

        <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-amber-500" /><h2 className="text-sm font-semibold text-slate-900">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })} Pay Estimate</h2></div>
          {payroll?.error ? <p className="text-xs text-red-600">{payroll.error}</p> : payroll ? <div className="space-y-2 text-sm">
            <p className="flex justify-between gap-3 text-slate-600"><span>Monthly salary ({payroll.scale}{payroll.step})</span><span>{currency(payroll.monthlyBase)}</span></p>
            <p className="flex justify-between gap-3 text-slate-600"><span>Overtime pay (130%)</span><span>{currency(payroll.overtimePay)}</span></p>
            <p className="flex justify-between gap-3 border-t border-slate-100 pt-2 font-semibold text-slate-900"><span>Gross pay estimate</span><span>{currency(payroll.monthlyBase + payroll.overtimePay)}</span></p>
            <div className="space-y-1 border-t border-slate-100 pt-2 text-slate-600">
              <p className="flex justify-between gap-3"><span>Table salary (tabelloon)</span><span>{currency(payroll.tableSalary)}</span></p>
              <p className="flex justify-between gap-3 font-medium text-rose-700"><span>Loonheffing table deduction</span><span>-{currency(payroll.loonheffingTable)}</span></p>
              <p className="flex justify-between gap-3 font-medium text-rose-700"><span>BT withholding (37.56% + 12.91%)</span><span>-{currency(btWithholding)}</span></p>
            </div>
            <p className="flex justify-between gap-3 text-emerald-700"><span>Trip allowances</span><span>{currency(monthAllowance)}</span></p>
            {payroll.fixedDeductions.length > 0 && <div className="space-y-1 border-t border-slate-100 pt-2">
              <p className="font-medium text-slate-700">Monthly employee deductions</p>
              {payroll.fixedDeductions.map((deduction, index) => <p key={`${deduction.name}-${index}`} className="flex justify-between gap-3 text-slate-600"><span>{deduction.name}{deduction.reducesTableSalary ? " · reduces table salary" : ""}</span><span>-{currency(deduction.value)}</span></p>)}
              <p className="flex justify-between gap-3 font-medium text-slate-800"><span>Total fixed deductions</span><span>-{currency(fixedDeductionTotal)}</span></p>
            </div>}
            <p className="flex justify-between gap-3 border-t border-slate-200 pt-3 text-base font-bold text-slate-900"><span>Estimated net pay</span><span>{currency(netEstimate)}</span></p>
            <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-900">BT is estimated at a combined 50.47% on overtime pay. Trip allowances are included in the net estimate. {payroll.percentageDeductionCount > 0 && `${payroll.percentageDeductionCount} percentage deduction(s) are saved but excluded because their calculation bases are not configured.`}</p>
          </div> : <p className="text-xs text-slate-500">Loading monthly estimate…</p>}
        </section>

        <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-900">{month.toLocaleDateString("en-US", { month: "long", year: "numeric" })} Summary</h2>
          </div>
          <table className="w-full table-fixed text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="w-[38%] px-3 py-3 font-semibold">Date</th>
                <th className="w-[30%] px-2 py-3 text-center font-semibold">Hours worked</th>
                <th className="w-[32%] px-3 py-3 text-right font-semibold">Trip allowance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthRecords.length === 0 ? <tr><td colSpan={3} className="px-3 py-6 text-center text-slate-500">No entries for this month.</td></tr> : monthRecords.map((record) => <tr key={record.date}>
                <td className="px-3 py-3 font-medium text-slate-700">{new Date(`${record.date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</td>
                <td className="px-2 py-3 text-center font-medium text-amber-700">{record.hours > 0 ? `${Math.floor(record.hours)}h${String(Math.round((record.hours % 1) * 60)).padStart(2, "0")}` : "—"}</td>
                <td className="px-3 py-3 text-right font-medium text-emerald-700">{record.allowance > 0 ? `€${record.allowance.toFixed(2)}` : "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}

export default function Home() {
  return <AccountGate><CalendarHome /></AccountGate>;
}
