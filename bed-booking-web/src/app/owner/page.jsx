"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { getActiveCities } from "@/lib/firestore/consumer";
import {
    getOwnerBedBlocks,
    getOwnerBeds,
    getOwnerCheckoutAlerts,
    getOwnerLiveJobs,
    getOwnerUpcomingBookings,
    getOwnerProperties,
    getOwnerRooms,
    togglePropertyActive,
    toggleRoomActive,
    updateProperty,
} from "@/lib/firestore/owner";
export default function OwnerPage() {
    const { profile, user } = useAuth();
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [cities, setCities] = useState([]);
    const [properties, setProperties] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [beds, setBeds] = useState([]);
    const [bedBlocks, setBedBlocks] = useState([]);
    const [liveJobs, setLiveJobs] = useState([]);
    const [checkoutAlerts, setCheckoutAlerts] = useState([]);
    const [upcomingBookings, setUpcomingBookings] = useState([]);
    const [advanceCollected, setAdvanceCollected] = useState(0);
    const [activeBookingCount, setActiveBookingCount] = useState(0);
    const [editingPropertyId, setEditingPropertyId] = useState(null);
    const [editPropertyForm, setEditPropertyForm] = useState({
        cityId: "",
        name: "",
        exactAddress: "",
        lat: "",
        lng: "",
        nearRailwayKm: "",
        nearBusKm: "",
    });
    const activeBeds = useMemo(() => beds.filter((b) => b.active), [beds]);
    const inactiveBeds = useMemo(() => beds.filter((b) => !b.active), [beds]);

    function renderBookingStage(statusValue) {
        const normalized = String(statusValue ?? "").toLowerCase();
        if (normalized === "confirmed") {
            return <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Booked</span>;
        }
        if (normalized === "checked_in") {
            return <span className="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">Checked In</span>;
        }
        if (normalized === "completed") {
            return <span className="inline-block rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">Completed</span>;
        }
        if (normalized === "cancelled") {
            return <span className="inline-block rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Cancelled</span>;
        }
        return <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{statusValue || "Unknown"}</span>;
    }

    const loadOwnerData = useCallback(async () => {
        if (!user?.uid) return;
        setLoadingData(true);
        setError(null);
        try {
            const [cityItems, propertyItems, roomItems, bedItems, blockItems] = await Promise.all([
                getActiveCities(),
                getOwnerProperties(user.uid),
                getOwnerRooms(user.uid),
                getOwnerBeds(user.uid),
                getOwnerBedBlocks(user.uid),
            ]);
            const [liveJobItems, upcomingSummary] = await Promise.all([
                getOwnerLiveJobs(user.uid),
                getOwnerUpcomingBookings(user.uid),
            ]);
            setCities(cityItems);
            setProperties(propertyItems);
            setRooms(roomItems);
            setBeds(bedItems);
            setBedBlocks(blockItems);
            setLiveJobs(liveJobItems);
            setUpcomingBookings(upcomingSummary.upcomingBookings);
            setAdvanceCollected(upcomingSummary.advanceCollected);
            setActiveBookingCount(upcomingSummary.activeBookingCount);
            const alertItems = await getOwnerCheckoutAlerts(user.uid);
            setCheckoutAlerts(alertItems);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load owner inventory.");
        } finally {
            setLoadingData(false);
        }
    }, [user?.uid]);
    useEffect(() => {
        void loadOwnerData();
    }, [loadOwnerData]);
    function cityNameById(cityId) {
        return cities.find((item) => item.id === cityId)?.name ?? "";
    }
    function handleStartEditProperty(item) {
        setEditingPropertyId(item.id);
        setEditPropertyForm({
            cityId: item.cityId,
            name: item.name,
            exactAddress: item.exactAddress,
            lat: String(item.lat),
            lng: String(item.lng),
            nearRailwayKm: String(item.nearRailwayKm),
            nearBusKm: String(item.nearBusKm),
        });
    }
    function handleCancelEditProperty() {
        setEditingPropertyId(null);
    }
    async function handleUpdateProperty(event) {
        event.preventDefault();
        if (!editingPropertyId) return;
        const lat = Number(editPropertyForm.lat);
        const lng = Number(editPropertyForm.lng);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setError("Latitude and longitude must be valid numbers.");
            return;
        }
        const nearRailwayKm = Number(editPropertyForm.nearRailwayKm);
        const nearBusKm = Number(editPropertyForm.nearBusKm);
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await updateProperty(editingPropertyId, {
                cityId: editPropertyForm.cityId,
                cityName: cityNameById(editPropertyForm.cityId),
                name: editPropertyForm.name.trim(),
                exactAddress: editPropertyForm.exactAddress.trim(),
                lat,
                lng,
                nearRailwayKm: Number.isNaN(nearRailwayKm) ? 0 : nearRailwayKm,
                nearBusKm: Number.isNaN(nearBusKm) ? 0 : nearBusKm,
            });
            setEditingPropertyId(null);
            setNotice("Property updated.");
            await loadOwnerData();
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "Could not update property.");
        } finally {
            setSaving(false);
        }
    }
    async function handleToggleProperty(propertyId, isActive) {
        setSaving(true);
        setError(null);
        try {
            await togglePropertyActive(propertyId, !isActive);
            await loadOwnerData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update property status.");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleRoom(roomId, isActive) {
        setSaving(true);
        setError(null);
        try {
            await toggleRoomActive(roomId, !isActive);
            await loadOwnerData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update room status.");
        } finally {
            setSaving(false);
        }
    }

    async function handleCopyBookingId(bookingCode, fallbackId) {
        const value = String(bookingCode || fallbackId || "").trim();
        if (!value) return;
        try {
            await navigator.clipboard.writeText(value);
            setNotice(`Copied booking ID: ${value}`);
        } catch {
            setError("Could not copy booking ID.");
        }
    }

    return (
        <ProtectedRoute allowedRoles={["owner"]}>
        <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
            {/* Header */}
            <div className="glass-card animate-rise rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold">Owner Portal</h1>
                        <p className="mt-1 text-xs text-slate-500">Logged in as role: {profile?.role ?? "unknown"}</p>
                    </div>
                    <Link href="/profile" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                        Edit Profile
                    </Link>
                </div>
            </div>

            {error && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                    {error}
                </div>
            )}
            {notice && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {notice}
                </div>
            )}

            {/* Stats */}
            <section className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-6">
                <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-3xl font-bold text-slate-900">{loadingData ? "—" : properties.length}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Properties</p>
                </div>
                <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-3xl font-bold text-slate-900">{loadingData ? "—" : rooms.length}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Rooms</p>
                </div>
                <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-3xl font-bold text-emerald-600">{loadingData ? "—" : activeBeds.length}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Active Beds</p>
                </div>
                <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-3xl font-bold text-rose-500">{loadingData ? "—" : inactiveBeds.length}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Inactive Beds</p>
                </div>
                <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-3xl font-bold text-amber-600">{loadingData ? "—" : liveJobs.length}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Live Jobs</p>
                </div>
                <div className="glass-card rounded-2xl p-4 text-center">
                    <p className="text-3xl font-bold text-indigo-600">{loadingData ? "—" : activeBookingCount}</p>
                    <p className="mt-1 text-xs font-medium text-slate-500 uppercase tracking-wide">Active Bookings</p>
                </div>
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold">Upcoming Bookings</h2>
                        <p className="mt-1 text-sm text-slate-500">Advance collected for active bookings: INR {loadingData ? "—" : advanceCollected}</p>
                    </div>
                    <Link href="/history" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                        View History →
                    </Link>
                </div>
                {loadingData ? (
                    <p className="mt-4 text-sm text-slate-500">Loading upcoming bookings...</p>
                ) : upcomingBookings.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No upcoming bookings.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="pb-2 text-left font-semibold">Booking ID</th>
                                    <th className="pb-2 text-left font-semibold">Property</th>
                                    <th className="pb-2 text-left font-semibold">Room</th>
                                    <th className="pb-2 text-left font-semibold">Bed</th>
                                    <th className="pb-2 text-left font-semibold">Check-In</th>
                                    <th className="pb-2 text-left font-semibold">Check-Out</th>
                                    <th className="pb-2 text-left font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {upcomingBookings.map((job) => (
                                    <tr key={job.id}>
                                        <td className="py-2 font-mono text-xs text-slate-700">
                                            <div className="flex items-center gap-2">
                                                <span>{job.bookingCode || job.id}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopyBookingId(job.bookingCode, job.id)}
                                                    className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-2 text-slate-700">{job.propertyName || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.roomName || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.bedCode || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.checkInAt || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.checkOutAt || "-"}</td>
                                        <td className="py-2">{renderBookingStage(job.bookingStatus || "confirmed")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Checkout Alerts</h2>
                <p className="mt-1 text-sm text-slate-500">Triggered when a consumer checks out and remaining payment gets calculated.</p>
                {loadingData ? (
                    <p className="mt-4 text-sm text-slate-500">Loading checkout alerts...</p>
                ) : checkoutAlerts.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No checkout alerts yet.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="pb-2 text-left font-semibold">Booking ID</th>
                                    <th className="pb-2 text-left font-semibold">Property</th>
                                    <th className="pb-2 text-left font-semibold">Room</th>
                                    <th className="pb-2 text-left font-semibold">Bed</th>
                                    <th className="pb-2 text-left font-semibold">Check-In</th>
                                    <th className="pb-2 text-left font-semibold">Check-Out</th>
                                    <th className="pb-2 text-left font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {checkoutAlerts.map((item) => (
                                    <tr key={item.id}>
                                        <td className="py-2 font-mono text-xs text-slate-700">
                                            <div className="flex items-center gap-2">
                                                <span>{item.bookingCode || item.id}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopyBookingId(item.bookingCode, item.id)}
                                                    className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-2 text-slate-700">{item.propertyName || "-"}</td>
                                        <td className="py-2 text-slate-700">{item.roomName || "-"}</td>
                                        <td className="py-2 text-slate-700">{item.bedCode || "-"}</td>
                                        <td className="py-2 text-slate-700">{item.checkInAt || "-"}</td>
                                        <td className="py-2 text-slate-700">{item.checkOutAt || "-"}</td>
                                        <td className="py-2">{renderBookingStage(item.bookingStatus || "completed")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Inventory Actions</h2>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <Link href="/owner/beds" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition">
                        Create Inventory
                    </Link>
                    <Link href="/owner/property-status" className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition">
                        Inventory Status
                    </Link>
                </div>
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h2 className="text-lg font-semibold">Live Jobs</h2>
                        <p className="mt-1 text-sm text-slate-500">Current ongoing bookings in your properties.</p>
                    </div>
                    <Link href="/history" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                        View History →
                    </Link>
                </div>
                {loadingData ? (
                    <p className="mt-4 text-sm text-slate-500">Loading live jobs...</p>
                ) : liveJobs.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No live jobs right now.</p>
                ) : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="pb-2 text-left font-semibold">Booking ID</th>
                                    <th className="pb-2 text-left font-semibold">Property</th>
                                    <th className="pb-2 text-left font-semibold">Room</th>
                                    <th className="pb-2 text-left font-semibold">Bed</th>
                                    <th className="pb-2 text-left font-semibold">Check-In</th>
                                    <th className="pb-2 text-left font-semibold">Check-Out</th>
                                    <th className="pb-2 text-left font-semibold">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {liveJobs.map((job) => (
                                    <tr key={job.id}>
                                        <td className="py-2 font-mono text-xs text-slate-700">
                                            <div className="flex items-center gap-2">
                                                <span>{job.bookingCode || job.id}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => void handleCopyBookingId(job.bookingCode, job.id)}
                                                    className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                        </td>
                                        <td className="py-2 text-slate-700">{job.propertyName || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.roomName || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.bedCode || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.checkInAt || "-"}</td>
                                        <td className="py-2 text-slate-700">{job.checkOutAt || "-"}</td>
                                        <td className="py-2">{renderBookingStage(job.bookingStatus || "checked_in")}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            {/* Bed status table */}
            {beds.length > 0 && (
                <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-semibold">Bed Status</h2>
                        <Link href="/owner/beds" className="rounded-full border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition">
                            Manage Inventory →
                        </Link>
                    </div>
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs text-slate-500 uppercase tracking-wide">
                                    <th className="pb-2 text-left font-semibold">Bed Code</th>
                                    <th className="pb-2 text-left font-semibold">Type</th>
                                    <th className="pb-2 text-left font-semibold">Room</th>
                                    <th className="pb-2 text-left font-semibold">Status</th>
                                    <th className="pb-2 text-left font-semibold">Blocks</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {beds.map((bed) => {
                                    const room = rooms.find((r) => r.id === bed.roomId);
                                    const activeBlocks = bedBlocks.filter((b) => b.bedId === bed.id);
                                    return (
                                        <tr key={bed.id} className="text-sm">
                                            <td className="py-2 font-medium">{bed.bedCode}</td>
                                            <td className="py-2 text-slate-600">{bed.bedType}</td>
                                            <td className="py-2 text-slate-600">{room?.roomName ?? "—"}</td>
                                            <td className="py-2">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${bed.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-600"}`}>
                                                    {bed.active ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td className="py-2 text-slate-500">{activeBlocks.length > 0 ? `${activeBlocks.length} block(s)` : "—"}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {beds.length === 0 && !loadingData && (
                <div className="glass-card mt-6 rounded-2xl p-6 text-center text-sm text-slate-500">
                    No beds added yet.{" "}
                    <Link href="/owner/beds" className="font-semibold text-sky-600 underline">
                        Manage inventory →
                    </Link>
                </div>
            )}

            {/* Properties & Rooms list */}
            <section className="glass-card animate-stagger mt-8 rounded-2xl p-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold">Properties</h2>
                    <button type="button" onClick={() => void loadOwnerData()} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                        Refresh
                    </button>
                </div>
                {loadingData ? (
                    <p className="mt-3 text-sm text-slate-500">Loading...</p>
                ) : properties.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No properties yet. Create one above.</p>
                ) : (
                    <ul className="mt-4 space-y-3">
                        {properties.map((item) => (
                            <li key={item.id} className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                {editingPropertyId === item.id ? (
                                    <form onSubmit={handleUpdateProperty} className="grid gap-2">
                                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Editing: {item.name}</p>
                                        <select value={editPropertyForm.cityId} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, cityId: e.target.value }))} className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" required>
                                            <option value="">Select city</option>
                                            {cities.map((city) => (<option key={city.id} value={city.id}>{city.name}{city.state ? `, ${city.state}` : ""}</option>))}
                                        </select>
                                        <input value={editPropertyForm.name} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Property name" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" required />
                                        <input value={editPropertyForm.exactAddress} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, exactAddress: e.target.value }))} placeholder="Exact address" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" required />
                                        <div className="grid grid-cols-2 gap-2">
                                            <input value={editPropertyForm.lat} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, lat: e.target.value }))} placeholder="Latitude" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" required />
                                            <input value={editPropertyForm.lng} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, lng: e.target.value }))} placeholder="Longitude" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <input value={editPropertyForm.nearRailwayKm} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, nearRailwayKm: e.target.value }))} placeholder="Railway km" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                                            <input value={editPropertyForm.nearBusKm} onChange={(e) => setEditPropertyForm((prev) => ({ ...prev, nearBusKm: e.target.value }))} placeholder="Bus km" className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs" />
                                        </div>
                                        <div className="flex gap-2">
                                            <button type="submit" disabled={saving} className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:bg-slate-400">Save</button>
                                            <button type="button" onClick={handleCancelEditProperty} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50">Cancel</button>
                                        </div>
                                    </form>
                                ) : (
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="font-semibold">{item.name}</p>
                                            <p className="text-sm text-slate-500">{item.cityName}</p>
                                            <p className="text-sm text-slate-500">{item.exactAddress}</p>
                                            <p className="mt-1 text-xs text-slate-400">
                                                {rooms.filter((r) => r.propertyId === item.id).length} room(s) &middot;
                                                {" "}{beds.filter((b) => rooms.filter((r) => r.propertyId === item.id).some((r) => r.id === b.roomId)).length} bed(s)
                                            </p>
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            <button type="button" onClick={() => handleStartEditProperty(item)} className="rounded-full border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50">Edit</button>
                                            <button type="button" onClick={() => void handleToggleProperty(item.id, item.status !== "inactive")} className="rounded-full border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                                                {item.status === "inactive" ? "Enable" : "Disable"}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Rooms list */}
            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-xl font-semibold">Rooms</h2>
                {loadingData ? (
                    <p className="mt-3 text-sm text-slate-500">Loading...</p>
                ) : rooms.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No rooms yet.</p>
                ) : (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {rooms.map((item) => {
                            const prop = properties.find((p) => p.id === item.propertyId);
                            return (
                                <li key={item.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                                    <p className="font-semibold text-sm">{item.roomName}</p>
                                    <p className="text-xs text-slate-500">{prop?.name ?? "Unknown property"}</p>
                                    <p className="text-xs text-slate-500">Total beds: {item.totalBeds}</p>
                                    <button type="button" onClick={() => void handleToggleRoom(item.id, item.active !== false)} className="mt-2 rounded-full border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50">
                                        {item.active === false ? "Enable" : "Disable"}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </main>
        </ProtectedRoute>
    );
}
