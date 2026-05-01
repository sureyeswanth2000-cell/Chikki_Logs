"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    checkInConfirmedBooking,
    checkoutOpenBooking,
    getActiveCities,
    getListingsByCity,
    getOpenConsumerBookings,
} from "@/lib/firestore/consumer";
import { formatDistance, googleMapsDirectionsUrl } from "@/lib/geo";

function getElapsedHours(checkInAt) {
    const checkInMs = new Date(checkInAt).getTime();
    if (Number.isNaN(checkInMs)) return 0;
    return Math.max(1, Math.ceil((Date.now() - checkInMs) / (1000 * 60 * 60)));
}

function ratingText(average, count) {
    const safeCount = Number(count ?? 0);
    if (safeCount <= 0) {
        return "New bed ratings pending";
    }
    return `${Number(average ?? 0).toFixed(1)}/5 from ${safeCount} stay${safeCount === 1 ? "" : "s"}`;
}

function readLocation(latValue, lngValue) {
    const lat = Number(latValue);
    const lng = Number(lngValue);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }
    return { lat, lng };
}

function ConsumerContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { profile, user } = useAuth();
    const [cities, setCities] = useState([]);
    const [loadingCities, setLoadingCities] = useState(true);
    const [loadingListings, setLoadingListings] = useState(false);
    const [loadingOpenBookings, setLoadingOpenBookings] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [cityId, setCityId] = useState("");
    const [duration, setDuration] = useState("hourly");
    const [bedFilter, setBedFilter] = useState("all");
    const [maxFinalPrice, setMaxFinalPrice] = useState("");
    const [nearMeEnabled, setNearMeEnabled] = useState(false);
    const [userLocation, setUserLocation] = useState(null);
    const [listings, setListings] = useState([]);
    const [openBookings, setOpenBookings] = useState([]);
    const [checkInLoadingId, setCheckInLoadingId] = useState("");
    const [checkoutLoadingId, setCheckoutLoadingId] = useState("");
    const initialSearchAppliedRef = useRef(false);

    const selectedCityName = useMemo(() => cities.find((item) => item.id === cityId)?.name ?? "", [cities, cityId]);

    const loadOpenBookings = useCallback(async () => {
        if (!user?.uid) {
            setOpenBookings([]);
            return;
        }
        setLoadingOpenBookings(true);
        try {
            const rows = await getOpenConsumerBookings(user.uid);
            setOpenBookings(rows);
        } finally {
            setLoadingOpenBookings(false);
        }
    }, [user?.uid]);

    const runSearch = useCallback(async (
        nextCityId = cityId,
        nextDuration = duration,
        nextBedFilter = bedFilter,
        nextMaxFinalPrice = maxFinalPrice,
        nextLocation = userLocation,
        nextNearMeEnabled = nearMeEnabled
    ) => {
        if (!nextCityId) {
            setError("Select a city before searching.");
            return;
        }
        setError(null);
        setNotice(null);
        setLoadingListings(true);
        try {
            const parsedMaxPrice = Number(nextMaxFinalPrice);
            const results = await getListingsByCity({
                cityId: nextCityId,
                duration: nextDuration,
                bedFilter: nextBedFilter,
                maxFinalPrice: nextMaxFinalPrice.trim().length > 0 && !Number.isNaN(parsedMaxPrice)
                    ? parsedMaxPrice
                    : undefined,
                userLat: nextNearMeEnabled && nextLocation ? nextLocation.lat : undefined,
                userLng: nextNearMeEnabled && nextLocation ? nextLocation.lng : undefined,
            });
            setListings(results);
            if (results.length === 0) {
                setNotice("No listings found for selected filters.");
            } else if (nextNearMeEnabled && nextLocation) {
                setNotice("Listings are sorted by nearest property from your current location.");
            }
        } catch (searchError) {
            setError(searchError instanceof Error ? searchError.message : "Failed to load listings.");
        } finally {
            setLoadingListings(false);
        }
    }, [bedFilter, cityId, duration, maxFinalPrice, nearMeEnabled, userLocation]);

    useEffect(() => {
        async function loadCities() {
            setLoadingCities(true);
            setError(null);
            try {
                const cityList = await getActiveCities();
                setCities(cityList);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Could not load cities.");
            } finally {
                setLoadingCities(false);
            }
        }
        void loadCities();
    }, []);

    useEffect(() => {
        if (initialSearchAppliedRef.current) {
            return;
        }
        const initialCityId = searchParams.get("cityId");
        const initialDuration = searchParams.get("duration");
        const initialBedFilter = searchParams.get("bedFilter");
        const initialNearMe = searchParams.get("nearMe") === "1";
        const initialLocation = readLocation(searchParams.get("userLat"), searchParams.get("userLng"));
        const effectiveDuration = initialDuration && ["hourly", "overnight", "overday"].includes(initialDuration)
            ? initialDuration
            : duration;
        const effectiveBedFilter = initialBedFilter && ["all", "AC", "NON_AC"].includes(initialBedFilter)
            ? initialBedFilter
            : bedFilter;
        if (initialCityId) {
            initialSearchAppliedRef.current = true;
            setCityId(initialCityId);
            setDuration(effectiveDuration);
            setBedFilter(effectiveBedFilter);
            setNearMeEnabled(Boolean(initialNearMe && initialLocation));
            setUserLocation(initialLocation);
            void runSearch(initialCityId, effectiveDuration, effectiveBedFilter, maxFinalPrice, initialLocation, Boolean(initialNearMe && initialLocation));
        }
    }, [bedFilter, duration, maxFinalPrice, runSearch, searchParams]);

    useEffect(() => {
        void loadOpenBookings();
    }, [loadOpenBookings]);

    async function handleSearch(event) {
        event?.preventDefault();
        await runSearch();
    }

    function openBookingPage(listing) {
        const params = new URLSearchParams({
            cityId: cityId || "",
            propertyId: listing.propertyId || "",
            duration,
            bedFilter,
        });
        if (nearMeEnabled && userLocation) {
            params.set("nearMe", "1");
            params.set("userLat", String(userLocation.lat));
            params.set("userLng", String(userLocation.lng));
        }
        const bookingPath = `/booking?${params.toString()}`;
        if (!user?.uid) {
            const next = encodeURIComponent(bookingPath);
            router.push(`/login?next=${next}`);
            return;
        }
        router.push(bookingPath);
    }

    async function handleCheckoutBooking(bookingId) {
        if (!user?.uid) return;
        setCheckoutLoadingId(bookingId);
        setError(null);
        setNotice(null);
        try {
            const summary = await checkoutOpenBooking({ userId: user.uid, bookingId });
            setNotice(`Checked out for ${summary.bookingCode}. Total ${summary.elapsedHours} hour(s). Remaining payment: INR ${summary.remainingPaid}.`);
            await loadOpenBookings();
        } catch (checkoutError) {
            setError(checkoutError instanceof Error ? checkoutError.message : "Checkout failed.");
        } finally {
            setCheckoutLoadingId("");
        }
    }

    async function handleCheckInBooking(bookingId) {
        if (!user?.uid) return;
        setCheckInLoadingId(bookingId);
        setError(null);
        setNotice(null);
        try {
            const summary = await checkInConfirmedBooking({ userId: user.uid, bookingId });
            setNotice(`Checked in for booking ID: ${summary.bookingCode}`);
            await loadOpenBookings();
        } catch (checkInError) {
            setError(checkInError instanceof Error ? checkInError.message : "Check-in failed.");
        } finally {
            setCheckInLoadingId("");
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
        <ProtectedRoute allowedRoles={["consumer", "owner"]}>
        <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
            <div className="glass-card animate-rise flex items-center justify-between gap-3 rounded-2xl p-6">
                <div>
                    <h1 className="text-3xl font-bold">Consumer Portal</h1>
                    <p className="mt-2 text-xs text-slate-500">
                        {user ? `Logged in as role: ${profile?.role ?? "consumer"}` : "Browse openly and sign in only when you are ready to book."}
                    </p>
                </div>
            </div>

            <p className="mt-3 text-slate-700">Browse by city, confirm your location, filter nearby listings, and book available beds.</p>

            {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
            {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

            {!user ? (
                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                    You can browse listings without login. We will ask you to sign in only when you click to book a bed.
                </div>
            ) : null}

            <section className="glass-card animate-stagger mt-8 rounded-2xl p-6">
                <h2 className="text-xl font-semibold">Confirm Location And Search Beds</h2>
                <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleSearch}>
                    <select value={cityId} onChange={(event) => setCityId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500" required disabled={loadingCities}>
                        <option value="">{loadingCities ? "Loading cities..." : "Select city"}</option>
                        {cities.map((city) => (<option key={city.id} value={city.id}>{city.name}, {city.state}</option>))}
                    </select>

                    <select value={duration} onChange={(event) => setDuration(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500">
                        <option value="hourly">Hourly</option>
                        <option value="overnight">Overnight</option>
                        <option value="overday">Overday</option>
                    </select>

                    <select value={bedFilter} onChange={(event) => setBedFilter(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500">
                        <option value="all">All Beds</option>
                        <option value="AC">AC Only</option>
                        <option value="NON_AC">Non-AC Only</option>
                    </select>

                    <input value={maxFinalPrice} onChange={(event) => setMaxFinalPrice(event.target.value)} placeholder="Max final total price (optional)" className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500" />

                    <button type="submit" disabled={loadingListings} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                        {loadingListings ? "Searching..." : "Search Listings"}
                    </button>
                </form>
            </section>

            <section className="glass-card animate-stagger mt-8 rounded-2xl p-6">
                <h2 className="text-xl font-semibold">Listings {selectedCityName ? `in ${selectedCityName}` : ""}</h2>
                {nearMeEnabled && userLocation ? (
                    <p className="mt-1 text-xs text-slate-500">Nearest properties are shown first. Directions open in Google Maps from your detected location.</p>
                ) : null}
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {listings.map((item) => (
                        <article key={item.propertyId} className="animate-list-item rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:border-sky-200">
                            <h3 className="text-lg font-semibold">{item.propertyName}</h3>
                            <p className="mt-1 text-sm text-slate-600">{item.exactAddress}</p>
                            <p className="mt-1 text-sm text-slate-600">Near Railway: {formatDistance(item.nearRailwayKm) || "-"} | Near Bus Stand: {formatDistance(item.nearBusKm) || "-"}</p>
                            {Number.isFinite(Number(item.distanceFromUserKm)) ? (
                                <p className="mt-1 text-sm font-semibold text-sky-700">Distance from you: {formatDistance(item.distanceFromUserKm)}</p>
                            ) : null}
                            {item.scarcityApplied ? (
                                <p className="mt-2 text-sm text-amber-700">
                                    Beds Available Now: {item.shownAvailableBeds} (high demand in this area)
                                </p>
                            ) : (
                                <p className="mt-2 text-sm text-slate-700">Available Beds: {item.shownAvailableBeds} | AC: {item.acBeds} | Non-AC: {item.nonAcBeds}</p>
                            )}
                            {item.demandActive ? (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">High Demand</span>
                                    <span className="text-xs font-semibold text-amber-700">{String(item.demandSource).toLowerCase() === "city" ? "City demand" : "Property demand"}</span>
                                </div>
                            ) : item.demandWarningActive ? (
                                <p className="mt-2 text-xs font-semibold text-amber-700">Demand is rising. Book now before prices increase.</p>
                            ) : null}
                            <p className="mt-2 text-sm font-semibold text-slate-900">Hourly from INR {item.minHourlyPrice} | Overnight from INR {item.minOvernightPrice}</p>
                            <p className="mt-1 text-xs text-slate-500">All-inclusive consumer prices (includes platform and payment fees).</p>
                            <p className="mt-1 text-xs font-semibold text-slate-600">Bed rating: {ratingText(item.ratingAverage, item.ratingCount)}</p>
                            <p className="mt-1 text-xs text-slate-500">Checkout uses the booking-time locked rate for actual stay hours.</p>
                            <div className="mt-3 flex gap-2">
                                <a href={googleMapsDirectionsUrl({ lat: item.lat, lng: item.lng }, nearMeEnabled ? userLocation : null)} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Directions</a>
                                <button type="button" onClick={() => openBookingPage(item)} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700">
                                    {user ? "Book This" : "Login To Book"}
                                </button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            {user ? (
                <section className="glass-card animate-stagger mt-8 rounded-2xl p-6">
                    <h2 className="text-xl font-semibold">Live / Open Bookings</h2>
                    <p className="mt-1 text-sm text-slate-500">Flow: Booked until check-in time, then Check-In, then Checkout at end of stay.</p>
                    {loadingOpenBookings ? (
                        <p className="mt-4 text-sm text-slate-500">Loading open bookings...</p>
                    ) : openBookings.length === 0 ? (
                        <p className="mt-4 text-sm text-slate-500">No open bookings currently.</p>
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
                                        <th className="pb-2 text-left font-semibold">Status</th>
                                        <th className="pb-2 text-left font-semibold">Live Hours</th>
                                        <th className="pb-2 text-left font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {openBookings.map((item) => (
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
                                            <td className="py-2">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${String(item.bookingStatus).toLowerCase() === "checked_in" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {String(item.bookingStatus).toLowerCase() === "checked_in" ? "Checked In" : "Booked"}
                                                </span>
                                            </td>
                                            <td className="py-2 text-slate-700">{getElapsedHours(item.checkInAt)} hr</td>
                                            <td className="py-2">
                                                {String(item.bookingStatus).toLowerCase() === "confirmed" ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleCheckInBooking(item.id)}
                                                        disabled={!item.canCheckIn || checkInLoadingId === item.id}
                                                        className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                                    >
                                                        {checkInLoadingId === item.id ? "Checking in..." : (item.canCheckIn ? "Check-In" : "Wait for time")}
                                                    </button>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleCheckoutBooking(item.id)}
                                                        disabled={checkoutLoadingId === item.id}
                                                        className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                                                    >
                                                        {checkoutLoadingId === item.id ? "Checking out..." : "Checkout"}
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            ) : null}

        </main>
        </ProtectedRoute>
    );
}

export default function ConsumerPage() {
    return (
        <Suspense fallback={<main className="mx-auto max-w-6xl px-5 py-10 text-sm text-slate-600">Loading consumer portal...</main>}>
            <ConsumerContent />
        </Suspense>
    );
}
