"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateWorkHours, WorkHoursResult } from "@/lib/calculator/worktime";
import { createClient } from "@/lib/supabase/client";
import { syncWorkGeneratedTrips } from "@/lib/supabase/sync-work-trips";
import { Clock, Save } from "lucide-react";

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const { message, details, hint, code } = error as {
      message: unknown;
      details?: unknown;
      hint?: unknown;
      code?: unknown;
    };
    return [message, details, hint, code]
      .filter((part): part is string => typeof part === "string" && part.length > 0)
      .join(" · ");
  }
  return "Onbekende fout.";
};

const formatHours = (hours: number) => {
  const totalMinutes = Math.round(hours * 60);
  return `${Math.floor(totalMinutes / 60)}u${String(totalMinutes % 60).padStart(2, "0")}`;
};

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
    is_overnight: boolean;
  };
  onWorkSaved?: () => void;
}) {
  const toDateTimeInput = (date: string, time: string) => `${date}T${time.slice(0, 5)}`;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const defaultDate = initialDate ?? todayKey;
  const [startTime, setStartTime] = useState(initialWork
    ? toDateTimeInput(initialWork.date, initialWork.start_time)
    : `${defaultDate}T06:00`);
  const [endTime, setEndTime] = useState(initialWork
    ? toDateTimeInput(initialWork.date, initialWork.end_time)
    : `${defaultDate}T18:00`);
  const [pauseMinutes, setPauseMinutes] = useState(String(initialWork?.break_minutes ?? 60));
  const [isOvernight, setIsOvernight] = useState(initialWork?.is_overnight ?? false);
  const [saving, setSaving] = useState(false);

  const startDate = startTime ? new Date(startTime) : null;
  const endDate = endTime ? new Date(endTime) : null;
  const result: WorkHoursResult | null = startDate && endDate
    && !Number.isNaN(startDate.getTime())
    && !Number.isNaN(endDate.getTime())
    && endDate > startDate
    ? calculateWorkHours(startDate, endDate, Number(pauseMinutes) || 0)
    : null;

  const handleSave = async () => {
    if (!startDate || !endDate) {
      alert("Vul een begin- en eindtijd in.");
      return;
    }
    if (endDate <= startDate) {
      alert("De eindtijd moet na de begintijd liggen.");
      return;
    }
    if (!result) return;

    try {
      setSaving(true);
      const supabase = createClient();

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
        is_overnight: isOvernight,
        normal_hours: result.normalHours,
        overtime_130: result.overtime130,
      };
      let saveError: string | null = null;
      if (initialWork) {
        const { error } = await supabase.from("work_cards")
          .update(workData)
          .eq("id", initialWork.id);
        if (error) {
          saveError = error.message;
        } else {
          const verification = await supabase.from("work_cards")
            .select("date, start_time, end_time, break_minutes, is_overnight, normal_hours, overtime_130")
            .eq("id", initialWork.id)
            .maybeSingle();
          if (verification.error) {
            saveError = verification.error.message;
          } else if (!verification.data) {
            saveError = "De werktijd is niet gevonden. Ververs de dag en probeer het opnieuw.";
          } else {
            const saved = verification.data;
            const matchesSavedValues =
              saved.date === workData.date
              && saved.start_time.slice(0, 8) === workData.start_time
              && saved.end_time.slice(0, 8) === workData.end_time
              && Number(saved.break_minutes) === workData.break_minutes
              && saved.is_overnight === workData.is_overnight
              && Number(saved.normal_hours) === workData.normal_hours
              && Number(saved.overtime_130) === workData.overtime_130;
            if (!matchesSavedValues) {
              saveError = "De werktijd kon niet worden bijgewerkt. Controleer of de Supabase-migratie voor het bewerken van Werk-uren is uitgevoerd.";
            }
          }
        }
      } else {
        const { error } = await supabase.from("work_cards").insert([workData]).select("id").single();
        if (error) saveError = error.message;
      }

      if (saveError) {
        alert("Opslaan mislukt: " + saveError);
      } else {
        try {
          const syncDates = [localDate];
          if (initialWork && initialWork.date !== localDate) syncDates.push(initialWork.date);
          const syncResult = await syncWorkGeneratedTrips(syncDates);
          const workMessage = initialWork
            ? "De werktijd is bijgewerkt."
            : "De werktijd is opgeslagen! ⏱️";
          const tripMessage = syncResult.tripsUpdated > 0
            ? ` ${syncResult.tripsUpdated} automatische Rit(ten) bijgewerkt.`
            : syncResult.hasPendingOvernight
              ? " De automatische Rit volgt zodra je een Werkdag zonder overnachting opslaat."
              : " Er is geen automatische Rit gevonden om op te slaan.";
          alert(workMessage + tripMessage);
        } catch (syncError) {
          console.error("Automatische Rit bijwerken mislukt:", syncError);
          alert(
            "De Werk-uren zijn opgeslagen, maar de automatische Rit kon niet worden bijgewerkt: "
            + getErrorMessage(syncError),
          );
        }
        setStartTime(`${defaultDate}T06:00`);
        setEndTime(`${defaultDate}T18:00`);
        setPauseMinutes("60");
        setIsOvernight(false);
        onWorkSaved?.();
      }
    } catch (error) {
      console.error("Werktijd opslaan mislukt:", error);
      alert("Er is een fout opgetreden: " + getErrorMessage(error));
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
          <label className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={isOvernight}
              onChange={(event) => setIsOvernight(event.target.checked)}
              className="h-4 w-4 accent-amber-600"
            />
            Overnachting
          </label>
        </div>

        {result !== null ? (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Totaal
                </span>
                <span className="text-lg font-bold text-slate-800">
                  {formatHours(result.totalHours)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase block font-semibold">
                  Normaal
                </span>
                <span className="text-lg font-bold text-slate-800">
                  {formatHours(result.normalHours)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-amber-700 uppercase block font-semibold">
                  Overwerk 130%
                </span>
                <span className="text-lg font-bold text-amber-700">
                  {formatHours(result.overtime130)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-indigo-700 uppercase block font-semibold">
                  Zaterdag 150%
                </span>
                <span className="text-lg font-bold text-indigo-700">
                  {formatHours(result.saturdayHours)}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-violet-700 uppercase block font-semibold">
                  Zondag 200%
                </span>
                <span className="text-lg font-bold text-violet-700">
                  {formatHours(result.sundayHours)}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <p role="alert" className="text-sm text-red-600">
            De eindtijd moet na de begintijd liggen.
          </p>
        )}

        <Button
          onClick={handleSave}
          disabled={saving || !result}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center justify-center gap-2 touch-manipulation py-3"
        >
          <Save className="w-4 h-4" />
          {saving ? "Opslaan…" : initialWork ? "Wijzigingen opslaan" : "Uren opslaan"}
        </Button>
      </CardContent>
    </Card>
  );
}
