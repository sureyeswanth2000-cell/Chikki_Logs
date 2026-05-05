"use client";

import { useCallback, useEffect, useState } from "react";
import { ProtectedRoute } from "@/components/auth/protected-route";
import { DemandPricingPanel } from "@/components/admin/demand-pricing-panel";
import { useAuth } from "@/context/auth-context";
import {
  addCity,
  approveOwnerApplication,
  getCitiesWithOwners,
  getDailyGrowthOverview,
  getDashboardMetrics,
  getGrowthStats,
  getOwnerApplications,
  getOwnersWithBlockStatus,
  getPlatformSettings,
  getRoleChangeHistory,
  rejectOwnerApplication,
  revealAadhaarForInvestigation,
  savePlatformDefaultCommission,
  searchUserByPhone,
  setCityScarcityMode,
  setOwnerBookingBlockOverride,
  updateCity,
  updateManagedUserRole,
  updatePlatformSettings,
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

function CityRow({ city, onEdit, onDisable, onToggleScarcity, scarcitySavingCityId }) {
  const scarcityActive = Boolean(city.scarcityEnabled);
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
        {scarcityActive ? (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            ON (up to {city.scarcityValue || 1})
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">
            Off
          </span>
        )}
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
          {city.active ? (
            <button
              type="button"
              onClick={() => onDisable(city)}
              className="rounded px-2 py-1 text-xs font-semibold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50"
            >
              Disable
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onDisable(city)}
              className="rounded px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-50"
            >
              Enable
            </button>
          )}
          <button
            type="button"
            disabled={scarcitySavingCityId === city.id}
            onClick={() => onToggleScarcity(city)}
            className={`rounded px-2 py-1 text-xs font-semibold ring-1 disabled:opacity-60 ${
              scarcityActive
                ? "text-amber-700 ring-amber-200 hover:bg-amber-50"
                : "text-emerald-700 ring-emerald-200 hover:bg-emerald-50"
            }`}
          >
            {scarcitySavingCityId === city.id
              ? "Saving..."
              : scarcityActive
                ? "Disable Scarcity"
                : "Enable Scarcity"}
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
  const [ownerRevenueSharePercent, setOwnerRevenueSharePercent] = useState(10);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [searchNotice, setSearchNotice] = useState(null);
  const [applications, setApplications] = useState([]);
  const [appsLoading, setAppsLoading] = useState(false);
  const [appsNotice, setAppsNotice] = useState(null);
  const [checkInGraceMinutes, setCheckInGraceMinutes] = useState(15);
  const [platformFeeInr, setPlatformFeeInr] = useState(9);
  const [platformCommissionPercent, setPlatformCommissionPercent] = useState(5);
  const [commissionSaving, setCommissionSaving] = useState(false);
  const [commissionNotice, setCommissionNotice] = useState(null);
  const [commissionError, setCommissionError] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState(null);
  const [settingsNotice, setSettingsNotice] = useState(null);
  const [globalScarcityDisabled, setGlobalScarcityDisabled] = useState(false);
  const [scarcityKillSaving, setScarcityKillSaving] = useState(false);
  const [scarcitySavingCityId, setScarcitySavingCityId] = useState("");
  const [growthStats, setGrowthStats] = useState(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthError, setGrowthError] = useState(null);
  const [dailyOverview, setDailyOverview] = useState(null);
  const [dailyOverviewLoading, setDailyOverviewLoading] = useState(false);
  const [dailyOverviewError, setDailyOverviewError] = useState(null);
  const [blockOwners, setBlockOwners] = useState([]);
  const [blockOwnersLoading, setBlockOwnersLoading] = useState(false);
  const [blockSavingId, setBlockSavingId] = useState("");
  const [blockNotice, setBlockNotice] = useState(null);
  const [blockError, setBlockError] = useState(null);
  const [roleChanges, setRoleChanges] = useState([]);
  const [roleChangesLoading, setRoleChangesLoading] = useState(false);
  const [identityForm, setIdentityForm] = useState({
    aadhaarRefId: "",
    targetUserId: "",
    bookingId: "",
    reason: "",
  });
  const [identityLoading, setIdentityLoading] = useState(false);
  const [identityError, setIdentityError] = useState(null);
  const [identityResult, setIdentityResult] = useState(null);
  const [identityCountdown, setIdentityCountdown] = useState(0);

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

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setSettingsError(null);
    try {
      const settings = await getPlatformSettings();
      setCheckInGraceMinutes(Number(settings?.checkInGraceMinutes ?? 15));
      setPlatformFeeInr(Number(settings?.platformFeeInr ?? 9));
      setPlatformCommissionPercent(Number(settings?.platformCommissionPercent ?? 5));
      setGlobalScarcityDisabled(Boolean(settings?.globalScarcityDisabled ?? false));
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not load platform settings.");
    } finally {
      setSettingsLoading(false);
    }
  }, []);

  const loadGrowth = useCallback(async () => {
    setGrowthLoading(true);
    setGrowthError(null);
    try {
      setGrowthStats(await getGrowthStats());
    } catch (error) {
      setGrowthError(error instanceof Error ? error.message : "Could not load growth data.");
    } finally {
      setGrowthLoading(false);
    }
  }, []);

  const loadDailyOverview = useCallback(async () => {
    setDailyOverviewLoading(true);
    setDailyOverviewError(null);
    try {
      setDailyOverview(await getDailyGrowthOverview());
    } catch (error) {
      setDailyOverviewError(error instanceof Error ? error.message : "Could not load daily overview.");
    } finally {
      setDailyOverviewLoading(false);
    }
  }, []);

  const loadBlockOwners = useCallback(async () => {
    setBlockOwnersLoading(true);
    try {
      setBlockOwners(await getOwnersWithBlockStatus());
    } catch {
      setBlockOwners([]);
    } finally {
      setBlockOwnersLoading(false);
    }
  }, []);

  const loadRoleChanges = useCallback(async () => {
    setRoleChangesLoading(true);
    try {
      setRoleChanges(await getRoleChangeHistory(50));
    } catch {
      setRoleChanges([]);
    } finally {
      setRoleChangesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMetrics();
    void loadCities();
    void loadApplications();
    void loadSettings();
    void loadGrowth();
    void loadDailyOverview();
    void loadBlockOwners();
    void loadRoleChanges();
  }, [loadApplications, loadCities, loadGrowth, loadMetrics, loadSettings, loadDailyOverview, loadBlockOwners, loadRoleChanges]);

  useEffect(() => {
    if (!identityResult || identityCountdown <= 0) return undefined;
    const timer = window.setTimeout(() => {
      setIdentityCountdown((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [identityCountdown, identityResult]);

  useEffect(() => {
    if (identityResult && identityCountdown === 0) {
      setIdentityResult(null);
    }
  }, [identityCountdown, identityResult]);

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

    // Duplicate check — same name + state (case-insensitive), excluding the city being edited
    const duplicate = cities.find(
      (c) =>
        c.name.trim().toLowerCase() === cityForm.name.trim().toLowerCase() &&
        c.state.trim().toLowerCase() === cityForm.state.trim().toLowerCase() &&
        c.id !== editingCity?.id
    );
    if (duplicate) {
      setCityError(`"${cityForm.name.trim()}, ${cityForm.state.trim()}" already exists.`);
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

  async function handleDisableCity(city) {
    const action = city.active ? "disable" : "enable";
    const message = city.active
      ? `Disable "${city.name}"? It will no longer appear to consumers.`
      : `Enable "${city.name}"? It will become visible to consumers again.`;
    if (!window.confirm(message)) return;

    setSavingCity(true);
    setCityError(null);
    try {
      await updateCity(city.id, { name: city.name, state: city.state, active: !city.active });
      await loadCities();
    } catch (error) {
      setCityError(error instanceof Error ? error.message : `Could not ${action} city.`);
    } finally {
      setSavingCity(false);
    }
  }

  async function handleToggleCityScarcity(city) {
    if (city.scarcityEnabled) {
      const confirmed = window.confirm(
        `Disable safe scarcity for "${city.name}"? Consumers will see the real bed count.`
      );
      if (!confirmed) return;
    }
    setCityError(null);
    setScarcitySavingCityId(city.id);
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
    } catch (error) {
      setCityError(error instanceof Error ? error.message : "Could not update scarcity mode.");
    } finally {
      setScarcitySavingCityId("");
    }
  }

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSettingsSaving(true);
    setSettingsError(null);
    setSettingsNotice(null);
    try {
      const next = await updatePlatformSettings({
        checkInGraceMinutes,
        platformFeeInr,
        globalScarcityDisabled,
      });
      setCheckInGraceMinutes(Number(next?.checkInGraceMinutes ?? 15));
      setPlatformFeeInr(Number(next?.platformFeeInr ?? 9));
      setPlatformCommissionPercent(Number(next?.platformCommissionPercent ?? platformCommissionPercent));
      setGlobalScarcityDisabled(Boolean(next?.globalScarcityDisabled ?? false));
      setSettingsNotice("Platform timeout updated successfully.");
    } catch (error) {
      setSettingsError(error instanceof Error ? error.message : "Could not save platform settings.");
    } finally {
      setSettingsSaving(false);
    }
  }

  async function handleSaveCommission(event) {
    event.preventDefault();
    setCommissionSaving(true);
    setCommissionError(null);
    setCommissionNotice(null);
    try {
      const result = await savePlatformDefaultCommission(platformCommissionPercent);
      setPlatformCommissionPercent(Number(result?.platformCommissionPercent ?? platformCommissionPercent));
      const affected = result?.affectedOwnerCount ?? 0;
      setCommissionNotice(
        affected > 0
          ? `Commission updated to ${result.platformCommissionPercent}%. ${affected} owner(s) were bumped up and notified.`
          : `Commission default updated to ${result.platformCommissionPercent}%. No owners were affected.`
      );
    } catch (error) {
      setCommissionError(error instanceof Error ? error.message : "Could not update commission.");
    } finally {
      setCommissionSaving(false);
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

    // Extra confirmation when granting elevated access
    if (selectedRole === "operator" || selectedRole === "superadmin") {
      const displayName = searchResult.name || searchResult.phoneNumber || "this user";
      const accessDescription =
        selectedRole === "operator"
          ? "Operators can manage all bookings, override owner blocks, settle commissions, and see platform financials across every city."
          : "Superadmins have unrestricted platform access including identity break-glass, role changes, and billing controls.";
      const confirmed = window.confirm(
        `Promote "${displayName}" to ${selectedRole.toUpperCase()}?\n\n${accessDescription}\n\nThis grants significant platform access. Proceed only if you are certain.`
      );
      if (!confirmed) return;
    }

    try {
      const result = await updateManagedUserRole(
        searchResult.id,
        selectedRole,
        selectedRole === "owner" ? ownerRevenueSharePercent : undefined
      );
      setSearchResult((prev) => (prev ? {
        ...prev,
        role: selectedRole,
        ownerRevenueSharePercent: selectedRole === "owner" ? ownerRevenueSharePercent : prev.ownerRevenueSharePercent,
      } : prev));
      if (result?.changed === false) {
        setSearchNotice("Role was already set to that value.");
      } else {
        setSearchNotice(`Role updated from ${result?.previousRole ?? searchResult.role} to ${selectedRole}.`);
      }
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : "Role update failed.");
    }
  }

  async function handleRevealAadhaar(event) {
    event.preventDefault();
    setIdentityError(null);
    setIdentityResult(null);
    setIdentityCountdown(0);

    const reason = identityForm.reason.trim();
    if (reason.length < 20) {
      setIdentityError("Enter a detailed reason with at least 20 characters.");
      return;
    }
    if (!identityForm.aadhaarRefId.trim() && !identityForm.targetUserId.trim() && !identityForm.bookingId.trim()) {
      setIdentityError("Enter Aadhaar reference ID, target user ID, or booking ID.");
      return;
    }

    setIdentityLoading(true);
    try {
      const result = await revealAadhaarForInvestigation({
        aadhaarRefId: identityForm.aadhaarRefId.trim(),
        targetUserId: identityForm.targetUserId.trim(),
        bookingId: identityForm.bookingId.trim(),
        reason,
      });
      setIdentityResult(result);
      setIdentityCountdown(Number(result?.revealExpiresInSeconds ?? 60));
    } catch (error) {
      setIdentityError(error instanceof Error ? error.message : "Could not reveal Aadhaar.");
    } finally {
      setIdentityLoading(false);
    }
  }

  function fillIdentityFromSearchResult() {
    if (!searchResult) return;
    setIdentityForm((current) => ({
      ...current,
      aadhaarRefId: searchResult.aadhaarRefId || current.aadhaarRefId,
      targetUserId: searchResult.id || current.targetUserId,
    }));
    setActiveTab("identity");
  }

  async function handleApproveApplication(application) {
    if (!window.confirm(`Approve "${application.businessName}" and promote them to Owner?`)) {
      return;
    }
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
      setApplications((prev) =>
        prev.map((item) =>
          item.id === application.id
            ? { ...item, _status: "approved", agreedOwnerRevenueSharePercent: agreedPercent }
            : item
        )
      );
      setAppsNotice(`${application.businessName} was approved and promoted to Owner with ${agreedPercent}% revenue share.`);
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
      setApplications((prev) =>
        prev.map((item) =>
          item.id === application.id ? { ...item, _status: "rejected" } : item
        )
      );
      setAppsNotice(`${application.businessName} was rejected.`);
    } catch (error) {
      setAppsNotice(error instanceof Error ? error.message : "Rejection failed.");
    }
  }

  async function handleToggleBookingBlock(owner) {
    const nextUnblock = !owner.bookingBlockOverride;
    setBlockSavingId(owner.id);
    setBlockError(null);
    setBlockNotice(null);
    try {
      await setOwnerBookingBlockOverride(owner.id, nextUnblock, nextUnblock ? "Manually unblocked by superadmin" : "Block override removed by superadmin");
      setBlockOwners((prev) =>
        prev.map((o) => o.id === owner.id ? { ...o, bookingBlockOverride: nextUnblock } : o)
      );
      setBlockNotice(nextUnblock ? `Bookings unblocked for ${owner.name}.` : `Block override removed for ${owner.name}.`);
    } catch (error) {
      setBlockError(error instanceof Error ? error.message : "Could not update block status.");
    } finally {
      setBlockSavingId("");
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
            { id: "growth", label: "Growth" },
            { id: "settings", label: "Platform Settings" },
            { id: "demand", label: "Demand Pricing" },
            { id: "roles", label: "Role Control" },
            { id: "identity", label: "Identity Access" },
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

        {activeTab === "growth" ? (
          <section className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Growth Dashboard</h2>
                <p className="mt-1 text-sm text-slate-500">7-day booking trend and all-time city breakdown.</p>
              </div>
              <button
                type="button"
                onClick={() => void loadGrowth()}
                className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>

            {growthError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{growthError}</div>
            ) : null}

            {growthLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading growth data...</p>
            ) : growthStats ? (
              <>
                {/* 7-day trend */}
                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-500">Bookings — Last 7 Days</h3>
                  {(() => {
                    const maxBookings = Math.max(...growthStats.dailyTrend.map((d) => d.bookings), 1);
                    return (
                      <div className="flex items-end gap-2 h-36">
                        {growthStats.dailyTrend.map((day) => {
                          const pct = Math.round((day.bookings / maxBookings) * 100);
                          const label = new Date(day.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric" });
                          return (
                            <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                              <span className="text-xs font-semibold text-slate-700">{day.bookings || ""}</span>
                              <div className="w-full flex items-end" style={{ height: "80px" }}>
                                <div
                                  className="w-full rounded-t-md bg-indigo-500 transition-all"
                                  style={{ height: `${pct}%`, minHeight: day.bookings ? "4px" : "2px", opacity: day.bookings ? 1 : 0.15 }}
                                />
                              </div>
                              <span className="text-[10px] text-slate-400 text-center leading-tight">{label}</span>
                              {day.gross > 0 ? (
                                <span className="text-[10px] text-emerald-600 font-medium">₹{day.gross}</span>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* City breakdown */}
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">All-Time City Breakdown</h3>
                  {growthStats.cityBreakdown.length === 0 ? (
                    <p className="text-sm italic text-slate-400">No booking data yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-4 py-3 text-left">#</th>
                            <th className="px-4 py-3 text-left">City</th>
                            <th className="px-4 py-3 text-right">Total Bookings</th>
                            <th className="px-4 py-3 text-right">Gross Revenue (INR)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {growthStats.cityBreakdown.map((city, index) => (
                            <tr key={city.name} className="hover:bg-slate-50">
                              <td className="px-4 py-3 text-slate-400 font-medium">{index + 1}</td>
                              <td className="px-4 py-3 font-medium text-slate-800">{city.name}</td>
                              <td className="px-4 py-3 text-right text-slate-700">{city.bookings}</td>
                              <td className="px-4 py-3 text-right text-emerald-700 font-semibold">
                                {city.gross > 0 ? `₹${city.gross.toLocaleString("en-IN")}` : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <p className="mt-4 text-sm italic text-slate-400">No growth data available yet.</p>
            )}
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">Platform Settings</h2>
            <p className="mt-1 text-sm text-slate-500">
              Only superadmin can change no-check-in timeout and fixed platform fee (charged once per booking at checkout).
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
            ) : null}
            <form className="mt-4 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleSaveSettings}>
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
              <button
                type="submit"
                disabled={settingsSaving || settingsLoading}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {settingsSaving ? "Saving..." : "Save Settings"}
              </button>
            </form>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-bold text-slate-800">Platform Default Commission</h3>
              <p className="mt-1 text-xs text-slate-500">
                Owners without a custom commission will use this default. If you increase it, all owners below the new default are bumped up and notified.
              </p>
              {commissionError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{commissionError}</div>
              )}
              {commissionNotice && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{commissionNotice}</div>
              )}
              <form className="mt-3 flex flex-col gap-3 md:flex-row md:items-end" onSubmit={handleSaveCommission}>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Default Commission % (0–100)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={platformCommissionPercent}
                    onChange={(event) => setPlatformCommissionPercent(Number(event.target.value || 0))}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                  />
                </div>
                <button
                  type="submit"
                  disabled={commissionSaving || settingsLoading}
                  className="rounded-full bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-60"
                >
                  {commissionSaving ? "Saving..." : "Update Commission"}
                </button>
              </form>
            </div>

            <div className="mt-6 border-t border-slate-200 pt-5">
              <h3 className="text-sm font-bold text-slate-800">Global Scarcity Emergency Off Switch</h3>
              <p className="mt-1 text-xs text-slate-500">
                When enabled, the 15-minute scarcity refresh job is suppressed globally — all cities will stop receiving fake bed count updates until you turn this off.
              </p>
              <div className="mt-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={async () => {
                    const next = !globalScarcityDisabled;
                    const label = next ? "DISABLE all scarcity globally" : "Re-enable scarcity globally";
                    const warning = next
                      ? "This will immediately stop scarcity refresh for ALL cities. Consumers will see real bed counts next time scarcity refreshes."
                      : "Scarcity refresh will resume on the next 15-minute schedule.";
                    if (!window.confirm(`${label}?\n\n${warning}`)) return;
                    setScarcityKillSaving(true);
                    setSettingsError(null);
                    setSettingsNotice(null);
                    try {
                      const result = await updatePlatformSettings({
                        checkInGraceMinutes,
                        platformFeeInr,
                        globalScarcityDisabled: next,
                      });
                      setGlobalScarcityDisabled(Boolean(result?.globalScarcityDisabled ?? next));
                      setSettingsNotice(next ? "Scarcity mode globally disabled." : "Scarcity mode re-enabled.");
                    } catch (error) {
                      setSettingsError(error instanceof Error ? error.message : "Could not update scarcity kill switch.");
                    } finally {
                      setScarcityKillSaving(false);
                    }
                  }}
                  disabled={scarcityKillSaving || settingsLoading}
                  className={[
                    "rounded-full px-4 py-2 text-sm font-semibold transition disabled:opacity-60",
                    globalScarcityDisabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "bg-rose-600 text-white hover:bg-rose-700",
                  ].join(" ")}
                >
                  {scarcityKillSaving
                    ? "Saving..."
                    : globalScarcityDisabled
                    ? "Re-Enable Scarcity"
                    : "Disable All Scarcity"}
                </button>
                <span className={["text-sm font-semibold", globalScarcityDisabled ? "text-rose-600" : "text-emerald-600"].join(" ")}>
                  {globalScarcityDisabled ? "⚠ Scarcity globally OFF" : "✓ Scarcity globally ON"}
                </span>
              </div>
            </div>
          </section>
        ) : null}

        {activeTab === "demand" ? (
          <div className="mt-6">
            <DemandPricingPanel />
          </div>
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
                      disabled={searchResult.role === "superadmin"}
                    />
                  </div>
                ) : null}
                {searchResult.role === "superadmin" ? (
                  <p className="mt-3 text-sm text-amber-700">
                    Existing superadmin accounts are locked from UI changes and must be edited only from the database side.
                  </p>
                ) : null}
                {searchResult.aadhaarRefId ? (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <p className="text-sm font-semibold text-amber-800">
                      Aadhaar reference: {searchResult.aadhaarRefId}
                    </p>
                    <p className="mt-1 text-xs text-amber-700">
                      Masked display: XXXX XXXX {searchResult.aadhaarLast4 || "----"} | Status: {searchResult.aadhaarStatus || "submitted"}
                    </p>
                    <button
                      type="button"
                      onClick={fillIdentityFromSearchResult}
                      className="mt-3 rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      Open Break-Glass Form
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {activeTab === "identity" ? (
          <section className="mt-6 rounded-2xl border border-amber-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">Identity Break-Glass Access</h2>
            <p className="mt-1 text-sm text-slate-500">
              Reveal full Aadhaar only for legal, security, fraud, or serious support cases. Every reveal is permanently audited.
            </p>

            {identityError ? (
              <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {identityError}
              </div>
            ) : null}

            <form className="mt-4 grid gap-3" onSubmit={(event) => void handleRevealAadhaar(event)}>
              <div className="grid gap-3 md:grid-cols-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Aadhaar Ref ID
                  </label>
                  <input
                    value={identityForm.aadhaarRefId}
                    onChange={(event) => setIdentityForm((current) => ({ ...current, aadhaarRefId: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
                    placeholder="uuid reference"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Target User ID
                  </label>
                  <input
                    value={identityForm.targetUserId}
                    onChange={(event) => setIdentityForm((current) => ({ ...current, targetUserId: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
                    placeholder="Firebase UID"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Booking ID
                  </label>
                  <input
                    value={identityForm.bookingId}
                    onChange={(event) => setIdentityForm((current) => ({ ...current, bookingId: event.target.value }))}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
                    placeholder="booking document id"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Reason
                </label>
                <textarea
                  value={identityForm.reason}
                  onChange={(event) => setIdentityForm((current) => ({ ...current, reason: event.target.value }))}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-amber-400"
                  placeholder="Example: Police complaint verification for booking incident..."
                  required
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={identityLoading}
                  className="rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                >
                  {identityLoading ? "Revealing..." : "Reveal Aadhaar"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIdentityResult(null);
                    setIdentityCountdown(0);
                  }}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Clear Reveal
                </button>
              </div>
            </form>

            {identityResult ? (
              <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-800">
                  Break-glass reveal active for {identityCountdown}s
                </p>
                <p className="mt-3 font-mono text-2xl font-bold tracking-widest text-slate-900">
                  {identityResult.aadhaar}
                </p>
                <p className="mt-2 text-xs text-slate-600">
                  Ref: {identityResult.aadhaarRefId} | User: {identityResult.targetUserId || "-"}
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  This reveal has been written to audit logs. Do not copy it into tickets, chats, notes, or other records.
                </p>
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
                      <th className="px-4 py-3 text-left">Scarcity</th>
                      <th className="px-4 py-3 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {cities.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-sm italic text-slate-400">
                          No cities found yet.
                        </td>
                      </tr>
                    ) : (
                      cities.map((city) => (
                        <CityRow
                          key={city.id}
                          city={city}
                          onEdit={startEditCity}
                          onDisable={(targetCity) => void handleDisableCity(targetCity)}
                          onToggleScarcity={(targetCity) => void handleToggleCityScarcity(targetCity)}
                          scarcitySavingCityId={scarcitySavingCityId}
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
                  Superadmin can approve or reject submitted owner applications. Approved applicants are promoted to Owner.
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
                        <p className="text-sm text-slate-600">Proposed Revenue Share: {application.agreedOwnerRevenueSharePercent ?? 10}%</p>
                        {application.description ? (
                          <p className="mt-1 text-sm italic text-slate-500">&quot;{application.description}&quot;</p>
                        ) : null}
                      </div>
                      <div className="flex gap-2">
                        {application._status === "approved" ? (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            ✓ Approved
                          </span>
                        ) : application._status === "rejected" ? (
                          <span className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">
                            ✕ Rejected
                          </span>
                        ) : (
                          <>
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
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {/* Daily Growth Overview */}
        {activeTab === "overview" ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">Daily Growth — Today vs Yesterday</h2>
            {dailyOverviewLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading daily overview…</p>
            ) : dailyOverviewError ? (
              <p className="mt-4 text-sm text-rose-600">{dailyOverviewError}</p>
            ) : dailyOverview ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {(["today", "yesterday"]).map((bucket) => (
                  <div key={bucket} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">
                      {bucket === "today" ? "Today" : "Yesterday"}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <MetricCard label="Bookings" value={dailyOverview[bucket].bookings} />
                      <MetricCard label="Check-ins" value={dailyOverview[bucket].checkIns} />
                      <MetricCard label="Cancellations" value={dailyOverview[bucket].cancellations} />
                      <MetricCard label="Revenue (INR)" value={`₹${dailyOverview[bucket].revenue.toFixed(0)}`} />
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {/* Booking Block Override */}
        {activeTab === "overview" ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">Owner Booking Block Override</h2>
            <p className="mt-1 text-sm text-slate-500">
              Manually override the auto-block for owners with excessive unpaid dues. All changes are audit-logged.
            </p>
            {blockError ? <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{blockError}</div> : null}
            {blockNotice ? <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{blockNotice}</div> : null}
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
                      <th className="py-2 px-3 text-left">Pending Dues</th>
                      <th className="py-2 px-3 text-left">Status</th>
                      <th className="py-2 px-3 text-left">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blockOwners.map((owner) => (
                      <tr key={owner.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-3 font-medium text-slate-800">{owner.name || owner.id}</td>
                        <td className="py-2 px-3 text-slate-600">{owner.phone}</td>
                        <td className="py-2 px-3">
                          {owner.pendingCommissionInr > 0 ? (
                            <span className="font-semibold text-rose-600">₹{owner.pendingCommissionInr}</span>
                          ) : "—"}
                        </td>
                        <td className="py-2 px-3">
                          {owner.bookingBlockOverride ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">Override (Unblocked)</span>
                          ) : owner.pendingCommissionInr > 500 ? (
                            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700">Auto-Blocked</span>
                          ) : (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-500">Normal</span>
                          )}
                        </td>
                        <td className="py-2 px-3">
                          <button
                            type="button"
                            disabled={blockSavingId === owner.id}
                            onClick={() => void handleToggleBookingBlock(owner)}
                            className={`rounded px-3 py-1 text-xs font-semibold ring-1 disabled:opacity-60 ${owner.bookingBlockOverride ? "text-slate-700 ring-slate-300 hover:bg-slate-100" : "text-amber-700 ring-amber-200 hover:bg-amber-50"}`}
                          >
                            {blockSavingId === owner.id ? "Saving…" : owner.bookingBlockOverride ? "Remove Override" : "Unblock Bookings"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}

        {/* Role-Change History */}
        {activeTab === "overview" ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-bold text-slate-800">Role-Change History</h2>
            <p className="mt-1 text-sm text-slate-500">Last 50 user role changes (newest first).</p>
            {roleChangesLoading ? (
              <p className="mt-4 text-sm text-slate-500">Loading…</p>
            ) : roleChanges.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No role changes recorded yet.</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                      <th className="py-2 px-3 text-left">When</th>
                      <th className="py-2 px-3 text-left">Target User</th>
                      <th className="py-2 px-3 text-left">From</th>
                      <th className="py-2 px-3 text-left">To</th>
                      <th className="py-2 px-3 text-left">Actor</th>
                      <th className="py-2 px-3 text-left">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roleChanges.map((entry) => (
                      <tr key={entry.id} className="border-b border-slate-50 hover:bg-slate-50">
                        <td className="py-2 px-3 text-slate-500 whitespace-nowrap text-xs">
                          {entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-slate-600">{entry.targetUserId}</td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">{entry.previousRole || "—"}</span>
                        </td>
                        <td className="py-2 px-3">
                          <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-700">{entry.nextRole || "—"}</span>
                        </td>
                        <td className="py-2 px-3 font-mono text-xs text-slate-500">{entry.actorUserId}</td>
                        <td className="py-2 px-3 text-slate-500 text-xs">{entry.source || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        ) : null}
      </main>
    </ProtectedRoute>
  );
}
