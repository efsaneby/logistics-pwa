import {
  calculateEendaagseRit,
  calculateMeerdaagseRit,
} from "@/lib/calculator/verblijfskosten";
import { createClient } from "@/lib/supabase/client";
import { getTripAllowanceRatesForDate } from "@/lib/supabase/trip-allowance-rates";

interface WorkRecord {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_overnight: boolean;
}

interface DailyWork {
  date: string;
  firstWork: WorkRecord;
  lastWork: WorkRecord;
  isOvernight: boolean;
}

interface GeneratedTrip {
  user_id: string;
  departure_time: string;
  return_time: string;
  is_multi_day: boolean;
  calculated_allowance: number;
  travel_cost_per_one_way: number;
  generated_start_work_id: string;
  generated_end_work_id: string;
}

const localDateTime = (date: string, time: string) => new Date(`${date}T${time}`);
const dateKey = (value: string) => value.slice(0, 10);

export async function syncWorkGeneratedTrips(affectedDates: string[]) {
  if (!affectedDates.length) return { tripsUpdated: 0, hasPendingOvernight: false };

  const supabase = createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error("Log in om de automatische Rit bij te werken.");

  const [workResult, generatedTripsResult, profileResult] = await Promise.all([
    supabase.from("work_cards")
      .select("id, date, start_time, end_time, is_overnight")
      .order("date")
      .order("start_time"),
    supabase.from("trip_cards")
      .select("id, departure_time, return_time, generated_start_work_id, travel_cost_per_one_way")
      .not("generated_start_work_id", "is", null),
    supabase.from("driver_profiles")
      .select("travel_cost_per_one_way")
      .eq("user_id", authData.user.id)
      .single(),
  ]);

  if (workResult.error) throw workResult.error;
  if (generatedTripsResult.error) throw generatedTripsResult.error;
  if (profileResult.error) throw profileResult.error;

  const workByDate = new Map<string, WorkRecord[]>();
  for (const work of workResult.data ?? []) {
    const dayWorks = workByDate.get(work.date) ?? [];
    dayWorks.push(work);
    workByDate.set(work.date, dayWorks);
  }

  const dailyWorks: DailyWork[] = [...workByDate.entries()]
    .sort(([firstDate], [secondDate]) => firstDate.localeCompare(secondDate))
    .map(([date, dayWorks]) => {
      const firstWork = [...dayWorks].sort((first, second) =>
        first.start_time.localeCompare(second.start_time),
      )[0];
      const lastWork = [...dayWorks].sort((first, second) =>
        second.end_time.localeCompare(first.end_time),
      )[0];
      return {
        date,
        firstWork,
        lastWork,
        isOvernight: dayWorks.some((work) => work.is_overnight),
      };
    });

  const intervals: { start: DailyWork; end: DailyWork }[] = [];
  let overnightStart: DailyWork | null = null;
  for (const day of dailyWorks) {
    if (day.isOvernight) {
      overnightStart ??= day;
      continue;
    }

    if (overnightStart) {
      intervals.push({ start: overnightStart, end: day });
      overnightStart = null;
    } else {
      intervals.push({ start: day, end: day });
    }
  }

  const affectedStart = affectedDates.reduce((start, date) => date < start ? date : start);
  const affectedEnd = affectedDates.reduce((end, date) => date > end ? date : end);
  let syncStart = affectedStart;
  let syncEnd = affectedEnd;
  let rangeExpanded = true;
  while (rangeExpanded) {
    const previousStart = syncStart;
    const previousEnd = syncEnd;

    for (const trip of generatedTripsResult.data ?? []) {
      const tripStart = dateKey(trip.departure_time);
      const tripEnd = dateKey(trip.return_time);
      if (tripStart <= syncEnd && tripEnd >= syncStart) {
        if (tripStart < syncStart) syncStart = tripStart;
        if (tripEnd > syncEnd) syncEnd = tripEnd;
      }
    }

    for (const interval of intervals) {
      if (interval.start.date <= syncEnd && interval.end.date >= syncStart) {
        if (interval.start.date < syncStart) syncStart = interval.start.date;
        if (interval.end.date > syncEnd) syncEnd = interval.end.date;
      }
    }

    rangeExpanded = syncStart !== previousStart || syncEnd !== previousEnd;
  }
  const datesOverlap = (start: string, end: string) => start <= syncEnd && end >= syncStart;
  const scopedIntervals = intervals.filter(({ start, end }) => datesOverlap(start.date, end.date));
  const scopedExistingTrips = (generatedTripsResult.data ?? []).filter((trip) =>
    datesOverlap(dateKey(trip.departure_time), dateKey(trip.return_time)),
  );

  const existingByStartId = new Map(
    scopedExistingTrips.map((trip) => [trip.generated_start_work_id, trip]),
  );
  const tripsToUpsert: GeneratedTrip[] = await Promise.all(scopedIntervals.map(async ({ start, end }) => {
    const departure = localDateTime(start.date, start.firstWork.start_time);
    const returnTime = localDateTime(end.date, end.lastWork.end_time);
    if (Number.isNaN(departure.getTime()) || Number.isNaN(returnTime.getTime()) || returnTime <= departure) {
      throw new Error(`Controleer de Werk-begin- en eindtijd op ${end.date}; de automatische Rit kan niet worden berekend.`);
    }

    const isMultiDay = start.date !== end.date;
    const existing = existingByStartId.get(start.firstWork.id);
    const allowanceRates = await getTripAllowanceRatesForDate(start.date);
    return {
      user_id: authData.user.id,
      departure_time: departure.toISOString(),
      return_time: returnTime.toISOString(),
      is_multi_day: isMultiDay,
      calculated_allowance: isMultiDay
        ? calculateMeerdaagseRit(departure, returnTime, allowanceRates)
        : calculateEendaagseRit(departure, returnTime, allowanceRates),
      travel_cost_per_one_way: Number(existing?.travel_cost_per_one_way ?? profileResult.data.travel_cost_per_one_way),
      generated_start_work_id: start.firstWork.id,
      generated_end_work_id: end.lastWork.id,
    };
  }));

  const tripsToInsert: GeneratedTrip[] = [];
  for (const trip of tripsToUpsert) {
    const existing = existingByStartId.get(trip.generated_start_work_id);
    if (!existing) {
      tripsToInsert.push(trip);
      continue;
    }

    const { error } = await supabase.from("trip_cards")
      .update({
        departure_time: trip.departure_time,
        return_time: trip.return_time,
        is_multi_day: trip.is_multi_day,
        calculated_allowance: trip.calculated_allowance,
        generated_end_work_id: trip.generated_end_work_id,
      })
      .eq("id", existing.id);
    if (error) throw error;
  }

  if (tripsToInsert.length) {
    const { data, error } = await supabase.from("trip_cards")
      .insert(tripsToInsert)
      .select("generated_start_work_id");
    if (error) throw error;
    if (data.length !== tripsToInsert.length) {
      throw new Error("Niet alle automatische Ritten zijn bevestigd door de database.");
    }
  }

  const activeStartIds = new Set(tripsToUpsert.map((trip) => trip.generated_start_work_id));
  const staleTripIds = scopedExistingTrips
    .filter((trip) => !activeStartIds.has(trip.generated_start_work_id))
    .map((trip) => trip.id);
  if (staleTripIds.length) {
    const { error } = await supabase.from("trip_cards").delete().in("id", staleTripIds);
    if (error) throw error;
  }

  return {
    tripsUpdated: tripsToUpsert.length,
    hasPendingOvernight: overnightStart !== null
      && overnightStart.date <= syncEnd
      && dailyWorks.some((day) => day.date >= syncStart && day.date <= syncEnd && day.isOvernight),
  };
}
