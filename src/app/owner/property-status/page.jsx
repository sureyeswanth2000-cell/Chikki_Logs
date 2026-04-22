"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import {
    disableBedBlock,
    getOwnerBedBlocks,
    getOwnerBeds,
    getOwnerProperties,
    getOwnerRooms,
    toggleBedActive,
    togglePropertyActive,
    toggleRoomActive,
    updateRoomTotalBeds,
} from "@/lib/firestore/owner";

export default function OwnerPropertyStatusPage() {
    const { user, profile } = useAuth();
    const [properties, setProperties] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [beds, setBeds] = useState([]);
    const [bedBlocks, setBedBlocks] = useState([]);
    const [roomCapacityDrafts, setRoomCapacityDrafts] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    const loadData = useCallback(async () => {
        if (!user?.uid) return;
        setLoading(true);
        setError(null);
        try {
            const [propertyItems, roomItems, bedItems, blockItems] = await Promise.all([
                getOwnerProperties(user.uid),
                getOwnerRooms(user.uid),
                getOwnerBeds(user.uid),
                getOwnerBedBlocks(user.uid),
            ]);
            setProperties(propertyItems);
            setRooms(roomItems);
            setBeds(bedItems);
            setBedBlocks(blockItems);
            setRoomCapacityDrafts(Object.fromEntries(roomItems.map((room) => [room.id, String(room.totalBeds)])));
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load status data.");
        } finally {
            setLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    async function handleToggleProperty(propertyId, isActive) {
        setSaving(true);
        setError(null);
        try {
            await togglePropertyActive(propertyId, !isActive);
            setNotice("Property status updated.");
            await loadData();
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
            setNotice("Room status updated.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update room status.");
        } finally {
            setSaving(false);
        }
    }

    async function handleToggleBed(bedId, isActive) {
        setSaving(true);
        setError(null);
        try {
            await toggleBedActive(bedId, !isActive);
            setNotice("Bed status updated.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update bed status.");
        } finally {
            setSaving(false);
        }
    }

    async function handleDisableBlock(blockId) {
        setSaving(true);
        setError(null);
        try {
            await disableBedBlock(blockId);
            setNotice("Bed block disabled.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not disable bed block.");
        } finally {
            setSaving(false);
        }
    }

    async function handleUpdateRoomCapacity(roomId) {
        const nextValue = roomCapacityDrafts[roomId] ?? "";
        setSaving(true);
        setError(null);
        try {
            await updateRoomTotalBeds(roomId, nextValue);
            setNotice("Room bed capacity updated.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update room capacity.");
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
                        <h1 className="text-3xl font-bold">Inventory Status</h1>
                        <p className="mt-1 text-xs text-slate-500">Manage status for properties, rooms, beds, and blocks.</p>
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
                <h2 className="text-lg font-semibold">Property Status</h2>
                {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {properties.map((property) => (
                            <article key={property.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                <p className="font-semibold text-slate-900">{property.name}</p>
                                <p className="text-xs text-slate-500">{property.cityName || "Unknown city"}</p>
                                <button type="button" onClick={() => void handleToggleProperty(property.id, property.status !== "inactive")} disabled={saving} className="mt-3 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
                                    {property.status === "inactive" ? "Enable" : "Disable"}
                                </button>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Room Status</h2>
                {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : (
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        {rooms.map((room) => {
                            const property = properties.find((item) => item.id === room.propertyId);
                            return (
                                <article key={room.id} className="rounded-xl border border-slate-200 bg-white p-4">
                                    <p className="font-semibold text-slate-900">{room.roomName}</p>
                                    <p className="text-xs text-slate-500">{property?.name ?? "Unknown property"}</p>
                                    <div className="mt-2 flex items-center gap-2">
                                        <label className="text-xs text-slate-500">Total beds</label>
                                        <input type="number" min={1} value={roomCapacityDrafts[room.id] ?? String(room.totalBeds)} onChange={(event) => setRoomCapacityDrafts((prev) => ({ ...prev, [room.id]: event.target.value }))} className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-xs" />
                                        <button type="button" onClick={() => void handleUpdateRoomCapacity(room.id)} disabled={saving} className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60">Save</button>
                                    </div>
                                    <button type="button" onClick={() => void handleToggleRoom(room.id, room.active !== false)} disabled={saving} className="mt-3 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
                                        {room.active === false ? "Enable" : "Disable"}
                                    </button>
                                </article>
                            );
                        })}
                    </div>
                )}
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Bed Status</h2>
                {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                    <th className="pb-2 text-left font-semibold">Bed</th>
                                    <th className="pb-2 text-left font-semibold">Room</th>
                                    <th className="pb-2 text-left font-semibold">Type</th>
                                    <th className="pb-2 text-left font-semibold">Owner Price</th>
                                    <th className="pb-2 text-left font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {beds.map((bed) => {
                                    const room = rooms.find((item) => item.id === bed.roomId);
                                    return (
                                        <tr key={bed.id}>
                                            <td className="py-2 font-medium">{bed.bedCode}</td>
                                            <td className="py-2 text-slate-600">{room?.roomName ?? "-"}</td>
                                            <td className="py-2 text-slate-600">{bed.bedType}</td>
                                            <td className="py-2 text-slate-600">H:{bed.hourlyPrice} / ON:{bed.overnightPrice} / OD:{bed.overdayPrice}</td>
                                            <td className="py-2">
                                                <button type="button" onClick={() => void handleToggleBed(bed.id, bed.active)} disabled={saving} className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
                                                    {bed.active ? "Disable" : "Enable"}
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Bed Block Status</h2>
                {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : bedBlocks.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">No active blocks found.</p>
                ) : (
                    <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {bedBlocks.map((block) => {
                            const bed = beds.find((item) => item.id === block.bedId);
                            const room = rooms.find((item) => item.id === block.roomId);
                            return (
                                <li key={block.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <p className="text-sm font-semibold">{bed?.bedCode ?? "Bed"} - {room?.roomName ?? "Room"}</p>
                                    <p className="mt-1 text-xs text-slate-500">{block.reason}</p>
                                    <button type="button" onClick={() => void handleDisableBlock(block.id)} disabled={saving} className="mt-2 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:opacity-60">
                                        Disable Block
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </main>
    );
}
