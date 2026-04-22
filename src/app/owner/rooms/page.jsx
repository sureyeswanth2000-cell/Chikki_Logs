"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { createRoom, getOwnerProperties, getOwnerRooms, toggleRoomActive, updateRoomTotalBeds } from "@/lib/firestore/owner";

export default function OwnerRoomsPage() {
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [properties, setProperties] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [roomCapacityDrafts, setRoomCapacityDrafts] = useState({});
    const [form, setForm] = useState({
        propertyId: "",
        roomName: "",
        totalBeds: "",
    });

    const propertyMap = useMemo(() => Object.fromEntries(properties.map((item) => [item.id, item])), [properties]);

    const loadData = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        setError(null);
        try {
            const [propertyItems, roomItems] = await Promise.all([
                getOwnerProperties(user.uid),
                getOwnerRooms(user.uid),
            ]);
            setProperties(propertyItems);
            setRooms(roomItems);
            setRoomCapacityDrafts(Object.fromEntries(roomItems.map((room) => [room.id, String(room.totalBeds)])));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load rooms.");
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    async function handleCreateRoom(event) {
        event.preventDefault();
        if (!user?.uid) return;

        const totalBeds = Number(form.totalBeds);
        if (Number.isNaN(totalBeds) || totalBeds <= 0) {
            setError("Total beds must be greater than 0.");
            return;
        }

        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createRoom(user.uid, {
                propertyId: form.propertyId,
                roomName: form.roomName.trim(),
                totalBeds,
            });
            setForm({ propertyId: "", roomName: "", totalBeds: "" });
            setNotice("Room created successfully.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create room.");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleRoom(roomId, isActive) {
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await toggleRoomActive(roomId, !isActive);
            setNotice("Room status updated.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update room status.");
        } finally {
            setSaving(false);
        }
    }

    async function handleUpdateRoomCapacity(roomId) {
        const nextValue = roomCapacityDrafts[roomId] ?? "";
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await updateRoomTotalBeds(roomId, nextValue);
            setNotice("Room bed capacity updated.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update room bed capacity.");
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
        <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
            <div className="glass-card animate-rise rounded-2xl p-6">
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <h1 className="text-3xl font-bold">Create Room</h1>
                        <p className="mt-1 text-xs text-slate-500">Create rooms and manage room status and bed capacity.</p>
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
                <h2 className="text-lg font-semibold">Add New Room</h2>
                {loading ? (
                    <p className="mt-3 text-sm text-slate-500">Loading properties...</p>
                ) : (
                    <form className="mt-4 grid gap-3" onSubmit={handleCreateRoom}>
                        <select
                            value={form.propertyId}
                            onChange={(e) => setForm((prev) => ({ ...prev, propertyId: e.target.value }))}
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            required
                        >
                            <option value="">Select property</option>
                            {properties.map((item) => (
                                <option key={item.id} value={item.id}>{item.name}</option>
                            ))}
                        </select>
                        <input
                            value={form.roomName}
                            onChange={(e) => setForm((prev) => ({ ...prev, roomName: e.target.value }))}
                            placeholder="Room name (example: Room 101)"
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            required
                        />
                        <input
                            value={form.totalBeds}
                            onChange={(e) => setForm((prev) => ({ ...prev, totalBeds: e.target.value }))}
                            placeholder="Total beds"
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            required
                        />
                        <button
                            type="submit"
                            disabled={saving}
                            className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed"
                        >
                            {saving ? "Saving..." : "Create Room"}
                        </button>
                    </form>
                )}
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Room Status</h2>
                {loading ? (
                    <p className="mt-3 text-sm text-slate-500">Loading rooms...</p>
                ) : rooms.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No rooms found.</p>
                ) : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {rooms.map((room) => (
                            <div key={room.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                                <p className="text-sm font-semibold text-slate-900">{room.roomName}</p>
                                <p className="text-xs text-slate-500">{propertyMap[room.propertyId]?.name ?? "Unknown property"}</p>
                                <div className="mt-2 flex items-center gap-2">
                                    <label className="text-xs text-slate-500">Total beds</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={roomCapacityDrafts[room.id] ?? String(room.totalBeds)}
                                        onChange={(event) => setRoomCapacityDrafts((prev) => ({ ...prev, [room.id]: event.target.value }))}
                                        className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => void handleUpdateRoomCapacity(room.id)}
                                        className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                                        disabled={saving}
                                    >
                                        Save Beds Count
                                    </button>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => void handleToggleRoom(room.id, room.active !== false)}
                                    className="mt-3 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                                >
                                    {room.active === false ? "Enable" : "Disable"}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </main>
    );
}
