"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DemandPricingPanel } from "@/components/admin/demand-pricing-panel";
import { useAuth } from "@/context/auth-context";
import {
  addCity,
  approveOwnerApplication,
  getCitiesWithOwners,
  getDashboardMetrics,
  getOwnerApplications,
  getPlatformSettings,
  searchUserByPhone,
  setCityScarcityMode,
  updateCity,
  updateManagedUserRole,
  updatePlatformSettings,
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
  const [ownerRevenueSharePercent, setOwnerRevenueSharePercent] = useState(10);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchNotice, setSearchNotice] = useState(null);
  const [searchError, setSearchError] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsNotice, setAppsNotice] = useState(null);
  const [cities, setCities] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const [citiesNotice, setCitiesNotice] = useState(null);
  const [citySavingId, setCitySavingId] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCity, setEditingCity] = useState(null);
  const [cityForm, setCityForm] = useState({ name: "", state: "" });
  const [cityFormError, setCityFormError] = useState(null);
  const [savingCity, setSavingCity] = useState(false);
  const [checkInGraceMinutes, setCheckInGraceMinutes] = useState(15);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [settingsNotice, setSettingsNotice] = useState(null);

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

  const loadCities = useCallback(async () => {
    setCitiesLoading(true);
    setCitiesNotice(null);
    try {
      const data = await getCitiesWithOwners();
      setCities(data);
    } catch {
      setCitiesNotice("Could not load city scarcity controls.");
    } finally {
      setCitiesLoading(false);
    }
  }, []);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const settings = await getPlatformSettings();
      setCheckInGraceMinutes(Number(settings?.checkInGraceMinutes ?? 15));
    } catch {
      // default remains 15 — do not block the UI
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadApplications();
    void loadCities();
    void loadSettings();
  }, [loadApplications, loadCities, loadMetrics, loadSettings]);

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await updatePlatformSettings({ checkInGraceMinutes });
      setCheckInGraceMinutes(Number(next?.checkInGraceMinutes ?? 15));
      setSettingsNotice("Platform timeout updated successfully.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not save platform settings.");
    } finally {
      setSettingsSaving(false);
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
      setSelectedRole(found.role === "owner" ? "owner" : "consumer");
      setOwnerRevenueSharePercent(Number(found.ownerRevenueSharePercent ?? 10));
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
      await updateManagedUserRole(
        searchResult.id,
        selectedRole,
        selectedRole === "owner" ? ownerRevenueSharePercent : undefined
      );
      setSearchResult((prev) => (prev ? {
        ...prev,
        role: selectedRole,
        ownerRevenueSharePercent: selectedRole === "owner" ? ownerRevenueSharePercent : prev.ownerRevenueSharePercent,
      } : prev));
      setSearchNotice(`Role updated to ${selectedRole}.`);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Role update failed.");
    }
  }

  async function handleApproveApplication(application) {
    setAppsNotice(null);
    try {
      const enteredPercent = window.prompt(
        `Enter agreed revenue share % for ${application.businessName}`,
        String(application.agreedOwnerRevenueSharePercent ?? 10)
      );
      if (enteredPercent === null) {
        return;
      }
      const agreedPercent = Math.max(0, Math.min(100, Number(enteredPercent)));
      if (Number.isNaN(agreedPercent)) {
        setAppsNotice("Enter a valid revenue share percentage between 0 and 100.");
        return;
      }
      await approveOwnerApplication(application.id, application.userId, agreedPercent);
      setApplications((prev) => prev.filter((item) => item.id !== application.id));
      setAppsNotice(`${application.businessName} was approved with ${agreedPercent}% owner revenue share.`);
    } catch (error) {
      setAppsNotice(error instanceof Error ? error.message : "Approval failed.");
    }
  }

  function startAddCity() {
    setEditingCity(null);
    setShowAddForm(true);
    setCityForm({ name: "", state: "" });
    setCityFormError(null);
  }

  function startEditCity(city) {
    setEditingCity(city);
    setShowAddForm(false);
    setCityForm({ name: city.name, state: city.state });
    setCityFormError(null);
  }

  async function handleSaveCity() {
    if (!cityForm.name.trim() || !cityForm.state.trim()) {
      setCityFormError("City name and state are required.");
      return;
    }
    const duplicate = cities.find(
      (c) =>
        c.name.trim().toLowerCase() === cityForm.name.trim().toLowerCase() &&
        c.state.trim().toLowerCase() === cityForm.state.trim().toLowerCase() &&
        c.id !== editingCity?.id
    );
    if (duplicate) {
      setCityFormError(`"${cityForm.name.trim()}, ${cityForm.state.trim()}" already exists.`);
      return;
    }
    setSavingCity(true);
    setCityFormError(null);
    try {
      if (editingCity) {
        await updateCity(editingCity.id, { ...cityForm, active: editingCity.active });
      } else {
        await addCity({ ...cityForm, active: true });
      }
      setEditingCity(null);
      setShowAddForm(false);
      setCityForm({ name: "", state: "" });
      await loadCities();
    } catch (error) {
      setCityFormError(error instanceof Error ? error.message : "Could not save city.");
    } finally {
      setSavingCity(false);
    }
  }

  async function handleDisableCity(city) {
    const label = city.active ? "disable" : "re-enable";
    if (!confirm(`${label === "disable" ? "Disable" : "Re-enable"} "${city.name}"?`)) return;
    try {
      await updateCity(city.id, { name: city.name, state: city.state, active: !city.active });
      await loadCities();
    } catch (error) {
      setCitiesNotice(error instanceof Error ? error.message : "Could not update city status.");
    }
  }

  async function handleToggleScarcity(city) {
    setCitiesNotice(null);
    setCitySavingId(city.id);
    try {
      const result = await setCityScarcityMode({
        cityId: city.id,
        enabled: !city.scarcityEnabled,
      });
      setCities((prev) =>
        prev.map((item) =>
          item.id === city.id
            ? {
                ...item,
                scarcityEnabled: result.scarcityEnabled,
                scarcityValue: result.scarcityValue,
                scarcityUpdatedAtMs: Date.now(),
              }
            : item
        )
      );
      setCitiesNotice(
        result.scarcityEnabled
          ? `${city.name}: safe scarcity enabled.`
          : `${city.name}: safe scarcity disabled.`
      );
    } catch (error) {
      setCitiesNotice(error instanceof Error ? error.message : "Could not update scarcity mode.");
    } finally {
      setCitySavingId("");
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
                {selectedRole === "owner" ? (
                  <div className="mt-3 max-w-xs">
                    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Owner Revenue Share %
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={ownerRevenueSharePercent}
                      onChange={(event) => setOwnerRevenueSharePercent(Number(event.target.value || 0))}
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                    />
                  </div>
                ) : null}
            </div>
          ) : null}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Platform Settings</h2>
          <p className="mt-1 text-sm text-slate-500">
            Control the no-check-in auto-cancel grace period. This directly affects when a confirmed booking gets auto-cancelled if the guest never checks in.
          </p>

          {settingsError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {settingsError}
            </div>
          ) : null}
          {settingsNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {settingsNotice}
            </div>
          ) : null}

          {settingsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading platform settings...</p>
          ) : (
            <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={(event) => void handleSaveSettings(event)}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Check-in grace timeout (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={120}
                  value={checkInGraceMinutes}
                  onChange={(event) => setCheckInGraceMinutes(Number(event.target.value || 15))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <button
                type="submit"
                disabled={settingsSaving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {settingsSaving ? "Saving..." : "Save Timeout"}
              </button>
            </form>
          )}
        </section>

        <div className="mt-8">
          <DemandPricingPanel />
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">City Management</h2>
              <p className="mt-1 text-sm text-slate-500">Add, edit, or disable cities. New cities default to active. All changes are audit-logged.</p>
            </div>
            <button
              type="button"
              onClick={startAddCity}
              className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
            >
              + Add City
            </button>
          </div>

          {cityFormError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {cityFormError}
            </div>
          ) : null}

          {(showAddForm || editingCity) ? (
            <div className="mt-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <h3 className="mb-3 font-semibold text-indigo-800">
                {editingCity ? `Edit ${editingCity.name}` : "Add New City"}
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
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
                  onClick={() => { setEditingCity(null); setShowAddForm(false); setCityFormError(null); }}
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
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cities.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-sm italic text-slate-400">No cities found yet.</td>
                    </tr>
                  ) : (
                    cities.map((city) => (
                      <tr key={city.id}>
                        <td className="py-3 px-4 font-medium text-slate-800">{city.name}</td>
                        <td className="py-3 px-4 text-slate-600">{city.state}</td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${city.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {city.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-3 px-4 flex gap-2">
                          <button
                            type="button"
                            onClick={() => startEditCity(city)}
                            className="rounded px-3 py-1 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDisableCity(city)}
                            className={`rounded px-3 py-1 text-xs font-semibold ring-1 ${city.active ? "text-rose-700 ring-rose-200 hover:bg-rose-50" : "text-emerald-700 ring-emerald-200 hover:bg-emerald-50"}`}
                          >
                            {city.active ? "Disable" : "Enable"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Safe Scarcity Control</h2>
              <p className="mt-1 text-sm text-slate-500">
                Operator can enable city-level scarcity mode. Consumer view shows up to a safe range and never above real availability.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadCities()}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh Cities
            </button>
          </div>

          {citiesNotice ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              {citiesNotice}
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
                    <th className="px-4 py-3 text-left">Scarcity</th>
                    <th className="px-4 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {cities.map((city) => (
                    <tr key={city.id}>
                      <td className="py-3 px-4 font-medium text-slate-800">{city.name}</td>
                      <td className="py-3 px-4 text-slate-600">{city.state}</td>
                      <td className="py-3 px-4">
                        {city.scarcityEnabled ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            ON (value {city.scarcityValue || 1})
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            OFF
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <button
                          type="button"
                          disabled={citySavingId === city.id}
                          onClick={() => void handleToggleScarcity(city)}
                          className={`rounded px-3 py-1 text-xs font-semibold ring-1 disabled:opacity-60 ${
                            city.scarcityEnabled
                              ? "text-amber-700 ring-amber-200 hover:bg-amber-50"
                              : "text-emerald-700 ring-emerald-200 hover:bg-emerald-50"
                          }`}
                        >
                          {citySavingId === city.id
                            ? "Saving..."
                            : city.scarcityEnabled
                              ? "Disable"
                              : "Enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
                      <p className="text-sm text-slate-600">Proposed Revenue Share: {application.agreedOwnerRevenueSharePercent ?? 10}%</p>
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
