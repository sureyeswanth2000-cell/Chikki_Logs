"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/context/auth-context";
import {
    createBookingWithAdvance,
    getListingByPropertyForBooking,
    validateAadhaar,
} from "@/lib/firestore/consumer";
import { formatDistance, formatTransitSummary, googleMapsDirectionsUrl } from "@/lib/geo";

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

function addHours(date, hours) {
    const next = new Date(date);
    next.setHours(next.getHours() + hours);
    return next;
}

function addDays(date, days) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function priceForBed(duration, bed) {
    const displayPrices = {
        hourly: Number(bed?.displayHourlyPrice),
        overnight: Number(bed?.displayOvernightPrice),
        overday: Number(bed?.displayOverdayPrice),
    };
    if (Number.isFinite(displayPrices[duration])) {
        return displayPrices[duration];
    }
    const prices = {
        hourly: Number(bed?.hourlyPrice ?? 120),
        overnight: Number(bed?.overnightPrice ?? 650),
        overday: Number(bed?.overdayPrice ?? 900),
    };
    const acExtra = String(bed?.bedType ?? "").toUpperCase() === "AC" ? 50 : 0;
    const basePrice = (prices[duration] ?? prices.hourly) + acExtra;
    const demandMultiplierPercent = Math.max(0, Number(bed?.demandMultiplierPercent ?? 0));
    return Math.round(basePrice * (1 + demandMultiplierPercent / 100));
}

function maskAadhaar(value) {
    const digits = String(value ?? "").replace(/\D/g, "").slice(-4);
    if (digits.length !== 4) return "XXXX XXXX";
    return `XXXX XXXX ${digits}`;
}

