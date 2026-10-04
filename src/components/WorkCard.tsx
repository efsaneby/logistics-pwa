"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateWorkHours, WorkHoursResult } from "@/lib/calculator/worktime";
import { createClient } from "@/lib/supabase/client";
import { Clock, Calculator, Save } from "lucide-react";

export default function WorkCard({
  onWorkSaved,
}: {
  onWorkSaved?: () => void;
}) {
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [pauseMinutes, setPauseMinutes] = useState("60");
  const [result, setResult] = useState<WorkHoursResult | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCalculate = () => {
    if (!startTime || !endTime) {
      alert("Lütfen başlama ve bitiş saatlerini girin.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      alert("Bitiş saati başlama saatinden sonra olmalıdır!");
      return;
    }

    const calculated = calculateWorkHours(
      start,
      end,
      Number(pauseMinutes) || 0,
    );
    setResult(calculated);
  };

  const handleSave = async () => {
    if (!result || !startTime || !endTime) return;

    try {
      setSaving(true);
      const supabase = createClient();
      const startDate = new Date(startTime);
      const endDate = new Date(endTime);

      // YYYY-MM-DD biçiminde tarih
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, "0");
      const day = String(startDate.getDate()).padStart(2, "0");
      const localDate = `${year}-${month}-${day}`;

      // HH:mm:ss biçiminde saatler (Supabase TIME kolonu için)
      const startFormatted = startDate.toTimeString().split(" ")[0];
      const endFormatted = endDate.toTimeString().split(" ")[0];

      const { error } = await supabase.from("work_cards").insert([
        {
          date: localDate,
          start_time: startFormatted,
          end_time: endFormatted,
          break_minutes: Number(pauseMinutes) || 0,
          normal_hours: result.normalHours,
          overtime_130: result.overtime130,
        },
      ]);

      if (error) {
        alert("Kaydedilirken hata oluştu: " + error.message);
      } else {
        alert("Çalışma saati başarıyla kaydedildi! ⏱️");
        setStartTime("");
        setEndTime("");
        setResult(null);
        onWorkSaved?.();
      }
    } catch (err: any) {
      alert("Hata: " + (err?.message || "Bilinmeyen bir hata oluştu."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-slate-200 dark:border-slate-800">
      <CardHeader className="bg-slate-900 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-amber-400" />
          Uren Registratie (Saat Kaydı)
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="startTime"
              className="text-xs font-semibold text-slate-600"
            >
              Aanvang (Başlangıç Tarihi ve Saati)
            </Label>
            <Input
              id="startTime"
              type="datetime-local"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1 touch-manipulation"
            />
          </div>

          <div>
            <Label
              htmlFor="endTime"
              className="text-xs font-semibold text-slate-600"
            >
              Einde (Bitiş Tarihi ve Saati)
            </Label>
            <Input
              id="endTime"
              type="datetime-local"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1 touch-manipulation"
            />
          </div>

          <div>
            <Label
              htmlFor="pause"
              className="text-xs font-semibold text-slate-600"
            >
              Pauze (Mola Süresi - Dakika)
            </Label>
            <Input
              id="pause"
              type="number"
              min="0"
              step="5"
              value={pauseMinutes}
              onChange={(e) => setPauseMinutes(e.target.value)}
              className="mt-1 touch-manipulation"
            />
          </div>
        </div>

        <Button
          onClick={handleCalculate}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center justify-center gap-2 touch-manipulation py-3"
        >
          <Calculator className="w-4 h-4" />
          Uren Berekenen
        </Button>

        {result !== null && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Totaal
                </span>
                <span className="text-lg font-bold text-slate-800">
                  {result.totalHours} u
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Normaal
                </span>
                <span className="text-lg font-bold text-slate-800">
                  {result.normalHours} u
                </span>
              </div>
              <div>
                <span className="text-[10px] text-amber-700 uppercase block font-semibold">
                  Overwerk 130%
                </span>
                <span className="text-lg font-bold text-amber-700">
                  {result.overtime130} u
                </span>
              </div>
            </div>

            <Button
              onClick={handleSave}
              disabled={saving}
              variant="outline"
              className="w-full border-amber-600 text-amber-800 hover:bg-amber-100 flex items-center justify-center gap-2 touch-manipulation"
            >
              <Save className="w-4 h-4" />
              {saving ? "Opslaan..." : "Uren Opslaan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
