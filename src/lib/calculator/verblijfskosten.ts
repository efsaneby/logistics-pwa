export interface TripAllowanceRates {
  single_day_minimum_hours: number;
  single_day_day_rate_per_hour: number;
  single_day_evening_rate_per_hour: number;
  single_day_evening_start_hour: number;
  multi_day_intermediate_day_amount: number;
  first_day_amount_by_hour: Record<number, number>;
  last_day_amount_by_hour: Record<number, number>;
}

/**
 * Calculates a one-day trip allowance using the rates effective on its departure date.
 */
export function calculateEendaagseRit(
  departure: Date,
  returnTime: Date,
  rates: TripAllowanceRates,
): number {
  const totalMinutes = Math.floor(
    (returnTime.getTime() - departure.getTime()) / (1000 * 60),
  );
  if (totalMinutes / 60 < rates.single_day_minimum_hours) return 0;

  const eveningStart = new Date(returnTime);
  eveningStart.setHours(rates.single_day_evening_start_hour, 0, 0, 0);
  const eveningMinutes = returnTime.getTime() <= eveningStart.getTime()
    ? 0
    : Math.floor(
        (returnTime.getTime() - Math.max(departure.getTime(), eveningStart.getTime()))
        / (1000 * 60),
      );
  const dayMinutes = totalMinutes - eveningMinutes;
  const dayAmount = Math.round(
    dayMinutes * (rates.single_day_day_rate_per_hour / 60) * 100,
  ) / 100;
  const eveningAmount = Math.round(
    eveningMinutes * (rates.single_day_evening_rate_per_hour / 60) * 100,
  ) / 100;

  return Math.round((dayAmount + eveningAmount) * 100) / 100;
}

/**
 * Calculates a multi-day trip allowance using the rates effective on its departure date.
 */
export function calculateMeerdaagseRit(
  departure: Date,
  returnTime: Date,
  rates: TripAllowanceRates,
): number {
  const firstDayAmount = rates.first_day_amount_by_hour[departure.getHours()] ?? 0;
  const lastDayAmount = rates.last_day_amount_by_hour[returnTime.getHours()] ?? 0;
  const departureDay = new Date(
    departure.getFullYear(),
    departure.getMonth(),
    departure.getDate(),
  );
  const returnDay = new Date(
    returnTime.getFullYear(),
    returnTime.getMonth(),
    returnTime.getDate(),
  );
  const dayDifference = Math.round(
    (returnDay.getTime() - departureDay.getTime()) / (1000 * 60 * 60 * 24),
  );
  const intermediateDays = Math.max(0, dayDifference - 1);

  return Math.round(
    (
      firstDayAmount
      + intermediateDays * rates.multi_day_intermediate_day_amount
      + lastDayAmount
    ) * 100,
  ) / 100;
}
