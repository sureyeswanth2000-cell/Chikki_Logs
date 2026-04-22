import pilotCities from "../../../data/pilot-cities.json";
import CitiesTableClient from "./cities-table-client";

export const metadata = {
  title: "Cities | Chikki Beds",
};

export default function CitiesPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 py-10 md:px-6 md:py-12">
      <section className="glass-card animate-rise rounded-2xl p-6 md:p-8">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Cities Table</h1>
            <p className="mt-2 text-sm text-slate-600">
              Available cities for Search Beds.
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
            Total Cities: {pilotCities.length}
          </span>
        </div>
        <CitiesTableClient cities={pilotCities} />
      </section>
    </main>
  );
}
