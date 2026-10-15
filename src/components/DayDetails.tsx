"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import WorkCard from "@/components/WorkCard";
import TripCard from "@/components/TripCard";
import { getTripDailyAllowance } from "@/lib/calculator/trip-allowance";
import { createClient } from "@/lib/supabase/client";
import { CalendarDays, Clock3, Pencil, Plus, Trash2, Truck } from "lucide-react";

interface WorkRecord {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  normal_hours: number;
  overtime_130: number;
}

interface TripRecord {
  id: string;
  departure_time: string;
  return_time: string;
  is_multi_day: boolean;
  calculated_allowance: number;
  travel_cost_per_one_way: number;
}

type EditingRecord = { type: "work" | "trip"; id: string } | { type: "new"; kind: "work" | "trip" } | null;

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatTime = (value: string) => value.slice(0, 5);
const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ${date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;
};
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("en-NL", { style: "currency", currency: "EUR" }).format(amount);

export default function DayDetails({
  date,
  refreshKey,
  onChanged,
}: {
  date: string;
  refreshKey: number;
  onChanged: () => void;
}) {
  const [works, setWorks] = useState<WorkRecord[]>([]);
  const [trips, setTrips] = useState<TripRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRecord>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const load = async () => {
        if (!alive) return;
        setLoading(true);
        setError(null);
        const supabase = createClient();
        const [workResult, tripResult] = await Promise.all([
          supabase.from("work_cards")
            .select("id, date, start_time, end_time, break_minutes, normal_hours, overtime_130")
            .eq("date", date)
            .order("start_time"),
          supabase.from("trip_cards")
            .select("id, departure_time, return_time, is_multi_day, calculated_allowance, travel_cost_per_one_way")
            .order("departure_time"),
        ]);
        if (!alive) return;
        if (workResult.error || tripResult.error) {
          setError(workResult.error?.message ?? tripResult.error?.message ?? "Could not load this day's records.");
          setWorks([]);
          setTrips([]);
        } else {
          const dayTrips = (tripResult.data ?? []).filter((trip) => {
            const start = new Date(trip.departure_time);
            const end = new Date(trip.return_time);
            return dateKey(start) <= date && dateKey(end) >= date;
          });
          setWorks(workResult.data ?? []);
          setTrips(dayTrips);
        }
        setLoading(false);
      };
      void load();
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [date, refreshKey]);

  const removeWork = async (work: WorkRecord) => {
    if (!confirm("Bu çalışma kaydını silmek istediğinden emin misin?")) return;
    const { error: deleteError } = await createClient().from("work_cards").delete().eq("id", work.id);
    if (deleteError) {
      alert(`Silinirken hata oluştu: ${deleteError.message}`);
      return;
    }
    onChanged();
  };

  const removeTrip = async (trip: TripRecord) => {
    const departure = new Date(trip.departure_time);
    const returnTime = new Date(trip.return_time);
    const spansDays = dateKey(departure) !== dateKey(returnTime);
    const affectedDates = `${formatDateTime(trip.departure_time)} – ${formatDateTime(trip.return_time)}`;
    const message = spansDays
      ? `Bu sefer ${affectedDates} tarihleri arasındaki tüm günlere yayılıyor. Sefer silinirse bütün günlerdeki harcırah ve reiskosten kayıtları da silinecek. Devam edilsin mi?`
      : "Bu sefer kaydını silmek istediğinden emin misin?";
    if (!confirm(message)) return;
    const { error: deleteError } = await createClient().from("trip_cards").delete().eq("id", trip.id);
    if (deleteError) {
      alert(`Silinirken hata oluştu: ${deleteError.message}`);
      return;
    }
    onChanged();
  };

  const beginTripEdit = (trip: TripRecord) => {
    const departure = new Date(trip.departure_time);
    const returnTime = new Date(trip.return_time);
    if (dateKey(departure) !== dateKey(returnTime)) {
      const accepted = confirm(
        `Bu sefer ${formatDateTime(trip.departure_time)} – ${formatDateTime(trip.return_time)} tarihleri arasındaki tüm günlere yayılıyor. Değişiklikler seferin tamamını ve tüm günlerdeki saat/ücret dağılımını etkileyecek. Düzenlemeye devam edilsin mi?`,
      );
      if (!accepted) return;
    }
    setEditing({ type: "trip", id: trip.id });
  };

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
        <CalendarDays className="h-4 w-4 text-amber-500" />
        {dayLabel}
      </h2>

      {loading ? <p className="py-4 text-center text-sm text-slate-500">Loading daily records…</p> : null}
      {error ? <p role="alert" className="py-3 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && (
        <div className="space-y-3">
          {works.map((work) => (
            <article key={work.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Clock3 className="h-4 w-4 text-amber-600" /> Work
                  </h3>
                  <p className="mt-1 text-sm text-slate-700">{formatTime(work.start_time)} – {formatTime(work.end_time)} · {work.break_minutes} min break</p>
                  <p className="mt-1 text-xs text-slate-600">
                    {Number(work.normal_hours).toFixed(2)} regular hours
                    {Number(work.overtime_130) > 0 ? ` · ${Number(work.overtime_130).toFixed(2)} overtime hours (130%)` : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button aria-label="Edit work record" variant="ghost" size="icon" onClick={() => setEditing({ type: "work", id: work.id })}><Pencil className="h-4 w-4" /></Button>
                  <Button aria-label="Delete work record" variant="ghost" size="icon" className="text-red-600" onClick={() => void removeWork(work)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {editing?.type === "work" && editing.id === work.id && (
                <div className="mt-3">
                  <WorkCard key={`edit-work-${work.id}`} initialWork={work} onWorkSaved={() => { setEditing(null); onChanged(); }} />
                  <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing(null)}>Cancel</Button>
                </div>
              )}
            </article>
          ))}

          {trips.map((trip) => {
            const departure = new Date(trip.departure_time);
            const returnTime = new Date(trip.return_time);
            const spansDays = dateKey(departure) !== dateKey(returnTime);
            const dayAllowance = getTripDailyAllowance(
              departure,
              returnTime,
              trip.is_multi_day,
              Number(trip.calculated_allowance),
              date,
            );
            const oneWayCost = Number(trip.travel_cost_per_one_way || 0);
            const travelCost = oneWayCost * (
              Number(dateKey(departure) === date) + Number(dateKey(returnTime) === date)
            );
            return (
              <article key={trip.id} className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Truck className="h-4 w-4 text-emerald-600" /> Trip{spansDays ? " · Multi-day" : ""}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTime(trip.departure_time)} – {formatDateTime(trip.return_time)}</p>
                    <p className="mt-2 text-xs text-slate-700">Allowance for this day: <strong>{formatCurrency(dayAllowance)}</strong></p>
                    <p className="mt-1 text-xs text-sky-800">Travel reimbursement for this day: <strong>{formatCurrency(travelCost)}</strong></p>
                    {spansDays && <p className="mt-1 text-[11px] text-slate-500">Editing or deleting affects the entire trip and all of its days.</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button aria-label="Edit trip" variant="ghost" size="icon" onClick={() => beginTripEdit(trip)}><Pencil className="h-4 w-4" /></Button>
                    <Button aria-label="Delete trip" variant="ghost" size="icon" className="text-red-600" onClick={() => void removeTrip(trip)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                {editing?.type === "trip" && editing.id === trip.id && (
                  <div className="mt-3">
                    <TripCard key={`edit-trip-${trip.id}`} initialTrip={trip} onTripSaved={() => { setEditing(null); onChanged(); }} />
                    <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                )}
              </article>
            );
          })}

          {!works.length && !trips.length && <p className="py-2 text-center text-sm text-slate-500">No work or trip records for this day yet.</p>}
        </div>
      )}

      {!loading && !error && (
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={() => setEditing({ type: "new", kind: "work" })}><Plus className="mr-2 h-4 w-4" /> Add work hours</Button>
          <Button variant="outline" onClick={() => setEditing({ type: "new", kind: "trip" })}><Plus className="mr-2 h-4 w-4" /> Add trip</Button>
        </div>
      )}
      {editing?.type === "new" && (
        <div className="mt-3">
          {editing.kind === "work"
            ? <WorkCard key={`new-work-${date}`} initialDate={date} onWorkSaved={() => { setEditing(null); onChanged(); }} />
            : <TripCard key={`new-trip-${date}`} initialDate={date} onTripSaved={() => { setEditing(null); onChanged(); }} />}
          <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing(null)}>Cancel</Button>
        </div>
      )}
    </section>
  );
}
