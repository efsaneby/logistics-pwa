"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Clock, Trash2, Calendar, RefreshCw } from "lucide-react";

interface WorkCardData {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  normal_hours: number;
  overtime_130: number;
  created_at: string;
}

export default function WorkList({ refreshKey }: { refreshKey: number }) {
  const [works, setWorks] = useState<WorkCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchWorks = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("work_cards")
        .select("*")
        .order("date", { ascending: false });

      if (error) {
        setErrorMsg(error.message);
      } else {
        setWorks(data || []);
      }
    } catch (err: any) {
      setErrorMsg("Bağlantı kurulamadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let isMounted = true;
    const timer = setTimeout(() => {
      if (isMounted) fetchWorks();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [refreshKey]);

  const handleDelete = async (id: string) => {
    if (!confirm("Bu çalışma kaydını silmek istediğinden emin misin?")) return;

    try {
      const supabase = createClient();
      const { error } = await supabase.from("work_cards").delete().eq("id", id);

      if (error) {
        alert("Silinirken hata oluştu: " + error.message);
      } else {
        setWorks((prev) => prev.filter((w) => w.id !== id));
      }
    } catch (err: any) {
      alert("Hata: " + err?.message);
    }
  };

  const totalNormal = works.reduce(
    (acc, curr) => acc + Number(curr.normal_hours || 0),
    0,
  );
  const totalOvertime = works.reduce(
    (acc, curr) => acc + Number(curr.overtime_130 || 0),
    0,
  );

  const formatTime = (dateString: string) => {
    try {
      const d = new Date(dateString);
      return d.toLocaleTimeString("nl-NL", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-slate-200 dark:border-slate-800 mt-6">
      <CardHeader className="bg-slate-800 text-white rounded-t-lg flex flex-row items-center justify-between py-3">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <Clock className="w-4 h-4 text-amber-400" />
          Mijn Werktijden (Çalışma Geçmişi)
        </CardTitle>
        <span className="text-xs bg-slate-700 px-2.5 py-1 rounded-full text-amber-300 font-bold">
          {works.length} Dagen
        </span>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {works.length > 0 && (
          <div className="grid grid-cols-2 gap-2 bg-slate-100 p-3 rounded-lg mb-3 text-center text-xs">
            <div>
              <span className="text-slate-500 block font-medium">
                Normaal Uren
              </span>
              <span className="text-base font-bold text-slate-800">
                {totalNormal.toFixed(1)} u
              </span>
            </div>
            <div>
              <span className="text-amber-700 block font-medium">
                Overwerk 130%
              </span>
              <span className="text-base font-bold text-amber-700">
                {totalOvertime.toFixed(1)} u
              </span>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-6 space-y-2 text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin text-amber-500" />
            <p className="text-xs">Uren laden...</p>
          </div>
        ) : errorMsg ? (
          <div className="text-center py-4 space-y-2">
            <p className="text-xs text-red-500 font-medium">{errorMsg}</p>
            <Button
              size="sm"
              variant="outline"
              onClick={fetchWorks}
              className="text-xs"
            >
              Opnieuw proberen
            </Button>
          </div>
        ) : works.length === 0 ? (
          <p className="text-xs text-center text-slate-500 py-4">
            Nog geen uren opgeslagen.
          </p>
        ) : (
          <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {works.map((work) => (
              <div
                key={work.id}
                className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-1 font-semibold text-slate-800">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{work.date}</span>
                  </div>
                  <div className="text-slate-500">
                    {formatTime(work.start_time)} - {formatTime(work.end_time)}{" "}
                    ({work.break_minutes}m pauze)
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="block font-bold text-slate-700">
                      {work.normal_hours}u N
                    </span>
                    {Number(work.overtime_130) > 0 && (
                      <span className="block font-bold text-amber-600 text-[11px]">
                        +{work.overtime_130}u (130%)
                      </span>
                    )}
                  </div>
                  <Button
                    onClick={() => handleDelete(work.id)}
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
