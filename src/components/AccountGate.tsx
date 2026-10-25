"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSalaryScaleRatesForDate } from "@/lib/supabase/salary-scales";
import type { SalaryScaleRate } from "@/lib/supabase/salary-scales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderCircle, LogOut, UserRound, UserRoundPen } from "lucide-react";
import {
  getStandardPayrollDeductionsForDate,
  isStandardPayrollDeductionName,
  type StandardPayrollDeduction,
} from "@/lib/supabase/standard-payroll-deductions";

interface DriverProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  scale: string;
  step: number;
  contract_hours_per_week: number;
  travel_cost_per_one_way: number;
  apply_loonheffingskorting: boolean;
  aow_category: "under_aow" | "aow_before_1946" | "aow_1946_or_later";
  single_elderly_credit: boolean;
}

type Deduction = {
  id?: string;
  name: string;
  calculation_type: "fixed" | "percentage";
  value: number;
  reduces_table_salary: boolean;
};

function getDutchAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("email not confirmed")) return "Bevestig je e-mailadres voordat je inlogt.";
  if (normalized.includes("invalid login credentials")) return "Het e-mailadres of wachtwoord is onjuist.";
  if (normalized.includes("user already registered")) return "Er bestaat al een account met dit e-mailadres.";
  if (normalized.includes("password") && normalized.includes("at least")) return "Je wachtwoord voldoet niet aan de minimale lengte.";
  if (normalized.includes("rate limit") || normalized.includes("too many")) return "Er zijn te veel pogingen gedaan. Wacht even en probeer het opnieuw.";
  if (normalized.includes("fetch") || normalized.includes("network")) return "Er kon geen verbinding worden gemaakt. Probeer het opnieuw.";
  return "Er is een fout opgetreden bij je account. Probeer het opnieuw.";
}

function AuthForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [needsEmailConfirmation, setNeedsEmailConfirmation] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const result = mode === "sign-up"
      ? await supabase.auth.signUp({ email: email.trim(), password })
      : await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);

    if (result.error) {
      console.error("Aanmelden mislukt:", result.error.message);
      if (result.error.message.toLowerCase().includes("email not confirmed")) {
        setNeedsEmailConfirmation(true);
      }
      setError(getDutchAuthError(result.error.message));
    } else if (mode === "sign-up" && !result.data.session) {
      setNeedsEmailConfirmation(true);
      setMessage("Je account is aangemaakt. Bevestig je e-mailadres via de e-mail en log daarna in.");
    }
  };

  const resendConfirmation = async () => {
    if (!email.trim()) {
      setError("Vul eerst je e-mailadres in.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: resendError } = await createClient().auth.resend({ type: "signup", email: email.trim() });
    setBusy(false);
    if (resendError) {
      console.error("Bevestigingsmail versturen mislukt:", resendError.message);
      setError("De bevestigingsmail kon niet worden verstuurd. Probeer het later opnieuw.");
    }
    else setMessage("Als je account nog bevestigd moet worden, is er een nieuwe bevestigingsmail verzonden.");
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
    <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">TruckLog</h1>
      <p className="mt-1 text-sm text-slate-500">{mode === "sign-in" ? "Log in op je account" : "Maak een chauffeursaccount aan"}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5"><Label htmlFor="account-email">E-mailadres</Label><Input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="account-password">Wachtwoord</Label><Input id="account-password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        {needsEmailConfirmation && <button type="button" disabled={busy} onClick={() => { void resendConfirmation(); }} className="w-full text-sm text-slate-600 underline">Bevestigingsmail opnieuw versturen</button>}
        <Button disabled={busy} className="w-full" type="submit">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{mode === "sign-in" ? "Inloggen" : "Account aanmaken"}</Button>
      </form>
      <button className="mt-4 w-full text-sm text-slate-600 underline" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(null); setMessage(null); }}>
        {mode === "sign-in" ? "Nieuw hier? Maak een account aan" : "Heb je al een account? Log in"}
      </button>
    </section>
  </main>;
}

