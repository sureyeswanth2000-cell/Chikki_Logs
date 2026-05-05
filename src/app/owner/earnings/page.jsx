"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    getOwnerEarningsSummary,
    getOwnerNotices,
    dismissOwnerNotice,
    getOwnerProfile,
    getOwnerCommissionDues,
    markOwnerDueAsPaid,
} from "@/lib/firestore/owner";

function formatDate(value) {
    return value.toISOString().slice(0, 10);
}

function getEarningsRange(rangeKey, customFromDate, customToDate) {
    if (rangeKey === "all_time") {
        return {};
    }
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
    const [commissionPercent, setCommissionPercent] = useState(null);
    const [notices, setNotices] = useState([]);
    const [pendingDues, setPendingDues] = useState([]);
    const [duesLoading, setDuesLoading] = useState(false);
    const [dueActionLoadingId, setDueActionLoadingId] = useState("");
    const [duesNotice, setDuesNotice] = useState(null);
    const [duesError, setDuesError] = useState(null);

    useEffect(() => {
        if (!user?.uid) return;
        setDuesLoading(true);
        getOwnerProfile(user.uid).then((profile) => {
            if (profile?.ownerRevenueSharePercent != null) {
                setCommissionPercent(profile.ownerRevenueSharePercent);
            }
        }).catch(() => {});
        getOwnerNotices(user.uid).then(setNotices).catch(() => {});
        getOwnerCommissionDues(user.uid)
            .then(setPendingDues)
            .catch(() => { setDuesError("Could not load commission dues. Please refresh."); })
            .finally(() => setDuesLoading(false));
    }, [user?.uid]);

    async function handleDismissNotice(noticeId) {
        try {
            await dismissOwnerNotice(noticeId);
            setNotices((current) => current.filter((n) => n.id !== noticeId));
        } catch {
            // silent
        }
    }

    async function handleMarkDuePaid(dueId) {
        if (!dueId) return;
        setDueActionLoadingId(dueId);
        setDuesError(null);
        setDuesNotice(null);
        try {
            await markOwnerDueAsPaid(dueId);
            setPendingDues((current) => current.map((due) => (
                due.id === dueId
                    ? { ...due, status: "claimed" }
                    : due
            )));
            setDuesNotice("Due marked as paid. Operator will confirm settlement.");
        } catch (markError) {
            setDuesError(markError instanceof Error ? markError.message : "Could not mark due as paid.");
        } finally {
            setDueActionLoadingId("");
        }
    }

    async function handleLoadEarnings(event) {
        event.preventDefault();
        if (!user?.uid) {
            setError("Please login first.");
            return;
        }
        const range = getEarningsRange(earningsRange, customFromDate, customToDate);
        if (earningsRange === "custom" && (!range.fromDate || !range.toDate)) {
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
                        <div className="flex items-center gap-3">
                            {commissionPercent != null && (
                                <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                                    Platform commission: {commissionPercent}%
                                </span>
                            )}
                            <Link href="/owner" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                Dashboard
                            </Link>
                        </div>
                    </div>

                    {notices.length > 0 && (
                        <div className="mt-4 flex flex-col gap-2">
                            {notices.map((notice) => (
                                <div key={notice.id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    <div>
                                        <p className="font-semibold">{notice.title}</p>
                                        <p className="mt-0.5 text-xs">{notice.message}</p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void handleDismissNotice(notice.id)}
                                        className="shrink-0 rounded-full border border-amber-300 px-2 py-0.5 text-xs font-semibold hover:bg-amber-100"
                                    >
                                        Dismiss
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

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
                            <option value="all_time">All Time</option>
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
                            Select today, week, month, custom date, or all time and load earnings.
                        </div>
                    ) : (
                        <div className="mt-6 grid gap-4 md:grid-cols-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Received</p>
                                <p className="mt-2 text-3xl font-bold text-emerald-700">{money(summary.paidAmount)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected</p>
                                <p className="mt-2 text-3xl font-bold text-slate-900">{money(summary.expectedEarnings)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending</p>
                                <p className="mt-2 text-3xl font-bold text-amber-600">{money(summary.pendingAmount)}</p>
                            </div>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings</p>
                                <p className="mt-2 text-3xl font-bold text-sky-700">{summary.bookingCount}</p>
                            </div>
                        </div>
                    )}

                    <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <h2 className="text-lg font-semibold text-slate-900">Pending Platform Dues</h2>
                                <p className="mt-1 text-xs text-slate-600">Cash checkout commissions owed to platform.</p>
                            </div>
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                Total: {money(pendingDues.reduce((sum, due) => sum + Number(due.commissionAmountInr ?? 0), 0))}
                            </span>
                        </div>

                        {duesError ? (
                            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{duesError}</div>
                        ) : null}
                        {duesNotice ? (
                            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{duesNotice}</div>
                        ) : null}

                        {duesLoading ? (
                            <div className="mt-4 text-sm text-slate-600">Loading dues...</div>
                        ) : pendingDues.length === 0 ? (
                            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">No pending dues right now.</div>
                        ) : (
                            <div className="mt-4 overflow-x-auto">
                                <table className="min-w-full text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                            <th className="py-2 pr-3">Booking</th>
                                            <th className="py-2 pr-3">Bed Amount</th>
                                            <th className="py-2 pr-3">Commission %</th>
                                            <th className="py-2 pr-3">Due Amount</th>
                                            <th className="py-2 pr-3">Status</th>
                                            <th className="py-2">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pendingDues.map((due) => (
                                            <tr key={due.id} className="border-b border-slate-100 last:border-b-0">
                                                <td className="py-2 pr-3 text-slate-700">{due.bookingId || "-"}</td>
                                                <td className="py-2 pr-3 text-slate-700">{money(due.bedAmount)}</td>
                                                <td className="py-2 pr-3 text-slate-700">{Number(due.commissionPercent ?? 0)}%</td>
                                                <td className="py-2 pr-3 font-semibold text-amber-700">{money(due.commissionAmountInr)}</td>
                                                <td className="py-2 pr-3">
                                                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${String(due.status).toLowerCase() === "claimed" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                                                        {String(due.status).toLowerCase() === "claimed" ? "Claimed" : "Pending"}
                                                    </span>
                                                </td>
                                                <td className="py-2">
                                                    {String(due.status).toLowerCase() === "pending" ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleMarkDuePaid(due.id)}
                                                            disabled={dueActionLoadingId === due.id}
                                                            className="rounded-full border border-indigo-300 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                                                        >
                                                            {dueActionLoadingId === due.id ? "Saving..." : "Mark as Paid"}
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-slate-500">Awaiting operator confirmation</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </section>
            </main>
        </ProtectedRoute>
    );
}
