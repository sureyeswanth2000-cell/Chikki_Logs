"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import {
    getOwnerBedBlocks,
    getOwnerBeds,
    getOwnerCheckoutAlerts,
    getOwnerEarningsSummary,
    getOwnerLiveJobs,
    getOwnerUpcomingBookings,
    getOwnerProperties,
    getOwnerRooms,
    toggleBedActive,
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

function DashboardPanel({ id, title, description, defaultOpen = false, children, action }) {
    return (
        <details id={id} className="glass-card rounded-2xl p-0" open={defaultOpen}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
                    {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
                </div>
                <div className="flex items-center gap-3">
                    {action}
                    <span className="rounded-full border border-slate-200 px-2 py-1 text-xs font-bold text-slate-500">v</span>
                </div>
            </summary>
            <div className="border-t border-slate-100 px-5 py-4">
                {children}
            </div>
        </details>
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

export default function OwnerPage() {
    const router = useRouter();
    const { profile, user } = useAuth();
    const [loadingData, setLoadingData] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [properties, setProperties] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [beds, setBeds] = useState([]);
    const [bedBlocks, setBedBlocks] = useState([]);
    const [activeBookings, setActiveBookings] = useState([]);
    const [futureBookings, setFutureBookings] = useState([]);
    const [checkoutAlerts, setCheckoutAlerts] = useState([]);
    const [activeBookingCount, setActiveBookingCount] = useState(0);
    const [earningsRange, setEarningsRange] = useState("today");
    const [customFromDate, setCustomFromDate] = useState(formatDate(new Date()));
    const [customToDate, setCustomToDate] = useState(formatDate(new Date()));
    const [earningsLoading, setEarningsLoading] = useState(false);
    const [earningsLoaded, setEarningsLoaded] = useState(false);
    const [earningsSummary, setEarningsSummary] = useState({
        bookingCount: 0,
        expectedEarnings: 0,
        paidAmount: 0,
        pendingAmount: 0,
    });
    const [searchValue, setSearchValue] = useState("");
    const [searchFocused, setSearchFocused] = useState(false);

    const activeBeds = useMemo(() => beds.filter((item) => item.active), [beds]);
    const blockedBeds = useMemo(() => beds.filter((item) => !item.active), [beds]);
    const pendingProperties = useMemo(() => properties.filter((item) => {
        const status = String(item.status ?? "").toLowerCase();
        return status === "pending" || status === "pending_approval" || status === "approval_pending";
    }), [properties]);

    const searchActions = useMemo(() => [
        { label: "Active bookings", keywords: "active current booking check in", targetId: "active-bookings" },
        { label: "Future bookings", keywords: "future upcoming booking reservation", targetId: "future-bookings" },
        { label: "Checkout pending", keywords: "checkout pending payment alert", targetId: "checkout-pending" },
        { label: "Earnings", keywords: "earn today week month custom revenue", targetId: "earnings" },
        { label: "Block beds", keywords: "block bed inventory status", targetId: "bed-control" },
        { label: "Unblock beds", keywords: "unblock bed inventory status", targetId: "bed-control" },
        { label: "Add property", keywords: "create add property", href: "/owner/beds#add-property" },
        { label: "Add room", keywords: "create add room", href: "/owner/beds#add-room" },
        { label: "Add bed", keywords: "create add bed", href: "/owner/beds#add-bed" },
        { label: "Support", keywords: "help support issue", href: "/support" },
        { label: "Profile", keywords: "profile account phone", href: "/profile" },
    ], []);

    const filteredSearchActions = useMemo(() => {
        const queryText = searchValue.trim().toLowerCase();
        if (!queryText) {
            return searchActions.slice(0, 6);
        }
        return searchActions.filter((item) =>
            `${item.label} ${item.keywords}`.toLowerCase().includes(queryText)
        ).slice(0, 6);
    }, [searchActions, searchValue]);

    const loadOwnerData = useCallback(async () => {
        if (!user?.uid) return;
        setLoadingData(true);
        setError(null);
        try {
            const [propertyItems, roomItems, bedItems, blockItems, liveJobItems, upcomingSummary, alertItems] = await Promise.all([
                getOwnerProperties(user.uid),
                getOwnerRooms(user.uid),
                getOwnerBeds(user.uid),
                getOwnerBedBlocks(user.uid),
                getOwnerLiveJobs(user.uid),
                getOwnerUpcomingBookings(user.uid),
                getOwnerCheckoutAlerts(user.uid),
            ]);
            setProperties(propertyItems);
            setRooms(roomItems);
            setBeds(bedItems);
            setBedBlocks(blockItems);
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

    async function handleLoadEarnings(event) {
        event.preventDefault();
        if (!user?.uid) return;
        const range = getEarningsRange(earningsRange, customFromDate, customToDate);
        if (!range.fromDate || !range.toDate) {
            setError("Choose a valid earnings date range.");
            return;
        }
        setEarningsLoading(true);
        setError(null);
        setNotice(null);
        try {
            const summary = await getOwnerEarningsSummary(user.uid, range);
            setEarningsSummary(summary);
            setEarningsLoaded(true);
        } catch (earningsError) {
            setError(earningsError instanceof Error ? earningsError.message : "Could not load earnings.");
        } finally {
            setEarningsLoading(false);
        }
    }

    async function handleToggleBed(bedId, isActive) {
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            await toggleBedActive(bedId, !isActive);
            setNotice(isActive ? "Bed blocked." : "Bed unblocked.");
            await loadOwnerData();
        } catch (toggleError) {
            setError(toggleError instanceof Error ? toggleError.message : "Could not update bed status.");
        } finally {
            setSaving(false);
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

    function handleSearchAction(item) {
        setSearchValue(item.label);
        setSearchFocused(false);
        if (item.href) {
            router.push(item.href);
            return;
        }
        const target = document.getElementById(item.targetId);
        if (target) {
            target.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function handleSearchSubmit(event) {
        event.preventDefault();
        const firstAction = filteredSearchActions[0];
        if (firstAction) {
            handleSearchAction(firstAction);
        }
    }

    return (
        <ProtectedRoute allowedRoles={["owner"]}>
            <main className="mx-auto max-w-6xl px-5 py-8 md:px-6 md:py-10">
                <section className="glass-card rounded-2xl p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-slate-900">Owner Dashboard</h1>
                            <p className="mt-1 text-sm text-slate-600">Active bookings, bed control, and earnings when you need them.</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link href="/consumer" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                Switch to Consumer Mode
                            </Link>
                            <Link href="/profile" className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                                Profile
                            </Link>
                        </div>
                    </div>

                    <form className="relative mt-5 grid gap-2 md:grid-cols-[minmax(0,1fr)_140px]" onSubmit={handleSearchSubmit}>
                        <input
                            value={searchValue}
                            onChange={(event) => setSearchValue(event.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            placeholder="Search owner actions, like add bed, block bed, earnings..."
                            className="h-11 rounded-xl border border-slate-300 bg-white px-4 text-sm outline-none transition focus:border-sky-500"
                        />
                        <button type="submit" className="shine-button h-11 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-700">
                            Search
                        </button>
                        {searchFocused ? (
                            <div className="absolute left-0 right-0 top-12 z-20 rounded-xl border border-slate-200 bg-white p-2 shadow-xl md:right-36">
                                {filteredSearchActions.length === 0 ? (
                                    <p className="px-3 py-2 text-sm text-slate-500">No suggestions found.</p>
                                ) : filteredSearchActions.map((item) => (
                                    <button
                                        key={item.label}
                                        type="button"
                                        onMouseDown={(event) => event.preventDefault()}
                                        onClick={() => handleSearchAction(item)}
                                        className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        ) : null}
                    </form>
                </section>

                {error ? (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                ) : null}
                {notice ? (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        {notice}
                    </div>
                ) : null}

                <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-slate-900">{loadingData ? "-" : activeBookingCount}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Active/Future</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-emerald-600">{loadingData ? "-" : activeBookings.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Checked In</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-amber-600">{loadingData ? "-" : checkoutAlerts.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Checkout Pending</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-sky-700">{loadingData ? "-" : activeBeds.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Available Beds</p>
                    </div>
                    <div className="glass-card rounded-xl p-4">
                        <p className="text-2xl font-bold text-rose-600">{loadingData ? "-" : blockedBeds.length}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Blocked Beds</p>
                    </div>
                </section>

                <div className="mt-5 grid gap-5">
                    <DashboardPanel
                        id="active-bookings"
                        title="Active Bookings"
                        description="Show this first: consumers who are currently checked in or occupying beds."
                        defaultOpen
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading active bookings...</p>
                        ) : (
                            <BookingsTable items={activeBookings} emptyText="No active bookings right now." onCopyBookingId={handleCopyBookingId} />
                        )}
                    </DashboardPanel>

                    <DashboardPanel
                        id="future-bookings"
                        title="Future Bookings"
                        description="Upcoming bookings after the current active work."
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading future bookings...</p>
                        ) : (
                            <BookingsTable items={futureBookings} emptyText="No future bookings." onCopyBookingId={handleCopyBookingId} />
                        )}
                    </DashboardPanel>

                    <DashboardPanel
                        id="checkout-pending"
                        title="Checkout Pending"
                        description="Bookings where checkout/payment attention is needed."
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading checkout pending...</p>
                        ) : (
                            <BookingsTable items={checkoutAlerts} emptyText="No checkout pending alerts." onCopyBookingId={handleCopyBookingId} />
                        )}
                    </DashboardPanel>

                    <DashboardPanel
                        id="earnings"
                        title="Earnings"
                        description="Load only the period you need so the dashboard stays light."
                        defaultOpen
                    >
                        <form className="grid gap-3 md:grid-cols-[180px_1fr_1fr_160px]" onSubmit={handleLoadEarnings}>
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
                                {earningsLoading ? "Loading..." : "Show Earnings"}
                            </button>
                        </form>

                        {!earningsLoaded ? (
                            <p className="mt-4 text-sm text-slate-500">Choose a period and click Show Earnings.</p>
                        ) : (
                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Expected Earnings</p>
                                    <p className="mt-1 text-2xl font-bold text-slate-900">{money(earningsSummary.expectedEarnings)}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid/Settled</p>
                                    <p className="mt-1 text-2xl font-bold text-emerald-700">{money(earningsSummary.paidAmount)}</p>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings</p>
                                    <p className="mt-1 text-2xl font-bold text-sky-700">{earningsSummary.bookingCount}</p>
                                </div>
                            </div>
                        )}
                    </DashboardPanel>

                    <DashboardPanel
                        id="bed-control"
                        title="Inventory And Bed Control"
                        description="Block or unblock beds directly from the inventory list."
                        defaultOpen
                        action={<Link href="/owner/beds" className="hidden rounded-full border border-sky-300 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 sm:inline-block">Add Inventory</Link>}
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading beds...</p>
                        ) : beds.length === 0 ? (
                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                                No beds yet. <Link href="/owner/beds" className="font-semibold text-sky-700 underline">Add beds</Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                                            <th className="pb-2 text-left font-semibold">Bed</th>
                                            <th className="pb-2 text-left font-semibold">Property</th>
                                            <th className="pb-2 text-left font-semibold">Room</th>
                                            <th className="pb-2 text-left font-semibold">Price</th>
                                            <th className="pb-2 text-left font-semibold">Status</th>
                                            <th className="pb-2 text-left font-semibold">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {beds.map((bed) => {
                                            const property = properties.find((item) => item.id === bed.propertyId);
                                            const room = rooms.find((item) => item.id === bed.roomId);
                                            const activeBlocks = bedBlocks.filter((item) => item.bedId === bed.id);
                                            return (
                                                <tr key={bed.id}>
                                                    <td className="py-2 font-semibold text-slate-800">{bed.bedCode}</td>
                                                    <td className="py-2 text-slate-600">{property?.name ?? "-"}</td>
                                                    <td className="py-2 text-slate-600">{room?.roomName ?? "-"}</td>
                                                    <td className="py-2 text-slate-600">H {money(bed.hourlyPrice)} / ON {money(bed.overnightPrice)}</td>
                                                    <td className="py-2">
                                                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${bed.active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                                                            {bed.active ? "Available" : "Blocked"}
                                                        </span>
                                                        {activeBlocks.length > 0 ? <span className="ml-2 text-xs text-slate-500">{activeBlocks.length} scheduled</span> : null}
                                                    </td>
                                                    <td className="py-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => void handleToggleBed(bed.id, bed.active)}
                                                            disabled={saving}
                                                            className={`rounded-full border px-3 py-1 text-xs font-semibold transition disabled:opacity-60 ${bed.active ? "border-rose-300 text-rose-700 hover:bg-rose-50" : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"}`}
                                                        >
                                                            {bed.active ? "Block" : "Unblock"}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                            <Link href="/owner/beds#add-property" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add Property</Link>
                            <Link href="/owner/beds#add-room" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add Room</Link>
                            <Link href="/owner/beds#add-bed" className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Add Bed</Link>
                            <Link href="/owner/beds" className="rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-700">Add All</Link>
                        </div>
                    </DashboardPanel>

                    <DashboardPanel
                        id="pending-properties"
                        title="Properties Pending Approval"
                        description="New properties should be approved by operator or superadmin before listing."
                    >
                        {loadingData ? (
                            <p className="text-sm text-slate-500">Loading properties...</p>
                        ) : pendingProperties.length === 0 ? (
                            <p className="text-sm text-slate-500">No pending properties right now.</p>
                        ) : (
                            <ul className="grid gap-3 sm:grid-cols-2">
                                {pendingProperties.map((property) => (
                                    <li key={property.id} className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                                        <p className="font-semibold text-slate-900">{property.name}</p>
                                        <p className="mt-1 text-sm text-slate-600">{property.cityName || "-"} - {property.exactAddress || "-"}</p>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </DashboardPanel>

                    <DashboardPanel
                        id="inventory-details"
                        title="Property, Room, And Bed Details"
                        description="Collapsed by default so the dashboard stays light."
                    >
                        <div className="grid gap-4 lg:grid-cols-2">
                            <div>
                                <h3 className="font-semibold text-slate-900">Properties</h3>
                                <ul className="mt-3 grid gap-2">
                                    {properties.map((property) => (
                                        <li key={property.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                            <p className="font-semibold text-slate-900">{property.name}</p>
                                            <p className="text-sm text-slate-500">{property.cityName || "-"} - {property.status || "active"}</p>
                                        </li>
                                    ))}
                                    {properties.length === 0 ? <li className="text-sm text-slate-500">No properties yet.</li> : null}
                                </ul>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-900">Rooms</h3>
                                <ul className="mt-3 grid gap-2">
                                    {rooms.map((room) => {
                                        const property = properties.find((item) => item.id === room.propertyId);
                                        return (
                                            <li key={room.id} className="rounded-xl border border-slate-200 bg-white p-3">
                                                <p className="font-semibold text-slate-900">{room.roomName}</p>
                                                <p className="text-sm text-slate-500">{property?.name ?? "-"} - {room.totalBeds} beds</p>
                                            </li>
                                        );
                                    })}
                                    {rooms.length === 0 ? <li className="text-sm text-slate-500">No rooms yet.</li> : null}
                                </ul>
                            </div>
                        </div>
                    </DashboardPanel>
                </div>
            </main>
        </ProtectedRoute>
    );
}
