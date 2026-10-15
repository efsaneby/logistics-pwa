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
  initialDate,
  initialWork,
  onWorkSaved,
}: {
  initialDate?: string;
  initialWork?: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
  };
  onWorkSaved?: () => void;
}) {
  const toDateTimeInput = (date: string, time: string) => `${date}T${time.slice(0, 5)}`;
  const [startTime, setStartTime] = useState(initialWork
    ? toDateTimeInput(initialWork.date, initialWork.start_time)
    : initialDate ? `${initialDate}T08:00` : "");
  const [endTime, setEndTime] = useState(initialWork
    ? toDateTimeInput(initialWork.date, initialWork.end_time)
    : initialDate ? `${initialDate}T16:00` : "");
  const [pauseMinutes, setPauseMinutes] = useState(String(initialWork?.break_minutes ?? 60));
  const [result, setResult] = useState<WorkHoursResult | null>(() => {
    if (!initialWork) return null;
    return calculateWorkHours(
      new Date(toDateTimeInput(initialWork.date, initialWork.start_time)),
      new Date(toDateTimeInput(initialWork.date, initialWork.end_time)),
      initialWork.break_minutes,
    );
  });
  const [saving, setSaving] = useState(false);

  const handleCalculate = () => {
    if (!startTime || !endTime) {
      alert("Vul een begin- en eindtijd in.");
      return;
    }

    const start = new Date(startTime);
    const end = new Date(endTime);

    if (end <= start) {
      alert("De eindtijd moet na de begintijd liggen.");
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

      // Datum in YYYY-MM-DD-formaat.
      const year = startDate.getFullYear();
      const month = String(startDate.getMonth() + 1).padStart(2, "0");
      const day = String(startDate.getDate()).padStart(2, "0");
      const localDate = `${year}-${month}-${day}`;

      // Tijden in HH:mm:ss-formaat voor de Supabase TIME-kolom.
      const startFormatted = startDate.toTimeString().split(" ")[0];
      const endFormatted = endDate.toTimeString().split(" ")[0];

      const workData = {
        date: localDate,
        start_time: startFormatted,
        end_time: endFormatted,
        break_minutes: Number(pauseMinutes) || 0,
        normal_hours: result.normalHours,
        overtime_130: result.overtime130,
      };
      const { error } = initialWork
        ? await supabase.from("work_cards").update(workData).eq("id", initialWork.id)
        : await supabase.from("work_cards").insert([workData]);

      if (error) {
        alert("Opslaan mislukt: " + error.message);
      } else {
        alert(initialWork ? "De werktijd is bijgewerkt." : "De werktijd is opgeslagen! ⏱️");
        setStartTime("");
        setEndTime("");
        setResult(null);
        onWorkSaved?.();
      }
    } catch (error) {
      alert("Er is een fout opgetreden: " + (error instanceof Error ? error.message : "Onbekende fout."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-slate-200 dark:border-slate-800">
      <CardHeader className="bg-slate-900 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="w-5 h-5 text-amber-400" />
        {initialWork ? "Werktijd bewerken" : "Werktijd registreren"}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="startTime"
              className="text-xs font-semibold text-slate-600"
            >
              Begintijd
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
              Eindtijd
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
              Pauze (minuten)
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
          Uren berekenen
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
              {saving ? "Opslaan…" : initialWork ? "Wijzigingen opslaan" : "Uren opslaan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
