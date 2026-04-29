"use client";
import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { getOwnerEarningsSummary } from "@/lib/firestore/owner";

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

export default function OwnerEarningsPage() {
    const { user } = useAuth();
    const [earningsRange, setEarningsRange] = useState("today");
    const [customFromDate, setCustomFromDate] = useState(formatDate(new Date()));
    const [customToDate, setCustomToDate] = useState(formatDate(new Date()));
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [error, setError] = useState(null);
    const [summary, setSummary] = useState({
        bookingCount: 0,
        expectedEarnings: 0,
        paidAmount: 0,
        pendingAmount: 0,
    });

    async function handleLoadEarnings(event) {
        event.preventDefault();
        if (!user?.uid) {
            setError("Please login first.");
            return;
        }
        const range = getEarningsRange(earningsRange, customFromDate, customToDate);
        if (!range.fromDate || !range.toDate) {
            setError("Choose a valid date range.");
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await getOwnerEarningsSummary(user.uid, range);
            setSummary(data);
            setLoaded(true);
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : "Could not load earnings.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <ProtectedRoute allowedRoles={["owner"]}>
            <main className="mx-auto max-w-5xl px-5 py-8 md:px-6 md:py-10">
                <section className="glass-card rounded-2xl p-6">
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Earnings</h1>
                            <p className="mt-1 text-sm text-slate-600">Choose one period to keep reads light and focused.</p>
                        </div>
                        <Link href="/owner" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                            Dashboard
                        </Link>
                    </div>

                    <form className="mt-6 grid gap-3 md:grid-cols-[180px_1fr_1fr_160px]" onSubmit={handleLoadEarnings}>
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
                        <button type="submit" disabled={loading} className="shine-button rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-400">
                            {loading ? "Loading..." : "Show Earnings"}
                        </button>
                    </form>

                    {error ? (
                        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
                    ) : null}

                    {!loaded ? (
                        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
                            Select today, week, month, or custom date and load earnings.
                        </div>
                    ) : (
                        <div className="mt-6 grid gap-4 md:grid-cols-3">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Earned / Expected</p>
                                <p className="mt-2 text-3xl font-bold text-slate-900">{money(summary.expectedEarnings)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid / Settled</p>
                                <p className="mt-2 text-3xl font-bold text-emerald-700">{money(summary.paidAmount)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings</p>
                                <p className="mt-2 text-3xl font-bold text-sky-700">{summary.bookingCount}</p>
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </ProtectedRoute>
    );
}
