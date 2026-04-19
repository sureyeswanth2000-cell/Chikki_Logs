"use client";

import { useState } from "react";
import { useAuth } from "@/context/auth-context";
import { getConsumerBookingHistory } from "@/lib/firestore/consumer";
import { getOwnerBookingHistory } from "@/lib/firestore/owner";

function formatDate(value) {
  return value.toISOString().slice(0, 10);
}

function getDateRange(rangeKey) {
  const now = new Date();
  const toDate = formatDate(now);
  const from = new Date(now);

  if (rangeKey === "1w") {
    from.setDate(from.getDate() - 6);
  } else if (rangeKey === "1m") {
    from.setDate(from.getDate() - 29);
  }

  return {
    fromDate: formatDate(from),
    toDate,
  };
}

export default function HistoryPage() {
  const { user, profile } = useAuth();
  const [dateRange, setDateRange] = useState("1d");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [result, setResult] = useState({ total: 0, dailyCounts: [], bookings: [] });
  const isOwnerHistory = profile?.role === "owner";

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

  async function handleLoadHistory(event) {
    event?.preventDefault();
    if (!user?.uid) {
      setError("Please login to view booking history.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { fromDate, toDate } = getDateRange(dateRange);
      const data = isOwnerHistory
        ? await getOwnerBookingHistory(user.uid, { fromDate, toDate })
        : await getConsumerBookingHistory(user.uid, {
            bookingType: "old",
            fromDate,
            toDate,
          });
      setResult(data);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
      <section className="glass-card rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-slate-900">{isOwnerHistory ? "Service History" : "Booking History"}</h1>
        <p className="mt-2 text-sm text-slate-700">
          {isOwnerHistory
            ? "View completed and past bookings for your properties. Date range defaults to the last 1 day."
            : "View your past bookings. Date range defaults to the last 1 day."}
        </p>

        <form className="mt-5 grid gap-3 md:grid-cols-[minmax(0,260px)_220px]" onSubmit={handleLoadHistory}>
          <select
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value)}
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500"
          >
            <option value="1d">Last 1 Day</option>
            <option value="1w">Last 1 Week</option>
            <option value="1m">Last 1 Month</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
          >
            {loading ? "Loading..." : "Get Booking History"}
          </button>
        </form>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {notice && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {notice}
          </div>
        )}

        {!loaded ? (
          <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-600">
            History not loaded yet. Choose filter options and click &quot;Get Booking History&quot;.
          </div>
        ) : (
          <>
            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">Total Booking Count By Day</h2>
              <p className="mt-1 text-sm text-slate-600">Total filtered bookings: {result.total}</p>

              {result.dailyCounts.length === 0 ? (
                <p className="mt-3 text-sm text-slate-500">No bookings found for selected filters.</p>
              ) : (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                  {result.dailyCounts.map((item) => (
                    <div key={item.day} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                      <p className="font-semibold text-slate-800">{item.day}</p>
                      <p className="text-slate-600">{item.count} booking(s)</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">
              <h2 className="text-lg font-semibold text-slate-900">Booking Details</h2>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-700">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Booking ID</th>
                      <th className="px-3 py-2 font-semibold">Property</th>
                      {isOwnerHistory && <th className="px-3 py-2 font-semibold">Room</th>}
                      {isOwnerHistory && <th className="px-3 py-2 font-semibold">Bed</th>}
                      <th className="px-3 py-2 font-semibold">Check-In</th>
                      <th className="px-3 py-2 font-semibold">Check-Out</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-3 py-2 font-semibold">City</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.bookings.length === 0 && (
                      <tr>
                        <td colSpan={isOwnerHistory ? 8 : 6} className="px-3 py-4 text-center text-slate-500">
                          No booking details found.
                        </td>
                      </tr>
                    )}
                    {result.bookings.map((item) => (
                      <tr key={item.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-mono text-xs text-slate-700">
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
                        <td className="px-3 py-2 text-slate-700">{item.propertyName || "-"}</td>
                        {isOwnerHistory && <td className="px-3 py-2 text-slate-700">{item.roomName || "-"}</td>}
                        {isOwnerHistory && <td className="px-3 py-2 text-slate-700">{item.bedCode || "-"}</td>}
                        <td className="px-3 py-2 text-slate-700">{item.checkInAt || "-"}</td>
                        <td className="px-3 py-2 text-slate-700">{item.checkOutAt || "-"}</td>
                        <td className="px-3 py-2 text-slate-700">{item.bookingStatus || "-"}</td>
                        <td className="px-3 py-2 text-slate-700">{item.cityName || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}
