"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    getOwnerCheckoutAlerts,
    getOwnerEarningsSummary,
    getOwnerLiveJobs,
    getOwnerUpcomingBookings,
} from "@/lib/firestore/owner";

function formatDate(value) {
    return value.toISOString().slice(0, 10);
}

function getEarningsRange(rangeKey, customFromDate, customToDate) {
    if (rangeKey === "custom") {
        return { fromDate: customFromDate, toDate: customToDate };
    }
    const now = new Date();
    const toDate = formatDate(now);
    const from = new Date(now);
    if (rangeKey === "week") {
        from.setDate(from.getDate() - 6);
    }
    if (rangeKey === "month") {
        from.setDate(from.getDate() - 29);
    }
    return { fromDate: formatDate(from), toDate };
}

function money(value) {
    return `INR ${Math.round(Number(value ?? 0)).toLocaleString("en-IN")}`;
}

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
    const [earningsLoading, setEarningsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [activeBookings, setActiveBookings] = useState([]);
    const [futureBookings, setFutureBookings] = useState([]);
    const [checkoutAlerts, setCheckoutAlerts] = useState([]);
    const [activeBookingCount, setActiveBookingCount] = useState(0);
    const [earningsRange, setEarningsRange] = useState("today");
    const [customFromDate, setCustomFromDate] = useState(formatDate(new Date()));
    const [customToDate, setCustomToDate] = useState(formatDate(new Date()));
    const [periodEarnings, setPeriodEarnings] = useState({
        bookingCount: 0,
        expectedEarnings: 0,
        paidAmount: 0,
        pendingAmount: 0,
    });
    const [totalEarnings, setTotalEarnings] = useState({
        bookingCount: 0,
        expectedEarnings: 0,
        paidAmount: 0,
        pendingAmount: 0,
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
            setActiveBookings(liveJobItems);
            setFutureBookings(upcomingSummary.upcomingBookings);
            setActiveBookingCount(upcomingSummary.activeBookingCount);
            setCheckoutAlerts(alertItems);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Failed to load owner dashboard.");
        } finally {
            setLoadingData(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void loadOwnerData();
    }, [loadOwnerData]);

    const loadEarningsData = useCallback(async (rangeKey, fromDate, toDate) => {
        if (!user?.uid) return;
        const range = getEarningsRange(rangeKey, fromDate, toDate);
        if (!range.fromDate || !range.toDate) {
            setError("Choose a valid earnings date range.");
            return;
        }
        setEarningsLoading(true);
        setError(null);
        try {
            const [periodSummary, totalSummary] = await Promise.all([
                getOwnerEarningsSummary(user.uid, range),
                getOwnerEarningsSummary(user.uid, {}),
            ]);
            setPeriodEarnings(periodSummary);
            setTotalEarnings(totalSummary);
        } catch (earningsError) {
            setError(earningsError instanceof Error ? earningsError.message : "Could not load earnings.");
        } finally {
            setEarningsLoading(false);
        }
    }, [user?.uid]);

    useEffect(() => {
        void loadEarningsData("today", customFromDate, customToDate);
    }, [customFromDate, customToDate, loadEarningsData]);

    function handleLoadEarnings(event) {
        event.preventDefault();
        void loadEarningsData(earningsRange, customFromDate, customToDate);
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

                <section className="mt-5 grid gap-3 sm:grid-cols-3">
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
                </section>

                <section className="glass-card mt-5 rounded-2xl p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900">Earnings</h2>
                            <p className="mt-1 text-sm text-slate-600">Owner received amount by period, with total received since starting.</p>
                        </div>
                        <Link href="/owner/earnings" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                            Open Earnings Page
                        </Link>
                    </div>
                    <form className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr_1fr_150px]" onSubmit={handleLoadEarnings}>
                        <select
                            value={earningsRange}
                            onChange={(event) => setEarningsRange(event.target.value)}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                        >
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="custom">Custom Date</option>
                        </select>
                        <input
                            type="date"
                            value={customFromDate}
                            onChange={(event) => setCustomFromDate(event.target.value)}
                            disabled={earningsRange !== "custom"}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                        />
                        <input
                            type="date"
                            value={customToDate}
                            onChange={(event) => setCustomToDate(event.target.value)}
                            disabled={earningsRange !== "custom"}
                            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm disabled:bg-slate-100"
                        />
                        <button type="submit" disabled={earningsLoading} className="shine-button rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400">
                            {earningsLoading ? "Loading..." : "Show"}
                        </button>
                    </form>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</p>
                            <p className="mt-2 text-2xl font-bold text-emerald-700">{earningsLoading ? "-" : money(periodEarnings.paidAmount)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{earningsLoading ? "-" : money(periodEarnings.expectedEarnings)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Received</p>
                            <p className="mt-2 text-2xl font-bold text-sky-700">{earningsLoading ? "-" : money(totalEarnings.paidAmount)}</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Bookings</p>
                            <p className="mt-2 text-2xl font-bold text-slate-900">{earningsLoading ? "-" : totalEarnings.bookingCount}</p>
                        </div>
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
