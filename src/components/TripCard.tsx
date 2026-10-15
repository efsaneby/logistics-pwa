"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateEendaagseRit,
  calculateMeerdaagseRit,
} from "@/lib/calculator/verblijfskosten";
import { createClient } from "@/lib/supabase/client";
import { Truck, Calculator, Save } from "lucide-react";

export default function TripCard({
  initialDate,
  initialTrip,
  onTripSaved,
}: {
  initialDate?: string;
  initialTrip?: {
    id: string;
    departure_time: string;
    return_time: string;
    is_multi_day: boolean;
    calculated_allowance: number;
    travel_cost_per_one_way: number;
  };
  onTripSaved?: () => void;
}) {
  const toDateTimeInput = (value: string) => {
    const date = new Date(value);
    const pad = (part: number) => String(part).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const [departure, setDeparture] = useState(initialTrip
    ? toDateTimeInput(initialTrip.departure_time)
    : initialDate ? `${initialDate}T08:00` : "");
  const [returnTime, setReturnTime] = useState(initialTrip
    ? toDateTimeInput(initialTrip.return_time)
    : initialDate ? `${initialDate}T17:00` : "");
  const [isMultiDay, setIsMultiDay] = useState(initialTrip?.is_multi_day ?? false);
  const [result, setResult] = useState<number | null>(initialTrip ? Number(initialTrip.calculated_allowance) : null);
  const [travelCostPerOneWay, setTravelCostPerOneWay] = useState<number | null>(
    initialTrip ? Number(initialTrip.travel_cost_per_one_way) : null,
  );
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  const handleCalculate = async () => {
    if (!departure || !returnTime) return;

    const depDate = new Date(departure);
    const retDate = new Date(returnTime);

    if (retDate <= depDate) {
      alert("De aankomsttijd moet na de vertrektijd liggen.");
      return;
    }

    let travelRate = travelCostPerOneWay;
    if (travelRate === null) {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        alert(authError?.message ?? "Log in om de reiskostenvergoeding te berekenen.");
        return;
      }
      const { data: profile, error: profileError } = await supabase.from("driver_profiles")
        .select("travel_cost_per_one_way")
        .eq("user_id", authData.user.id)
        .single();
      if (profileError || !profile) {
        alert(profileError?.message ?? "De reiskostenvergoeding kon niet uit je profiel worden geladen.");
        return;
      }
      travelRate = Number(profile.travel_cost_per_one_way) || 0;
    }

    let allowance = 0;
    if (isMultiDay) {
      allowance = calculateMeerdaagseRit(depDate, retDate);
    } else {
      allowance = calculateEendaagseRit(depDate, retDate);
    }

    setResult(allowance);
    setTravelCostPerOneWay(travelRate);
  };

  const handleSave = async () => {
    if (result === null || travelCostPerOneWay === null || !departure || !returnTime) return;

    if (initialTrip) {
      const originalDeparture = new Date(initialTrip.departure_time);
      const originalReturn = new Date(initialTrip.return_time);
      const updatedDeparture = new Date(departure);
      const updatedReturn = new Date(returnTime);
      const dateKey = (date: Date) =>
        `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
      const originalWasSingleDay = dateKey(originalDeparture) === dateKey(originalReturn);
      const updatedSpansMultipleDays = dateKey(updatedDeparture) !== dateKey(updatedReturn);
      if (originalWasSingleDay && updatedSpansMultipleDays && !confirm(
        "Deze wijziging spreidt de rit over meerdere dagen. De wijziging heeft invloed op de verblijfskosten en reiskosten van alle dagen. Wil je doorgaan?",
      )) return;
    }

    setSaving(true);
    try {
      const tripData = {
        departure_time: new Date(departure).toISOString(),
        return_time: new Date(returnTime).toISOString(),
        is_multi_day: isMultiDay,
        calculated_allowance: result,
        travel_cost_per_one_way: travelCostPerOneWay,
      };
      const { error } = initialTrip
        ? await supabase.from("trip_cards").update(tripData).eq("id", initialTrip.id)
        : await supabase.from("trip_cards").insert([tripData]);
      if (error) {
        alert("Opslaan mislukt: " + error.message);
      } else {
        alert(initialTrip ? "De rit is bijgewerkt." : "De rit is opgeslagen! 🚚");
        setDeparture("");
        setReturnTime("");
        setResult(null);
        setTravelCostPerOneWay(null);
        onTripSaved?.();
      }
    } catch (error) {
      alert("Opslaan mislukt: " + (error instanceof Error ? error.message : "Onbekende fout."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-slate-200 dark:border-slate-800">
      <CardHeader className="bg-slate-900 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Truck className="w-5 h-5 text-amber-400" />
          Ritvergoeding
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {/* Kies het type rit */}
        <div className="flex bg-slate-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => {
              setIsMultiDay(false);
              setResult(null);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              !isMultiDay ? "bg-white shadow text-slate-900" : "text-slate-500"
            }`}
          >
            Eendaagse rit
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMultiDay(true);
              setResult(null);
            }}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-all ${
              isMultiDay ? "bg-white shadow text-slate-900" : "text-slate-500"
            }`}
          >
            Meerdaagse rit
          </button>
        </div>

        {/* Datum en tijd */}
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="departure"
              className="text-xs font-semibold text-slate-600"
            >
              Vertrekdatum en -tijd
            </Label>
            <Input
              id="departure"
              type="datetime-local"
              value={departure}
              onChange={(e) => {
                setDeparture(e.target.value);
                setResult(null);
              }}
              className="mt-1"
            />
          </div>

          <div>
            <Label
              htmlFor="returnTime"
              className="text-xs font-semibold text-slate-600"
            >
              Aankomstdatum en -tijd
            </Label>
            <Input
              id="returnTime"
              type="datetime-local"
              value={returnTime}
              onChange={(e) => {
                setReturnTime(e.target.value);
                setResult(null);
              }}
              className="mt-1"
            />
          </div>
        </div>

        {/* Bereken de vergoeding */}
        <Button
          onClick={handleCalculate}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center gap-2"
        >
          <Calculator className="w-4 h-4" />
          {initialTrip ? "Vergoeding opnieuw berekenen" : "Vergoeding berekenen"}
        </Button>

        {(travelCostPerOneWay !== null || initialTrip) && (
          <div className="space-y-1.5">
            <Label htmlFor="trip-travel-cost" className="text-xs font-semibold text-slate-600">
              Reiskosten per enkele reis (€)
            </Label>
            <Input
              id="trip-travel-cost"
              type="number"
              min="0"
              step="0.01"
              value={travelCostPerOneWay ?? 0}
              onChange={(event) => setTravelCostPerOneWay(Number(event.target.value) || 0)}
            />
          </div>
        )}

        {/* Resultaat */}
        {result !== null && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-2">
            <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wider block">
              Berekende verblijfskosten
            </span>
            <span className="text-3xl font-extrabold text-emerald-900 block">
              € {result.toFixed(2).replace(".", ",")}
            </span>

            <p className="text-sm text-emerald-800">Reiskosten: € {travelCostPerOneWay?.toFixed(2)} heen + € {travelCostPerOneWay?.toFixed(2)} terug = € {((travelCostPerOneWay ?? 0) * 2).toFixed(2)}</p>
            <Button
              onClick={() => { void handleSave(); }}
              disabled={saving}
              variant="outline"
              className="w-full mt-2 border-emerald-600 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Opslaan…" : initialTrip ? "Rit bijwerken" : "Rit opslaan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
