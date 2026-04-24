"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { getActiveCities } from "@/lib/firestore/consumer";
import { submitOwnerApplication } from "@/lib/firestore/owner";
import { useEffect } from "react";

export default function ApplyOwnerPage() {
  const { user, profile, loading: authLoading } = useAuth();
  const router = useRouter();

  const [cities, setCities] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({
    businessName: "",
    phone: "",
    cityId: "",
    propertyAddress: "",
    description: "",
  });

  useEffect(() => {
    getActiveCities()
      .then(setCities)
      .catch(() => setError("Could not load city list. Please refresh the page."));
  }, []);

  // Pre-fill phone from profile
  useEffect(() => {
    if (profile?.phoneNumber) {
      setForm((prev) => ({ ...prev, phone: profile.phoneNumber }));
    }
  }, [profile?.phoneNumber]);

  if (authLoading) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16 text-sm text-slate-500">
        Loading...
      </main>
    );
  }

  if (profile?.role === "owner") {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-sm text-emerald-800">
          <p className="font-semibold text-lg">You are already an Owner!</p>
          <p className="mt-1">Head to the Owner Portal to manage your properties and beds.</p>
          <a
            href="/owner"
            className="mt-4 inline-block rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            Go to Owner Portal
          </a>
        </div>
      </main>
    );
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.businessName.trim() || !form.cityId || !form.propertyAddress.trim()) {
      setError("Please fill in all required fields.");
      return;
    }
    if (!user) {
      setError("Please login to submit your application.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const selectedCity = cities.find((c) => c.id === form.cityId);
      await submitOwnerApplication(user.uid, {
        businessName: form.businessName.trim(),
        phone: form.phone.trim(),
        cityId: form.cityId,
        cityName: selectedCity?.name ?? "",
        propertyAddress: form.propertyAddress.trim(),
        description: form.description.trim(),
      });
      setSubmitted(true);
    } catch (e) {
      // Show full error detail for debugging
      const code = e?.code ? ` [${e.code}]` : "";
      const msg = e instanceof Error ? e.message : String(e);
      setError(`Submit failed${code}: ${msg}`);
      console.error("[apply-owner] submitOwnerApplication error:", e);
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <main className="mx-auto max-w-xl px-5 py-16">
        <div className="glass-card rounded-2xl p-8 text-center">
          <p className="text-4xl">✅</p>
          <h1 className="mt-4 text-2xl font-bold text-slate-900">Application Submitted!</h1>
          <p className="mt-2 text-sm text-slate-600">
            Your owner application has been sent to the admin team. You will be notified once
            it is reviewed. This usually takes 1–2 business days.
          </p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-6 rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            Back to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <ProtectedRoute allowedRoles={["consumer"]}>
    <main className="mx-auto max-w-xl px-5 py-10 md:py-14">
      <section className="glass-card animate-rise rounded-2xl p-6 md:p-8">
        <h1 className="text-2xl font-bold text-slate-900">Apply as Bed Owner</h1>
        <p className="mt-2 text-sm text-slate-600">
          Fill in your property details. The admin team will review and activate your owner account.
        </p>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
            {!user && (
              <a href="/login" className="ml-2 font-semibold underline hover:text-rose-900">
                Login here
              </a>
            )}
          </div>
        )}

        <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Business / Property Name <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.businessName}
              onChange={(e) => setForm((prev) => ({ ...prev, businessName: e.target.value }))}
              placeholder="e.g. Sri Lakshmi Lodge"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Contact Phone
            </label>
            <input
              value={form.phone}
              onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="+91XXXXXXXXXX"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              City <span className="text-rose-500">*</span>
            </label>
            <select
              value={form.cityId}
              onChange={(e) => setForm((prev) => ({ ...prev, cityId: e.target.value }))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              required
            >
              <option value="">Select a city</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>
                  {city.name}, {city.state}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Property Address <span className="text-rose-500">*</span>
            </label>
            <input
              value={form.propertyAddress}
              onChange={(e) => setForm((prev) => ({ ...prev, propertyAddress: e.target.value }))}
              placeholder="Full street address of the property"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500"
              required
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">
              Brief Description (optional)
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Tell us about your property — amenities, bed count, type of travellers you serve..."
              rows={3}
              maxLength={500}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500 resize-none"
            />
            <p className="mt-0.5 text-right text-xs text-slate-400">{form.description.length}/500</p>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="shine-button rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {submitting ? "Submitting..." : "Submit Application"}
          </button>
        </form>
      </section>
    </main>
    </ProtectedRoute>
  );
}
