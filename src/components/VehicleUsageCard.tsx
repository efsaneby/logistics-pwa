"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { LoaderCircle, Truck } from "lucide-react";

type VehicleUsage = {
  id: string;
  tractor_identifier: string;
  trailer_identifier: string | null;
  started_at: string;
  ended_at: string | null;
};

const toLocalDateTimeInput = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDateTime = (value: string) =>
  new Date(value).toLocaleString("nl-NL", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function VehicleUsageCard({ refreshKey }: { refreshKey: number }) {
  const [usages, setUsages] = useState<VehicleUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [tractorIdentifier, setTractorIdentifier] = useState("");
  const [trailerIdentifier, setTrailerIdentifier] = useState("");
  const [startedAt, setStartedAt] = useState(() => toLocalDateTimeInput(new Date()));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadUsages = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await createClient()
        .from("driver_vehicle_usages")
        .select("id, tractor_identifier, trailer_identifier, started_at, ended_at")
        .order("started_at", { ascending: false });
      if (error) throw error;
      setUsages(data ?? []);
    } catch (error) {
      console.error("Voertuiggebruik laden mislukt:", error);
      setLoadError("Voertuiggegevens konden niet worden geladen.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { void loadUsages(); }, 0);
    return () => clearTimeout(timer);
  }, [loadUsages, refreshKey]);

  const activeUsage = usages.find((usage) => usage.ended_at === null) ?? null;
  const history = usages.filter((usage) => usage.ended_at !== null);
  const openDialog = () => {
    setTractorIdentifier(activeUsage?.tractor_identifier ?? "");
    setTrailerIdentifier(activeUsage?.trailer_identifier ?? "");
    setStartedAt(toLocalDateTimeInput(new Date()));
    setSaveError(null);
    setDialogOpen(true);
  };

  const saveUsage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError(null);
    const startDate = new Date(startedAt);
    if (!tractorIdentifier.trim()) {
      setSaving(false);
      setSaveError("Vul het kenteken of bedrijfsnummer van de trekker in.");
      return;
    }
    if (Number.isNaN(startDate.getTime())) {
      setSaving(false);
      setSaveError("Kies een geldige startdatum en -tijd.");
      return;
    }
    const { error } = await createClient().rpc("start_driver_vehicle_usage", {
      p_tractor_identifier: tractorIdentifier.trim(),
      p_trailer_identifier: trailerIdentifier.trim() || null,
      p_started_at: startDate.toISOString(),
    });
    setSaving(false);
    if (error) {
      console.error("Voertuiggebruik opslaan mislukt:", error);
      setSaveError(error.message.includes("later than the current usage")
        ? "De starttijd moet na de starttijd van het huidige voertuiggebruik liggen."
        : error.message.includes("future")
          ? "De starttijd mag niet in de toekomst liggen."
        : "Het voertuiggebruik kon niet worden opgeslagen. Controleer je gegevens en probeer het opnieuw.");
      return;
    }
    setDialogOpen(false);
    await loadUsages();
  };

  return (
    <>
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="vehicle-usage-title">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="vehicle-usage-title" className="flex items-center gap-2 text-sm font-semibold text-slate-900">
              <Truck className="h-4 w-4 shrink-0 text-amber-600" />
              Huidig voertuig
            </h2>
            {loading ? (
              <p className="mt-2 text-xs text-slate-500">Voertuiggegevens laden…</p>
            ) : loadError ? (
              <p role="alert" className="mt-2 text-xs text-red-600">{loadError}</p>
            ) : activeUsage ? (
              <div className="mt-2 space-y-1 text-sm">
                <p className="break-words text-slate-800"><span className="text-slate-500">Trekker:</span> <strong>{activeUsage.tractor_identifier}</strong></p>
                <p className="break-words text-slate-800"><span className="text-slate-500">Oplegger:</span> <strong>{activeUsage.trailer_identifier || "Niet ingevuld"}</strong></p>
                <p className="text-xs text-slate-500">Sinds {formatDateTime(activeUsage.started_at)}</p>
              </div>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Nog geen actief voertuig geregistreerd.</p>
            )}
          </div>
          <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={openDialog}>
            {activeUsage ? "Wijzigen" : "Registreren"}
          </Button>
        </div>

        {history.length > 0 && (
          <div className="mt-3 border-t border-slate-100 pt-2">
            <button
              type="button"
              className="text-xs font-medium text-slate-600 underline"
              aria-expanded={showHistory}
              onClick={() => setShowHistory((visible) => !visible)}
            >
              {showHistory ? "Verberg geschiedenis" : `Bekijk geschiedenis (${history.length})`}
            </button>
            {showHistory && (
              <ul className="mt-3 space-y-3">
                {history.map((usage) => (
                  <li key={usage.id} className="border-l-2 border-slate-200 pl-3 text-xs">
                    <p className="break-words font-medium text-slate-800">
                      Trekker {usage.tractor_identifier} · Oplegger {usage.trailer_identifier || "niet ingevuld"}
                    </p>
                    <p className="mt-1 text-slate-500">
                      {formatDateTime(usage.started_at)} – {usage.ended_at ? formatDateTime(usage.ended_at) : "Nu"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{activeUsage ? "Voertuig wijzigen" : "Voertuig registreren"}</DialogTitle>
            <DialogDescription>
              Dit is je eigen registratie. Registreer de trekker en oplegger die je vanaf dit moment gebruikt; eerdere periodes blijven bewaard.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveUsage} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-tractor">Trekker · kenteken of bedrijfsnummer</Label>
              <Input id="vehicle-tractor" required maxLength={80} value={tractorIdentifier} onChange={(event) => setTractorIdentifier(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-trailer">Oplegger · kenteken of bedrijfsnummer</Label>
              <Input id="vehicle-trailer" maxLength={80} value={trailerIdentifier} onChange={(event) => setTrailerIdentifier(event.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vehicle-started-at">Gebruikt vanaf</Label>
              <Input id="vehicle-started-at" type="datetime-local" required value={startedAt} onChange={(event) => setStartedAt(event.target.value)} />
            </div>
            {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
            <DialogFooter>
              <Button type="submit" disabled={saving}>
                {saving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
                Gebruik starten
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
