"use client";
import { Fragment, useCallback, useEffect, useState } from "react";
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
    updateBedPrices,
    updateRoomTotalBeds,
} from "@/lib/firestore/owner";

export default function OwnerPropertyStatusPage() {
    const { user, profile } = useAuth();
    const [properties, setProperties] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [beds, setBeds] = useState([]);
    const [bedBlocks, setBedBlocks] = useState([]);
    const [roomCapacityDrafts, setRoomCapacityDrafts] = useState({});
    const [bedPriceDrafts, setBedPriceDrafts] = useState({});
    const [editingBedId, setEditingBedId] = useState(null);
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
            setBedPriceDrafts(Object.fromEntries(bedItems.map((bed) => [bed.id, {
                hourlyPrice: String(bed.hourlyPrice),
                overnightPrice: String(bed.overnightPrice),
                overdayPrice: String(bed.overdayPrice),
            }])));
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

    function handleEditBedPrices(bed) {
        setEditingBedId(bed.id);
        setBedPriceDrafts((prev) => ({
            ...prev,
            [bed.id]: {
                hourlyPrice: String(bed.hourlyPrice),
                overnightPrice: String(bed.overnightPrice),
                overdayPrice: String(bed.overdayPrice),
            },
        }));
        setError(null);
        setNotice(null);
    }

    function handlePriceDraftChange(bedId, field, value) {
        setBedPriceDrafts((prev) => ({
            ...prev,
            [bedId]: {
                ...(prev[bedId] ?? {}),
                [field]: value,
            },
        }));
    }

    async function handleUpdateBedPrices(bedId) {
        if (!user?.uid) return;
        const draft = bedPriceDrafts[bedId] ?? {};
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await updateBedPrices(user.uid, bedId, draft);
            setNotice("Bed prices updated.");
            setEditingBedId(null);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not update bed prices.");
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
                        <h1 className="text-3xl font-bold">Inventory</h1>
                        <p className="mt-1 text-xs text-slate-500">Block beds first, then manage properties and rooms when needed.</p>
                    </div>
                    <div className="flex gap-2">
                        <Link href="/owner" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                            Dashboard
                        </Link>
                        <Link href="/owner/beds" className="rounded-full border border-sky-300 bg-white px-4 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50 transition">
                            Add Inventory
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
                <h2 className="text-lg font-semibold">Bed Control</h2>
                <p className="mt-1 text-sm text-slate-500">Quick block or unblock for day-to-day owner control.</p>
                {loading ? <p className="mt-3 text-sm text-slate-500">Loading...</p> : (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                    <th className="pb-2 text-left font-semibold">Bed</th>
                                    <th className="pb-2 text-left font-semibold">Room</th>
                                    <th className="pb-2 text-left font-semibold">Type</th>
                                    <th className="pb-2 text-left font-semibold">Owner Price</th>
                                    <th className="pb-2 text-left font-semibold">Status</th>
                                    <th className="pb-2 text-left font-semibold">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {beds.map((bed) => {
                                    const room = rooms.find((item) => item.id === bed.roomId);
                                    const draft = bedPriceDrafts[bed.id] ?? {
                                        hourlyPrice: String(bed.hourlyPrice),
                                        overnightPrice: String(bed.overnightPrice),
                                        overdayPrice: String(bed.overdayPrice),
                                    };
                                    return (
                                        <Fragment key={bed.id}>
                                            <tr>
                                                <td className="py-2 font-medium">{bed.bedCode}</td>
                                                <td className="py-2 text-slate-600">{room?.roomName ?? "-"}</td>
                                                <td className="py-2 text-slate-600">{bed.bedType}</td>
                                                <td className="py-2 text-slate-600">H:{bed.hourlyPrice} / ON:{bed.overnightPrice} / OD:{bed.overdayPrice}</td>
                                                <td className="py-2">
                                                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${bed.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                                        {bed.active ? "Available" : "Blocked"}
                                                    </span>
                                                </td>
                                                <td className="py-2">
                                                    <div className="flex flex-wrap gap-2">
                                                        <button type="button" onClick={() => handleEditBedPrices(bed)} disabled={saving} className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60">
                                                            Edit Price
                                                        </button>
                                                        <button type="button" onClick={() => void handleToggleBed(bed.id, bed.active)} disabled={saving} className={`rounded-full border px-3 py-1 text-xs font-semibold disabled:opacity-60 ${bed.active ? "border-rose-300 text-rose-700 hover:bg-rose-50" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}>
                                                            {bed.active ? "Block" : "Unblock"}
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {editingBedId === bed.id ? (
                                                <tr className="bg-slate-50/70">
                                                    <td colSpan={6} className="py-3">
                                                        <div className="grid gap-3 rounded-xl border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end">
                                                            <label className="text-xs font-semibold text-slate-600">
                                                                Hourly
                                                                <input type="number" min={1} value={draft.hourlyPrice} onChange={(event) => handlePriceDraftChange(bed.id, "hourlyPrice", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                                            </label>
                                                            <label className="text-xs font-semibold text-slate-600">
                                                                Overnight
                                                                <input type="number" min={1} value={draft.overnightPrice} onChange={(event) => handlePriceDraftChange(bed.id, "overnightPrice", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                                            </label>
                                                            <label className="text-xs font-semibold text-slate-600">
                                                                Overday
                                                                <input type="number" min={1} value={draft.overdayPrice} onChange={(event) => handlePriceDraftChange(bed.id, "overdayPrice", event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                                                            </label>
                                                            <div className="flex gap-2">
                                                                <button type="button" onClick={() => void handleUpdateBedPrices(bed.id)} disabled={saving} className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-700 disabled:opacity-60">
                                                                    Save
                                                                </button>
                                                                <button type="button" onClick={() => setEditingBedId(null)} disabled={saving} className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ) : null}
                                        </Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                        {beds.length === 0 ? <p className="mt-3 text-sm text-slate-500">No beds yet.</p> : null}
                    </div>
                )}
            </section>

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

            <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
                <h2 className="text-lg font-semibold">Add Inventory</h2>
                <p className="mt-1 text-sm text-slate-500">Create property, room, and bed records from the dedicated inventory form.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                    <Link href="/owner/beds#add-property" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                        Add Property
                    </Link>
                    <Link href="/owner/beds#add-room" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                        Add Room
                    </Link>
                    <Link href="/owner/beds#add-bed" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
                        Add Bed
                    </Link>
                    <Link href="/owner/beds" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 transition">
                        Add All
                    </Link>
                </div>
            </section>
        </main>
    );
}
