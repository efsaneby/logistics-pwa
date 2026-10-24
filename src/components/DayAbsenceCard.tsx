"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { Save } from "lucide-react";

export type AbsenceType = "sick" | "vacation";

export default function DayAbsenceCard({
  date,
  initialAbsence,
  hasWork,
  onSaved,
}: {
  date: string;
  initialAbsence: AbsenceType | null;
  hasWork: boolean;
  onSaved: () => void;
}) {
  const [absenceType, setAbsenceType] = useState<AbsenceType | "none">(initialAbsence ?? "none");
  const [savedAbsenceType, setSavedAbsenceType] = useState<AbsenceType | "none">(initialAbsence ?? "none");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (hasWork && absenceType !== "none") {
      setError("Verwijder eerst de Werk-registratie van deze dag.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      if (!authData.user) throw new Error("Log in om de dagstatus op te slaan.");

      const result = absenceType === "none"
        ? await supabase.from("driver_absences")
            .delete()
            .eq("user_id", authData.user.id)
            .eq("date", date)
        : initialAbsence
          ? await supabase.from("driver_absences")
              .update({ absence_type: absenceType })
              .eq("user_id", authData.user.id)
              .eq("date", date)
          : await supabase.from("driver_absences")
              .insert({ user_id: authData.user.id, date, absence_type: absenceType });

      if (result.error) throw result.error;
      setSavedAbsenceType(absenceType);
      onSaved();
    } catch (saveError) {
      console.error("Dagstatus opslaan mislukt:", saveError);
      setError(saveError instanceof Error ? saveError.message : "De dagstatus kon niet worden opgeslagen.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
      <h3 className="text-sm font-semibold text-slate-800">Dagstatus</h3>
      <p className="mt-1 text-xs text-slate-600">
        Ziekte of vakantie telt als 8 normale uren. Dit maakt geen overwerk of Rit aan.
      </p>
      <label htmlFor="day-absence" className="sr-only">Dagstatus selecteren</label>
      <select
        id="day-absence"
        value={absenceType}
        onChange={(event) => setAbsenceType(event.target.value as AbsenceType | "none")}
        disabled={saving || hasWork}
        className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 disabled:bg-slate-100"
      >
        <option value="none">Geen afwezigheid</option>
        <option value="sick">Ziek</option>
        <option value="vacation">Vakantie</option>
      </select>
      {hasWork && (
        <p className="mt-2 text-xs text-amber-800">
          Verwijder eerst de Werk-registratie voordat je Ziek of Vakantie kiest.
        </p>
      )}
      {error && <p role="alert" className="mt-2 text-xs text-red-600">{error}</p>}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p aria-live="polite" className="text-xs text-slate-600">
          {savedAbsenceType === "none"
            ? "Geen afwezigheid opgeslagen."
            : `${savedAbsenceType === "sick" ? "Ziek" : "Vakantie"} · 8u00`}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSave()}
          disabled={saving || hasWork || absenceType === savedAbsenceType}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Opslaan…" : "Dagstatus opslaan"}
        </Button>
      </div>
    </section>
  );
}
