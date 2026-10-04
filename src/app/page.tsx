"use client";

import { useState } from "react";
import TripCard from "@/components/TripCard";
import TripList from "@/components/TripList";
import WorkCard from "@/components/WorkCard";
import WorkList from "@/components/WorkList";
import { Truck, Clock } from "lucide-react";

export default function Home() {
  const [activeTab, setActiveTab] = useState<"trips" | "work">("trips");
  const [tripRefreshKey, setTripRefreshKey] = useState(0);
  const [workRefreshKey, setWorkRefreshKey] = useState(0);

  return (
    <main className="min-h-screen bg-slate-50 py-6 px-4 flex flex-col items-center justify-start">
      <div className="mb-4 text-center">
        <h1 className="text-2xl font-bold text-slate-900">
          Logistics Assistant 2026
        </h1>
        <p className="text-xs text-slate-500 mt-1">
          CAO Beroepsgoederenvervoer Tool
        </p>
      </div>

      {/* Sekme Butonları */}
      <div className="flex bg-slate-200 p-1 rounded-xl w-full max-w-md mb-6 select-none">
        <button
          onClick={() => setActiveTab("trips")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all touch-manipulation ${
            activeTab === "trips"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Truck className="w-4 h-4 text-amber-500" />
          Verblijfskosten
        </button>

        <button
          onClick={() => setActiveTab("work")}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all touch-manipulation ${
            activeTab === "work"
              ? "bg-white text-slate-900 shadow-sm"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          <Clock className="w-4 h-4 text-amber-500" />
          Uren Registratie
        </button>
      </div>

      {/* İçerikler */}
      <div className="w-full max-w-md space-y-6">
        {activeTab === "trips" ? (
          <>
            <TripCard
              onTripSaved={() => setTripRefreshKey((prev) => prev + 1)}
            />
            <TripList refreshKey={tripRefreshKey} />
          </>
        ) : (
          <>
            <WorkCard
              onWorkSaved={() => setWorkRefreshKey((prev) => prev + 1)}
            />
            <WorkList refreshKey={workRefreshKey} />
          </>
        )}
      </div>
    </main>
  );
}
