"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DemandPricingPanel } from "@/components/admin/demand-pricing-panel";
import { useAuth } from "@/context/auth-context";
import {
  addCity,
  approvePendingProperty,
  approveOwnerApplication,
  confirmOwnerCommissionDueSettlement,
  dismissOperatorNotice,
  getCitiesWithOwners,
  getDashboardMetrics,
  getOperatorNotices,
  getOwnerApplications,
  getOwnerCommissionDuesForOperator,
  getOwnersForCommissionManagement,
  getOwnersWithBlockStatus,
  getPendingPropertyApprovals,
  getPlatformSettings,
  getRoleChangeHistory,
  rejectPendingProperty,
  runCommissionDuesManual,
  saveOwnerCommissionOverride,
  savePlatformDefaultCommission,
  searchUserByPhone,
  setCityScarcityMode,
  setOwnerBookingBlockOverride,
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
  const [propertyApprovals, setPropertyApprovals] = useState([]);
  const [propertyApprovalsLoading, setPropertyApprovalsLoading] = useState(false);
  const [propertyApprovalsNotice, setPropertyApprovalsNotice] = useState(null);
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
  const [platformFeeInr, setPlatformFeeInr] = useState(9);
  const [futureBookingSurchargePercent, setFutureBookingSurchargePercent] = useState(10);
  const [platformCommissionPercent, setPlatformCommissionPercent] = useState(5);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [settingsNotice, setSettingsNotice] = useState(null);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionError, setCommissionError] = useState(null);
  const [commissionNotice, setCommissionNotice] = useState(null);
  const [ownersList, setOwnersList] = useState([]);
  const [ownersLoading, setOwnersLoading] = useState(false);
  const [ownerOverrideSavingId, setOwnerOverrideSavingId] = useState("");
  const [ownerOverrideValues, setOwnerOverrideValues] = useState({});
  const [ownerOverrideError, setOwnerOverrideError] = useState(null);
  const [ownerOverrideNotice, setOwnerOverrideNotice] = useState(null);
  const [dueRows, setDueRows] = useState([]);
  const [dueLoading, setDueLoading] = useState(false);
  const [dueNotice, setDueNotice] = useState(null);
  const [dueError, setDueError] = useState(null);
  const [confirmDueLoadingId, setConfirmDueLoadingId] = useState("");
  const [operatorNotices, setOperatorNotices] = useState([]);
  const [noticeActionLoadingId, setNoticeActionLoadingId] = useState("");
  const [runDuesNowLoading, setRunDuesNowLoading] = useState(false);

  // Booking block override
  const [blockOwners, setBlockOwners] = useState([]);
  const [blockOwnersLoading, setBlockOwnersLoading] = useState(false);
  const [blockOwnersError, setBlockOwnersError] = useState(null);
  const [blockOwnersNotice, setBlockOwnersNotice] = useState(null);
  const [blockSavingId, setBlockSavingId] = useState("");

  // Role-change history
  const [roleChanges, setRoleChanges] = useState([]);
  const [roleChangesLoading, setRoleChangesLoading] = useState(false);

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

  const loadPropertyApprovals = useCallback(async () => {
    setPropertyApprovalsLoading(true);
    setPropertyApprovalsNotice(null);
    try {
      const data = await getPendingPropertyApprovals();
      setPropertyApprovals(data);
    } catch {
      setPropertyApprovalsNotice("Could not load pending property approvals.");
    } finally {
      setPropertyApprovalsLoading(false);
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
      setPlatformFeeInr(Number(settings?.platformFeeInr ?? 9));
      setFutureBookingSurchargePercent(Number(settings?.futureBookingSurchargePercent ?? 10));
      setPlatformCommissionPercent(Number(settings?.platformCommissionPercent ?? 5));
    } catch {
      // default remains — do not block the UI
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadOwnersList = useCallback(async () => {
    setOwnersLoading(true);
    try {
      const owners = await getOwnersForCommissionManagement();
      setOwnersList(owners);
      const initValues = {};
      owners.forEach((o) => {
        initValues[o.id] = o.ownerRevenueSharePercent !== null ? String(o.ownerRevenueSharePercent) : "";
      });
      setOwnerOverrideValues(initValues);
    } catch {
      setOwnersList([]);
    } finally {
      setOwnersLoading(false);
    }
  }, []);

  const loadOwnerDues = useCallback(async () => {
    setDueLoading(true);
    setDueError(null);
    try {
      const rows = await getOwnerCommissionDuesForOperator();
      setDueRows(rows);
    } catch {
      setDueError("Could not load owner commission dues.");
    } finally {
      setDueLoading(false);
    }
  }, []);

  const loadOperatorNotices = useCallback(async () => {
    try {
      const rows = await getOperatorNotices();
      setOperatorNotices(rows);
    } catch {
      setOperatorNotices([]);
    }
  }, []);

  const loadBlockOwners = useCallback(async () => {
    setBlockOwnersLoading(true);
    setBlockOwnersError(null);
    try {
      const rows = await getOwnersWithBlockStatus();
      setBlockOwners(rows);
    } catch {
      setBlockOwnersError("Could not load owner block status.");
    } finally {
      setBlockOwnersLoading(false);
    }
  }, []);

  const loadRoleChanges = useCallback(async () => {
    setRoleChangesLoading(true);
    try {
      const rows = await getRoleChangeHistory(30);
      setRoleChanges(rows);
    } catch {
      setRoleChanges([]);
    } finally {
      setRoleChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadApplications();
    void loadPropertyApprovals();
    void loadCities();
    void loadSettings();
    void loadOwnerDues();
    void loadOperatorNotices();
    void loadOwnersList();
    void loadBlockOwners();
    void loadRoleChanges();
  }, [loadApplications, loadPropertyApprovals, loadCities, loadMetrics, loadSettings, loadOwnerDues, loadOperatorNotices, loadOwnersList, loadBlockOwners, loadRoleChanges]);

  async function handleSaveCommission(event) {
    event.preventDefault();
    setCommissionSaving(true);
    setCommissionError(null);
    setCommissionNotice(null);
    try {
      const result = await savePlatformDefaultCommission(platformCommissionPercent);
      setPlatformCommissionPercent(Number(result?.platformCommissionPercent ?? platformCommissionPercent));
      setCommissionNotice(`Platform default commission updated to ${result?.platformCommissionPercent ?? platformCommissionPercent}%.${result?.affectedOwnerCount > 0 ? ` ${result.affectedOwnerCount} owners were bumped to the new default.` : ""}`);
      await loadOwnersList();
    } catch (error) {
      setCommissionError(error instanceof Error ? error.message : "Could not update platform commission.");
    } finally {
      setCommissionSaving(false);
    }
  }

  async function handleSaveOwnerOverride(ownerId, clear = false) {
    setOwnerOverrideSavingId(ownerId);
    setOwnerOverrideError(null);
    setOwnerOverrideNotice(null);
    try {
      const percent = clear ? 0 : Number(ownerOverrideValues[ownerId] ?? "");
      await saveOwnerCommissionOverride(ownerId, percent, clear);
      setOwnersList((prev) => prev.map((o) =>
        o.id === ownerId ? { ...o, ownerRevenueSharePercent: clear ? null : percent } : o
      ));
      if (clear) {
        setOwnerOverrideValues((prev) => ({ ...prev, [ownerId]: "" }));
      }
      setOwnerOverrideNotice(clear ? "Override cleared — owner now uses platform default." : `Commission override set to ${percent}%.`);
    } catch (error) {
      setOwnerOverrideError(error instanceof Error ? error.message : "Could not save override.");
    } finally {
      setOwnerOverrideSavingId("");
    }
  }

  async function handleConfirmDue(dueId) {
    if (!dueId) return;
    setConfirmDueLoadingId(dueId);
    setDueError(null);
    setDueNotice(null);
    try {
      await confirmOwnerCommissionDueSettlement(dueId);
      setDueRows((prev) => prev.filter((item) => item.id !== dueId));
      setDueNotice("Commission due settlement confirmed.");
    } catch (error) {
      setDueError(error instanceof Error ? error.message : "Could not confirm settlement.");
    } finally {
      setConfirmDueLoadingId("");
    }
  }

  async function handleDismissOperatorNotice(noticeId) {
    if (!noticeId) return;
    setNoticeActionLoadingId(noticeId);
    try {
      await dismissOperatorNotice(noticeId);
      setOperatorNotices((prev) => prev.filter((item) => item.id !== noticeId));
    } finally {
      setNoticeActionLoadingId("");
    }
  }

  async function handleRunDuesNow() {
    setRunDuesNowLoading(true);
    setDueError(null);
    setDueNotice(null);
    try {
      const result = await runCommissionDuesManual();
      setDueNotice(`Manual due run completed. New dues created: ${result.created}.`);
      await loadOwnerDues();
      await loadOperatorNotices();
    } catch (error) {
      setDueError(error instanceof Error ? error.message : "Could not run due creation.");
    } finally {
      setRunDuesNowLoading(false);
    }
  }

  async function handleToggleBookingBlock(owner) {
    const nextUnblock = !owner.bookingBlockOverride;
    const reason = nextUnblock
      ? `Manually unblocked by operator`
      : `Block override removed by operator`;
    setBlockSavingId(owner.id);
    setBlockOwnersError(null);
    setBlockOwnersNotice(null);
    try {
      await setOwnerBookingBlockOverride(owner.id, nextUnblock, reason);
      setBlockOwners((prev) =>
        prev.map((o) => o.id === owner.id ? { ...o, bookingBlockOverride: nextUnblock } : o)
      );
      setBlockOwnersNotice(
        nextUnblock
          ? `Bookings unblocked for ${owner.name} — dues check bypassed.`
          : `Block override removed for ${owner.name} — dues check re-enabled.`
      );
    } catch (error) {
      setBlockOwnersError(error instanceof Error ? error.message : "Could not update block status.");
    } finally {
      setBlockSavingId("");
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await updatePlatformSettings({ checkInGraceMinutes, platformFeeInr, futureBookingSurchargePercent });
      setCheckInGraceMinutes(Number(next?.checkInGraceMinutes ?? 15));
      setPlatformFeeInr(Number(next?.platformFeeInr ?? 9));
      setFutureBookingSurchargePercent(Number(next?.futureBookingSurchargePercent ?? 10));
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

    if (searchResult.role === selectedRole) {
      setSearchNotice("No change needed. User already has this role.");
      return;
    }

    const userLabel = searchResult.name || searchResult.phoneNumber || "this user";
    const confirmed = window.confirm(
      `Update role for "${userLabel}" from ${String(searchResult.role).toUpperCase()} to ${String(selectedRole).toUpperCase()}?`
    );
    if (!confirmed) return;

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
      setSearchNotice(`Role updated from ${searchResult.role} to ${selectedRole}.`);
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

  async function handleApprovePropertyApproval(item) {
    if (!window.confirm(`Approve property "${item.name}" for listing?`)) {
      return;
    }
    setPropertyApprovalsNotice(null);
    try {
      await approvePendingProperty(item.id);
      setPropertyApprovals((prev) => prev.filter((entry) => entry.id !== item.id));
      setPropertyApprovalsNotice(`Property "${item.name}" approved and moved to active listing.`);
      await loadMetrics();
    } catch (error) {
      setPropertyApprovalsNotice(error instanceof Error ? error.message : "Could not approve property.");
    }
  }

  async function handleRejectPropertyApproval(item) {
    const reason = window.prompt(`Optional rejection reason for "${item.name}"`, "");
    if (reason === null) {
      return;
    }
    setPropertyApprovalsNotice(null);
    try {
      await rejectPendingProperty(item.id, reason.trim());
      setPropertyApprovals((prev) => prev.filter((entry) => entry.id !== item.id));
      setPropertyApprovalsNotice(`Property "${item.name}" was rejected.`);
    } catch (error) {
      setPropertyApprovalsNotice(error instanceof Error ? error.message : "Could not reject property.");
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
              <MetricCard label="Future Today" value={metrics.futureBookingsToday ?? 0} />
              <MetricCard label="Gross Today" value={`INR ${metrics.grossCollectionToday}`} />
              <MetricCard label="Future Gross" value={`INR ${metrics.futureBookingGrossToday ?? 0}`} />
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
            Operator can review users and switch only between consumer and owner. Each change now requires explicit confirmation.
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
            Control no-check-in timeout, fixed platform fee, and the Future Booking surcharge.
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
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Platform Fee (INR per booking)
                </label>
                <input
                  type="number"
                  min={0}
                  max={999}
                  value={platformFeeInr}
                  onChange={(event) => setPlatformFeeInr(Number(event.target.value || 0))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Future Booking Surcharge (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={futureBookingSurchargePercent}
                  onChange={(event) => setFutureBookingSurchargePercent(Number(event.target.value || 0))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <button
                type="submit"
                disabled={settingsSaving}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {settingsSaving ? "Saving..." : "Save Settings"}
              </button>
            </form>
          )}
        </section>

        {/* Platform Default Commission */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Platform Default Commission</h2>
          <p className="mt-1 text-sm text-slate-500">
            The default revenue share % charged to all owners. Owners without a custom override use this rate.
            Raising this will auto-bump any owner currently below the new default.
          </p>

          {commissionError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {commissionError}
            </div>
          ) : null}
          {commissionNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {commissionNotice}
            </div>
          ) : null}

          {settingsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading...</p>
          ) : (
            <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={(event) => void handleSaveCommission(event)}>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Default Commission (%)
                </label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={platformCommissionPercent}
                  onChange={(event) => setPlatformCommissionPercent(Number(event.target.value || 0))}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <button
                type="submit"
                disabled={commissionSaving}
                className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {commissionSaving ? "Saving..." : "Save Commission Default"}
              </button>
            </form>
          )}
        </section>

        {/* Per-Owner Commission Overrides */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Per-Owner Commission Overrides</h2>
          <p className="mt-1 text-sm text-slate-500">
            Set a custom commission % per owner. Leave blank to inherit platform default.
          </p>

          {ownerOverrideError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {ownerOverrideError}
            </div>
          ) : null}
          {ownerOverrideNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {ownerOverrideNotice}
            </div>
          ) : null}

          {ownersLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading owners...</p>
          ) : ownersList.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No owners found.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-4">Owner</th>
                    <th className="pb-2 pr-4">Phone</th>
                    <th className="pb-2 pr-4">Current Rate</th>
                    <th className="pb-2 pr-4">Override %</th>
                    <th className="pb-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {ownersList.map((owner) => (
                    <tr key={owner.id} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-slate-800">{owner.name || "—"}</td>
                      <td className="py-2 pr-4 text-slate-500">{owner.phone || "—"}</td>
                      <td className="py-2 pr-4">
                        {owner.ownerRevenueSharePercent !== null ? (
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                            {owner.ownerRevenueSharePercent}% (custom)
                          </span>
                        ) : (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            {platformCommissionPercent}% (default)
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-4">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          placeholder={String(platformCommissionPercent)}
                          value={ownerOverrideValues[owner.id] ?? ""}
                          onChange={(event) => setOwnerOverrideValues((prev) => ({ ...prev, [owner.id]: event.target.value }))}
                          className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
                        />
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleSaveOwnerOverride(owner.id, false)}
                            disabled={ownerOverrideSavingId === owner.id || ownerOverrideValues[owner.id] === ""}
                            className="rounded-full bg-indigo-600 px-3 py-1 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                          >
                            {ownerOverrideSavingId === owner.id ? "Saving..." : "Set"}
                          </button>
                          {owner.ownerRevenueSharePercent !== null ? (
                            <button
                              type="button"
                              onClick={() => void handleSaveOwnerOverride(owner.id, true)}
                              disabled={ownerOverrideSavingId === owner.id}
                              className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="mt-8">
          <DemandPricingPanel />
        </div>

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Owner Commission Dues</h2>
              <p className="mt-1 text-sm text-slate-500">
                Review owner cash-checkout commission dues and confirm settlements.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleRunDuesNow()}
                disabled={runDuesNowLoading}
                className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60"
              >
                {runDuesNowLoading ? "Running..." : "Run Due Creation Now"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void loadOwnerDues();
                  void loadOperatorNotices();
                }}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh Dues
              </button>
            </div>
          </div>

          {operatorNotices.length > 0 ? (
            <div className="mt-4 space-y-2">
              {operatorNotices.map((notice) => (
                <div key={notice.id} className="flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <div>
                    <p className="font-semibold">{notice.title}</p>
                    <p className="mt-0.5 text-xs">{notice.message}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDismissOperatorNotice(notice.id)}
                    disabled={noticeActionLoadingId === notice.id}
                    className="shrink-0 rounded-full border border-amber-300 px-2 py-0.5 text-xs font-semibold hover:bg-amber-100 disabled:opacity-60"
                  >
                    {noticeActionLoadingId === notice.id ? "Saving..." : "Dismiss"}
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {dueError ? (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              {dueError}
            </div>
          ) : null}
          {dueNotice ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {dueNotice}
            </div>
          ) : null}

          {dueLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading dues...</p>
          ) : dueRows.length === 0 ? (
            <p className="mt-4 text-sm italic text-slate-400">No pending or claimed dues right now.</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl ring-1 ring-slate-200 bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3 text-left">Owner</th>
                    <th className="px-4 py-3 text-left">Booking</th>
                    <th className="px-4 py-3 text-left">Bed Amount</th>
                    <th className="px-4 py-3 text-left">Commission %</th>
                    <th className="px-4 py-3 text-left">Due Amount</th>
                    <th className="px-4 py-3 text-left">Owner Total Pending</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dueRows.map((due) => (
                    <tr key={due.id}>
                      <td className="px-4 py-3 text-slate-700">
                        <p className="font-medium text-slate-800">{due.ownerName || due.ownerId || "-"}</p>
                        <p className="text-xs text-slate-500">{due.ownerPhone || ""}</p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">{due.bookingId || "-"}</td>
                      <td className="px-4 py-3 text-slate-700">INR {Math.round(Number(due.bedAmount ?? 0)).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-slate-700">{Number(due.commissionPercent ?? 0)}%</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">INR {Math.round(Number(due.commissionAmountInr ?? 0)).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3 text-slate-700">INR {Math.round(Number(due.ownerPendingCommissionInr ?? 0)).toLocaleString("en-IN")}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${String(due.status).toLowerCase() === "claimed" ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"}`}>
                          {String(due.status).toLowerCase() === "claimed" ? "Claimed" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void handleConfirmDue(due.id)}
                          disabled={confirmDueLoadingId === due.id}
                          className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                        >
                          {confirmDueLoadingId === due.id ? "Confirming..." : "Confirm Settlement"}
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

        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Pending Property Approvals</h2>
              <p className="mt-1 text-sm text-slate-500">
                Every new owner property stays pending until operator/superadmin review.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadPropertyApprovals()}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>

          {propertyApprovalsNotice ? (
            <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
              {propertyApprovalsNotice}
            </div>
          ) : null}

          {propertyApprovalsLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading pending properties...</p>
          ) : propertyApprovals.length === 0 ? (
            <p className="mt-4 text-sm italic text-slate-400">No pending property approvals right now.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {propertyApprovals.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-slate-800">{item.name}</p>
                      <p className="text-sm text-slate-600">Owner: {item.ownerName || item.ownerId}</p>
                      <p className="text-sm text-slate-600">Phone: {item.ownerPhone || "—"}</p>
                      <p className="text-sm text-slate-600">City: {item.cityName || "Unknown city"}</p>
                      <p className="text-sm text-slate-600">Address: {item.exactAddress || "—"}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleApprovePropertyApproval(item)}
                        className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                      >
                        Approve Listing
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRejectPropertyApproval(item)}
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

        {/* Booking Block Override */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Owner Booking Block Override</h2>
          <p className="mt-1 text-sm text-slate-500">
            When an owner has excessive unpaid dues the system auto-blocks new bookings. You can manually
            override the block here. All changes are audit-logged.
          </p>
          {blockOwnersError ? (
            <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{blockOwnersError}</div>
          ) : null}
          {blockOwnersNotice ? (
            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{blockOwnersNotice}</div>
          ) : null}
          {blockOwnersLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading owners…</p>
          ) : blockOwners.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No owners found.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 px-3 text-left">Owner</th>
                    <th className="py-2 px-3 text-left">Phone</th>
                    <th className="py-2 px-3 text-left">Pending Dues (INR)</th>
                    <th className="py-2 px-3 text-left">Block Status</th>
                    <th className="py-2 px-3 text-left">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {blockOwners.map((owner) => (
                    <tr key={owner.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 px-3 font-medium text-slate-800">{owner.name || owner.id}</td>
                      <td className="py-2 px-3 text-slate-600">{owner.phone}</td>
                      <td className="py-2 px-3 text-slate-600">
                        {owner.pendingCommissionInr > 0 ? (
                          <span className="font-semibold text-rose-600">INR {owner.pendingCommissionInr}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {owner.bookingBlockOverride ? (
                          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                            Override Active (Unblocked)
                          </span>
                        ) : owner.pendingCommissionInr > 500 ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">
                            Auto-Blocked
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          type="button"
                          disabled={blockSavingId === owner.id}
                          onClick={() => void handleToggleBookingBlock(owner)}
                          className={`rounded px-3 py-1 text-xs font-semibold ring-1 disabled:opacity-60 ${
                            owner.bookingBlockOverride
                              ? "text-slate-700 ring-slate-300 hover:bg-slate-100"
                              : "text-amber-700 ring-amber-200 hover:bg-amber-50"
                          }`}
                        >
                          {blockSavingId === owner.id
                            ? "Saving…"
                            : owner.bookingBlockOverride
                              ? "Remove Override"
                              : "Unblock Bookings"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Role-Change History */}
        <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-bold text-slate-800">Role-Change History</h2>
          <p className="mt-1 text-sm text-slate-500">Last 30 user role changes (newest first).</p>
          {roleChangesLoading ? (
            <p className="mt-4 text-sm text-slate-500">Loading…</p>
          ) : roleChanges.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No role changes on record.</p>
          ) : (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 px-3 text-left">When</th>
                    <th className="py-2 px-3 text-left">Target User ID</th>
                    <th className="py-2 px-3 text-left">From</th>
                    <th className="py-2 px-3 text-left">To</th>
                    <th className="py-2 px-3 text-left">Actor</th>
                    <th className="py-2 px-3 text-left">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {roleChanges.map((entry) => (
                    <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="py-2 px-3 text-slate-500 whitespace-nowrap">
                        {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-slate-600">{entry.targetUserId}</td>
                      <td className="py-2 px-3">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                          {entry.previousRole || "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3">
                        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">
                          {entry.nextRole || "—"}
                        </span>
                      </td>
                      <td className="py-2 px-3 font-mono text-xs text-slate-500">{entry.actorUserId}</td>
                      <td className="py-2 px-3 text-slate-500">{entry.source || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </ProtectedRoute>
  );
}
