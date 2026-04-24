"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/context/auth-context";
import {
  approveOwnerApplication,
  getDashboardMetrics,
  getOwnerApplications,
  searchUserByPhone,
  updateManagedUserRole,
} from "@/lib/firestore/superadmin";

const operatorRoleOptions = [
  { value: "consumer", label: "Consumer" },
  { value: "owner", label: "Owner" },
];

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

export default function OperatorPage() {
  const { profile, signOutUser } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [selectedRole, setSelectedRole] = useState("consumer");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNotice, setSearchNotice] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsNotice, setAppsNotice] = useState(null);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      const nextMetrics = await getDashboardMetrics();
      setMetrics(nextMetrics);
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadApplications = useCallback(async () => {
    setAppsLoading(true);
    setAppsNotice(null);
    try {
      const data = await getOwnerApplications();
      setApplications(data);
    } catch {
      setAppsNotice("Could not load owner applications.");
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadApplications();
  }, [loadApplications, loadMetrics]);

  async function handleSearch(event) {
    event.preventDefault();
    setSearchLoading(true);
    setSearchError(null);
    setSearchNotice(null);
    setSearchResult(null);

    try {
      const found = await searchUserByPhone(searchPhone.trim());
      if (!found) {
        setSearchError("No registered user found for that phone number.");
        return;
      }
      setSearchResult(found);
      setSelectedRole(found.role === "owner" ? "owner" : "consumer");
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSaveRole() {
    if (!searchResult) return;
    setSearchError(null);
    setSearchNotice(null);

    try {
      await updateManagedUserRole(searchResult.id, selectedRole);
      setSearchResult((prev) => (prev ? { ...prev, role: selectedRole } : prev));
      setSearchNotice(`Role updated to ${selectedRole}.`);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Role update failed.");
    }
  }

  async function handleApproveApplication(application) {
    setAppsNotice(null);
    try {
      await approveOwnerApplication(application.id, application.userId);
      setApplications((prev) => prev.filter((item) => item.id !== application.id));
      setAppsNotice(`${application.businessName} was approved and moved to owner.`);
    } catch (error) {
      setAppsNotice(error instanceof Error ? error.message : "Approval failed.");
    }
  }

  return (
    <ProtectedRoute allowedRoles={["operator"]}>
      <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
        <div className="glass-card animate-rise flex items-center justify-between gap-3 rounded-2xl p-6">
          <div>
            <h1 className="text-3xl font-bold">Operator Console</h1>
            <p className="mt-2 text-xs text-slate-500">Logged in as role: {profile?.role ?? "unknown"}</p>
          </div>
          <button
            type="button"
            onClick={() => signOutUser()}
            className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Sign Out
          </button>
        </div>

        <section className="mt-6">
          <h2 className="text-lg font-bold text-slate-800">Operational Snapshot</h2>
          {metricsLoading ? (
            <p className="mt-3 text-sm text-slate-500">Loading operational metrics...</p>
          ) : metrics ? (
            <div className="mt-4 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
              <MetricCard label="Bookings Today" value={metrics.bookingsToday} />
              <MetricCard label="Gross Today" value={`INR ${metrics.grossCollectionToday}`} />
              <MetricCard label="Commission" value={`INR ${metrics.commissionToday}`} />
              <MetricCard label="Active Properties" value={metrics.activeProperties} />
              <MetricCard label="Active Owners" value={metrics.activeOwners} />
              <MetricCard label="Payment Success" value={`${metrics.paymentSuccessRate}%`} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Metrics are currently unavailable.</p>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Consumer / Owner Role Swap</h2>
          <p className="mt-1 text-sm text-slate-500">
            Operator can review users and switch only between consumer and owner.
          </p>

          {searchError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {searchError}
            </div>
          ) : null}
          {searchNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {searchNotice}
            </div>
          ) : null}

          <form className="mt-4 flex flex-col gap-3 md:flex-row" onSubmit={(event) => void handleSearch(event)}>
            <input
              value={searchPhone}
              onChange={(event) => setSearchPhone(event.target.value)}
              placeholder="+91XXXXXXXXXX or 10-digit number"
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              required
            />
            <button
              type="submit"
              disabled={searchLoading}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {searchLoading ? "Searching..." : "Search User"}
            </button>
          </form>

          {searchResult ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-800">{searchResult.name || "(No name)"}</p>
              <p className="text-sm text-slate-600">{searchResult.phoneNumber}</p>
              <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current Role
                  </label>
                  <p className="rounded-lg bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200">
                    {searchResult.role}
                  </p>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Change To
                  </label>
                  <select
                    value={selectedRole}
                    onChange={(event) => setSelectedRole(event.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  >
                    {operatorRoleOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => void handleSaveRole()}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Save Role
                </button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Pending Owner Applications</h2>
              <p className="mt-1 text-sm text-slate-500">
                Operator can review applications and approve genuine owners into the platform.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadApplications()}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {appsNotice ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              {appsNotice}
            </div>
          ) : null}

          {appsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading applications...</p>
          ) : applications.length === 0 ? (
            <p className="mt-4 text-sm italic text-slate-400">No pending owner applications right now.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {applications.map((application) => (
                <div key={application.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-800">{application.businessName}</p>
                      <p className="text-sm text-slate-600">Phone: {application.phone}</p>
                      <p className="text-sm text-slate-600">City: {application.cityName}</p>
                      <p className="text-sm text-slate-600">Address: {application.propertyAddress}</p>
                      {application.description ? (
                        <p className="mt-1 text-sm italic text-slate-500">&quot;{application.description}&quot;</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleApproveApplication(application)}
                      className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                    >
                      Approve To Owner
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </ProtectedRoute>
  );
}
