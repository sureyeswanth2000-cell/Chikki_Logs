"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { useAuth } from "@/context/auth-context";
import {
  addCity,
  approveOwnerApplication,
  deleteCity,
  getCitiesWithOwners,
  getDashboardMetrics,
  getOwnerApplications,
  rejectOwnerApplication,
  searchUserByPhone,
  updateCity,
  updateManagedUserRole,
} from "@/lib/firestore/superadmin";

const superadminRoleOptions = [
  { value: "consumer", label: "Consumer" },
  { value: "owner", label: "Owner" },
  { value: "operator", label: "Operator" },
  { value: "superadmin", label: "Superadmin" },
];

function MetricCard({ label, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-3 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function CityRow({ city, onEdit, onDelete }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 px-4 font-medium text-slate-800">{city.name}</td>
      <td className="py-3 px-4 text-slate-600">{city.state}</td>
      <td className="py-3 px-4 text-slate-600">{city.ownerCount}</td>
      <td className="py-3 px-4">
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
            city.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {city.active ? "Active" : "Inactive"}
        </span>
      </td>
      <td className="py-3 px-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onEdit(city)}
            className="rounded px-2 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-300 hover:bg-slate-100"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onDelete(city)}
            className="rounded px-2 py-1 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
          >
            Delete
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function InternalControlPage() {
  const { profile, signOutUser } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");
  const [metrics, setMetrics] = useState(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [cityError, setCityError] = useState(null);
  const [savingCity, setSavingCity] = useState(false);
  const [editingCity, setEditingCity] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [cityForm, setCityForm] = useState({ name: "", state: "", active: true });
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [selectedRole, setSelectedRole] = useState("consumer");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchNotice, setSearchNotice] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsNotice, setAppsNotice] = useState(null);

  const loadMetrics = useCallback(async () => {
    setMetricsLoading(true);
    try {
      setMetrics(await getDashboardMetrics());
    } catch {
      setMetrics(null);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadCities = useCallback(async () => {
    setCitiesLoading(true);
    setCityError(null);
    try {
      setCities(await getCitiesWithOwners());
    } catch (error) {
      setCityError(error instanceof Error ? error.message : "Could not load cities.");
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  const loadApplications = useCallback(async () => {
    setAppsLoading(true);
    setAppsNotice(null);
    try {
      setApplications(await getOwnerApplications());
    } catch {
      setAppsNotice("Could not load applications.");
    } finally {
      setAppsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadCities();
    void loadApplications();
  }, [loadApplications, loadCities, loadMetrics]);

  function startAddCity() {
    setEditingCity(null);
    setShowAddForm(true);
    setCityForm({ name: "", state: "", active: true });
    setCityError(null);
  }

  function startEditCity(city) {
    setEditingCity(city);
    setShowAddForm(false);
    setCityForm({ name: city.name, state: city.state, active: city.active });
    setCityError(null);
  }

  async function handleSaveCity() {
    if (!cityForm.name.trim() || !cityForm.state.trim()) {
      setCityError("City name and state are required.");
      return;
    }

    setSavingCity(true);
    setCityError(null);
    try {
      if (editingCity) {
        await updateCity(editingCity.id, cityForm);
      } else {
        await addCity(cityForm);
      }
      setEditingCity(null);
      setShowAddForm(false);
      setCityForm({ name: "", state: "", active: true });
      await loadCities();
    } catch (error) {
      setCityError(error instanceof Error ? error.message : "Could not save city.");
    } finally {
      setSavingCity(false);
    }
  }

  async function handleDeleteCity(city) {
    if (!window.confirm(`Delete city "${city.name}"? This cannot be undone.`)) {
      return;
    }

    setSavingCity(true);
    setCityError(null);
    try {
      await deleteCity(city.id);
      await loadCities();
    } catch (error) {
      setCityError(error instanceof Error ? error.message : "Could not delete city.");
    } finally {
      setSavingCity(false);
    }
  }

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
      setSelectedRole(found.role);
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
      const result = await updateManagedUserRole(searchResult.id, selectedRole);
      setSearchResult((prev) => (prev ? { ...prev, role: selectedRole } : prev));
      if (result?.changed === false) {
        setSearchNotice("Role was already set to that value.");
      } else {
        setSearchNotice(`Role updated from ${result?.previousRole ?? searchResult.role} to ${selectedRole}.`);
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Role update failed.");
    }
  }

  async function handleApproveApplication(application) {
    if (!window.confirm(`Approve "${application.businessName}" and promote them to Owner?`)) {
      return;
    }
    setAppsNotice(null);
    try {
      await approveOwnerApplication(application.id, application.userId);
      setApplications((prev) => prev.filter((item) => item.id !== application.id));
      setAppsNotice(`${application.businessName} was approved and promoted to Owner.`);
    } catch (error) {
      setAppsNotice(error instanceof Error ? error.message : "Approval failed.");
    }
  }

  async function handleRejectApplication(application) {
    if (!window.confirm(`Reject application from "${application.businessName}"?`)) {
      return;
    }
    setAppsNotice(null);
    try {
      await rejectOwnerApplication(application.id);
      setApplications((prev) => prev.filter((item) => item.id !== application.id));
      setAppsNotice(`${application.businessName} was rejected.`);
    } catch (error) {
      setAppsNotice(error instanceof Error ? error.message : "Rejection failed.");
    }
  }

  return (
    <ProtectedRoute allowedRoles={["superadmin"]}>
      <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
        <div className="glass-card animate-rise flex items-center justify-between gap-3 rounded-2xl p-6">
          <div>
            <h1 className="text-3xl font-bold">Internal Control</h1>
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

        <div className="mt-6 flex flex-wrap gap-2 border-b border-slate-200">
          {[
            { id: "overview", label: "Overview" },
            { id: "roles", label: "Role Control" },
            { id: "cities", label: "Cities" },
            { id: "applications", label: "Applications" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
                activeTab === tab.id
                  ? "border-indigo-600 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" ? (
          <section className="mt-6">
            <h2 className="text-lg font-bold text-slate-800">Platform Snapshot</h2>
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
        ) : null}

        {activeTab === "roles" ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">Role Control</h2>
            <p className="mt-1 text-sm text-slate-500">
              Superadmin can create operator and superadmin roles, but existing superadmin accounts remain locked from UI changes.
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
                      disabled={searchResult.role === "superadmin"}
                    >
                      {superadminRoleOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleSaveRole()}
                    disabled={searchResult.role === "superadmin"}
                    className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Save Role
                  </button>
                </div>
                {searchResult.role === "superadmin" ? (
                  <p className="mt-3 text-sm text-amber-700">
                    Existing superadmin accounts are locked from UI changes and must be edited only from the database side.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "cities" ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">City Control</h2>
                <p className="mt-1 text-sm text-slate-500">
                  City changes are restricted to superadmin and each change is recorded in audit logs.
                </p>
              </div>
              <button
                type="button"
                onClick={startAddCity}
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
              >
                + Add City
              </button>
            </div>

            {cityError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {cityError}
              </div>
            ) : null}

            {(showAddForm || editingCity) ? (
              <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                <h3 className="mb-3 font-semibold text-indigo-800">
                  {editingCity ? `Edit ${editingCity.name}` : "Add New City"}
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">City Name</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={cityForm.name}
                      onChange={(event) => setCityForm((current) => ({ ...current, name: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">State</label>
                    <input
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={cityForm.state}
                      onChange={(event) => setCityForm((current) => ({ ...current, state: event.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
                    <select
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      value={cityForm.active ? "active" : "inactive"}
                      onChange={(event) => setCityForm((current) => ({ ...current, active: event.target.value === "active" }))}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={savingCity}
                    onClick={() => void handleSaveCity()}
                    className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition"
                  >
                    {savingCity ? "Saving..." : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCity(null);
                      setShowAddForm(false);
                      setCityError(null);
                    }}
                    className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            {citiesLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading cities...</p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left">City</th>
                      <th className="px-4 py-3 text-left">State</th>
                      <th className="px-4 py-3 text-left">Owners</th>
                      <th className="px-4 py-3 text-left">Status</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cities.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-6 text-center text-sm italic text-slate-400">
                          No cities found yet.
                        </td>
                      </tr>
                    ) : (
                      cities.map((city) => (
                        <CityRow
                          key={city.id}
                          city={city}
                          onEdit={startEditCity}
                          onDelete={(targetCity) => void handleDeleteCity(targetCity)}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "applications" ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Owner Applications</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Superadmin can review submitted owner applications and reject those that do not meet standards.
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
              <p className="mt-4 text-sm italic text-slate-400">No pending applications right now.</p>
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
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleApproveApplication(application)}
                          className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleRejectApplication(application)}
                          className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </main>
    </ProtectedRoute>
  );
}
