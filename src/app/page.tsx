"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import TripCard from "@/components/TripCard";
import TripList from "@/components/TripList";
import WorkCard from "@/components/WorkCard";
import WorkList from "@/components/WorkList";
import { createClient } from "@/lib/supabase/client";
import { MEERDAAGSE_MATRIX_2026 } from "@/lib/calculator/verblijfskosten";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Truck } from "lucide-react";

type DayRecord = { date: string; hours: number; allowance: number };
const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function Home() {
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [entryType, setEntryType] = useState<"work" | "trip" | null>(null);
  const [records, setRecords] = useState<DayRecord[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadCalendar = useCallback(async () => {
    const supabase = createClient();
    const [workResult, tripResult] = await Promise.all([
      supabase.from("work_cards").select("date, normal_hours, overtime_130"),
      supabase.from("trip_cards").select("departure_time, return_time, is_multi_day, calculated_allowance"),
    ]);
    const byDate = new Map<string, DayRecord>();
    for (const item of workResult.data ?? []) {
      const row = byDate.get(item.date) ?? { date: item.date, hours: 0, allowance: 0 };
      row.hours += Number(item.normal_hours || 0) + Number(item.overtime_130 || 0);
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
        const row = byDate.get(key) ?? { date: key, hours: 0, allowance: 0 };
        row.allowance += amount;
        byDate.set(key, row);
      });
    }
    setRecords([...byDate.values()]);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void loadCalendar(); }, 0);
    return () => clearTimeout(timer);
  }, [loadCalendar, refreshKey]);

  const calendarDays = useMemo(() => {
    const offset = (month.getDay() + 6) % 7;
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return [...Array(offset).fill(null), ...Array.from({ length: count }, (_, i) => i + 1)];
  }, [month]);
  const recordMap = useMemo(() => new Map(records.map((record) => [record.date, record])), [records]);
  const today = toDateKey(new Date());
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
                {record && record.hours > 0 && <span className={`w-full truncate text-[9px] leading-3 ${active ? "text-amber-200" : "text-amber-700"}`}>{record.hours.toFixed(1)}h</span>}
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

        <section className="mt-5 space-y-3">
          <WorkList refreshKey={refreshKey} />
          <TripList refreshKey={refreshKey} />
        </section>
      </div>
    </main>
  );
}
