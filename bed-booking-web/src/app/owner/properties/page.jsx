"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { getActiveCities } from "@/lib/firestore/consumer";
import { createProperty } from "@/lib/firestore/owner";

export default function OwnerPropertiesPage() {
    const { user, profile } = useAuth();
    const [cities, setCities] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [form, setForm] = useState({
        cityId: "",
        name: "",
        exactAddress: "",
        lat: "",
        lng: "",
        nearRailwayKm: "",
        nearBusKm: "",
    });

    const loadCities = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const cityItems = await getActiveCities();
            setCities(cityItems);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load cities.");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCities();
    }, [loadCities]);

    function cityNameById(cityId) {
        return cities.find((item) => item.id === cityId)?.name ?? "";
    }

    async function handleSubmit(event) {
        event.preventDefault();
        if (!user?.uid) return;

        const lat = Number(form.lat);
        const lng = Number(form.lng);
        const nearRailwayKm = Number(form.nearRailwayKm);
        const nearBusKm = Number(form.nearBusKm);

        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setError("Latitude and longitude must be valid numbers.");
            return;
        }

        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createProperty(user.uid, {
                cityId: form.cityId,
                cityName: cityNameById(form.cityId),
                name: form.name.trim(),
                exactAddress: form.exactAddress.trim(),
                lat,
                lng,
                nearRailwayKm: Number.isNaN(nearRailwayKm) ? 0 : nearRailwayKm,
                nearBusKm: Number.isNaN(nearBusKm) ? 0 : nearBusKm,
            });
            setForm({
                cityId: "",
                name: "",
                exactAddress: "",
                lat: "",
                lng: "",
                nearRailwayKm: "",
                nearBusKm: "",
            });
            setNotice("Property created successfully.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create property.");
        } finally {
            setSaving(false);
        }
    }

    if (!user) {
        return (
            <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
                <div className="rounded-xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
                    Checking access...
                </div>
            </main>
        );
    }
    if (profile && profile.role !== "owner") return null;

    return (
        <main className="mx-auto max-w-4xl px-5 py-10 md:px-6 md:py-12">
            <div className="glass-card animate-rise rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold">Create Property</h1>
                        <p className="mt-1 text-xs text-slate-500">Add a new property with location details.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/owner" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                            Owner Portal
                        </Link>
                        <Link href="/profile" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                            Edit Profile
                        </Link>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
            )}
            {notice && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
            )}

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                {loading ? (
                    <p className="text-sm text-slate-500">Loading cities...</p>
                ) : (
                    <form className="grid gap-3" onSubmit={handleSubmit}>
                        <select
                            value={form.cityId}
                            onChange={(e) => setForm((prev) => ({ ...prev, cityId: e.target.value }))}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            required
                        >
                            <option value="">Select city</option>
                            {cities.map((city) => (
                                <option key={city.id} value={city.id}>
                                    {city.name}{city.state ? `, ${city.state}` : ""}
                                </option>
                            ))}
                        </select>
                        <input
                            value={form.name}
                            onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                            placeholder="Property name"
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            required
                        />
                        <input
                            value={form.exactAddress}
                            onChange={(e) => setForm((prev) => ({ ...prev, exactAddress: e.target.value }))}
                            placeholder="Exact address"
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            required
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                value={form.lat}
                                onChange={(e) => setForm((prev) => ({ ...prev, lat: e.target.value }))}
                                placeholder="Latitude"
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                required
                            />
                            <input
                                value={form.lng}
                                onChange={(e) => setForm((prev) => ({ ...prev, lng: e.target.value }))}
                                placeholder="Longitude"
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                                required
                            />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                value={form.nearRailwayKm}
                                onChange={(e) => setForm((prev) => ({ ...prev, nearRailwayKm: e.target.value }))}
                                placeholder="Railway distance (km)"
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                            <input
                                value={form.nearBusKm}
                                onChange={(e) => setForm((prev) => ({ ...prev, nearBusKm: e.target.value }))}
                                placeholder="Bus stand distance (km)"
                                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={saving}
                            className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        >
                            {saving ? "Saving..." : "Create Property"}
                        </button>
                    </form>
                )}
            </section>
        </main>
    );
}
