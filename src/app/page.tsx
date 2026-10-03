"use client";

import { useState } from "react";
import TripCard from "@/components/TripCard";
import TripList from "@/components/TripList";

export default function Home() {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTripSaved = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <main className="min-h-screen bg-slate-50 py-6 px-4 flex flex-col items-center justify-start">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Logistics Allowance 2026
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          CAO Beroepsgoederenvervoer Verblijfskosten
        </p>
      </div>

      <div className="w-full max-w-md space-y-6">
        <TripCard onTripSaved={handleTripSaved} />
        <TripList refreshKey={refreshKey} />
      </div>
    </main>
  );
}
