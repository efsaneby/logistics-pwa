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
  onTripSaved,
}: {
  initialDate?: string;
  onTripSaved?: () => void;
}) {
  const [departure, setDeparture] = useState(initialDate ? `${initialDate}T08:00` : "");
  const [returnTime, setReturnTime] = useState(initialDate ? `${initialDate}T17:00` : "");
  const [isMultiDay, setIsMultiDay] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [travelCostPerOneWay, setTravelCostPerOneWay] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const supabase = createClient();

  const handleCalculate = async () => {
    if (!departure || !returnTime) return;

    const depDate = new Date(departure);
    const retDate = new Date(returnTime);

    if (retDate <= depDate) {
      alert("Dönüş zamanı çıkış zamanından sonra olmalıdır!");
      return;
    }

    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) {
      alert(authError?.message ?? "Sign in to calculate travel reimbursement.");
      return;
    }
    const { data: profile, error: profileError } = await supabase.from("driver_profiles")
      .select("travel_cost_per_one_way")
      .eq("user_id", authData.user.id)
      .single();
    if (profileError || !profile) {
      alert(profileError?.message ?? "Could not load the travel reimbursement from your profile.");
      return;
    }

    let allowance = 0;
    if (isMultiDay) {
      allowance = calculateMeerdaagseRit(depDate, retDate);
    } else {
      allowance = calculateEendaagseRit(depDate, retDate);
    }

    setResult(allowance);
    setTravelCostPerOneWay(Number(profile.travel_cost_per_one_way) || 0);
  };

  const handleSave = async () => {
    if (result === null || travelCostPerOneWay === null || !departure || !returnTime) return;

    setSaving(true);
    const { error } = await supabase.from("trip_cards").insert([
      {
        departure_time: new Date(departure).toISOString(),
        return_time: new Date(returnTime).toISOString(),
        is_multi_day: isMultiDay,
        calculated_allowance: result,
        travel_cost_per_one_way: travelCostPerOneWay,
      },
    ]);

    setSaving(false);

    if (error) {
      alert("Kaydedilirken bir hata oluştu: " + error.message);
    } else {
      alert("Sefer başarıyla kaydedildi! 🚚");
      setDeparture("");
      setReturnTime("");
      setResult(null);
      setTravelCostPerOneWay(null);
      onTripSaved?.();
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto shadow-lg border-slate-200 dark:border-slate-800">
      <CardHeader className="bg-slate-900 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Truck className="w-5 h-5 text-amber-400" />
          Trip Allowance
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        {/* Sefer Tipi Seçimi */}
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
            Single-day trip
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
            Multi-day trip
          </button>
        </div>

        {/* Tarih / Saat Girişleri */}
        <div className="space-y-3">
          <div>
            <Label
              htmlFor="departure"
              className="text-xs font-semibold text-slate-600"
            >
              Vertrek (Çıkış Tarihi ve Saati)
            </Label>
            <Input
              id="departure"
              type="datetime-local"
              value={departure}
              onChange={(e) => setDeparture(e.target.value)}
              className="mt-1"
            />
          </div>

          <div>
            <Label
              htmlFor="returnTime"
              className="text-xs font-semibold text-slate-600"
            >
              Aankomst (Dönüş Tarihi ve Saati)
            </Label>
            <Input
              id="returnTime"
              type="datetime-local"
              value={returnTime}
              onChange={(e) => setReturnTime(e.target.value)}
              className="mt-1"
            />
          </div>
        </div>

        {/* Hesapla Butonu */}
        <Button
          onClick={handleCalculate}
          className="w-full bg-slate-900 hover:bg-slate-800 text-white font-medium flex items-center gap-2"
        >
          <Calculator className="w-4 h-4" />
          Calculate allowance
        </Button>

        {/* Sonuç Alanı */}
        {result !== null && (
          <div className="mt-4 p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-center space-y-2">
            <span className="text-xs text-emerald-700 font-semibold uppercase tracking-wider block">
              Calculated allowance
            </span>
            <span className="text-3xl font-extrabold text-emerald-900 block">
              € {result.toFixed(2).replace(".", ",")}
            </span>

            <p className="text-sm text-emerald-800">Reiskosten: €{travelCostPerOneWay?.toFixed(2)} vertrek + €{travelCostPerOneWay?.toFixed(2)} terug = €{((travelCostPerOneWay ?? 0) * 2).toFixed(2)}</p>
            <Button
              onClick={() => { void handleSave(); }}
              disabled={saving}
              variant="outline"
              className="w-full mt-2 border-emerald-600 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? "Opslaan..." : "Rit Opslaan"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
