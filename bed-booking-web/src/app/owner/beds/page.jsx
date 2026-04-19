"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { getActiveCities } from "@/lib/firestore/consumer";
import {
    createBed,
    createBedBlock,
    createProperty,
    createRoom,
    getOwnerBeds,
    getOwnerProperties,
    getOwnerRooms,
} from "@/lib/firestore/owner";

const LocationPickerMap = dynamic(
    () => import("@/components/owner/location-picker-map").then((mod) => mod.LocationPickerMap),
    { ssr: false }
);

function haversineKm(lat1, lng1, lat2, lng2) {
    const toRadians = (deg) => (deg * Math.PI) / 180;
    const earthRadiusKm = 6371;
    const deltaLat = toRadians(lat2 - lat1);
    const deltaLng = toRadians(lng2 - lng1);
    const a =
        Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
        Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
    return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function findNearbyTransitDistances(lat, lng) {
    const overpassQuery = `
[out:json][timeout:25];
(
  node["railway"="station"](around:20000,${lat},${lng});
  node["amenity"="bus_station"](around:20000,${lat},${lng});
);
out body;
`;
    const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`);
    if (!response.ok) {
        throw new Error("Transit lookup failed.");
    }
    const payload = await response.json();
    const elements = Array.isArray(payload?.elements) ? payload.elements : [];

    const railwayDistances = elements
        .filter((item) => item?.tags?.railway === "station")
        .map((item) => haversineKm(lat, lng, Number(item.lat), Number(item.lon)))
        .filter((value) => Number.isFinite(value));

    const busDistances = elements
        .filter((item) => item?.tags?.amenity === "bus_station")
        .map((item) => haversineKm(lat, lng, Number(item.lat), Number(item.lon)))
        .filter((value) => Number.isFinite(value));

    return {
        nearRailwayKm: railwayDistances.length ? Math.min(...railwayDistances).toFixed(2) : "",
        nearBusKm: busDistances.length ? Math.min(...busDistances).toFixed(2) : "",
    };
}

export default function OwnerBedsPage() {
    const { user, profile } = useAuth();
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [distanceLoading, setDistanceLoading] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [cities, setCities] = useState([]);
    const [properties, setProperties] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [beds, setBeds] = useState([]);

    const [propertyForm, setPropertyForm] = useState({
        cityId: "",
        name: "",
        exactAddress: "",
        lat: "",
        lng: "",
        nearRailwayKm: "",
        nearBusKm: "",
    });
    const [roomForm, setRoomForm] = useState({
        propertyId: "",
        roomName: "",
        totalBeds: "",
    });
    const [bedForm, setBedForm] = useState({
        propertyId: "",
        roomId: "",
        bedCode: "",
        bedType: "NON_AC",
        hourlyPrice: "120",
        overnightPrice: "650",
        overdayPrice: "900",
    });
    const [blockForm, setBlockForm] = useState({
        propertyId: "",
        roomId: "",
        bedId: "",
        blockStart: "",
        blockEnd: "",
        reason: "",
        isFullBlock: false,
    });

    const roomsForBedProperty = useMemo(() => rooms.filter((r) => r.propertyId === bedForm.propertyId), [rooms, bedForm.propertyId]);
    const blockRooms = useMemo(() => rooms.filter((r) => r.propertyId === blockForm.propertyId), [rooms, blockForm.propertyId]);
    const blockBeds = useMemo(() => beds.filter((b) => b.roomId === blockForm.roomId), [beds, blockForm.roomId]);

    const loadData = useCallback(async () => {
        if (!user?.uid) return;
        setLoadingData(true);
        setError(null);
        try {
            const [cityItems, propertyItems, roomItems, bedItems] = await Promise.all([
                getActiveCities(),
                getOwnerProperties(user.uid),
                getOwnerRooms(user.uid),
                getOwnerBeds(user.uid),
            ]);
            setCities(cityItems);
            setProperties(propertyItems);
            setRooms(roomItems);
            setBeds(bedItems);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to load data.");
        } finally {
            setLoadingData(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    function cityNameById(cityId) {
        return cities.find((item) => item.id === cityId)?.name ?? "";
    }

    async function refreshTransitDistances(latValue, lngValue) {
        const lat = Number(latValue);
        const lng = Number(lngValue);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setError("Pick a valid map location first.");
            return;
        }

        setDistanceLoading(true);
        setError(null);
        try {
            const distances = await findNearbyTransitDistances(lat, lng);
            setPropertyForm((prev) => ({
                ...prev,
                nearRailwayKm: distances.nearRailwayKm,
                nearBusKm: distances.nearBusKm,
            }));
            setNotice("Nearby railway and bus stand distances calculated.");
        } catch {
            setError("Could not auto-calculate nearby distances. You can still enter them manually.");
        } finally {
            setDistanceLoading(false);
        }
    }

    async function handleUseCurrentLocation() {
        if (!navigator?.geolocation) {
            setError("Geolocation is not supported in this browser.");
            return;
        }
        setError(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                setPropertyForm((prev) => ({
                    ...prev,
                    lat: lat.toFixed(6),
                    lng: lng.toFixed(6),
                }));
                void refreshTransitDistances(lat, lng);
            },
            () => {
                setError("Could not read current GPS location.");
            }
        );
    }

    function handleMapPick(lat, lng) {
        setPropertyForm((prev) => ({
            ...prev,
            lat: lat.toFixed(6),
            lng: lng.toFixed(6),
        }));
        void refreshTransitDistances(lat, lng);
    }

    async function handleCreateProperty(event) {
        event.preventDefault();
        if (!user?.uid) return;
        const lat = Number(propertyForm.lat);
        const lng = Number(propertyForm.lng);
        const nearRailwayKm = Number(propertyForm.nearRailwayKm);
        const nearBusKm = Number(propertyForm.nearBusKm);
        if (Number.isNaN(lat) || Number.isNaN(lng)) {
            setError("Select exact location from map or provide valid coordinates.");
            return;
        }
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createProperty(user.uid, {
                cityId: propertyForm.cityId,
                cityName: cityNameById(propertyForm.cityId),
                name: propertyForm.name.trim(),
                exactAddress: propertyForm.exactAddress.trim(),
                lat,
                lng,
                nearRailwayKm: Number.isNaN(nearRailwayKm) ? 0 : nearRailwayKm,
                nearBusKm: Number.isNaN(nearBusKm) ? 0 : nearBusKm,
            });
            setPropertyForm({ cityId: "", name: "", exactAddress: "", lat: "", lng: "", nearRailwayKm: "", nearBusKm: "" });
            setNotice("Property created successfully.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create property.");
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateRoom(event) {
        event.preventDefault();
        if (!user?.uid) return;
        const totalBeds = Number(roomForm.totalBeds);
        if (Number.isNaN(totalBeds) || totalBeds <= 0) {
            setError("Total beds must be greater than 0.");
            return;
        }
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createRoom(user.uid, {
                propertyId: roomForm.propertyId,
                roomName: roomForm.roomName.trim(),
                totalBeds,
            });
            setRoomForm({ propertyId: "", roomName: "", totalBeds: "" });
            setNotice("Room created successfully.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create room.");
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateBed(event) {
        event.preventDefault();
        if (!user?.uid) return;
        const hourlyPrice = Number(bedForm.hourlyPrice);
        const overnightPrice = Number(bedForm.overnightPrice);
        const overdayPrice = Number(bedForm.overdayPrice);
        if ([hourlyPrice, overnightPrice, overdayPrice].some((price) => Number.isNaN(price) || price <= 0)) {
            setError("All bed prices must be valid and greater than 0.");
            return;
        }
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createBed(user.uid, {
                propertyId: bedForm.propertyId,
                roomId: bedForm.roomId,
                bedCode: bedForm.bedCode.trim(),
                bedType: bedForm.bedType,
                hourlyPrice,
                overnightPrice,
                overdayPrice,
            });
            setBedForm({ propertyId: "", roomId: "", bedCode: "", bedType: "NON_AC", hourlyPrice: "120", overnightPrice: "650", overdayPrice: "900" });
            setNotice("Bed created successfully with owner pricing.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not create bed.");
        } finally {
            setSaving(false);
        }
    }

    async function handleCreateBlock(event) {
        event.preventDefault();
        if (!user?.uid) return;
        if (!blockForm.blockStart) {
            setError("Block start time is required.");
            return;
        }
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await createBedBlock(user.uid, {
                propertyId: blockForm.propertyId,
                roomId: blockForm.roomId,
                bedId: blockForm.bedId,
                blockStart: blockForm.blockStart,
                blockEnd: blockForm.isFullBlock ? undefined : blockForm.blockEnd || undefined,
                reason: blockForm.reason.trim(),
                isFullBlock: blockForm.isFullBlock,
            });
            setBlockForm({ propertyId: "", roomId: "", bedId: "", blockStart: "", blockEnd: "", reason: "", isFullBlock: false });
            setNotice("Bed block added.");
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Could not add bed block.");
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
                        <h1 className="text-3xl font-bold">Create Inventory</h1>
                        <p className="mt-1 text-xs text-slate-500">Create property, room, bed, and blocks from one screen.</p>
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

            <section className="mt-8 grid gap-6 lg:grid-cols-2">
                <article className="glass-card animate-stagger rounded-2xl p-6 lg:col-span-2">
                    <h2 className="text-lg font-semibold">Create Property</h2>
                    <p className="mt-1 text-xs text-slate-500">Pick exact location directly on map. Nearby bus stand and railway distances auto-calculate.</p>
                    <form className="mt-4 grid gap-3" onSubmit={handleCreateProperty}>
                        <select value={propertyForm.cityId} onChange={(e) => setPropertyForm((prev) => ({ ...prev, cityId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select city</option>
                            {cities.map((city) => (
                                <option key={city.id} value={city.id}>{city.name}{city.state ? `, ${city.state}` : ""}</option>
                            ))}
                        </select>
                        <input value={propertyForm.name} onChange={(e) => setPropertyForm((prev) => ({ ...prev, name: e.target.value }))} placeholder="Property name" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        <input value={propertyForm.exactAddress} onChange={(e) => setPropertyForm((prev) => ({ ...prev, exactAddress: e.target.value }))} placeholder="Exact address" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />

                        <LocationPickerMap
                            lat={Number(propertyForm.lat)}
                            lng={Number(propertyForm.lng)}
                            onPick={handleMapPick}
                        />
                        <div className="flex flex-wrap gap-2">
                            <button type="button" onClick={() => void handleUseCurrentLocation()} className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition">
                                Use Current GPS
                            </button>
                            <button type="button" onClick={() => void refreshTransitDistances(propertyForm.lat, propertyForm.lng)} disabled={distanceLoading} className="rounded-full border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 transition disabled:opacity-60">
                                {distanceLoading ? "Calculating..." : "Recalculate Distances"}
                            </button>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <input value={propertyForm.lat} onChange={(e) => setPropertyForm((prev) => ({ ...prev, lat: e.target.value }))} placeholder="Latitude" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                            <input value={propertyForm.lng} onChange={(e) => setPropertyForm((prev) => ({ ...prev, lng: e.target.value }))} placeholder="Longitude" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input value={propertyForm.nearRailwayKm} onChange={(e) => setPropertyForm((prev) => ({ ...prev, nearRailwayKm: e.target.value }))} placeholder="Railway distance (km)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            <input value={propertyForm.nearBusKm} onChange={(e) => setPropertyForm((prev) => ({ ...prev, nearBusKm: e.target.value }))} placeholder="Bus stand distance (km)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                        </div>
                        <button type="submit" disabled={saving} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                            {saving ? "Saving..." : "Create Property"}
                        </button>
                    </form>
                </article>

                <article className="glass-card animate-stagger rounded-2xl p-6">
                    <h2 className="text-lg font-semibold">Create Room</h2>
                    <form className="mt-4 grid gap-3" onSubmit={handleCreateRoom}>
                        <select value={roomForm.propertyId} onChange={(e) => setRoomForm((prev) => ({ ...prev, propertyId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select property</option>
                            {properties.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <input value={roomForm.roomName} onChange={(e) => setRoomForm((prev) => ({ ...prev, roomName: e.target.value }))} placeholder="Room name (example: Room 101)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        <input value={roomForm.totalBeds} onChange={(e) => setRoomForm((prev) => ({ ...prev, totalBeds: e.target.value }))} placeholder="Total beds" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        <button type="submit" disabled={saving} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                            {saving ? "Saving..." : "Create Room"}
                        </button>
                    </form>
                </article>

                <article className="glass-card animate-stagger rounded-2xl p-6">
                    <h2 className="text-lg font-semibold">Create Bed</h2>
                    <p className="mt-1 text-xs text-slate-500">Set owner prices here. Consumer listing and booking uses these prices.</p>
                    <form className="mt-4 grid gap-3" onSubmit={handleCreateBed}>
                        <select value={bedForm.propertyId} onChange={(e) => { setBedForm((prev) => ({ ...prev, propertyId: e.target.value, roomId: "" })); }} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select property</option>
                            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <select value={bedForm.roomId} onChange={(e) => setBedForm((prev) => ({ ...prev, roomId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select room</option>
                            {roomsForBedProperty.map((r) => <option key={r.id} value={r.id}>{r.roomName}</option>)}
                        </select>
                        <input value={bedForm.bedCode} onChange={(e) => setBedForm((prev) => ({ ...prev, bedCode: e.target.value }))} placeholder="Bed code (e.g. B1)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        <select value={bedForm.bedType} onChange={(e) => setBedForm((prev) => ({ ...prev, bedType: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm">
                            <option value="NON_AC">NON_AC</option>
                            <option value="AC">AC</option>
                        </select>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <input value={bedForm.hourlyPrice} onChange={(e) => setBedForm((prev) => ({ ...prev, hourlyPrice: e.target.value }))} placeholder="Hourly price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                            <input value={bedForm.overnightPrice} onChange={(e) => setBedForm((prev) => ({ ...prev, overnightPrice: e.target.value }))} placeholder="Overnight price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                            <input value={bedForm.overdayPrice} onChange={(e) => setBedForm((prev) => ({ ...prev, overdayPrice: e.target.value }))} placeholder="Overday price" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        </div>
                        <button type="submit" disabled={saving} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                            {saving ? "Saving..." : "Create Bed"}
                        </button>
                    </form>
                </article>

                <article className="glass-card animate-stagger rounded-2xl p-6 lg:col-span-2">
                    <h2 className="text-lg font-semibold">Create Bed Block</h2>
                    <form className="mt-4 grid gap-3" onSubmit={handleCreateBlock}>
                        <select value={blockForm.propertyId} onChange={(e) => setBlockForm((prev) => ({ ...prev, propertyId: e.target.value, roomId: "", bedId: "" }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select property</option>
                            {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                        <select value={blockForm.roomId} onChange={(e) => setBlockForm((prev) => ({ ...prev, roomId: e.target.value, bedId: "" }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select room</option>
                            {blockRooms.map((r) => <option key={r.id} value={r.id}>{r.roomName}</option>)}
                        </select>
                        <select value={blockForm.bedId} onChange={(e) => setBlockForm((prev) => ({ ...prev, bedId: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required>
                            <option value="">Select bed</option>
                            {blockBeds.map((b) => <option key={b.id} value={b.id}>{b.bedCode} ({b.bedType})</option>)}
                        </select>
                        <label className="text-xs font-medium text-slate-600">Block Start</label>
                        <input type="datetime-local" value={blockForm.blockStart} onChange={(e) => setBlockForm((prev) => ({ ...prev, blockStart: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        {!blockForm.isFullBlock && (
                            <>
                                <label className="text-xs font-medium text-slate-600">Block End</label>
                                <input type="datetime-local" value={blockForm.blockEnd} onChange={(e) => setBlockForm((prev) => ({ ...prev, blockEnd: e.target.value }))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                            </>
                        )}
                        <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                            <input type="checkbox" checked={blockForm.isFullBlock} onChange={(e) => setBlockForm((prev) => ({ ...prev, isFullBlock: e.target.checked }))} />
                            Full block (no end time)
                        </label>
                        <input value={blockForm.reason} onChange={(e) => setBlockForm((prev) => ({ ...prev, reason: e.target.value }))} placeholder="Reason (maintenance / personal / occupied)" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" required />
                        <button type="submit" disabled={saving} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:bg-slate-400 disabled:cursor-not-allowed">
                            {saving ? "Saving..." : "Create Block"}
                        </button>
                    </form>
                </article>
            </section>

            {loadingData && <p className="mt-6 text-sm text-slate-500">Loading owner inventory data...</p>}
        </main>
    );
}
