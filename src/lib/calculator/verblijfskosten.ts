// 2026 FNV Meerdaagse Hazır Matris Verisi
export const MEERDAAGSE_MATRIX_2026 = {
  eersteDag: {
    0: 52.79,
    1: 52.79,
    2: 51.14,
    3: 49.49,
    4: 47.84,
    5: 46.19,
    6: 44.54,
    7: 42.89,
    8: 41.24,
    9: 39.59,
    10: 37.94,
    11: 36.29,
    12: 34.64,
    13: 32.99,
    14: 31.34,
    15: 29.69,
    16: 28.04,
    17: 11.55,
    18: 9.9,
    19: 8.25,
    20: 6.6,
    21: 4.95,
    22: 3.3,
    23: 1.65,
    24: 0.0,
  },
  laatsteDag: {
    0: 0.0,
    1: 1.65,
    2: 3.3,
    3: 4.95,
    4: 6.6,
    5: 8.25,
    6: 9.9,
    7: 11.55,
    8: 13.2,
    9: 14.85,
    10: 16.5,
    11: 18.15,
    12: 19.8,
    13: 34.17,
    14: 35.82,
    15: 37.47,
    16: 39.12,
    17: 40.77,
    18: 42.42,
    19: 46.19,
    20: 49.96,
    21: 53.73,
    22: 57.5,
    23: 61.27,
    24: 65.04,
  },
  tussenliggendeDag: 65.04,
};

interface TripParams {
  departure: Date;
  returnTime: Date;
}

/**
 * Tek Günlük Sefer Hesaplayıcı (Eendaagse Rit)
 * Dakika bazlı hassas hesaplama (CAO Beroepsgoederenvervoer)
 */
export function calculateEendaagseRit(
  departure: Date,
  returnTime: Date,
): number {
  const diffMs = returnTime.getTime() - departure.getTime();
  const totalMinutes = Math.floor(diffMs / (1000 * 60));
  const totalHours = totalMinutes / 60;

  // 1. Baraj: 4 saatten az ise vergoeding verilmez
  if (totalHours < 4) return 0.0;

  const retHour = returnTime.getHours();

  // 2. Akşam saatleri hesabı (18:00 - 24:00 arasındaki dakikalar)
  let avondMinutes = 0;
  if (retHour >= 18) {
    const avondStart = new Date(returnTime);
    avondStart.setHours(18, 0, 0, 0);

    if (departure < avondStart) {
      avondMinutes = Math.floor(
        (returnTime.getTime() - avondStart.getTime()) / (1000 * 60),
      );
    } else {
      avondMinutes = totalMinutes;
    }
  }

  // 3. Gündüz dakikaları (Toplam süre - Akşam süresi)
  const basisMinutes = totalMinutes - avondMinutes;

  // Dakika başı tarifeler (Saatlik € 0,83 ve € 3,77)
  const basisRatePerMin = 0.83 / 60;
  const avondRatePerMin = 3.77 / 60;

  // Her kalem önce kendi içinde cent seviyesine yuvarlanır (Resmi sitedeki gibi)
  const basisSubtotal = Math.round(basisMinutes * basisRatePerMin * 100) / 100;
  const avondSubtotal = Math.round(avondMinutes * avondRatePerMin * 100) / 100;

  return Math.round((basisSubtotal + avondSubtotal) * 100) / 100;
}

/**
 * Çok Günlük Sefer Hesaplayıcı (Meerdaagse Rit)
 */
export function calculateMeerdaagseRit(
  departure: Date,
  returnTime: Date,
): number {
  const depHour = departure.getHours();
  const retHour = returnTime.getHours();

  // 1. İlk gün matrahı
  const firstDayAmount =
    MEERDAAGSE_MATRIX_2026.eersteDag[
      depHour as keyof typeof MEERDAAGSE_MATRIX_2026.eersteDag
    ] || 0;

  // 2. Son gün matrahı
  const lastDayAmount =
    MEERDAAGSE_MATRIX_2026.laatsteDag[
      retHour as keyof typeof MEERDAAGSE_MATRIX_2026.laatsteDag
    ] || 0;

  // 3. Aradaki tam gün sayısı
  const depDate = new Date(
    departure.getFullYear(),
    departure.getMonth(),
    departure.getDate(),
  );
  const retDate = new Date(
    returnTime.getFullYear(),
    returnTime.getMonth(),
    returnTime.getDate(),
  );
  const diffDays = Math.round(
    (retDate.getTime() - depDate.getTime()) / (1000 * 3600 * 24),
  );

  const fullDaysCount = Math.max(0, diffDays - 1);
  const middleDaysAmount =
    fullDaysCount * MEERDAAGSE_MATRIX_2026.tussenliggendeDag;

  const totalAllowance = firstDayAmount + middleDaysAmount + lastDayAmount;
  return Math.round(totalAllowance * 100) / 100;
}
