export interface WorkHoursResult {
  totalHours: number; // Toplam net çalışma saati
  normalHours: number; // Normal çalışma saati (Günlük max 8 saat)
  overtime130: number; // %130 Fazla mesai saati
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
  if (end <= start) {
    return { totalHours: 0, normalHours: 0, overtime130: 0 };
  }

  // Toplam süreyi milisaniye bazında hesapla
  const diffMs = end.getTime() - start.getTime();
  const grossHours = diffMs / (1000 * 60 * 60);

  // Molayı saat cinsinden düş
  const pauseHours = pauseMinutes / 60;
  const netHours = Math.max(0, grossHours - pauseHours);

  // CAO kuralı: Günlük standart 8 saattir. 8 saatin üzeri %130 mesaidir.
  const normalHours = Math.min(8, netHours);
  const overtime130 = Math.max(0, netHours - 8);

  return {
    totalHours: Number(netHours.toFixed(2)),
    normalHours: Number(normalHours.toFixed(2)),
    overtime130: Number(overtime130.toFixed(2)),
  };
}
