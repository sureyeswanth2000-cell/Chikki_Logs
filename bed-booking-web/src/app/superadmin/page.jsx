"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { addCity, deleteCity, getCitiesWithOwners, updateCity, searchUserByPhone, promoteUserToOwner, demoteOwnerToConsumer, getOwnerApplications, approveOwnerApplication, rejectOwnerApplication } from "@/lib/firestore/superadmin";

function CityRow({ city, onEdit, onDelete }) {
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
      <td className="py-3 px-4 font-medium text-slate-800">{city.name}</td>
      <td className="py-3 px-4 text-slate-600">{city.state}</td>
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

export default function SuperadminPage() {
  const { profile, signOutUser } = useAuth();
  const [cities, setCities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [editingCity, setEditingCity] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [form, setForm] = useState({ name: "", state: "", active: true });

  // Tab state
  const [activeTab, setActiveTab] = useState("cities");

  // Owners tab state
  const [searchPhone, setSearchPhone] = useState("");
  const [searchResult, setSearchResult] = useState(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchNotice, setSearchNotice] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsNotice, setAppsNotice] = useState(null);

  const loadCities = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCitiesWithOwners();
      setCities(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load cities.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCities();
  }, [loadCities]);

  function startAdd() {
    setEditingCity(null);
    setForm({ name: "", state: "", active: true });
    setShowAddForm(true);
    setError(null);
  }

  function startEdit(city) {
    setEditingCity(city);
    setForm({ name: city.name, state: city.state, active: city.active });
    setShowAddForm(false);
    setError(null);
  }

  function handleCancel() {
    setEditingCity(null);
    setShowAddForm(false);
    setError(null);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.state.trim()) {
      setError("City name and state are required.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (editingCity) {
        await updateCity(editingCity.id, form);
      } else {
        await addCity(form);
      }
      setEditingCity(null);
      setShowAddForm(false);
      await loadCities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(city) {
    if (!window.confirm(`Delete city "${city.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteCity(city.id);
      await loadCities();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSearchOwner(event) {
    event.preventDefault();
    setSearchError(null);
    setSearchNotice(null);
    setSearchResult(null);
    if (!searchPhone.trim()) return;
    setSearchLoading(true);
    try {
      const found = await searchUserByPhone(searchPhone.trim());
      if (!found) {
        setSearchError("No registered user found with that phone number. The user must log in at least once first.");
      } else {
        setSearchResult(found);
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Search failed.");
    } finally {
      setSearchLoading(false);
    }
  }

  async function handlePromoteToOwner(userId) {
    setSearchError(null);
    setSearchNotice(null);
    try {
      await promoteUserToOwner(userId);
      setSearchResult((prev) => prev ? { ...prev, role: "owner" } : prev);
      setSearchNotice("User promoted to Owner successfully.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Promotion failed.");
    }
  }

  async function handleDemoteOwner(userId) {
    if (!window.confirm("Remove owner role from this user?")) return;
    setSearchError(null);
    setSearchNotice(null);
    try {
      await demoteOwnerToConsumer(userId);
      setSearchResult((prev) => prev ? { ...prev, role: "consumer" } : prev);
      setSearchNotice("User role changed to Consumer.");
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Demotion failed.");
    }
  }

  async function loadApplications() {
    setAppsLoading(true);
    setAppsNotice(null);
    try {
      const data = await getOwnerApplications();
      setApplications(data);
    } catch (e) {
      setAppsNotice("Could not load applications.");
    } finally {
      setAppsLoading(false);
    }
  }

  async function handleApproveApplication(app) {
    if (!app.userId) {
      setAppsNotice("Application missing userId — cannot approve.");
      return;
    }
    try {
      await approveOwnerApplication(app.id, app.userId);
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
      setAppsNotice(`Approved — ${app.businessName} is now an Owner.`);
    } catch (e) {
      setAppsNotice(e instanceof Error ? e.message : "Approval failed.");
    }
  }

  async function handleRejectApplication(app) {
    if (!window.confirm(`Reject application from "${app.businessName}"?`)) return;
    try {
      await rejectOwnerApplication(app.id);
      setApplications((prev) => prev.filter((a) => a.id !== app.id));
    } catch (e) {
      setAppsNotice(e instanceof Error ? e.message : "Rejection failed.");
    }
  }

  return (
    <ProtectedRoute allowedRoles={["superadmin"]}>
      <main className="mx-auto max-w-5xl px-5 py-10 md:px-6 md:py-12">
        <div className="glass-card animate-rise flex items-center justify-between gap-3 rounded-2xl p-6">
          <div>
            <h1 className="text-3xl font-bold">Superadmin Dashboard</h1>
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

        {/* Tab navigation */}
        <div className="mt-6 flex gap-2 border-b border-slate-200">
          <button
            type="button"
            onClick={() => setActiveTab("cities")}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === "cities"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Cities
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab("owners"); void loadApplications(); }}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
              activeTab === "owners"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            Owners
          </button>
        </div>

        {/* CITIES TAB */}
        {activeTab === "cities" && (
          <div className="mt-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Cities</h2>
              <button
                type="button"
                onClick={startAdd}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition"
          >
            + Add City
          </button>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {(showAddForm || editingCity) && (
          <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
            <h3 className="mb-3 font-semibold text-indigo-800">
              {editingCity ? `Edit: ${editingCity.name}` : "Add New City"}
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">City Name</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Kavali"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">State</label>
                <input
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.state}
                  onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
                  placeholder="e.g. Andhra Pradesh"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Status</label>
                <select
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  value={form.active ? "active" : "inactive"}
                  onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === "active" }))}
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60 transition"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-slate-500">Loading cities...</p>
        ) : (
          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white">
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
                {cities.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-sm italic text-slate-400">
                      No cities found. Click &quot;+ Add City&quot; to create one.
                    </td>
                  </tr>
                )}
                {cities.map((city) => (
                  <CityRow key={city.id} city={city} onEdit={startEdit} onDelete={(c) => void handleDelete(c)} />
                ))}
              </tbody>
            </table>
          </div>
        )}
          </div>
        )}

        {/* OWNERS TAB */}
        {activeTab === "owners" && (
          <div className="mt-6 space-y-8">

            {/* Search & Promote */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <h2 className="text-lg font-bold text-slate-800">Search & Promote User to Owner</h2>
              <p className="mt-1 text-sm text-slate-500">
                The user must have logged in at least once. Search by their registered phone number.
              </p>

              {searchError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {searchError}
                </div>
              )}
              {searchNotice && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                  {searchNotice}
                </div>
              )}

              <form className="mt-4 flex gap-3" onSubmit={(e) => void handleSearchOwner(e)}>
                <input
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="+91XXXXXXXXXX or 10-digit number"
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  required
                />
                <button
                  type="submit"
                  disabled={searchLoading}
                  className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                >
                  {searchLoading ? "Searching..." : "Search"}
                </button>
              </form>

              {searchResult && (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <p className="font-semibold text-slate-800">{searchResult.name || "(No name)"}</p>
                  <p className="text-sm text-slate-600">{searchResult.phoneNumber}</p>
                  <p className="text-sm text-slate-600">
                    Current role:{" "}
                    <span className={`font-semibold ${searchResult.role === "owner" ? "text-emerald-700" : "text-slate-700"}`}>
                      {searchResult.role}
                    </span>
                  </p>
                  <div className="mt-3 flex gap-2">
                    {searchResult.role !== "owner" ? (
                      <button
                        type="button"
                        onClick={() => void handlePromoteToOwner(searchResult.id)}
                        className="rounded-full bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700"
                      >
                        Promote to Owner
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleDemoteOwner(searchResult.id)}
                        className="rounded-full border border-rose-300 px-4 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50"
                      >
                        Remove Owner Role
                      </button>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* Owner Applications */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">Owner Applications</h2>
                <button
                  type="button"
                  onClick={() => void loadApplications()}
                  className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Refresh
                </button>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Users who applied via &quot;Apply as Owner&quot; form.
              </p>

              {appsNotice && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  {appsNotice}
                </div>
              )}

              {appsLoading ? (
                <p className="mt-4 text-sm text-slate-500">Loading applications...</p>
              ) : applications.length === 0 ? (
                <p className="mt-4 text-sm italic text-slate-400">No pending applications.</p>
              ) : (
                <div className="mt-4 space-y-3">
                  {applications.map((app) => (
                    <div key={app.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold text-slate-800">{app.businessName}</p>
                          <p className="text-sm text-slate-600">Phone: {app.phone}</p>
                          <p className="text-sm text-slate-600">City: {app.cityName}</p>
                          <p className="text-sm text-slate-600">Address: {app.propertyAddress}</p>
                          {app.description && (
                            <p className="mt-1 text-sm text-slate-500 italic">&quot;{app.description}&quot;</p>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => void handleApproveApplication(app)}
                            className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleRejectApplication(app)}
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
          </div>
        )}
      </main>
    </ProtectedRoute>
  );
}
