"use client";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    checkInConfirmedBooking,
    checkoutOpenBooking,
    createBookingWithAdvance,
    getActiveCities,
    getConsumerBookingCount,
    getListingsByCity,
    getOpenConsumerBookings,
    validateAadhaar,
} from "@/lib/firestore/consumer";

function pad2(value) {
    return String(value).padStart(2, "0");
}

function toInputDateTime(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function roundToNextQuarterHour(date) {
    const next = new Date(date);
    next.setSeconds(0, 0);
    const minutes = next.getMinutes();
    const rounded = Math.ceil(minutes / 15) * 15;
    if (rounded === 60) {
        next.setHours(next.getHours() + 1, 0, 0, 0);
    } else {
        next.setMinutes(rounded);
    }
    return next;
}

function nowInputDateTime() {
    return toInputDateTime(roundToNextQuarterHour(new Date()));
}

function maskAadhaar(value) {
    const digits = String(value ?? "").replace(/\D/g, "").slice(-4);
    if (digits.length !== 4) return "XXXX XXXX";
    return `XXXX XXXX ${digits}`;
}

function getElapsedHours(checkInAt) {
    const checkInMs = new Date(checkInAt).getTime();
    if (Number.isNaN(checkInMs)) return 0;
    return Math.max(1, Math.ceil((Date.now() - checkInMs) / (1000 * 60 * 60)));
}

function ConsumerPageInner() {
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
    const [listings, setListings] = useState([]);
    const [openBookings, setOpenBookings] = useState([]);
    const [selectedListing, setSelectedListing] = useState(null);
    const [aadhaarNumber, setAadhaarNumber] = useState("");
    const [checkInAt, setCheckInAt] = useState("");
    const [bookingLoading, setBookingLoading] = useState(false);
    const [checkInLoadingId, setCheckInLoadingId] = useState("");
    const [checkoutLoadingId, setCheckoutLoadingId] = useState("");
    const [bookingCount, setBookingCount] = useState(0);
    const bookingSectionRef = useRef(null);

    const selectedCityName = useMemo(() => cities.find((item) => item.id === cityId)?.name ?? "", [cities, cityId]);
    const hasSavedAadhaar = Boolean(profile?.hasAadhaar);
    const aadhaarRequiredForBooking = bookingCount >= 1;
    const minCheckInAt = useMemo(() => nowInputDateTime(), []);

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

    const runSearch = useCallback(async (nextCityId = cityId) => {
        if (!nextCityId) {
            setError("Select a city before searching.");
            return;
        }
        setError(null);
        setNotice(null);
        setLoadingListings(true);
        setSelectedListing(null);
        try {
            const parsedMaxPrice = Number(maxFinalPrice);
            const results = await getListingsByCity({
                cityId: nextCityId,
                duration,
                bedFilter,
                maxFinalPrice: maxFinalPrice.trim().length > 0 && !Number.isNaN(parsedMaxPrice)
                    ? parsedMaxPrice
                    : undefined,
            });
            setListings(results);
            if (results.length === 0) {
                setNotice("No listings found for selected filters.");
            }
        } catch (searchError) {
            setError(searchError instanceof Error ? searchError.message : "Failed to load listings.");
        } finally {
            setLoadingListings(false);
        }
    }, [bedFilter, cityId, duration, maxFinalPrice]);

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
        const initialCityId = searchParams.get("cityId");
        const initialDuration = searchParams.get("duration");
        const initialBedFilter = searchParams.get("bedFilter");
        if (initialCityId) {
            setCityId(initialCityId);
            void runSearch(initialCityId);
        }
        if (initialDuration && ["hourly", "overnight", "overday"].includes(initialDuration)) {
            setDuration(initialDuration);
        }
        if (initialBedFilter && ["all", "AC", "NON_AC"].includes(initialBedFilter)) {
            setBedFilter(initialBedFilter);
        }
    }, [runSearch, searchParams]);

    useEffect(() => {
        void loadOpenBookings();
    }, [loadOpenBookings]);

    useEffect(() => {
        async function loadBookingCount() {
            if (!user?.uid) {
                setBookingCount(0);
                return;
            }
            try {
                const total = await getConsumerBookingCount(user.uid);
                setBookingCount(total);
            } catch {
                setBookingCount(0);
            }
        }
        void loadBookingCount();
    }, [user?.uid]);

    async function handleSearch(event) {
        event?.preventDefault();
        await runSearch();
    }

    function openBookingSheet(listing) {
        if (!user?.uid) {
            const next = encodeURIComponent(`/consumer?cityId=${cityId || ""}&duration=${duration}&bedFilter=${bedFilter}`);
            router.push(`/login?next=${next}`);
            return;
        }
        setSelectedListing(listing);
        setError(null);
        setNotice(null);
        const defaultCheckIn = toInputDateTime(roundToNextQuarterHour(new Date()));
        setCheckInAt(defaultCheckIn);
        setAadhaarNumber("");
        setTimeout(() => bookingSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    }

    async function handleBooking(event) {
        event.preventDefault();
        if (!user?.uid || !selectedListing) return;

        if (aadhaarRequiredForBooking && !validateAadhaar(aadhaarNumber)) {
            setError("Aadhaar is required from your second booking onward. Enter a valid 12-digit Aadhaar number.");
            return;
        }

        if (!checkInAt) {
            setError("Select check-in time.");
            return;
        }

        if (new Date(checkInAt).getTime() < Date.now()) {
            setError("Check-in time cannot be in the past.");
            return;
        }

        setBookingLoading(true);
        setError(null);
        setNotice(null);
        try {
            const result = await createBookingWithAdvance({
                userId: user.uid,
                listing: selectedListing,
                requirementBedType: bedFilter,
                duration,
                checkInAt,
            });
            setNotice(`Booking opened. Booking ID: ${result.bookingCode}. Allocated bed: ${result.allocatedBedCode} (${result.allocatedBedType}). Advance INR 100 recorded.`);
            setCheckInAt("");
            setSelectedListing(null);
            await loadOpenBookings();
            setBookingCount((current) => current + 1);
        } catch (bookingError) {
            setError(bookingError instanceof Error ? bookingError.message : "Booking failed.");
        } finally {
            setBookingLoading(false);
        }
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
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                    {listings.map((item) => (
                        <article key={item.propertyId} className="animate-list-item rounded-xl border border-slate-200 bg-white/80 p-4 transition hover:-translate-y-0.5 hover:border-sky-200">
                            <h3 className="text-lg font-semibold">{item.propertyName}</h3>
                            <p className="mt-1 text-sm text-slate-600">{item.exactAddress}</p>
                            <p className="mt-1 text-sm text-slate-600">Near Railway: {item.nearRailwayKm} km | Near Bus Stand: {item.nearBusKm} km</p>
                            <p className="mt-2 text-sm text-slate-700">Available Beds: {item.availableBeds} | AC: {item.acBeds} | Non-AC: {item.nonAcBeds}</p>
                            <p className="mt-2 text-sm font-semibold text-slate-900">Final total starts from INR {item.minFinalPrice}</p>
                            <p className="mt-1 text-xs text-slate-500">Price source: owner-set bed prices + platform charges.</p>
                            <div className="mt-3 flex gap-2">
                                <a href={`https://www.google.com/maps?q=${item.lat},${item.lng}`} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Open Map</a>
                                <button type="button" onClick={() => openBookingSheet(item)} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700">
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

            {selectedListing ? (
                <section ref={bookingSectionRef} className="glass-card animate-stagger mt-8 rounded-2xl p-6">
                    <h2 className="text-xl font-semibold">Book: {selectedListing.propertyName}</h2>
                    <p className="mt-2 text-sm text-slate-600">
                        {aadhaarRequiredForBooking
                            ? "Aadhaar is mandatory from your second booking onward. Checkout will be done later from Live/Open bookings."
                            : "First booking is easier: Aadhaar is optional for this booking. Checkout will be done later from Live/Open bookings."}
                    </p>

                    {hasSavedAadhaar && aadhaarRequiredForBooking ? (
                        <p className="mt-2 text-xs text-slate-500">Saved Aadhaar on file: {maskAadhaar(profile?.aadhaarLast4 ?? "")}. Re-enter the full Aadhaar number to confirm this booking.</p>
                    ) : null}

                    <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleBooking}>
                        <input value={aadhaarNumber} onChange={(event) => setAadhaarNumber(event.target.value)} placeholder={aadhaarRequiredForBooking ? "Aadhaar number (12 digits)" : "Aadhaar number (optional for first booking)"} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500" required={aadhaarRequiredForBooking} />

                        <div>
                            <label className="mb-1 block text-xs font-semibold text-slate-600">Check-in</label>
                            <input type="datetime-local" value={checkInAt} onChange={(event) => setCheckInAt(event.target.value)} min={minCheckInAt} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500" required />
                        </div>

                        <button type="submit" disabled={bookingLoading} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                            {bookingLoading ? "Booking..." : "Open Booking + INR 100 Advance"}
                        </button>

                        <button type="button" onClick={() => setSelectedListing(null)} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">Cancel</button>
                    </form>
                </section>
            ) : null}
        </main>
        </ProtectedRoute>
    );
}

export default function ConsumerPage() {
    return (
        <Suspense>
            <ConsumerPageInner />
        </Suspense>
    );
}
