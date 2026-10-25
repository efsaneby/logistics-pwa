"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import WorkCard from "@/components/WorkCard";
import TripCard from "@/components/TripCard";
import DayAbsenceCard, { type AbsenceType } from "@/components/DayAbsenceCard";
import { getTripDailyAllowance } from "@/lib/calculator/trip-allowance";
import { calculateRecordedWorkHours } from "@/lib/calculator/worktime";
import { createClient } from "@/lib/supabase/client";
import { syncWorkGeneratedTrips } from "@/lib/supabase/sync-work-trips";
import { getTripAllowanceRatesForDate } from "@/lib/supabase/trip-allowance-rates";
import { CalendarDays, Clock3, Pencil, Save, Trash2, Truck } from "lucide-react";

interface WorkRecord {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  normal_hours: number;
  overtime_130: number;
  is_overnight: boolean;
}

interface TripRecord {
  id: string;
  departure_time: string;
  return_time: string;
  is_multi_day: boolean;
  calculated_allowance: number;
  travel_cost_per_one_way: number;
  generated_start_work_id: string | null;
  generated_end_work_id: string | null;
}

interface VehicleUsageRecord {
  id: string;
  tractor_identifier: string;
  trailer_identifier: string | null;
  started_at: string;
  ended_at: string | null;
}

