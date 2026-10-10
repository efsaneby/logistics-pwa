"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getSalaryScaleRatesForDate } from "@/lib/supabase/salary-scales";
import type { SalaryScaleRate, SalaryScaleVersion } from "@/lib/supabase/salary-scales";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoaderCircle, LogOut, UserRound, UserRoundPen } from "lucide-react";

interface DriverProfile {
  user_id: string;
  first_name: string;
  last_name: string;
  scale: string;
  step: number;
  contract_hours_per_week: number;
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
      if (result.error.message.toLowerCase().includes("email not confirmed")) {
        setNeedsEmailConfirmation(true);
        setError("Confirm your email address before signing in.");
      } else {
        setError(result.error.message);
      }
    } else if (mode === "sign-up" && !result.data.session) {
      setNeedsEmailConfirmation(true);
      setMessage("Account created. Check your email to confirm your address, then sign in.");
    }
  };

  const resendConfirmation = async () => {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    const { error: resendError } = await createClient().auth.resend({ type: "signup", email: email.trim() });
    setBusy(false);
    if (resendError) setError(resendError.message);
    else setMessage("If your account needs confirmation, a new confirmation email has been sent.");
  };

  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
    <section className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-xl font-bold text-slate-900">Logistics Assistant</h1>
      <p className="mt-1 text-sm text-slate-500">{mode === "sign-in" ? "Sign in to your account" : "Create your driver account"}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <div className="space-y-1.5"><Label htmlFor="account-email">Email</Label><Input id="account-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="account-password">Password</Label><Input id="account-password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} minLength={6} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
        {needsEmailConfirmation && <button type="button" disabled={busy} onClick={() => { void resendConfirmation(); }} className="w-full text-sm text-slate-600 underline">Resend confirmation email</button>}
        <Button disabled={busy} className="w-full" type="submit">{busy && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{mode === "sign-in" ? "Sign in" : "Create account"}</Button>
      </form>
      <button className="mt-4 w-full text-sm text-slate-600 underline" onClick={() => { setMode(mode === "sign-in" ? "sign-up" : "sign-in"); setError(null); setMessage(null); }}>
        {mode === "sign-in" ? "New here? Create an account" : "Already have an account? Sign in"}
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
  const [applyLoonheffingskorting, setApplyLoonheffingskorting] = useState(initialProfile?.apply_loonheffingskorting ?? true);
  const [aowCategory, setAowCategory] = useState<DriverProfile["aow_category"]>(initialProfile?.aow_category ?? "under_aow");
  const [singleElderlyCredit, setSingleElderlyCredit] = useState(initialProfile?.single_elderly_credit ?? false);
  const [deductions, setDeductions] = useState<Deduction[]>([]);
  const [loadingDeductions, setLoadingDeductions] = useState(Boolean(initialProfile));
  const [rates, setRates] = useState<SalaryScaleRate[]>([]);
  const [version, setVersion] = useState<SalaryScaleVersion | null>(null);
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
        setVersion(result.version);
      })
      .catch((loadError: unknown) => {
        if (alive) setError(loadError instanceof Error ? loadError.message : "Could not load salary scales.");
      })
      .finally(() => { if (alive) setLoadingRates(false); });
    return () => { alive = false; };
  }, [initialProfile]);

  useEffect(() => {
    if (!initialProfile) {
      setDeductions([]);
      setLoadingDeductions(false);
      return;
    }
    let alive = true;
    createClient().from("driver_deductions")
      .select("id, name, calculation_type, value, reduces_table_salary")
      .eq("user_id", userId)
      .order("created_at")
      .then(({ data, error: loadError }) => {
        if (!alive) return;
        if (loadError) setError(loadError.message);
        else setDeductions((data ?? []) as Deduction[]);
        setLoadingDeductions(false);
      });
    return () => { alive = false; };
  }, [initialProfile, userId]);

  const scales = useMemo(() => [...new Set(rates.map((rate) => rate.scale))], [rates]);
  const steps = useMemo(() => rates.filter((rate) => rate.scale === scale), [rates, scale]);
  const selectedRate = rates.find((rate) => rate.scale === scale && rate.step === Number(step));
  const estimatedMonthlyGross = selectedRate && version
    ? selectedRate.monthly_gross * (Number(weeklyHours) / version.full_time_hours_per_week)
    : null;

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    const profile = {
      user_id: userId,
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      scale,
      step: Number(step),
      contract_hours_per_week: Number(weeklyHours),
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
      <div className="flex items-center gap-3"><span className="rounded-xl bg-amber-50 p-2 text-amber-600"><UserRound className="h-5 w-5" /></span><div><h1 className="text-xl font-bold text-slate-900">{initialProfile ? "Your profile" : "Set up your profile"}</h1><p className="text-sm text-slate-500">Add your employment details to continue.</p></div></div>
      <form onSubmit={saveProfile} className="mt-6 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="first-name">First name</Label><Input id="first-name" autoComplete="given-name" required value={firstName} onChange={(event) => setFirstName(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="last-name">Last name</Label><Input id="last-name" autoComplete="family-name" required value={lastName} onChange={(event) => setLastName(event.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="salary-scale">Salary scale</Label><select id="salary-scale" required value={scale} disabled={loadingRates || rates.length === 0} onChange={(event) => { setScale(event.target.value); const firstStep = rates.find((rate) => rate.scale === event.target.value); if (firstStep) setStep(String(firstStep.step)); }} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Select scale</option>{scales.map((value) => <option key={value} value={value}>{value}</option>)}</select></div>
          <div className="space-y-1.5"><Label htmlFor="salary-step">Step (trede)</Label><select id="salary-step" required value={step} disabled={loadingRates || steps.length === 0} onChange={(event) => setStep(event.target.value)} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="" disabled>Select step</option>{steps.map((rate) => <option key={rate.step} value={rate.step}>{rate.step}</option>)}</select></div>
        </div>
        <div className="space-y-1.5"><Label htmlFor="weekly-hours">Contracted hours per week</Label><Input id="weekly-hours" type="number" min="1" max="60" step="0.5" required value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} /></div>
        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div><h2 className="text-sm font-semibold text-slate-800">Tax table settings</h2><p className="mt-1 text-xs text-slate-500">Used to select the correct 2026 monthly loonheffing table column.</p></div>
          <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={applyLoonheffingskorting} onChange={(event) => setApplyLoonheffingskorting(event.target.checked)} className="mt-0.5" /><span>Apply loonheffingskorting</span></label>
          <div className="space-y-1.5"><Label htmlFor="aow-category">AOW category</Label><select id="aow-category" value={aowCategory} onChange={(event) => setAowCategory(event.target.value as DriverProfile["aow_category"])} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="under_aow">Under AOW age</option><option value="aow_before_1946">AOW, born before 1946</option><option value="aow_1946_or_later">AOW, born in 1946 or later</option></select></div>
          {aowCategory !== "under_aow" && <label className="flex items-start gap-2 text-sm text-slate-700"><input type="checkbox" checked={singleElderlyCredit} onChange={(event) => setSingleElderlyCredit(event.target.checked)} className="mt-0.5" /><span>Apply single elderly person’s credit</span></label>}
        </section>
        <section className="space-y-3 rounded-xl border border-slate-200 p-3">
          <div><h2 className="text-sm font-semibold text-slate-800">Monthly employee deductions</h2><p className="mt-1 text-xs text-slate-500">Enter each deduction from your payslip. For each one, mark whether it reduces the table salary before loonheffing tabel. Some pension-related contributions do; other items, such as association fees or fines, may be deducted after tax.</p></div>
          {loadingDeductions ? <p className="text-xs text-slate-500">Loading deductions…</p> : deductions.map((deduction, index) => <div key={deduction.id ?? index} className="space-y-2 rounded-lg bg-slate-50 p-2">
            <div className="grid grid-cols-[minmax(0,1fr)_100px_90px_auto] items-end gap-2">
            <div className="space-y-1"><Label htmlFor={`deduction-name-${index}`}>Name</Label><Input id={`deduction-name-${index}`} required value={deduction.name} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} /></div>
            <div className="space-y-1"><Label htmlFor={`deduction-type-${index}`}>Type</Label><select id={`deduction-type-${index}`} value={deduction.calculation_type} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, calculation_type: event.target.value as Deduction["calculation_type"] } : item))} className="h-10 w-full rounded-md border border-slate-200 bg-white px-2 text-xs"><option value="fixed">€ amount</option><option value="percentage">Percent (not calculated)</option></select></div>
            <div className="space-y-1"><Label htmlFor={`deduction-value-${index}`}>{deduction.calculation_type === "fixed" ? "Monthly amount (€)" : "Rate (%)"}</Label><Input id={`deduction-value-${index}`} type="number" min="0" step="0.001" required value={deduction.value} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, value: Number(event.target.value) } : item))} /></div>
            <button type="button" aria-label={`Remove ${deduction.name || "deduction"}`} onClick={() => setDeductions((items) => items.filter((_, i) => i !== index))} className="h-10 px-2 text-xs text-red-600">Remove</button>
            </div>
            <label className="flex items-start gap-2 text-xs leading-4 text-slate-600"><input type="checkbox" checked={deduction.reduces_table_salary} onChange={(event) => setDeductions((items) => items.map((item, i) => i === index ? { ...item, reduces_table_salary: event.target.checked } : item))} className="mt-0.5" /><span>Subtract this item before calculating loonheffing tabel (tabelloon)</span></label>
          </div>)}
          <button type="button" onClick={() => setDeductions((items) => [...items, { name: "", calculation_type: "fixed", value: 0, reduces_table_salary: false }])} className="text-xs font-medium text-slate-700 underline">Add monthly deduction</button>
        </section>
        {loadingRates && <p className="text-sm text-slate-500">Loading current salary table…</p>}
        {estimatedMonthlyGross !== null && <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Estimated monthly gross salary</p><p className="mt-1 text-lg font-semibold text-slate-900">€{estimatedMonthlyGross.toLocaleString("en-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p><p className="mt-1 text-[11px] text-slate-500">Based on the salary table effective {version?.effective_from}.</p></div>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <Button type="submit" disabled={saving || loadingDeductions || loadingRates || rates.length === 0} className="w-full">{saving && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}{initialProfile ? "Save profile" : "Save and continue"}</Button>
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

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setProfile(null);
      setProfileLoaded(false);
      setEditingProfile(false);
      setError(null);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!session?.user.id) {
      setProfile(null);
      setProfileLoaded(false);
      return;
    }
    let alive = true;
    supabase.from("driver_profiles").select("user_id, first_name, last_name, scale, step, contract_hours_per_week, apply_loonheffingskorting, aow_category, single_elderly_credit").eq("user_id", session.user.id).maybeSingle().then(({ data, error: profileError }) => {
      if (!alive) return;
      if (profileError) setError(profileError.message);
      else setProfile(data as DriverProfile | null);
      setProfileLoaded(true);
    });
    return () => { alive = false; };
  }, [session?.user.id, supabase]);

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500"><LoaderCircle className="h-6 w-6 animate-spin" /></main>;
  if (!session) return <AuthForm />;
  if (!profileLoaded) return <main className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500"><LoaderCircle className="h-6 w-6 animate-spin" /></main>;
  if (error && !profile) return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4"><div className="max-w-md rounded-xl border border-red-200 bg-white p-5 text-sm text-red-700"><p>Could not load your driver profile. Make sure the Supabase migrations have been applied.</p><p className="mt-2 text-xs">{error}</p><button className="mt-4 underline" onClick={() => { void supabase.auth.signOut(); }}>Sign out</button></div></main>;
  if (!profile || editingProfile) return <ProfileForm userId={session.user.id} initialProfile={profile} onSaved={(savedProfile) => { setProfile(savedProfile); setEditingProfile(false); }} />;

  return <>
    <div className="mx-auto flex w-full max-w-lg items-center justify-between px-4 pt-3">
      <span className="text-xs text-slate-500">{profile.first_name} {profile.last_name} · {profile.scale}{profile.step} · {profile.contract_hours_per_week}h/week</span>
      <div className="flex items-center gap-1">
        <button aria-label="Edit profile" onClick={() => setEditingProfile(true)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><UserRoundPen className="h-4 w-4" /></button>
        <button aria-label="Sign out" onClick={() => { void supabase.auth.signOut(); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><LogOut className="h-4 w-4" /></button>
      </div>
    </div>
    {children}
  </>;
}