function ProfileForm({
  userId,
  initialProfile,
  onSaved,
}: {
  userId: string;
  initialProfile: DriverProfile | null;
  onSaved: (profile: DriverProfile) => void;
}) {
  const [firstName, setFirstName] = useState(initialProfile?.first_name ?? "");
  const [lastName, setLastName] = useState(initialProfile?.last_name ?? "");
  const [scale, setScale] = useState(initialProfile?.scale ?? "");
  const [step, setStep] = useState(initialProfile ? String(initialProfile.step) : "");
  const [weeklyHours, setWeeklyHours] = useState(initialProfile ? String(initialProfile.contract_hours_per_week) : "");
  const [travelCostPerOneWay, setTravelCostPerOneWay] = useState(String(initialProfile?.travel_cost_per_one_way ?? 0));
  const [applyLoonheffingskorting, setApplyLoonheffingskorting] = useState(initialProfile?.apply_loonheffingskorting ?? true);
  const [aowCategory, setAowCategory] = useState<DriverProfile["aow_category"]>(initialProfile?.aow_category ?? "under_aow");
  const [singleElderlyCredit, setSingleElderlyCredit] = useState(initialProfile?.single_elderly_credit ?? false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [standardDeductions, setStandardDeductions] = useState<StandardPayrollDeduction[]>([]);
  const [loadingStandardDeductions, setLoadingStandardDeductions] = useState(true);
  const [standardDeductionsError, setStandardDeductionsError] = useState<string | null>(null);
  const [loadingDeductions, setLoadingDeductions] = useState(Boolean(initialProfile));
  const [rates, setRates] = useState<SalaryScaleRate[]>([]);
  const [loadingRates, setLoadingRates] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    getSalaryScaleRatesForDate(currentDate)
      .then((result) => {
        if (!alive) return;
        setRates(result.rates);
      })
      .catch((loadError: unknown) => {
        if (alive) setError(loadError instanceof Error ? loadError.message : "De salarisschalen konden niet worden geladen.");
      })
      .finally(() => { if (alive) setLoadingRates(false); });
    return () => { alive = false; };
  }, [initialProfile]);

  useEffect(() => {
    let alive = true;
    const now = new Date();
    const currentDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    getStandardPayrollDeductionsForDate(currentDate)
      .then((items) => {
        if (alive) {
          setStandardDeductions(items);
          setStandardDeductionsError(null);
        }
      })
      .catch((loadError: unknown) => {
        console.error("Standaardinhoudingen laden mislukt:", loadError);
        if (alive) setStandardDeductionsError("De automatische inhoudingen konden niet worden geladen.");
      })
      .finally(() => { if (alive) setLoadingStandardDeductions(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!initialProfile) return;
    let alive = true;
    createClient().from("driver_deductions")
      .select("id, name, calculation_type, value, reduces_table_salary")
      .eq("user_id", userId)
      .order("created_at")
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError) setError(loadError.message);
        else setDeductions(((data ?? []) as Deduction[]).filter((item) => !isStandardPayrollDeductionName(item.name)));
        setLoadingDeductions(false);
      });
    return () => { alive = false; };
  }, [initialProfile, userId]);

  const scales = useMemo(() => [...new Set(rates.map((rate) => rate.scale))], [rates]);
  const steps = useMemo(() => rates.filter((rate) => rate.scale === scale), [rates, scale]);

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (deductions.some((deduction) => isStandardPayrollDeductionName(deduction.name))) {
      setError("Pensioen, WIA en SOOB worden automatisch toegevoegd. Verwijder deze uit de overige inhoudingen.");
      return;
    }
    setSaving(true);
    setError(null);
    const profile = {
      user_id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      scale,
      step: Number(step),
      contract_hours_per_week: Number(weeklyHours),
      travel_cost_per_one_way: Number(travelCostPerOneWay || 0),
      apply_loonheffingskorting: applyLoonheffingskorting,
      aow_category: aowCategory,
      single_elderly_credit: singleElderlyCredit,
    };
    const supabase = createClient();
    const query = initialProfile
      ? supabase.from("driver_profiles").update(profile).eq("user_id", userId)
      : supabase.from("driver_profiles").insert(profile);
    const { data, error: saveError } = await query.select().single();
    if (saveError) {
      setSaving(false);
      setError(saveError.message);
      return;
    }
    const { error: deleteError } = await supabase.from("driver_deductions").delete().eq("user_id", userId);
    if (deleteError) {
      setSaving(false);
      setError(deleteError.message);
      return;
    }
    if (deductions.length > 0) {
      const { error: insertError } = await supabase.from("driver_deductions").insert(
        deductions.map(({ name, calculation_type, value, reduces_table_salary }) => ({
          user_id: userId,
          name: name.trim(),
          calculation_type,
          value: Number(value),
          reduces_table_salary,
        })),
      );
      if (insertError) {
        setSaving(false);
        setError(insertError.message);
        return;
      }
    }
    setSaving(false);
    window.dispatchEvent(new Event("driver-profile-updated"));
    onSaved(data as DriverProfile);
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
    <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-600"><UserRound className="h-5 w-5" /></span><div><h1 className="text-xl font-bold text-slate-900">{initialProfile ? "Je profiel" : "Stel je profiel in"}</h1><p className="text-sm text-slate-500">Vul je arbeidsgegevens in om verder te gaan.</p></div></div>
      <form onSubmit={saveProfile} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="first-name">Voornaam</Label><Input id="first-name" autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="last-name">Achternaam</Label><Input id="last-name" autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="salary-scale">Salarisschaal</Label><select id="salary-scale" required value={scale} disabled={loadingRates || rates.length === 0} onChange={(event) => { setScale(event.target.value); const firstStep = rates.find((rate) => rate.scale === event.target.value); if (firstStep) setStep(String(firstStep.step)); }} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Kies een schaal</option>{scales.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="salary-step">Trede</Label><select id="salary-step" required value={step} disabled={loadingRates || steps.length === 0} onChange={(event) => setStep(event.target.value)} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Kies een trede</option>{steps.map((rate) => <option key={rate.step} value={rate.step}>{rate.step}</option>)}</select></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="weekly-hours">Contracturen per week</Label><Input id="weekly-hours" type="number" min="1" max="60" step="0.5" required value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="travel-cost-per-one-way">Reiskosten per enkele reis (€)</Label><Input id="travel-cost-per-one-way" type="number" min="0" step="0.01" value={travelCostPerOneWay} onChange={(event) => setTravelCostPerOneWay(event.target.value)} /><p className="text-xs text-slate-500">Ontvang je geen reiskostenvergoeding? Laat dan € 0 staan. Per rit wordt dit bedrag gerekend voor de heen- en terugreis.</p></div>
        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div><h2 className="text-sm font-semibold text-slate-800">Instellingen loonheffing</h2><p className="mt-1 text-xs text-slate-500">Bepaalt welke kolom van de toepasselijke maandtabel voor loonheffing wordt gebruikt.</p></div>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={applyLoonheffingskorting} onChange={(event) => setApplyLoonheffingskorting(event.target.checked)} className="mt-0.5" /><span>Loonheffingskorting toepassen</span></label>
          <div className="space-y-1.5"><Label htmlFor="aow-category">AOW-categorie</Label><select id="aow-category" value={aowCategory} onChange={(event) => setAowCategory(event.target.value as DriverProfile["aow_category"])} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="under_aow">Nog geen AOW-leeftijd</option><option value="aow_before_1946">AOW, geboren vóór 1946</option><option value="aow_1946_or_later">AOW, geboren in 1946 of later</option></select></div>
          {aowCategory !== "under_aow" && <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={singleElderlyCredit} onChange={(event) => setSingleElderlyCredit(event.target.checked)} className="mt-0.5" /><span>Alleenstaandeouderenkorting toepassen</span></label>}
        </section>
        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Automatische inhoudingen</h2>
            <p className="mt-1 text-xs leading-4 text-slate-500">
              Pensioen, WIA en SOOB zijn standaard ingesteld en worden automatisch in de netto-inschatting verwerkt. Je hoeft deze niet zelf toe te voegen.
            </p>
            {loadingStandardDeductions ? (
              <p className="mt-2 text-xs text-slate-500">Standaardbedragen laden…</p>
            ) : standardDeductionsError ? (
              <p role="alert" className="mt-2 text-xs text-red-600">{standardDeductionsError}</p>
            ) : standardDeductions.length > 0 ? (
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {standardDeductions.map((deduction) => (
                  <li key={deduction.deduction_key} className="flex justify-between gap-3">
                    <span>{deduction.name}</span>
                    <span className="shrink-0 font-medium">{new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(deduction.amount)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-xs text-slate-500">Er zijn geen standaardbedragen ingesteld voor deze periode.</p>
            )}
          </div>
          <div><h2 className="text-sm font-semibold text-slate-800">Overige maandelijkse inhoudingen</h2><p className="mt-1 text-xs text-slate-500">Voeg hier andere inhoudingen van je loonstrook toe, zoals contributie of boetes. Geef aan of deze het tabelloon vóór de loonheffing verlagen. Voeg Pensioen, WIA of SOOB niet toe; die worden hierboven automatisch verwerkt.</p></div>
          {loadingDeductions ? <p className="text-xs text-slate-500">Inhoudingen laden…</p> : deductions.map((deduction, index) => <div key={deduction.id ?? index} className="space-y-2 rounded-lg bg-slate-50 p-2">
            <div className="grid grid-cols-2 items-end gap-2">
            <div className="col-span-2 min-w-0 space-y-1"><Label htmlFor={`deduction-name-${index}`}>Naam</Label><Input id={`deduction-name-${index}`} required value={deduction.name} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></div>
            <div className="min-w-0 space-y-1"><Label htmlFor={`deduction-type-${index}`}>Type</Label><select id={`deduction-type-${index}`} value={deduction.calculation_type} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, calculation_type: event.target.value as Deduction["calculation_type"] } : item))} className="h-10 w-full min-w-0 rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="fixed">Vast bedrag (€)</option><option value="percentage">Percentage (niet berekend)</option></select></div>
            <div className="min-w-0 space-y-1"><Label htmlFor={`deduction-value-${index}`}>{deduction.calculation_type === "fixed" ? "Maandbedrag (€)" : "Percentage (%)"}</Label><Input id={`deduction-value-${index}`} type="number" min="0" step="0.001" required value={deduction.value} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item))} /></div>
            <button type="button" aria-label={`${deduction.name || "Inhouding"} verwijderen`} onClick={() => setDeductions((items) => items.filter((_, i) => i !== index))} className="col-span-2 h-9 justify-self-end px-2 text-xs text-red-600">Verwijderen</button>
            </div>
          </div>)}
          <button type="button" onClick={() => setDeductions((items) => [...items, { name: "", calculation_type: "fixed", value: 0, reduces_table_salary: false }])} className="text-xs font-medium text-slate-700 underline">Maandelijkse inhouding toevoegen</button>
        </section>
        {loadingRates && <p className="text-sm text-slate-500">Huidige salaristabel laden…</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={saving || loadingDeductions || loadingRates || rates.length === 0} className="w-full">{saving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{initialProfile ? "Profiel opslaan" : "Opslaan en doorgaan"}</Button>
      </form>
    </section>
  </main>;
}

export default function AccountGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<DriverProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const supabase = useMemo(() => createClient(), []);
  const sessionUserId = useRef<string | null>(null);

  useEffect(() => {
    let alive = true;
    let authEventReceived = false;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      setSession(nextSession);
      setLoading(false);
      const nextUserId = nextSession?.user.id ?? null;
      if (sessionUserId.current !== nextUserId) {
        sessionUserId.current = nextUserId;
        setProfile(null);
        setProfileLoaded(false);
        setEditingProfile(false);
        setError(null);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (!authEventReceived) {
        sessionUserId.current = data.session?.user.id ?? null;
        setSession(data.session);
      }
      setLoading(false);
    }).catch((sessionError: unknown) => {
      if (!alive) return;
      console.error("Sessie kon niet worden geladen:", sessionError);
      if (!authEventReceived) {
        setError("Je sessie kon niet worden geladen. Vernieuw de pagina en probeer het opnieuw.");
      }
      setLoading(false);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!session?.user.id) return;
    let alive = true;
    const loadProfile = async () => {
      try {
        const { data, error: profileError } = await supabase.from("driver_profiles")
          .select("user_id, first_name, last_name, scale, step, contract_hours_per_week, travel_cost_per_one_way, apply_loonheffingskorting, aow_category, single_elderly_credit")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (!alive) return;
        if (profileError) {
          setError(profileError.message);
          setProfile(null);
        } else {
          setError(null);
          setProfile(data as DriverProfile | null);
        }
      } catch (profileError) {
        if (!alive) return;
        console.error("Chauffeursprofiel kon niet worden geladen:", profileError);
        setError("Je chauffeursprofiel kon niet worden geladen. Probeer de pagina te vernieuwen.");
        setProfile(null);
      } finally {
        if (alive) setProfileLoaded(true);
      }
    };
    void loadProfile();
    return () => { alive = false; };
  }, [session?.user.id, supabase]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500"><LoaderCircle className="h-6 w-6 animate-spin" /></main>;
  if (!session) return <AuthForm />;
  if (!profileLoaded) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500"><LoaderCircle className="h-6 w-6 animate-spin" /></main>;
  if (error && !profile) return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><div className="max-w-md rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700"><p>Je chauffeursprofiel kon niet worden geladen. Controleer of de Supabase-migraties zijn uitgevoerd.</p><p className="mt-2 text-xs">{error}</p><button className="mt-4 underline" onClick={() => { void supabase.auth.signOut(); }}>Uitloggen</button></div></main>;
  if (!profile || editingProfile) return <ProfileForm userId={session.user.id} initialProfile={profile} onSaved={(savedProfile) => { setProfile(savedProfile); setEditingProfile(false); }} />;

  return <>
    <div className="mx-auto flex w-full max-w-lg items-start justify-between gap-2 px-4 pt-3">
      <span className="min-w-0 flex-1 break-words text-xs text-slate-500">{profile.first_name} {profile.last_name} · schaal {profile.scale}, trede {profile.step} · {profile.contract_hours_per_week} uur/week</span>
      <div className="flex shrink-0 items-center gap-1">
        <button aria-label="Profiel bewerken" onClick={() => setEditingProfile(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><UserRoundPen className="h-4 w-4" /></button>
        <button aria-label="Uitloggen" onClick={() => { void supabase.auth.signOut(); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><LogOut className="h-4 w-4" /></button>
      </div>
    </div>
    {children}
  </>;
}
