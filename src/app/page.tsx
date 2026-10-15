"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DayDetails from "@/components/DayDetails";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import AccountGate from "@/components/AccountGate";
import { getTripDailyAllowance } from "@/lib/calculator/trip-allowance";
import { ChevronLeft, ChevronRight, StickyNote, Wallet } from "lucide-react";
import { getSalaryScaleRatesForDate } from "@/lib/supabase/salary-scales";
import type { SalaryScaleRate } from "@/lib/supabase/salary-scales";

type DayRecord = { date: string; hours: number; overtimeHours: number; allowance: number; travelCost: number };
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
const weekdays = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const btWithholdingRate = 0.3756 + 0.1291;
const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const formatHours = (hours: number) => {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, "0")}`;
};

function CalendarHome() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showPayrollDetails, setShowPayrollDetails] = useState(false);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [noteDates, setNoteDates] = useState<Set<string>>(() => new Set());
  const [notesError, setNotesError] = useState<string | null>(null);
  const [payroll, setPayroll] = useState<PayrollSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCalendar = useCallback(async () => {
    const supabase = createClient();
    const monthStart = toDateKey(month);
    const monthEnd = toDateKey(new Date(month.getFullYear(), month.getMonth() + 1, 1));
    const [workResult, tripResult, notesResult] = await Promise.all([
      supabase.from("work_cards").select("date, normal_hours, overtime_130"),
      supabase.from("trip_cards").select("departure_time, return_time, is_multi_day, calculated_allowance, travel_cost_per_one_way"),
      supabase.from("driver_day_notes")
        .select("date")
        .gte("date", monthStart)
        .lt("date", monthEnd),
    ]);
    if (notesResult.error) {
      setNoteDates(new Set());
      setNotesError("Dagnotities konden niet worden geladen.");
      console.error("Dagnotities laden mislukt:", notesResult.error);
    } else {
      setNoteDates(new Set((notesResult.data ?? []).map((note) => note.date)));
      setNotesError(null);
    }
    const byDate = new Map<string, DayRecord>();
    for (const item of workResult.data ?? []) {
      const row = byDate.get(item.date) ?? { date: item.date, hours: 0, overtimeHours: 0, allowance: 0, travelCost: 0 };
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
      for (const date = new Date(firstDay); date <= lastDay; date.setDate(date.getDate() + 1)) {
        const key = toDateKey(date);
        const row = byDate.get(key) ?? { date: key, hours: 0, overtimeHours: 0, allowance: 0, travelCost: 0 };
        row.allowance += getTripDailyAllowance(
          departure,
          returnTime,
          item.is_multi_day,
          Number(item.calculated_allowance || 0),
          key,
        );
        byDate.set(key, row);
      }
      const travelAmount = Number(item.travel_cost_per_one_way || 0);
      const departureKey = toDateKey(departure);
      const departureRow = byDate.get(departureKey) ?? { date: departureKey, hours: 0, overtimeHours: 0, allowance: 0, travelCost: 0 };
      departureRow.travelCost += travelAmount;
      byDate.set(departureKey, departureRow);
      const returnKey = toDateKey(returnTime);
      const returnRow = byDate.get(returnKey) ?? { date: returnKey, hours: 0, overtimeHours: 0, allowance: 0, travelCost: 0 };
      returnRow.travelCost += travelAmount;
      byDate.set(returnKey, returnRow);
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
      setPayroll({ monthlyBase: 0, overtimePay: 0, fixedDeductions: [], percentageDeductionCount: 0, tableSalary: 0, loonheffingTable: 0, scale: "", step: 0, error: profileError?.message ?? deductionsError?.message ?? "Vul eerst je chauffeursprofiel in om de schatting te bekijken." });
      return;
    }
    const effectiveDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-01`;
    try {
      const salaryTable = await getSalaryScaleRatesForDate(effectiveDate);
      const rate = (salaryTable.rates as SalaryScaleRate[]).find((item) => item.scale === profile.scale && item.step === profile.step);
      if (!rate) throw new Error(`Salarisschaal ${profile.scale}${profile.step} is niet gevonden.`);
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
      if (!taxVersion) throw new Error(`Er is geen loonheffingstabel beschikbaar voor ${effectiveDate}.`);
      const { data: taxRow, error: taxRowError } = await supabase.from("loonheffing_table_rows")
        .select("tabelloon, under_aow_no_credit, under_aow_with_credit, aow_before_1946_no_credit, aow_before_1946_credit_excl_single, aow_before_1946_credit_incl_single, aow_1946_or_later_no_credit, aow_1946_or_later_credit_excl_single, aow_1946_or_later_credit_incl_single")
        .eq("version_id", taxVersion.id)
        .lte("tabelloon", tableSalary)
        .order("tabelloon", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (taxRowError) throw taxRowError;
      if (!taxRow) throw new Error("Er is geen loonheffingstabel gevonden voor dit tabelloon.");
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
      setPayroll({ monthlyBase: 0, overtimePay: 0, fixedDeductions: [], percentageDeductionCount: 0, tableSalary: 0, loonheffingTable: 0, scale: profile.scale, step: profile.step, error: loadError instanceof Error ? loadError.message : "De salaristabel kon niet worden geladen." });
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
  const monthTravelCost = monthRecords.reduce((sum, record) => sum + record.travelCost, 0);
  const fixedDeductionTotal = payroll?.fixedDeductions.reduce((sum, deduction) => sum + deduction.value, 0) ?? 0;
  const btWithholding = (payroll?.overtimePay ?? 0) * btWithholdingRate;
  const netEstimate = payroll
    ? payroll.monthlyBase + payroll.overtimePay + monthAllowance + monthTravelCost - payroll.loonheffingTable - btWithholding - fixedDeductionTotal
    : 0;
  const currency = (value: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(value);
  const compactCurrency = (value: number) => new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
  const saved = () => {
    setRefreshKey((value) => value + 1);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-5">
      <div className="mx-auto w-full max-w-lg">
        <header className="mb-5 text-center">
          <h1 className="text-xl font-bold text-slate-900">TruckLog</h1>
          <p className="mt-1 text-xs text-slate-500">Uren en ritvergoedingen</p>
        </header>

        <button
          type="button"
          onClick={() => setShowPayrollDetails((visible) => !visible)}
          aria-expanded={showPayrollDetails}
          className="mb-4 w-full rounded-2xl bg-slate-900 p-4 text-left text-white shadow-sm transition hover:bg-slate-800"
        >
          <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
            <Wallet className="h-4 w-4 text-amber-400" />
            {month.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })} · Geschat nettoloon
          </span>
          <span className="mt-1 block text-3xl font-bold">
            {payroll?.error ? "Niet beschikbaar" : payroll ? currency(netEstimate) : "…"}
          </span>
          <span className="mt-1 block text-xs text-slate-300">
            {payroll?.error ? payroll.error : "Tik voor de berekening"}
          </span>
        </button>

        {showPayrollDetails && payroll && !payroll.error && (
          <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-900">Details nettoloon</h2>
            <div className="space-y-2 text-sm">
              <p className="flex justify-between gap-3 text-slate-600"><span>Maandsalaris ({payroll.scale}{payroll.step})</span><span>{currency(payroll.monthlyBase)}</span></p>
              <p className="flex justify-between gap-3 text-slate-600"><span>Overwerkvergoeding (130%)</span><span>{currency(payroll.overtimePay)}</span></p>
              <p className="flex justify-between gap-3 border-t border-slate-100 pt-2 font-semibold text-slate-900"><span>Geschat brutoloon</span><span>{currency(payroll.monthlyBase + payroll.overtimePay)}</span></p>
              <div className="space-y-1 border-t border-slate-100 pt-2 text-slate-600">
                <p className="flex justify-between gap-3"><span>Tabelloon</span><span>{currency(payroll.tableSalary)}</span></p>
                <p className="flex justify-between gap-3 font-medium text-rose-700"><span>Loonheffing</span><span>-{currency(payroll.loonheffingTable)}</span></p>
                <p className="flex justify-between gap-3 font-medium text-rose-700"><span>Bijzonder tarief (50,47%)</span><span>-{currency(btWithholding)}</span></p>
              </div>
              <p className="flex justify-between gap-3 text-emerald-700"><span>Verblijfskosten</span><span>{currency(monthAllowance)}</span></p>
              <p className="flex justify-between gap-3 text-sky-700"><span>Reiskosten</span><span>{currency(monthTravelCost)}</span></p>
              {payroll.fixedDeductions.length > 0 && <div className="space-y-1 border-t border-slate-100 pt-2">
                <p className="font-medium text-slate-700">Maandelijkse inhoudingen</p>
                {payroll.fixedDeductions.map((deduction, index) => <p key={`${deduction.name}-${index}`} className="flex justify-between gap-3 text-slate-600"><span>{deduction.name}{deduction.reducesTableSalary ? " · verlaagt tabelloon" : ""}</span><span>-{currency(deduction.value)}</span></p>)}
                <p className="flex justify-between gap-3 font-medium text-slate-800"><span>Totaal inhoudingen</span><span>-{currency(fixedDeductionTotal)}</span></p>
              </div>}
              <p className="rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-900">Het bijzonder tarief op overwerk is geschat op 50,47%. Verblijfskosten zijn opgenomen in het nettoloon. {payroll.percentageDeductionCount > 0 && `${payroll.percentageDeductionCount} procentuele inhouding(en) zijn opgeslagen maar niet meegenomen, omdat de berekeningsbasis niet is ingesteld.`}</p>
            </div>
          </section>
        )}

        {selectedDate ? (
          <>
            <Button variant="ghost" className="mb-3" onClick={() => setSelectedDate(null)}>
              <ChevronLeft className="mr-1 h-4 w-4" /> Terug naar de kalender
            </Button>
            <DayDetails date={selectedDate} refreshKey={refreshKey} onChanged={saved} />
          </>
        ) : (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <button aria-label="Vorige maand" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronLeft className="h-5 w-5" /></button>
              <h2 className="text-base font-semibold text-slate-900">{month.toLocaleDateString("nl-NL", { month: "long", year: "numeric" })}</h2>
              <button aria-label="Volgende maand" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"><ChevronRight className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekdays.map((day) => <div key={day} className="pb-2 text-[11px] font-medium text-slate-400">{day}</div>)}
              {calendarDays.map((day, index) => {
                if (day === null) return <div key={`empty-${index}`} />;
                const key = toDateKey(new Date(month.getFullYear(), month.getMonth(), day));
                const record = recordMap.get(key);
                const hasNote = noteDates.has(key);
                const dateLabel = `${day} ${month.toLocaleDateString("nl-NL", { month: "long" })}`;
                const hoursLabel = record && record.hours > 0
                  ? formatHours(record.hours)
                  : "geen uren";
                const allowanceLabel = record && record.allowance > 0 ? compactCurrency(record.allowance) : "geen verblijfskosten";
                const travelLabel = record && record.travelCost > 0 ? compactCurrency(record.travelCost) : "geen reiskosten";
                return <button key={key} onClick={() => setSelectedDate(key)} aria-label={`${dateLabel}: ${hoursLabel}, ${allowanceLabel}, ${travelLabel}${hasNote ? ", heeft een notitie" : ""}`} className={`flex min-h-20 flex-col items-center justify-start gap-1 rounded-xl border px-1 pt-1.5 text-xs transition ${key === today ? "border-amber-300 bg-amber-50 font-semibold text-slate-900" : "border-slate-100 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"}`}>
                  <span className="mb-0.5 flex w-full items-center justify-center gap-1">
                    {day}
                    {hasNote && <StickyNote aria-hidden="true" className="h-3 w-3 shrink-0 text-violet-600" />}
                  </span>
                  <span className="w-full truncate rounded bg-amber-100 px-0.5 py-0.5 text-[9px] font-medium leading-3 text-amber-800">{record && record.hours > 0 ? hoursLabel : "—"}</span>
                  <span className="w-full truncate rounded bg-emerald-100 px-0.5 py-0.5 text-[9px] font-medium leading-3 text-emerald-800">{record && record.allowance > 0 ? compactCurrency(record.allowance) : "—"}</span>
                  <span className="w-full truncate rounded bg-sky-100 px-0.5 py-0.5 text-[9px] font-medium leading-3 text-sky-800">{record && record.travelCost > 0 ? compactCurrency(record.travelCost) : "—"}</span>
                </button>;
              })}
            </div>
            {notesError && <p role="alert" className="mt-3 text-center text-xs text-red-600">{notesError}</p>}
            <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-amber-500" /> Gewerkte uren</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-emerald-500" /> Verblijfskosten</span>
              <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sky-500" /> Reiskosten</span>
              <span className="flex items-center gap-1.5"><StickyNote aria-hidden="true" className="h-3 w-3 text-violet-600" /> Notitie</span>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return <AccountGate><CalendarHome /></AccountGate>;
}
