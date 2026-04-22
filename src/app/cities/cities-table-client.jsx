"use client";

import { useMemo, useState } from "react";

export default function CitiesTableClient({ cities }) {
  const [search, setSearch] = useState("");

  const sortedCities = useMemo(() => {
    return [...cities].sort((a, b) => {
      const byState = a.state.localeCompare(b.state);
      if (byState !== 0) return byState;
      return a.name.localeCompare(b.name);
    });
  }, [cities]);

  const filteredCities = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return sortedCities;
    return sortedCities.filter((city) => {
      return city.name.toLowerCase().includes(term) || city.state.toLowerCase().includes(term);
    });
  }, [search, sortedCities]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-[280px] flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by city or state"
            className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </label>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
          Showing {filteredCities.length} of {sortedCities.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">City</th>
              <th className="px-4 py-3 font-semibold">State</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredCities.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-sm text-slate-500">
                  No cities match your search.
                </td>
              </tr>
            )}
            {filteredCities.map((city) => (
              <tr key={`${city.state}-${city.name}`} className="border-t border-slate-200">
                <td className="px-4 py-3 font-medium text-slate-900">{city.name}</td>
                <td className="px-4 py-3 text-slate-700">{city.state}</td>
                <td className="px-4 py-3">
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-xs font-semibold",
                      city.active
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-600",
                    ].join(" ")}
                  >
                    {city.active ? "Active" : "Inactive"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
