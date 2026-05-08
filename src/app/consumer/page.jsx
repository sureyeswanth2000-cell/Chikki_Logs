"use client";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    checkInConfirmedBooking,
    createRazorpayCheckoutOrder,
    checkoutOpenBooking,
    getActiveCities,
    getListingsByCity,
    getOpenConsumerBookings,
    modifyConfirmedBooking,
    reportBedIssue,
} from "@/lib/firestore/consumer";
import { formatDistance, formatTransitSummary, googleMapsDirectionsUrl } from "@/lib/geo";

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

function pad2(value) {
    return String(value).padStart(2, "0");
}

function toInputDateTime(date) {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function dateTimeInputValue(value) {
    const text = String(value ?? "");
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text)) {
        return text.slice(0, 16);
    }
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) {
        return toInputDateTime(new Date());
    }
    return toInputDateTime(date);
}

function maxModifyTimeForMode(mode) {
    const max = new Date();
    if (String(mode ?? "").toLowerCase() === "future") {
        max.setDate(max.getDate() + 30);
    } else {
        max.setHours(max.getHours() + 24);
    }
    return toInputDateTime(max);
}

function isLocalDevUser(user) {
    return String(user?.uid ?? "").startsWith("dev-");
}

function buildLocalDevListing({ cityName, duration }) {
    const price = duration === "overnight" ? 650 : duration === "overday" ? 900 : 120;
    return {
        propertyId: "dev-smoke-property",
        propertyName: "Dev Smoke Beds",
        cityName: cityName || "Local City",
        exactAddress: "Local development preview only",
        lat: 14.91394,
        lng: 79.97984,
        nearestTransitType: "railway",
        nearestTransitName: "Local Railway Station",
        nearestTransitKm: 0.12,
        distanceFromUserKm: 0.001,
        shownAvailableBeds: 2,
        availableBeds: 2,
        acBeds: 1,
        nonAcBeds: 1,
        scarcityApplied: false,
        demandActive: false,
        demandWarningActive: false,
        minFinalPrice: price,
        minHourlyPrice: 120,
        minOvernightPrice: 650,
        platformFeeInr: 9,
        ratingAverage: 4.8,
        ratingCount: 12,
        recommendedBedId: "dev-smoke-bed",
        recommendedBedCode: "SMK-1",
        recommendedBedType: "NON_AC",
        recommendedBedPrice: price,
        recommendedBedRatingAverage: 4.8,
        recommendedBedRatingCount: 12,
    };
}

function buildLocalDevOpenBooking() {
    const now = new Date();
    now.setMinutes(now.getMinutes() - 20);
    return {
        id: "dev-open-booking",
        bookingCode: "DEV-OPEN-1",
        propertyId: "dev-smoke-property",
        propertyName: "Dev Smoke Beds",
        roomId: "dev-room-1",
        roomName: "101",
        bedId: "dev-smoke-bed",
        bedCode: "SMK-1",
        bedType: "NON_AC",
        checkInAt: now.toISOString().slice(0, 16),
        bookingStatus: "checked_in",
        bookingMode: "now",
        bookingModeLabel: "Book Now",
        modifiedCount: 0,
        totalAmount: 129,
        bedAmount: 120,
        platformFeeAmount: 9,
        bedIssueStatus: "",
        canModify: false,
        canCheckIn: false,
        canReportBedIssue: true,
        bedOptions: [
            { bedId: "dev-smoke-bed", bedCode: "SMK-1", bedType: "NON_AC", roomName: "101" },
            { bedId: "dev-smoke-bed-2", bedCode: "SMK-2", bedType: "AC", roomName: "101" },
        ],
    };
}

async function ensureRazorpayLoaded() {
    if (typeof window === "undefined") return false;
    if (window.Razorpay) return true;
    await new Promise((resolve, reject) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Could not load Razorpay checkout script."));
        document.body.appendChild(script);
    });
    return Boolean(window.Razorpay);
}

async function openRazorpayCheckout(options) {
    return new Promise((resolve, reject) => {
        const instance = new window.Razorpay({
            ...options,
            handler: (response) => resolve(response),
            modal: {
                ondismiss: () => reject(new Error("Payment was cancelled.")),
            },
        });
        instance.open();
    });
}

function ConsumerContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { loading: authLoading, profile, user } = useAuth();
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
    const [checkoutPaymentMethodByBooking, setCheckoutPaymentMethodByBooking] = useState({});
    const [modifyingBookingId, setModifyingBookingId] = useState("");
    const [modifyDrafts, setModifyDrafts] = useState({});
    const [modifyLoadingId, setModifyLoadingId] = useState("");
    const [issueReportingId, setIssueReportingId] = useState("");
    const [issueDrafts, setIssueDrafts] = useState({});
    const [issueLoadingId, setIssueLoadingId] = useState("");
    const [aadhaarBannerDismissed, setAadhaarBannerDismissed] = useState(false);
    const initialSearchAppliedRef = useRef(false);

    const isDevLocalUser = useMemo(() => isLocalDevUser(user), [user]);
    const selectedCityName = useMemo(() => cities.find((item) => item.id === cityId)?.name ?? "", [cities, cityId]);

    const loadOpenBookings = useCallback(async () => {
        if (!user?.uid || isDevLocalUser) {
            setOpenBookings(isDevLocalUser ? [buildLocalDevOpenBooking()] : []);
            return;
        }
        setLoadingOpenBookings(true);
        try {
            const rows = await getOpenConsumerBookings(user.uid);
            setOpenBookings(rows);
        } finally {
            setLoadingOpenBookings(false);
        }
    }, [isDevLocalUser, user?.uid]);

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
            if (isDevLocalUser) {
                setListings([buildLocalDevListing({ cityName: selectedCityName, duration: nextDuration })]);
                setNotice("Local smoke preview shown because live Firestore access is not available for the dev auth bypass.");
                return;
            }
            setError(searchError instanceof Error ? searchError.message : "Failed to load listings.");
        } finally {
            setLoadingListings(false);
        }
    }, [bedFilter, cityId, duration, isDevLocalUser, maxFinalPrice, nearMeEnabled, selectedCityName, userLocation]);

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
        if (authLoading) {
            return;
        }
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
    }, [authLoading, bedFilter, duration, maxFinalPrice, runSearch, searchParams]);

    useEffect(() => {
        void loadOpenBookings();
    }, [loadOpenBookings]);

    async function handleSearch(event) {
        event?.preventDefault();
        await runSearch();
    }

    function openBookingPage(listing, mode = "manual") {
        const params = new URLSearchParams({
            cityId: cityId || "",
            propertyId: listing.propertyId || "",
            propertyName: listing.propertyName || "",
            mode,
            duration,
            bedFilter,
        });
        if ((mode === "now" || mode === "future") && listing.recommendedBedId) {
            params.set("bedId", listing.recommendedBedId);
        }
        if (nearMeEnabled && userLocation) {
            params.set("nearMe", "1");
            params.set("userLat", String(userLocation.lat));
            params.set("userLng", String(userLocation.lng));
        }
        if (isDevLocalUser) {
            params.set("devAuth", profile?.role || "consumer");
            params.set("devPreview", "1");
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
        const selectedMethod = String(checkoutPaymentMethodByBooking[bookingId] ?? "cash").toLowerCase();
        const paymentMethod = selectedMethod === "online" ? "online" : "cash";

        setCheckoutLoadingId(bookingId);
        setError(null);
        setNotice(null);
        try {
            let summary;
            if (paymentMethod === "online") {
                const loaded = await ensureRazorpayLoaded();
                if (!loaded) {
                    throw new Error("Could not initialize online payment.");
                }
                const order = await createRazorpayCheckoutOrder({ bookingId });
                if (!order.paymentRequired) {
                    summary = await checkoutOpenBooking({ userId: user.uid, bookingId, paymentMethod: "cash" });
                } else {
                    const paymentResult = await openRazorpayCheckout({
                        key: order.keyId,
                        amount: order.amountPaise,
                        currency: order.currency,
                        name: "Chikki",
                        description: `Checkout payment for ${order.bookingCode || bookingId}`,
                        order_id: order.orderId,
                        prefill: {
                            name: profile?.name || "",
                            contact: user?.phoneNumber || "",
                        },
                        notes: {
                            bookingId,
                        },
                        theme: {
                            color: "#0f172a",
                        },
                    });

                    summary = await checkoutOpenBooking({
                        userId: user.uid,
                        bookingId,
                        paymentMethod: "online",
                        razorpayOrderId: String(paymentResult.razorpay_order_id ?? ""),
                        razorpayPaymentId: String(paymentResult.razorpay_payment_id ?? ""),
                        razorpaySignature: String(paymentResult.razorpay_signature ?? ""),
                    });
                }
            } else {
                summary = await checkoutOpenBooking({ userId: user.uid, bookingId, paymentMethod });
            }

            setNotice(
                `Checked out for ${summary.bookingCode}. Bed amount: INR ${summary.bedAmount}. `
                + `Platform fee: INR ${summary.platformFeeAmount}. Remaining payment: INR ${summary.remainingPaid}. `
                + `Payment method: ${paymentMethod.toUpperCase()}.`
            );
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

    function startModifyBooking(item) {
        setError(null);
        setNotice(null);
        setModifyingBookingId(item.id);
        setModifyDrafts((current) => ({
            ...current,
            [item.id]: {
                checkInAt: current[item.id]?.checkInAt ?? dateTimeInputValue(item.checkInAt),
                bedId: current[item.id]?.bedId ?? item.bedId,
            },
        }));
    }

    function updateModifyDraft(bookingId, field, value) {
        setModifyDrafts((current) => ({
            ...current,
            [bookingId]: {
                checkInAt: current[bookingId]?.checkInAt ?? "",
                bedId: current[bookingId]?.bedId ?? "",
                [field]: value,
            },
        }));
    }

    async function handleModifyBooking(event, item) {
        event.preventDefault();
        if (!user?.uid) return;
        const draft = modifyDrafts[item.id] ?? {};
        setModifyLoadingId(item.id);
        setError(null);
        setNotice(null);
        try {
            const summary = await modifyConfirmedBooking({
                bookingId: item.id,
                checkInAt: draft.checkInAt,
                bedId: draft.bedId || item.bedId,
            });
            setNotice(
                `Booking modified. ${summary.bookingCode}: ${summary.allocatedBedCode || "bed"} at ${summary.checkInAt}. `
                + `Locked total: INR ${Math.round(Number(summary.totalAmount ?? 0)).toLocaleString("en-IN")}.`
            );
            setModifyingBookingId("");
            await loadOpenBookings();
        } catch (modifyError) {
            setError(modifyError instanceof Error ? modifyError.message : "Could not modify booking.");
        } finally {
            setModifyLoadingId("");
        }
    }

    function startIssueReport(item) {
        setError(null);
        setNotice(null);
        setIssueReportingId(item.id);
        setIssueDrafts((current) => ({
            ...current,
            [item.id]: {
                reason: current[item.id]?.reason ?? "unclean",
                notes: current[item.id]?.notes ?? "",
            },
        }));
    }

    function updateIssueDraft(bookingId, field, value) {
        setIssueDrafts((current) => ({
            ...current,
            [bookingId]: {
                reason: current[bookingId]?.reason ?? "unclean",
                notes: current[bookingId]?.notes ?? "",
                [field]: value,
            },
        }));
    }

    async function handleReportBedIssue(event, item) {
        event.preventDefault();
        if (!user?.uid) return;
        const draft = issueDrafts[item.id] ?? {};
        setIssueLoadingId(item.id);
        setError(null);
        setNotice(null);
        try {
            if (isDevLocalUser) {
                setNotice("Local smoke preview: issue recorded and consumer would be moved to SMK-2 in the same property.");
                setOpenBookings((current) => current.map((booking) => booking.id === item.id
                    ? {
                        ...booking,
                        bedId: "dev-smoke-bed-2",
                        bedCode: "SMK-2",
                        bedType: "AC",
                        bedIssueStatus: "reassigned",
                    }
                    : booking));
                setIssueReportingId("");
                return;
            }
            const summary = await reportBedIssue({
                bookingId: item.id,
                reason: draft.reason || "other",
                notes: draft.notes || "",
            });
            setNotice(summary.message || "Bed issue reported. Support has been notified.");
            setIssueReportingId("");
            await loadOpenBookings();
        } catch (issueError) {
            setError(issueError instanceof Error ? issueError.message : "Could not report bed issue.");
        } finally {
            setIssueLoadingId("");
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

            {/* Aadhaar nudge: show after user has at least one booking and has not set Aadhaar */}
            {user && !aadhaarBannerDismissed && openBookings.length > 0 && !profile?.aadhaarRefId ? (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <span className="mt-0.5 shrink-0 text-base">&#x1F4CB;</span>
                <div className="flex-1">
                  <strong>Add Aadhaar if you want faster repeat booking</strong>
                  <p className="mt-1 text-xs text-amber-700">
                    Aadhaar is optional for booking right now. If you want to save it for later use, add it from your profile.
                  </p>
                  <div className="mt-2 flex gap-2">
                    <a
                      href="/profile"
                      className="rounded-full bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Go to Profile
                    </a>
                    <button
                      type="button"
                      onClick={() => setAadhaarBannerDismissed(true)}
                      className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-100"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

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
                            <p className="mt-1 text-sm text-slate-600">{formatTransitSummary(item)}</p>
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
                            <p className="mt-1 text-xs text-slate-500">Shown rates are bed prices. Platform fee (INR {item.platformFeeInr ?? 9}) is added once per booking at checkout.</p>
                            <p className="mt-1 text-xs font-semibold text-slate-600">Bed rating: {ratingText(item.ratingAverage, item.ratingCount)}</p>
                            {item.recommendedBedId ? (
                                <div className="mt-2 rounded-xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                                    <span className="font-bold">Recommended:</span>{" "}
                                    {item.recommendedBedCode || "Bed"} | {item.recommendedBedType || "Bed"} | INR {item.recommendedBedPrice}
                                    <span className="ml-1 text-sky-700">({ratingText(item.recommendedBedRatingAverage, item.recommendedBedRatingCount)})</span>
                                </div>
                            ) : null}
                            <p className="mt-1 text-xs text-slate-500">Checkout uses the booking-time locked bed rate for actual stay hours.</p>
                            <div className="mt-3 flex gap-2">
                                <a href={googleMapsDirectionsUrl({ lat: item.lat, lng: item.lng }, nearMeEnabled ? userLocation : null)} target="_blank" rel="noreferrer" className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">Directions</a>
                                <button type="button" onClick={() => openBookingPage(item, "now")} className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-slate-700">
                                    {user ? "Book Now" : "Login To Book"}
                                </button>
                                <button type="button" onClick={() => openBookingPage(item, "future")} className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-50">
                                    Future Booking
                                </button>
                                <button type="button" onClick={() => openBookingPage(item, "manual")} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                    Choose Bed
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
                                        <th className="pb-2 text-left font-semibold">Type</th>
                                        <th className="pb-2 text-left font-semibold">Check-In</th>
                                        <th className="pb-2 text-left font-semibold">Status</th>
                                        <th className="pb-2 text-left font-semibold">Locked Total</th>
                                        <th className="pb-2 text-left font-semibold">Live Hours</th>
                                        <th className="pb-2 text-left font-semibold">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {openBookings.map((item) => (
                                        <Fragment key={item.id}>
                                        <tr>
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
                                            <td className="py-2">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${String(item.bookingMode).toLowerCase() === "future" ? "bg-sky-100 text-sky-700" : "bg-slate-100 text-slate-700"}`}>
                                                    {item.bookingModeLabel || "Book Now"}
                                                </span>
                                                {String(item.bookingMode).toLowerCase() === "future" && Number(item.futureBookingSurchargePercent ?? 0) > 0 ? (
                                                    <p className="mt-1 text-[11px] text-slate-500">Future price locked</p>
                                                ) : null}
                                                {Number(item.modifiedCount ?? 0) > 0 ? (
                                                    <p className="mt-1 text-[11px] font-semibold text-sky-700">Modified</p>
                                                ) : null}
                                                {item.bedIssueStatus ? (
                                                    <p className="mt-1 text-[11px] font-semibold text-amber-700">Bed issue reported</p>
                                                ) : null}
                                            </td>
                                            <td className="py-2 text-slate-700">{item.checkInAt || "-"}</td>
                                            <td className="py-2">
                                                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${String(item.bookingStatus).toLowerCase() === "checked_in" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                                                    {String(item.bookingStatus).toLowerCase() === "checked_in" ? "Checked In" : "Booked"}
                                                </span>
                                            </td>
                                            <td className="py-2 text-slate-700">
                                                {Number(item.totalAmount ?? 0) > 0 ? `INR ${Math.round(Number(item.totalAmount)).toLocaleString("en-IN")}` : "-"}
                                            </td>
                                            <td className="py-2 text-slate-700">{getElapsedHours(item.checkInAt)} hr</td>
                                            <td className="py-2">
                                                {String(item.bookingStatus).toLowerCase() === "confirmed" ? (
                                                    <div className="flex flex-col gap-1">
                                                        {item.canModify ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => startModifyBooking(item)}
                                                                className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                                                            >
                                                                Modify
                                                            </button>
                                                        ) : null}
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleCheckInBooking(item.id)}
                                                            disabled={!item.canCheckIn || checkInLoadingId === item.id}
                                                            className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                                                        >
                                                            {checkInLoadingId === item.id ? "Checking in..." : (item.canCheckIn ? "Check-In" : "Wait for time")}
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-2">
                                                            <label className="text-[11px] font-medium text-slate-600" htmlFor={`checkout-method-${item.id}`}>
                                                                Pay via
                                                            </label>
                                                            <select
                                                                id={`checkout-method-${item.id}`}
                                                                value={String(checkoutPaymentMethodByBooking[item.id] ?? "cash")}
                                                                onChange={(event) => {
                                                                    const value = String(event.target.value ?? "cash").toLowerCase();
                                                                    setCheckoutPaymentMethodByBooking((current) => ({
                                                                        ...current,
                                                                        [item.id]: value,
                                                                    }));
                                                                }}
                                                                className="rounded-full border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
                                                            >
                                                                <option value="cash">Cash</option>
                                                                <option value="online">Online (Razorpay)</option>
                                                            </select>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleCheckoutBooking(item.id)}
                                                            disabled={checkoutLoadingId === item.id}
                                                            className="rounded-full border border-sky-300 px-3 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-60"
                                                        >
                                                            {checkoutLoadingId === item.id ? "Checking out..." : "Checkout"}
                                                        </button>
                                                        {item.canReportBedIssue ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => startIssueReport(item)}
                                                                className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                                                            >
                                                                Report Bed Issue
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                        {modifyingBookingId === item.id ? (
                                            <tr className="bg-sky-50/60">
                                                <td colSpan={10} className="px-3 py-4">
                                                    <form className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]" onSubmit={(event) => void handleModifyBooking(event, item)}>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">New Check-In</label>
                                                            <input
                                                                type="datetime-local"
                                                                min={toInputDateTime(new Date())}
                                                                max={maxModifyTimeForMode(item.bookingMode)}
                                                                value={modifyDrafts[item.id]?.checkInAt ?? dateTimeInputValue(item.checkInAt)}
                                                                onChange={(event) => updateModifyDraft(item.id, "checkInAt", event.target.value)}
                                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                                                                required
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Bed In Same Property</label>
                                                            <select
                                                                value={modifyDrafts[item.id]?.bedId ?? item.bedId}
                                                                onChange={(event) => updateModifyDraft(item.id, "bedId", event.target.value)}
                                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
                                                            >
                                                                {(item.bedOptions ?? []).map((bed) => (
                                                                    <option key={bed.bedId} value={bed.bedId}>
                                                                        {bed.bedCode || "Bed"} | {bed.bedType} | {bed.roomName || bed.roomId || "Room"}
                                                                    </option>
                                                                ))}
                                                            </select>
                                                        </div>
                                                        <button
                                                            type="submit"
                                                            disabled={modifyLoadingId === item.id}
                                                            className="self-end rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-60"
                                                        >
                                                            {modifyLoadingId === item.id ? "Saving..." : "Save Changes"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setModifyingBookingId("")}
                                                            className="self-end rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </form>
                                                    <p className="mt-2 text-xs text-slate-500">
                                                        Price and availability are checked again when you save. Booking type stays {item.bookingModeLabel || "Book Now"}.
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : null}
                                        {issueReportingId === item.id ? (
                                            <tr className="bg-amber-50/70">
                                                <td colSpan={10} className="px-3 py-4">
                                                    <form className="grid gap-3 md:grid-cols-[220px_1fr_auto_auto]" onSubmit={(event) => void handleReportBedIssue(event, item)}>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Issue</label>
                                                            <select
                                                                value={issueDrafts[item.id]?.reason ?? "unclean"}
                                                                onChange={(event) => updateIssueDraft(item.id, "reason", event.target.value)}
                                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                                                            >
                                                                <option value="unclean">Unclean bed</option>
                                                                <option value="damaged">Damaged bed</option>
                                                                <option value="occupied">Already occupied</option>
                                                                <option value="unsafe">Unsafe/uncomfortable</option>
                                                                <option value="wrong_bed">Wrong bed</option>
                                                                <option value="other">Other</option>
                                                            </select>
                                                        </div>
                                                        <div>
                                                            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</label>
                                                            <input
                                                                value={issueDrafts[item.id]?.notes ?? ""}
                                                                onChange={(event) => updateIssueDraft(item.id, "notes", event.target.value)}
                                                                maxLength={500}
                                                                placeholder="Short note for owner/operator"
                                                                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500"
                                                            />
                                                        </div>
                                                        <button
                                                            type="submit"
                                                            disabled={issueLoadingId === item.id}
                                                            className="self-end rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                                                        >
                                                            {issueLoadingId === item.id ? "Reporting..." : "Report"}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => setIssueReportingId("")}
                                                            className="self-end rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white"
                                                        >
                                                            Cancel
                                                        </button>
                                                    </form>
                                                    <p className="mt-2 text-xs text-slate-500">
                                                        We try another available bed in the same property first. If none is available, we try a nearby property and alert support.
                                                    </p>
                                                </td>
                                            </tr>
                                        ) : null}
                                        </Fragment>
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
