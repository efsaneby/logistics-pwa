const toDateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function getEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getDutchPublicHolidays(year: number): Map<string, string> {
  const easterSunday = getEasterSunday(year);
  const kingsDay = new Date(year, 3, 27);
  if (kingsDay.getDay() === 0) kingsDay.setDate(26);

  const holidays = new Map<string, string>([
    [toDateKey(new Date(year, 0, 1)), "Nieuwjaarsdag"],
    [toDateKey(addDays(easterSunday, -2)), "Goede Vrijdag"],
    [toDateKey(easterSunday), "Eerste paasdag"],
    [toDateKey(addDays(easterSunday, 1)), "Tweede paasdag"],
    [toDateKey(kingsDay), "Koningsdag"],
    [toDateKey(new Date(year, 4, 5)), "Bevrijdingsdag"],
    [toDateKey(addDays(easterSunday, 39)), "Hemelvaartsdag"],
    [toDateKey(addDays(easterSunday, 49)), "Eerste pinksterdag"],
    [toDateKey(addDays(easterSunday, 50)), "Tweede pinksterdag"],
    [toDateKey(new Date(year, 11, 25)), "Eerste kerstdag"],
    [toDateKey(new Date(year, 11, 26)), "Tweede kerstdag"],
  ]);

  if (year % 5 !== 0) holidays.delete(`${year}-05-05`);
  return holidays;
}

export function getDutchPublicHoliday(date: string): string | null {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year) || date.length !== 10) return null;
  return getDutchPublicHolidays(year).get(date) ?? null;
}