type EditingRecord = { type: "work" | "trip"; id: string } | null;

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const formatTime = (value: string) => value.slice(0, 5);
const formatHours = (hours: number) => {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}h${String(totalMinutes % 60).padStart(2, "0")}`;
};
const formatDateTime = (value: string) => {
  const date = new Date(value);
  return `${date.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })} ${date.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
};
const formatCurrency = (amount: number) =>
  new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(amount);

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
  const [vehicleUsages, setVehicleUsages] = useState<VehicleUsageRecord[]>([]);
  const [vehicleUsageError, setVehicleUsageError] = useState<string | null>(null);
  const [absence, setAbsence] = useState<AbsenceType | null>(null);
  const [tripRates, setTripRates] = useState<Map<string, Awaited<ReturnType<typeof getTripAllowanceRatesForDate>>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingRecord>(null);
  const [note, setNote] = useState("");
  const [savedNote, setSavedNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(true);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  const [noteMessage, setNoteMessage] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const timer = setTimeout(() => {
      const load = async () => {
        if (!alive) return;
        setLoading(true);
        setError(null);
        setNoteLoading(true);
        setNoteError(null);
        setNoteMessage(null);
        setVehicleUsageError(null);
        const supabase = createClient();
        try {
          const dayStart = new Date(`${date}T00:00:00`);
          const dayEnd = new Date(dayStart);
          dayEnd.setDate(dayEnd.getDate() + 1);
          const [workResult, tripResult, absenceResult, noteResult, vehicleUsageResult] = await Promise.all([
            supabase.from("work_cards")
              .select("id, date, start_time, end_time, break_minutes, normal_hours, overtime_130, is_overnight")
              .eq("date", date)
              .order("start_time"),
            supabase.from("trip_cards")
              .select("id, departure_time, return_time, is_multi_day, calculated_allowance, travel_cost_per_one_way, generated_start_work_id, generated_end_work_id")
              .order("departure_time"),
            supabase.from("driver_absences")
              .select("absence_type")
              .eq("date", date)
              .maybeSingle(),
            supabase.from("driver_day_notes")
              .select("note")
              .eq("date", date)
              .maybeSingle(),
            supabase.from("driver_vehicle_usages")
              .select("id, tractor_identifier, trailer_identifier, started_at, ended_at")
              .lt("started_at", dayEnd.toISOString())
              .or(`ended_at.is.null,ended_at.gt.${dayStart.toISOString()}`)
              .order("started_at"),
          ]);
          if (!alive) return;
          if (vehicleUsageResult.error) {
            console.error("Voertuiggebruik voor dag laden mislukt:", vehicleUsageResult.error);
            setVehicleUsageError("Voertuiggegevens voor deze dag konden niet worden geladen.");
            setVehicleUsages([]);
          } else {
            setVehicleUsages(vehicleUsageResult.data ?? []);
          }
          if (workResult.error || tripResult.error || absenceResult.error) {
            setError(workResult.error?.message ?? tripResult.error?.message ?? absenceResult.error?.message ?? "De gegevens van deze dag konden niet worden geladen.");
            setWorks([]);
            setTrips([]);
          } else {
            const dayTrips = (tripResult.data ?? []).filter((trip) => {
              const start = new Date(trip.departure_time);
              const end = new Date(trip.return_time);
              return dateKey(start) <= date && dateKey(end) >= date;
            });
            const ratesEntries = await Promise.all(dayTrips.map(async (trip) => {
              const departure = new Date(trip.departure_time);
              return [
                trip.id,
                await getTripAllowanceRatesForDate(dateKey(departure)),
              ] as const;
            }));
            setWorks(workResult.data ?? []);
            setTrips(dayTrips);
            setTripRates(new Map(ratesEntries));
            setAbsence(absenceResult.data?.absence_type as AbsenceType | null ?? null);
          }
          if (noteResult.error) {
            setNoteError(noteResult.error.message);
          } else {
            const loadedNote = noteResult.data?.note ?? "";
            setNote(loadedNote);
            setSavedNote(loadedNote);
            setNoteError(null);
          }
        } catch (loadError) {
          if (!alive) return;
          console.error("Daggegevens laden mislukt:", loadError);
          setError("De gegevens van deze dag konden niet worden geladen. Probeer het opnieuw.");
          setNoteError("De notitie kon niet worden geladen.");
        } finally {
          if (!alive) return;
          setNoteLoading(false);
          setLoading(false);
        }
      };
      void load();
    }, 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [date, refreshKey]);

  const saveNote = async () => {
    const trimmedNote = note.trim();
    setNoteSaving(true);
    setNoteError(null);
    setNoteMessage(null);
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Log in om een dagnotitie op te slaan.");

      const result = trimmedNote
        ? await supabase.from("driver_day_notes").upsert(
            { user_id: authData.user.id, date, note: trimmedNote },
            { onConflict: "user_id,date" },
          )
        : await supabase.from("driver_day_notes")
            .delete()
            .eq("user_id", authData.user.id)
            .eq("date", date);
      if (result.error) throw result.error;

      setNote(trimmedNote);
      setSavedNote(trimmedNote);
      setNoteMessage(trimmedNote ? "Notitie opgeslagen." : "Notitie verwijderd.");
      onChanged();
    } catch (saveError) {
      console.error("Dagnotitie opslaan mislukt:", saveError);
      setNoteError(saveError instanceof Error ? saveError.message : "De notitie kon niet worden opgeslagen.");
    } finally {
      setNoteSaving(false);
    }
  };

  const removeWork = async (work: WorkRecord) => {
    if (!confirm("Weet je zeker dat je deze werktijd wilt verwijderen?")) return;
    const { error: deleteError } = await createClient().from("work_cards").delete().eq("id", work.id);
    if (deleteError) {
      alert(`Verwijderen mislukt: ${deleteError.message}`);
      return;
    }
    try {
      await syncWorkGeneratedTrips([work.date]);
    } catch (syncError) {
      alert(
        "De Werk-uren zijn verwijderd, maar de automatische Rit kon niet worden bijgewerkt: "
        + (syncError instanceof Error ? syncError.message : "Onbekende fout."),
      );
    }
    onChanged();
  };

  const removeTrip = async (trip: TripRecord) => {
    const departure = new Date(trip.departure_time);
    const returnTime = new Date(trip.return_time);
    const spansDays = dateKey(departure) !== dateKey(returnTime);
    const affectedDates = `${formatDateTime(trip.departure_time)} – ${formatDateTime(trip.return_time)}`;
    const message = spansDays
      ? `Deze rit loopt van ${affectedDates} en beslaat meerdere dagen. Als je de rit verwijdert, worden ook de verblijfskosten en reiskosten van alle dagen verwijderd. Wil je doorgaan?`
      : "Weet je zeker dat je deze rit wilt verwijderen?";
    if (!confirm(message)) return;
    const { error: deleteError } = await createClient().from("trip_cards").delete().eq("id", trip.id);
    if (deleteError) {
      alert(`Verwijderen mislukt: ${deleteError.message}`);
      return;
    }
    onChanged();
  };

  const beginTripEdit = (trip: TripRecord) => {
    const departure = new Date(trip.departure_time);
    const returnTime = new Date(trip.return_time);
    if (dateKey(departure) !== dateKey(returnTime)) {
      const accepted = confirm(
        `Deze rit loopt van ${formatDateTime(trip.departure_time)} tot ${formatDateTime(trip.return_time)} en beslaat meerdere dagen. Wijzigingen hebben invloed op de hele rit en op de uren en vergoedingen van alle dagen. Wil je doorgaan?`,
      );
      if (!accepted) return;
    }
    setEditing({ type: "trip", id: trip.id });
  };

  const dayLabel = new Date(`${date}T12:00:00`).toLocaleDateString("nl-NL", {
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

      {loading ? <p className="py-4 text-center text-sm text-slate-500">Daggegevens laden…</p> : null}
      {error ? <p role="alert" className="py-3 text-sm text-red-600">{error}</p> : null}

      {!loading && !error && (
        <div className="space-y-3">
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Truck className="h-4 w-4 text-slate-600" />
              Voertuigen gebruikt op deze dag
            </h3>
            {vehicleUsageError ? (
              <p role="alert" className="mt-2 text-xs text-red-600">{vehicleUsageError}</p>
            ) : vehicleUsages.length > 0 ? (
              <ul className="mt-2 space-y-2">
                {vehicleUsages.map((usage) => (
                  <li key={usage.id} className="rounded-lg bg-white p-2 text-xs">
                    <p className="break-words font-medium text-slate-800">
                      Trekker {usage.tractor_identifier} · Oplegger {usage.trailer_identifier || "niet ingevuld"}
                    </p>
                    <p className="mt-1 text-slate-600">
                      {formatDateTime(usage.started_at)} – {usage.ended_at ? formatDateTime(usage.ended_at) : "Nu"}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Er zijn geen voertuigperiodes geregistreerd voor deze dag.</p>
            )}
          </section>
          {works.map((work) => {
            const workHours = calculateRecordedWorkHours(
              work.date,
              work.start_time,
              work.end_time,
              work.break_minutes,
            );
            return (
            <article key={work.id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <Clock3 className="h-4 w-4 text-amber-600" /> Werk
                  </h3>
                  <p className="mt-1 text-sm text-slate-700">{formatTime(work.start_time)} – {formatTime(work.end_time)} · {work.break_minutes} min pauze</p>
                  {work.is_overnight && <p className="mt-1 text-xs font-medium text-indigo-700">Overnachting</p>}
                  <p className="mt-1 text-xs text-slate-600">
                    {formatHours(workHours.normalHours)} normale uren
                    {workHours.overtime130 > 0
                      ? ` · ${formatHours(workHours.overtime130)} overuren (130%)`
                      : ""}
                    {workHours.saturdayHours > 0
                      ? ` · ${formatHours(workHours.saturdayHours)} zaterdag (150%)`
                      : ""}
                    {workHours.sundayHours > 0
                      ? ` · ${formatHours(workHours.sundayHours)} zondag (200%)`
                      : ""}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button aria-label="Werktijd bewerken" variant="ghost" size="icon" onClick={() => setEditing({ type: "work", id: work.id })}><Pencil className="h-4 w-4" /></Button>
                  <Button aria-label="Werktijd verwijderen" variant="ghost" size="icon" className="text-red-600" onClick={() => void removeWork(work)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              {editing?.type === "work" && editing.id === work.id && (
                <div className="mt-3">
                  <WorkCard key={`edit-work-${work.id}`} initialWork={work} onWorkSaved={() => { setEditing(null); onChanged(); }} />
                  <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing(null)}>Annuleren</Button>
                </div>
              )}
            </article>
          );
          })}

          {trips.map((trip) => {
            const departure = new Date(trip.departure_time);
            const returnTime = new Date(trip.return_time);
            const spansDays = dateKey(departure) !== dateKey(returnTime);
            const allowanceRates = tripRates.get(trip.id);
            if (!allowanceRates) {
              return (
                <article key={trip.id} role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  Ritvergoedingen voor deze datum konden niet worden geladen.
                </article>
              );
            }
            const dayAllowance = getTripDailyAllowance(
              departure,
              returnTime,
              trip.is_multi_day,
              Number(trip.calculated_allowance),
              date,
              allowanceRates,
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
                      <Truck className="h-4 w-4 text-emerald-600" /> Rit{spansDays ? " · Meerdaags" : ""}
                    </h3>
                    <p className="mt-1 text-sm text-slate-700">{formatDateTime(trip.departure_time)} – {formatDateTime(trip.return_time)}</p>
                    <p className="mt-2 text-xs text-slate-700">Verblijfskosten voor deze dag: <strong>{formatCurrency(dayAllowance)}</strong></p>
                    <p className="mt-1 text-xs text-sky-800">Reiskosten voor deze dag: <strong>{formatCurrency(travelCost)}</strong></p>
                    {spansDays && <p className="mt-1 text-[11px] text-slate-500">Bewerken of verwijderen heeft invloed op de hele rit en alle ritdagen.</p>}
                  </div>
                  <div className="flex gap-1">
                    {trip.generated_start_work_id ? (
                      <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-medium text-slate-600">Automatisch</span>
                    ) : (
                      <>
                        <Button aria-label="Rit bewerken" variant="ghost" size="icon" onClick={() => beginTripEdit(trip)}><Pencil className="h-4 w-4" /></Button>
                        <Button aria-label="Rit verwijderen" variant="ghost" size="icon" className="text-red-600" onClick={() => void removeTrip(trip)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </div>
                </div>
                {editing?.type === "trip" && editing.id === trip.id && (
                  <div className="mt-3">
                    <TripCard key={`edit-trip-${trip.id}`} initialTrip={trip} onTripSaved={() => { setEditing(null); onChanged(); }} />
                    <Button variant="ghost" className="mt-2 w-full" onClick={() => setEditing(null)}>Annuleren</Button>
                  </div>
                )}
              </article>
            );
          })}

          {!works.length && !trips.length && <p className="py-2 text-center text-sm text-slate-500">Er zijn nog geen werk- of ritgegevens voor deze dag.</p>}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="mt-4">
            <DayAbsenceCard
              key={`absence-${date}-${absence ?? "none"}`}
              date={date}
              initialAbsence={absence}
              hasWork={works.length > 0}
              onSaved={onChanged}
            />
          </div>
          {absence ? (
            <p className="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
              {absence === "sick" ? "Ziekte" : "Vakantie"} is geregistreerd als 8u00 normale uren.
              Er worden geen overuren, weekendtoeslag of Rit berekend.
            </p>
          ) : (
            <div className="mt-4">
              <WorkCard
                key={`new-work-${date}`}
                initialDate={date}
                onWorkSaved={onChanged}
              />
            </div>
          )}
        </>
      )}

      <section className="mt-4 space-y-2 border-t border-slate-100 pt-4">
        <label htmlFor="day-note" className="block text-sm font-semibold text-slate-800">Notitie voor deze dag</label>
        <textarea
          id="day-note"
          value={note}
          onChange={(event) => {
            setNote(event.target.value);
            setNoteMessage(null);
          }}
          maxLength={1000}
          rows={3}
          placeholder="Bijvoorbeeld: bijzonderheden over je werkdag…"
          disabled={noteLoading}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 disabled:bg-slate-50"
        />
        <div className="flex items-center justify-between gap-3">
          <p aria-live="polite" className={`text-xs ${noteError ? "text-red-600" : "text-emerald-700"}`}>
            {noteLoading ? "Notitie laden…" : noteError ?? noteMessage ?? `${note.length}/1000`}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => void saveNote()}
            disabled={noteLoading || noteSaving || note === savedNote}
          >
            <Save className="mr-2 h-4 w-4" />
            {noteSaving ? "Opslaan…" : note.trim() ? "Notitie opslaan" : "Notitie verwijderen"}
          </Button>
        </div>
      </section>
    </section>
  );
}
