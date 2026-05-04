"use client";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    getOwnerCheckoutAlerts,
    getOwnerDuesSummary,
    getOwnerLiveJobs,
    getOwnerUpcomingBookings,
} from "@/lib/firestore/owner";

function bookingTime(value) {
    return value || "-";
}

function statusBadge(statusValue) {
    const normalized = String(statusValue ?? "").toLowerCase();
    const styles = {
        confirmed: "bg-amber-100 text-amber-700",
        checked_in: "bg-emerald-100 text-emerald-700",
        completed: "bg-sky-100 text-sky-700",
        cancelled: "bg-rose-100 text-rose-700",
    };
    const label = normalized === "checked_in"
        ? "Checked In"
        : normalized
            ? normalized.replaceAll("_", " ")
            : "Unknown";
    return (
        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${styles[normalized] ?? "bg-slate-100 text-slate-700"}`}>
            {label}
        </span>
    );
}

function BookingsTable({ items, emptyText, onCopyBookingId }) {
    if (items.length === 0) {
        return <p className="text-sm text-slate-500">{emptyText}</p>;
    }

    return (
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
                <thead>
                    <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
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
                    {items.map((item) => (
                        <tr key={item.id}>
                            <td className="py-2 font-mono text-xs text-slate-700">
                                <div className="flex items-center gap-2">
                                    <span>{item.bookingCode || item.id}</span>
                                    <button
                                        type="button"
                                        onClick={() => void onCopyBookingId(item.bookingCode, item.id)}
                                        className="rounded-full border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50"
                                    >
                                        Copy
                                    </button>
                                </div>
                            </td>
                            <td className="py-2 text-slate-700">{item.propertyName || "-"}</td>
                            <td className="py-2 text-slate-700">{item.roomName || "-"}</td>
                            <td className="py-2 text-slate-700">{item.bedCode || "-"}</td>
                            <td className="py-2 text-slate-700">{bookingTime(item.checkInAt)}</td>
                            <td className="py-2 text-slate-700">{bookingTime(item.checkOutAt)}</td>
                            <td className="py-2">{statusBadge(item.bookingStatus)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function BookingPanel({ id, title, description, defaultOpen = false, children }) {
    return (
        <details id={id} className="glass-card rounded-2xl p-0" open={defaultOpen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    <p className="mt-1 text-sm text-slate-500">{description}</p>
                </div>
                <span className="rounded-full border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500">v</span>
            </summary>
            <div className="border-t border-slate-100 px-5 py-4">{children}</div>
        </details>
    );
}

export default function OwnerPage() {
    const { user } = useAuth();
    const [loadingData, setLoadingData] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [activeBookings, setActiveBookings] = useState([]);
    const [futureBookings, setFutureBookings] = useState([]);
    const [checkoutAlerts, setCheckoutAlerts] = useState([]);
    const [activeBookingCount, setActiveBookingCount] = useState(0);
    const [duesSummary, setDuesSummary] = useState({
        pendingCommissionInr: 0,
        pendingDueCount: 0,
        claimedDueCount: 0,
    });

    const loadOwnerData = useCallback(async () => {
        if (!user?.uid) return;
        setLoadingData(true);
        setError(null);
        try {
            const [liveJobItems, upcomingSummary, alertItems] = await Promise.all([
                getOwnerLiveJobs(user.uid),
                getOwnerUpcomingBookings(user.uid),
                getOwnerCheckoutAlerts(user.uid),
            ]);
            const dueSummary = await getOwnerDuesSummary(user.uid);
            setActiveBookings(liveJobItems);
            setFutureBookings(upcomingSummary.upcomingBookings);
            setActiveBookingCount(upcomingSummary.activeBookingCount);
            setCheckoutAlerts(alertItems);
            setDuesSummary(dueSummary);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load owner dashboard.");
        } finally {
            setLoadingData(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void loadOwnerData();
    }, [loadOwnerData]);

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
            <main className="mx-auto max-w-6xl px-5 py-8 md:px-6 md:py-10">
                <section className="glass-card rounded-2xl p-5">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">Owner Dashboard</h1>
                        <p className="mt-1 text-sm text-slate-600">Bookings that need attention now and next.</p>
                    </div>
                </section>

                {error ? (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                ) : null}
                {notice ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
                ) : null}

                <section className="mt-5 grid gap-3 sm:grid-cols-4">
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-slate-900">{loadingData ? "-" : activeBookings.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Active Bookings</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-sky-700">{loadingData ? "-" : futureBookings.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Future Bookings</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-amber-600">{loadingData ? "-" : checkoutAlerts.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Checkout Pending</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-rose-700">
                            {loadingData ? "-" : `INR ${Math.round(Number(duesSummary.pendingCommissionInr ?? 0)).toLocaleString("en-IN")}`}
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Platform Dues</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                            {loadingData ? "" : `${duesSummary.pendingDueCount} pending, ${duesSummary.claimedDueCount} claimed`}
                        </p>
                    </div>
                </section>

                <div className="mt-5 grid gap-5">
                    <BookingPanel
                        id="active-bookings"
                        title="Active Bookings"
                        description="Consumers currently checked in or occupying beds."
                        defaultOpen
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading active bookings...</p>
                        ) : (
                            <BookingsTable items={activeBookings} emptyText="No active bookings right now." onCopyBookingId={handleCopyBookingId} />
                        )}
                    </BookingPanel>

                    <BookingPanel
                        id="future-bookings"
                        title="Future Bookings"
                        description={`Upcoming bookings. Total active/future count: ${loadingData ? "-" : activeBookingCount}.`}
                        defaultOpen
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading future bookings...</p>
                        ) : (
                            <BookingsTable items={futureBookings} emptyText="No future bookings." onCopyBookingId={handleCopyBookingId} />
                        )}
                    </BookingPanel>

                    <BookingPanel
                        id="checkout-pending"
                        title="Checkout Pending"
                        description="Bookings where checkout/payment attention is needed."
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading checkout pending...</p>
                        ) : (
                            <BookingsTable items={checkoutAlerts} emptyText="No checkout pending alerts." onCopyBookingId={handleCopyBookingId} />
                        )}
                    </BookingPanel>
                </div>
            </main>
        </ProtectedRoute>
    );
}