function prettyDuration(value) {
    if (value === "overnight") return "Overnight";
    if (value === "overday") return "Overday";
    return "Hourly";
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

function isLocalDevHost() {
    if (typeof window === "undefined") {
        return false;
    }
    const host = window.location.hostname;
    return host === "localhost" || host === "127.0.0.1";
}

function buildDevSmokeListing({ cityId, propertyId, propertyName }) {
    const bedId = "dev-smoke-bed";
    return {
        propertyId: propertyId || "dev-smoke-property",
        propertyName: propertyName || "Dev Smoke Beds",
        exactAddress: "Local development preview only",
        lat: 0,
        lng: 0,
        bedOptions: [
            {
                bedId,
                bedCode: "SMK-1",
                bedType: "NON_AC",
                roomId: "dev-room-1",
                displayHourlyPrice: 120,
                displayOvernightPrice: 650,
                displayOverdayPrice: 900,
                platformFeeInr: 9,
                demandActive: false,
                demandWarningActive: false,
                ratingAverage: 4.8,
                ratingCount: 12,
            },
        ],
        recommendedBedId: bedId,
        demandActive: false,
        demandWarningActive: false,
        distanceFromUserKm: null,
        cityId,
    };
}

function BookingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { profile, refreshProfile, user } = useAuth();
    const cityId = searchParams.get("cityId") ?? "";
    const propertyId = searchParams.get("propertyId") ?? "";
    const propertyNameHint = searchParams.get("propertyName") ?? "";
    const modeParam = searchParams.get("mode");
    const requestedMode = modeParam === "recommended" || modeParam === "now"
        ? "now"
        : modeParam === "future"
        ? "future"
        : "manual";
    const requestedBedId = searchParams.get("bedId") ?? "";
    const devAuthRole = searchParams.get("devAuth") ?? "";
    const isDevSmokePreview = isLocalDevHost() && ["consumer", "owner", "operator", "superadmin"].includes(devAuthRole);
    const duration = ["hourly", "overnight", "overday"].includes(searchParams.get("duration"))
        ? searchParams.get("duration")
        : "hourly";
    const bedFilter = ["all", "AC", "NON_AC"].includes(searchParams.get("bedFilter"))
        ? searchParams.get("bedFilter")
        : "all";
    const nearMeEnabled = searchParams.get("nearMe") === "1";
    const userLatQuery = searchParams.get("userLat");
    const userLngQuery = searchParams.get("userLng");
    const userLocation = useMemo(() => readLocation(userLatQuery, userLngQuery), [userLatQuery, userLngQuery]);

    const [listing, setListing] = useState(null);
    const [loadingListing, setLoadingListing] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [step, setStep] = useState("details");
    const [selectedBedId, setSelectedBedId] = useState("");
    const [checkInAt, setCheckInAt] = useState("");
    const [aadhaarNumber, setAadhaarNumber] = useState("");
    const [bookingLoading, setBookingLoading] = useState(false);
    const [clockNowMs, setClockNowMs] = useState(Date.now());

    const selectedBed = useMemo(
        () => listing?.bedOptions?.find((bed) => bed.bedId === selectedBedId) ?? null,
        [listing?.bedOptions, selectedBedId]
    );
    const selectedBedPrice = useMemo(() => priceForBed(duration, selectedBed), [duration, selectedBed]);
    const platformFeeInr = useMemo(() => {
        const fromBed = Number(selectedBed?.platformFeeInr);
        if (Number.isFinite(fromBed)) {
            return Math.max(0, Math.min(999, Math.round(fromBed)));
        }
        const fromListing = Number(listing?.platformFeeInr);
        if (Number.isFinite(fromListing)) {
            return Math.max(0, Math.min(999, Math.round(fromListing)));
        }
        return 9;
    }, [listing?.platformFeeInr, selectedBed?.platformFeeInr]);
    const bookingTotal = selectedBedPrice + platformFeeInr;
    const hasSavedAadhaarRef = Boolean(profile?.aadhaarRefId && profile?.aadhaarLast4);
    const minCheckInAt = useMemo(() => toInputDateTime(roundToNextQuarterHour(new Date(clockNowMs))), [clockNowMs]);
    const maxCheckInAt = useMemo(() => {
        const now = new Date(clockNowMs);
        const maxDate = requestedMode === "future" ? addDays(now, 30) : addHours(now, 24);
        return toInputDateTime(maxDate);
    }, [clockNowMs, requestedMode]);
    const backToSearchParams = new URLSearchParams({
        cityId,
        duration,
        bedFilter,
    });
    if (nearMeEnabled && userLocation) {
        backToSearchParams.set("nearMe", "1");
        backToSearchParams.set("userLat", String(userLocation.lat));
        backToSearchParams.set("userLng", String(userLocation.lng));
    }
    const backToSearchHref = `/consumer?${backToSearchParams.toString()}`;

    const loadListing = useCallback(async () => {
        if (isDevSmokePreview) {
            const mockListing = buildDevSmokeListing({
                cityId,
                propertyId,
                propertyName: propertyNameHint || "Dev Smoke Beds",
            });
            setListing(mockListing);
            setSelectedBedId(mockListing.bedOptions[0]?.bedId ?? "");
            setCheckInAt(toInputDateTime(roundToNextQuarterHour(new Date())));
            setStep("review");
            setLoadingListing(false);
            setError(null);
            return;
        }
        if (!cityId || !propertyId) {
            setError("Choose a bed from search before starting booking.");
            setLoadingListing(false);
            return;
        }
        setLoadingListing(true);
        setError(null);
        try {
            const match = await getListingByPropertyForBooking({
                cityId,
                propertyId,
                duration,
                bedFilter,
                bookingMode: requestedMode === "future" ? "future" : "now",
                userLat: nearMeEnabled && userLocation ? userLocation.lat : undefined,
                userLng: nearMeEnabled && userLocation ? userLocation.lng : undefined,
            });
            if (!match) {
                setListing(null);
                setError("This listing is no longer available for the selected filters.");
                return;
            }
            const preferredBed = match.bedOptions?.find((bed) => bed.bedId === requestedBedId)
                ?? match.bedOptions?.find((bed) => bed.bedId === match.recommendedBedId)
                ?? match.bedOptions?.[0]
                ?? null;
            setListing(match);
            setSelectedBedId(preferredBed?.bedId ?? "");
            setCheckInAt(toInputDateTime(roundToNextQuarterHour(new Date())));
            setStep(requestedMode === "now" && preferredBed ? "review" : "details");
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load booking details.");
        } finally {
            setLoadingListing(false);
        }
    }, [bedFilter, cityId, duration, isDevSmokePreview, nearMeEnabled, propertyId, propertyNameHint, requestedBedId, requestedMode, userLocation]);

    useEffect(() => {
        void loadListing();
    }, [loadListing]);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setClockNowMs(Date.now());
        }, 30000);
        return () => window.clearInterval(timer);
    }, []);

    function handleReview(event) {
        event.preventDefault();
        setError(null);
        setNotice(null);

        if (!selectedBed) {
            setError("Select an available bed first.");
            return;
        }
        if (!checkInAt) {
            setError("Select check-in time.");
            return;
        }

        const selectedTime = new Date(checkInAt).getTime();
        const minTime = new Date(minCheckInAt).getTime();
        const maxTime = new Date(maxCheckInAt).getTime();
        if (Number.isNaN(selectedTime)) {
            setError("Select a valid check-in time.");
            return;
        }
        if (selectedTime < minTime) {
            setError("Check-in time cannot be in the past.");
            return;
        }
        if (selectedTime > maxTime) {
            setError(requestedMode === "future"
                ? "Future Booking is limited to the next 30 days."
                : "Book Now is limited to the next 24 hours.");
            return;
        }

        setStep("review");
    }

    async function handleCreateBooking(event) {
        event.preventDefault();
        if (!user?.uid || !listing || !selectedBed) return;

        const aadhaarDigits = aadhaarNumber.replace(/\D/g, "");
        if (aadhaarDigits && !validateAadhaar(aadhaarDigits)) {
            setError("Enter a valid 12-digit Aadhaar number or leave it blank for now.");
            return;
        }

        setBookingLoading(true);
        setError(null);
        setNotice(null);
        try {
            const result = await createBookingWithAdvance({
                userId: user.uid,
                listing,
                requirementBedType: selectedBed.bedType,
                selectedBed,
                duration,
                checkInAt,
                bookingMode: requestedMode === "future" ? "future" : "now",
                aadhaar: aadhaarDigits || undefined,
            });
            setNotice(`Booking opened. Booking ID: ${result.bookingCode}. Allocated bed: ${result.allocatedBedCode} (${result.allocatedBedType}).`);
            await refreshProfile?.();
            setStep("success");
        } catch (bookingError) {
            setError(bookingError instanceof Error ? bookingError.message : "Booking failed.");
        } finally {
            setBookingLoading(false);
        }
    }

    return (
        <ProtectedRoute allowedRoles={["consumer", "owner"]}>
            <main className="mx-auto max-w-5xl px-5 py-10 md:px-6 md:py-12">
                <div className="glass-card animate-rise rounded-2xl p-6">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-sky-700">
                        {requestedMode === "future" ? "Future Booking" : requestedMode === "now" ? "Book Now" : "Booking Step"}
                    </p>
                    <h1 className="mt-2 text-3xl font-bold">
                        {requestedMode === "future" ? "Schedule bed and start time" : "Confirm bed and start time"}
                    </h1>
                    <p className="mt-2 text-sm text-slate-600">
                        {requestedMode === "now"
                            ? "Book Now uses the recommended bed path for check-in within the next 24 hours. You can still change bed or time before confirming."
                            : requestedMode === "future"
                            ? "Choose a future check-in time within the next 30 days. The shown bed price is locked as the Future booking price after confirmation."
                            : "Select the exact bed and check-in time first. Aadhaar stays optional in the review step."}
                    </p>
                </div>

                {error && <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
                {notice && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>}

                {loadingListing ? (
                    <section className="glass-card animate-stagger mt-8 rounded-2xl p-6 text-sm text-slate-600">
                        <div className="space-y-3">
                            <p className="text-base font-semibold text-slate-900">
                                {propertyNameHint ? `Checking latest beds at ${propertyNameHint}` : "Checking latest bed availability"}
                            </p>
                            <p className="text-sm text-slate-600">Refreshing bed availability, blocks, ratings, and current price before you choose a bed.</p>
                            <div className="grid gap-3 md:grid-cols-2">
                                <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                                <div className="h-24 animate-pulse rounded-xl bg-slate-100" />
                            </div>
                        </div>
                    </section>
                ) : !listing ? (
                    <section className="glass-card animate-stagger mt-8 rounded-2xl p-6">
                        <p className="text-sm text-slate-600">Return to search and choose another available bed.</p>
                        <Link href={backToSearchHref} prefetch={false} className="mt-4 inline-block rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
                            Back To Search
                        </Link>
                    </section>
                ) : (
                    <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                        <section className="glass-card animate-stagger rounded-2xl p-6">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold">{listing.propertyName}</h2>
                                    <p className="mt-1 text-sm text-slate-600">{listing.exactAddress}</p>
                                    <p className="mt-1 text-xs text-slate-500">{formatTransitSummary(listing)}</p>
                                    {Number.isFinite(Number(listing.distanceFromUserKm)) ? (
                                        <p className="mt-1 text-xs font-semibold text-sky-700">Distance from you: {formatDistance(listing.distanceFromUserKm)}</p>
                                    ) : null}
                                    {listing.demandActive ? (
                                        <div className="mt-2 flex flex-wrap items-center gap-2">
                                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">High Demand</span>
                                            <span className="text-xs font-semibold text-amber-700">{String(listing.demandSource).toLowerCase() === "city" ? "City demand" : "Property demand"}</span>
                                        </div>
                                    ) : listing.demandWarningActive ? (
                                        <p className="mt-2 text-xs font-semibold text-amber-700">Demand is rising. Book now before prices increase.</p>
                                    ) : null}
                                </div>
                                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-800">
                                    {prettyDuration(duration)}
                                </span>
                            </div>

                            {step === "details" ? (
                                <form className="mt-6 grid gap-4" onSubmit={handleReview}>
                                    <div>
                                        <label className="mb-2 block text-xs font-semibold text-slate-600">Choose Bed</label>
                                        <div className="grid gap-3 md:grid-cols-2">
                                            {listing.bedOptions.map((bed) => (
                                                <label key={bed.bedId} className={`cursor-pointer rounded-xl border p-4 transition ${selectedBedId === bed.bedId ? "border-sky-500 bg-sky-50" : "border-slate-200 bg-white/80 hover:border-sky-200"}`}>
                                                    <input
                                                        type="radio"
                                                        name="bed"
                                                        value={bed.bedId}
                                                        checked={selectedBedId === bed.bedId}
                                                        onChange={(event) => setSelectedBedId(event.target.value)}
                                                        className="sr-only"
                                                    />
                                                    <span className="block text-sm font-semibold text-slate-900">{bed.bedCode || "Bed"}</span>
                                                    <span className="mt-1 block text-xs text-slate-500">{bed.bedType} | Room ID {bed.roomId}</span>
                                                    <span className="mt-2 block text-sm font-bold text-slate-900">INR {priceForBed(duration, bed)}</span>
                                                    {bed.demandActive ? (
                                                        <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-800">High Demand</span>
                                                    ) : bed.demandWarningActive ? (
                                                        <span className="mt-1 block text-xs font-semibold text-amber-700">Demand rising</span>
                                                    ) : null}
                                                    <span className="mt-1 block text-xs font-semibold text-slate-600">{ratingText(bed.ratingAverage, bed.ratingCount)}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-semibold text-slate-600">Check-in time</label>
                                        <input
                                            type="datetime-local"
                                            value={checkInAt}
                                            onChange={(event) => setCheckInAt(event.target.value)}
                                            min={minCheckInAt}
                                            max={maxCheckInAt}
                                            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500"
                                            required
                                        />
                                        <p className="mt-1 text-xs text-slate-500">
                                            {requestedMode === "future" ? "Future Booking is limited to the next 30 days." : "Book Now is limited to the next 24 hours."}
                                        </p>
                                    </div>

                                    <div className="flex flex-wrap gap-3">
                                        <button type="submit" className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
                                            Review Booking
                                        </button>
                                        <Link href={backToSearchHref} prefetch={false} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                            Back To Search
                                        </Link>
                                    </div>
                                </form>
                            ) : null}

                            {step === "review" ? (
                                <form className="mt-6 grid gap-4" onSubmit={handleCreateBooking}>
                                    <div className="rounded-xl border border-slate-200 bg-white/80 p-4">
                                        <h3 className="text-sm font-semibold text-slate-900">Review</h3>
                                        <dl className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
                                            <div><dt className="text-xs font-semibold text-slate-500">Bed</dt><dd>{selectedBed?.bedCode} ({selectedBed?.bedType})</dd></div>
                                            <div><dt className="text-xs font-semibold text-slate-500">Start</dt><dd>{checkInAt}</dd></div>
                                            <div><dt className="text-xs font-semibold text-slate-500">Stay Type</dt><dd>{prettyDuration(duration)}</dd></div>
                                            <div><dt className="text-xs font-semibold text-slate-500">{requestedMode === "future" ? "Future booking price" : "Bed price"}</dt><dd>INR {selectedBedPrice}</dd></div>
                                            <div><dt className="text-xs font-semibold text-slate-500">Platform fee</dt><dd>INR {platformFeeInr}</dd></div>
                                            <div><dt className="text-xs font-semibold text-slate-500">Booking total</dt><dd className="font-semibold">INR {bookingTotal}</dd></div>
                                        </dl>
                                        {selectedBed?.demandActive ? (
                                            <p className="mt-3 text-xs font-semibold text-amber-700">High Demand is included in the bed price shown above.</p>
                                        ) : selectedBed?.demandWarningActive ? (
                                            <p className="mt-3 text-xs font-semibold text-amber-700">Demand is rising for this area.</p>
                                        ) : null}
                                        {requestedMode === "future" ? (
                                            <p className="mt-3 text-xs font-semibold text-sky-700">Future booking price is the final bed price for this scheduled booking. It will be locked at confirmation.</p>
                                        ) : null}
                                    </div>

                                    {hasSavedAadhaarRef ? (
                                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                                            Saved Aadhaar reference will be used: {maskAadhaar(profile?.aadhaarLast4 ?? "")}. You can update it later from Profile if needed.
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="mb-1 block text-xs font-semibold text-slate-600">Aadhaar number (optional)</label>
                                            <input
                                                value={aadhaarNumber}
                                                onChange={(event) => setAadhaarNumber(event.target.value)}
                                                placeholder="12-digit Aadhaar number"
                                                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500"
                                            />
                                            <p className="mt-1 text-xs text-slate-500">If you have Aadhaar, you can share it now or add it later from your Profile. Booking stays available either way.</p>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap gap-3">
                                        <button type="submit" disabled={bookingLoading} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400">
                                            {bookingLoading ? "Opening Booking..." : "Open Booking"}
                                        </button>
                                        <button type="button" onClick={() => setStep("details")} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                            Change Bed / Time
                                        </button>
                                    </div>
                                </form>
                            ) : null}

                            {step === "success" ? (
                                <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                                    <h3 className="text-sm font-semibold text-emerald-800">Booking opened</h3>
                                    <p className="mt-1 text-sm text-emerald-700">You can check in from Live / Open Bookings when your start time arrives.</p>
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        <Link href={backToSearchHref} prefetch={false} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
                                            View Open Bookings
                                        </Link>
                                        <button type="button" onClick={() => router.refresh()} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                            Refresh Availability
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        <aside className="glass-card animate-stagger rounded-2xl p-6">
                            <h2 className="text-lg font-semibold">What happens next</h2>
                            <ol className="mt-4 space-y-3 text-sm text-slate-700">
                                <li><span className="font-semibold text-slate-900">1.</span> Pick exact bed and start time.</li>
                                <li><span className="font-semibold text-slate-900">2.</span> Review details and optionally share Aadhaar if you want it saved.</li>
                                <li><span className="font-semibold text-slate-900">3.</span> Check in when your booking time arrives.</li>
                                <li><span className="font-semibold text-slate-900">4.</span> Pay final amount at checkout from actual stay time.</li>
                            </ol>
                            <a href={googleMapsDirectionsUrl({ lat: listing.lat, lng: listing.lng }, nearMeEnabled ? userLocation : null)} target="_blank" rel="noreferrer" className="mt-5 inline-block rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                Directions
                            </a>
                        </aside>
                    </div>
                )}
            </main>
        </ProtectedRoute>
    );
}

export default function BookingPage() {
    return (
        <Suspense fallback={<main className="mx-auto max-w-5xl px-5 py-10 text-sm text-slate-600">Loading booking...</main>}>
            <BookingContent />
        </Suspense>
    );
}
