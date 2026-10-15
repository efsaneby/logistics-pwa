import { MEERDAAGSE_MATRIX_2026 } from "@/lib/calculator/verblijfskosten";

const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const dayOrdinal = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
};

export function getTripDailyAllowance(
  departure: Date,
  returnTime: Date,
  isMultiDay: boolean,
  calculatedAllowance: number,
  dateKey: string,
) {
  const departureKey = toDateKey(departure);
  const returnKey = toDateKey(returnTime);
  if (dateKey < departureKey || dateKey > returnKey) return 0;

  const firstOrdinal = dayOrdinal(departureKey);
  const dayCount = dayOrdinal(returnKey) - firstOrdinal + 1;
  if (!isMultiDay) {
    return dateKey === departureKey ? Number(calculatedAllowance || 0) : 0;
  }
  if (dayCount <= 1) return Number(calculatedAllowance || 0);

  const index = dayOrdinal(dateKey) - firstOrdinal;
  if (index === 0) {
    return MEERDAAGSE_MATRIX_2026.eersteDag[
      departure.getHours() as keyof typeof MEERDAAGSE_MATRIX_2026.eersteDag
    ] || 0;
  }
  if (index === dayCount - 1) {
    return MEERDAAGSE_MATRIX_2026.laatsteDag[
      returnTime.getHours() as keyof typeof MEERDAAGSE_MATRIX_2026.laatsteDag
    ] || 0;
  }
  return MEERDAAGSE_MATRIX_2026.tussenliggendeDag;
}
