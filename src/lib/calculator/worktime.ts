import { getDutchPublicHoliday } from "@/lib/calendar/public-holidays";

export interface WorkHoursResult {
  totalHours: number; // Toplam net çalışma saati
  normalHours: number; // Hafta içi normal çalışma saati (günlük max 8 saat)
  overtime130: number; // Hafta içi %130 fazla mesai saati
  saturdayHours: number; // Cumartesi %150 ücretlendirilen saat
  sundayHours: number; // Pazar %200 ücretlendirilen saat
  dailyBreakdown: {
    date: string;
    totalHours: number;
    normalHours: number;
    overtime130: number;
    saturdayHours: number;
    sundayHours: number;
  }[];
}

/**
 * CAO Beroepsgoederenvervoer standartlarına göre günlük çalışma saatini hesaplar.
 * @param start Başlangıç zamanı
 * @param end Bitiş zamanı
 * @param pauseMinutes Mola süresi (dakika)
 */
export function calculateWorkHours(
  start: Date,
  end: Date,
  pauseMinutes: number = 0,
): WorkHoursResult {
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return {
      totalHours: 0,
      normalHours: 0,
      overtime130: 0,
      saturdayHours: 0,
      sundayHours: 0,
      dailyBreakdown: [],
    };
  }

  const grossHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
  const netHours = Math.max(0, grossHours - Math.max(0, pauseMinutes) / 60);
  const netRatio = grossHours > 0 ? netHours / grossHours : 0;
  const dailyHours = new Map<string, { weekday: number; saturday: number; sunday: number }>();
  let cursor = new Date(start);

  while (cursor < end) {
    const nextDay = new Date(cursor);
    nextDay.setHours(24, 0, 0, 0);
    const segmentEnd = new Date(Math.min(nextDay.getTime(), end.getTime()));
    const segmentHours = ((segmentEnd.getTime() - cursor.getTime()) / (1000 * 60 * 60)) * netRatio;
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`;
    const hours = dailyHours.get(key) ?? { weekday: 0, saturday: 0, sunday: 0 };
    const dayOfWeek = cursor.getDay();
    if (dayOfWeek === 6) hours.saturday += segmentHours;
    else if (dayOfWeek === 0) hours.sunday += segmentHours;
    else hours.weekday += segmentHours;
    dailyHours.set(key, hours);
    cursor = segmentEnd;
  }

  let normalHours = 0;
  let overtime130 = 0;
  let saturdayHours = 0;
  let sundayHours = 0;
  const dailyBreakdown = [];
  for (const [date, hours] of dailyHours) {
    const holiday = getDutchPublicHoliday(date) !== null;
    const dailyNormalHours = holiday ? 0 : Math.min(8, hours.weekday);
    const dailyOvertime130 = holiday ? hours.weekday : Math.max(0, hours.weekday - 8);
    normalHours += dailyNormalHours;
    overtime130 += dailyOvertime130;
    saturdayHours += hours.saturday;
    sundayHours += hours.sunday;
    dailyBreakdown.push({
      date,
      totalHours: Number((hours.weekday + hours.saturday + hours.sunday).toFixed(2)),
      normalHours: Number(dailyNormalHours.toFixed(2)),
      overtime130: Number(dailyOvertime130.toFixed(2)),
      saturdayHours: Number(hours.saturday.toFixed(2)),
      sundayHours: Number(hours.sunday.toFixed(2)),
    });
  }

  return {
    totalHours: Number(netHours.toFixed(2)),
    normalHours: Number(normalHours.toFixed(2)),
    overtime130: Number(overtime130.toFixed(2)),
    saturdayHours: Number(saturdayHours.toFixed(2)),
    sundayHours: Number(sundayHours.toFixed(2)),
    dailyBreakdown,
  };
}

export function calculateRecordedWorkHours(
  date: string,
  startTime: string,
  endTime: string,
  pauseMinutes: number = 0,
): WorkHoursResult {
  const start = new Date(`${date}T${startTime}`);
  const end = new Date(`${date}T${endTime}`);
  if (end <= start) end.setDate(end.getDate() + 1);
  return calculateWorkHours(start, end, pauseMinutes);
}
