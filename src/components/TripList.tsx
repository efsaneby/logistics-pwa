"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { History, Trash2, Calendar, Euro, RefreshCw } from "lucide-react";

interface TripCardData {
  id: string;
  departure_time: string;
  return_time: string;
  is_multi_day: boolean;
  calculated_allowance: number;
  created_at: string;
}

export default function TripList({ refreshKey }: { refreshKey: number }) {
  const [trips, setTrips] = useState<TripCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchTrips = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("trip_cards")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Supabase Hatası:", error.message);
        setErrorMsg(error.message);
      } else {
        setTrips(data || []);
      }
    } catch (err: any) {
      console.error("Ağ Hatası:", err);
      setErrorMsg("Bağlantı kurulamadı.");
    } finally {
      setLoading(false);
    }
  };

  // Mobil hidrasyon kilitlenmesini önlemek için istek sadece client hazır olduğunda atılır
  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (isMounted) {
        await fetchTrips();
      }
    };

    // Sayfa DOM'a tam oturduktan sonra çalıştırma (setTimeout ile 100ms gecikme)
    const timer = setTimeout(() => {
      loadData();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    if (!confirm("Bu sefer kaydını silmek istediğinden emin misin?")) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from("trip_cards").delete().eq("id", id);

      if (error) {
        alert("Silinirken hata oluştu: " + error.message);
      } else {
        setTrips((prev) => prev.filter((t) => t.id !== id));
      }
    } catch (err: any) {
      alert("Hata: " + err?.message);
    }
  };

  const totalAllowance = trips.reduce(
    (acc, curr) => acc + Number(curr.calculated_allowance),
    0,
  );

  const formatDate = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return `${d.toLocaleDateString("nl-NL")} ${d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`;
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-slate-200 dark:border-slate-800 mt-6">
      <CardHeader className="bg-slate-800 text-white rounded-t-lg flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <History className="w-4 h-4 text-amber-400" />
          Mijn Ritten (Kayıtlı Seferler)
        </CardTitle>
        <span className="text-xs bg-slate-700 px-2.5 py-1 rounded-full text-amber-300 font-bold">
          {trips.length} Rit
        </span>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* Toplam Özet Kutusu */}
        {trips.length > 0 && (
          <div className="flex justify-between items-center bg-amber-50 border border-amber-200 p-3 rounded-lg mb-3">
            <span className="text-xs font-semibold text-amber-900 flex items-center gap-1">
              <Euro className="w-4 h-4" /> Totaal Vergoeding:
            </span>
            <span className="text-lg font-extrabold text-amber-900">
              € {totalAllowance.toFixed(2).replace(".", ",")}
            </span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
            <p className="text-xs">Ritten laden...</p>
          </div>
        ) : errorMsg ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-red-500 font-medium">{errorMsg}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchTrips}
              className="text-xs"
            >
              Opnieuw proberen (Tekrar Denet)
            </Button>
          </div>
        ) : trips.length === 0 ? (
          <p className="text-xs text-center text-slate-500 py-4">
            Nog geen ritten opgeslagen.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {trips.map((trip) => (
              <div
                key={trip.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-slate-600 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatDate(trip.departure_time)}</span>
                  </div>
                  <div className="text-slate-500 pl-4">
                    👉 {formatDate(trip.return_time)}
                  </div>
                  <span className="inline-block mt-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                    {trip.is_multi_day ? "Meerdaagse" : "Eendaagse"}
                  </span>
                </div>

                <div className="flex flex-col items-end gap-2">
                  <span className="font-bold text-emerald-700 text-sm">
                    €{" "}
                    {Number(trip.calculated_allowance)
                      .toFixed(2)
                      .replace(".", ",")}
                  </span>
                  <Button
                    onClick={() => handleDelete(trip.id)}
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50 touch-manipulation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
