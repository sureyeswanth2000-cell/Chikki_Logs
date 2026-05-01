"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_DEMAND_SETTINGS,
  getDemandPricingOverview,
  getDemandPricingSettings,
  saveDemandPricingSettings,
  updateDemandOverride,
} from "@/lib/firestore/superadmin";

function settingRowsToText(rows) {
  return rows
    .map((row) => `${Number(row.minOccupancyPercent ?? 0)}:${Number(row.multiplierPercent ?? 0)}`)
    .join("\n");
}

function parseThresholdText(value) {
  const rows = String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [min, increase] = line.split(":").map((part) => Number(part.trim()));
      if (!Number.isFinite(min) || !Number.isFinite(increase)) {
        throw new Error("Use one threshold per line like 90:50.");
      }
      return {
        minOccupancyPercent: min,
        multiplierPercent: increase,
      };
    });
  if (rows.length === 0) {
    throw new Error("At least one threshold row is required.");
  }
  return rows;
}

function DemandRow({ item }) {
  const target = item.scope === "city"
    ? item.cityName || item.cityId || item.scopeId
    : item.propertyName || item.propertyId || item.scopeId;
  return (
    <tr>
      <td className="px-4 py-3 font-semibold text-slate-800">{item.scope}</td>
      <td className="px-4 py-3 text-slate-700">{target || "-"}</td>
      <td className="px-4 py-3 text-slate-700">{Math.round(item.occupancyPercent)}%</td>
      <td className="px-4 py-3 text-slate-700">{item.multiplierPercent}%</td>
      <td className="px-4 py-3">
        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${item.active ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"}`}>
          {item.active ? "High Demand" : item.status || "Inactive"}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">{item.reason || "-"}</td>
    </tr>
  );
}

export function DemandPricingPanel() {
  const [settings, setSettings] = useState(DEFAULT_DEMAND_SETTINGS);
  const [propertyThresholdText, setPropertyThresholdText] = useState(settingRowsToText(DEFAULT_DEMAND_SETTINGS.propertyThresholds));
  const [cityThresholdText, setCityThresholdText] = useState(settingRowsToText(DEFAULT_DEMAND_SETTINGS.cityThresholds));
  const [overview, setOverview] = useState({ pricing: [], overrides: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [notice, setNotice] = useState(null);
  const [error, setError] = useState(null);
  const [overrideForm, setOverrideForm] = useState({
    scope: "city",
    scopeId: "",
    disabled: true,
    reason: "",
  });

  const loadDemand = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [nextSettings, nextOverview] = await Promise.all([
        getDemandPricingSettings(),
        getDemandPricingOverview(),
      ]);
      setSettings(nextSettings);
      setPropertyThresholdText(settingRowsToText(nextSettings.propertyThresholds));
      setCityThresholdText(settingRowsToText(nextSettings.cityThresholds));
      setOverview(nextOverview);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load demand pricing.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDemand();
  }, [loadDemand]);

  async function handleSaveSettings(event) {
    event.preventDefault();
    setSaving(true);
    setNotice(null);
    setError(null);
    try {
      const payload = {
        enabled: settings.enabled,
        emergencyDisabled: settings.emergencyDisabled,
        globalMaxCapPercent: Number(settings.globalMaxCapPercent || 100),
        propertyThresholds: parseThresholdText(propertyThresholdText),
        cityThresholds: parseThresholdText(cityThresholdText),
      };
      const saved = await saveDemandPricingSettings(payload);
      setSettings(saved);
      setPropertyThresholdText(settingRowsToText(saved.propertyThresholds));
      setCityThresholdText(settingRowsToText(saved.cityThresholds));
      setNotice("Demand pricing settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save demand settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleOverride(event) {
    event.preventDefault();
    setOverrideSaving(true);
    setNotice(null);
    setError(null);
    try {
      await updateDemandOverride({
        scope: overrideForm.scope,
        scopeId: overrideForm.scopeId.trim(),
        disabled: overrideForm.disabled,
        reason: overrideForm.reason.trim(),
      });
      setNotice(overrideForm.disabled ? "Demand override disabled this scope." : "Demand override cleared for this scope.");
      setOverrideForm((current) => ({ ...current, scopeId: "", reason: "" }));
      await loadDemand();
    } catch (overrideError) {
      setError(overrideError instanceof Error ? overrideError.message : "Could not update demand override.");
    } finally {
      setOverrideSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Demand Pricing</h2>
          <p className="mt-1 text-sm text-slate-500">Control peak-pricing rules and manual demand overrides.</p>
        </div>
        <button
          type="button"
          onClick={() => void loadDemand()}
          className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{notice}</div>
      ) : null}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading demand controls...</p>
      ) : (
        <>
          <form className="mt-5 grid gap-4" onSubmit={(event) => void handleSaveSettings(event)}>
            <div className="grid gap-4 md:grid-cols-3">
              <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))}
                />
                Enable Demand Pricing
              </label>
              <label className="flex items-center gap-3 rounded-xl border border-rose-200 p-3 text-sm font-semibold text-rose-700">
                <input
                  type="checkbox"
                  checked={settings.emergencyDisabled}
                  onChange={(event) => setSettings((current) => ({ ...current, emergencyDisabled: event.target.checked }))}
                />
                Emergency Disable
              </label>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Global max cap %</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={settings.globalMaxCapPercent}
                  onChange={(event) => setSettings((current) => ({ ...current, globalMaxCapPercent: Number(event.target.value || 0) }))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Property thresholds</label>
                <textarea
                  value={propertyThresholdText}
                  onChange={(event) => setPropertyThresholdText(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">City thresholds</label>
                <textarea
                  value={cityThresholdText}
                  onChange={(event) => setCityThresholdText(event.target.value)}
                  className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-400"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-fit rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Demand Settings"}
            </button>
          </form>

          <form className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={(event) => void handleOverride(event)}>
            <h3 className="font-semibold text-slate-800">Manual Scope Override</h3>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <select
                value={overrideForm.scope}
                onChange={(event) => setOverrideForm((current) => ({ ...current, scope: event.target.value }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                <option value="city">City</option>
                <option value="property">Property</option>
              </select>
              <input
                value={overrideForm.scopeId}
                onChange={(event) => setOverrideForm((current) => ({ ...current, scopeId: event.target.value }))}
                placeholder="cityId or propertyId"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                required
              />
              <select
                value={overrideForm.disabled ? "disabled" : "enabled"}
                onChange={(event) => setOverrideForm((current) => ({ ...current, disabled: event.target.value === "disabled" }))}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
              >
                <option value="disabled">Disable demand</option>
                <option value="enabled">Allow demand</option>
              </select>
              <input
                value={overrideForm.reason}
                onChange={(event) => setOverrideForm((current) => ({ ...current, reason: event.target.value }))}
                placeholder="reason"
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                required={overrideForm.disabled}
              />
            </div>
            <button
              type="submit"
              disabled={overrideSaving}
              className="mt-3 rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {overrideSaving ? "Saving..." : "Save Override"}
            </button>
          </form>

          <div className="mt-6 overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Scope</th>
                  <th className="px-4 py-3 text-left">Target</th>
                  <th className="px-4 py-3 text-left">Occupancy</th>
                  <th className="px-4 py-3 text-left">Increase</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {overview.pricing.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-sm italic text-slate-400">No demand summaries yet.</td>
                  </tr>
                ) : (
                  overview.pricing.slice(0, 12).map((item) => <DemandRow key={item.id} item={item} />)
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
