"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { getActiveCities } from "@/lib/firestore/consumer";

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [cities, setCities] = useState([]);
  const [cityId, setCityId] = useState("");
  const [detectingLocation, setDetectingLocation] = useState(false);
  const [locationNotice, setLocationNotice] = useState("");

  useEffect(() => {
    async function loadCities() {
      try {
        const items = await getActiveCities();
        setCities(items);
      } catch {
        setCities([]);
      }
    }
    void loadCities();
  }, []);

  function openConsumerWithCity() {
    const path = cityId ? `/consumer?cityId=${encodeURIComponent(cityId)}` : "/consumer";
    router.push(path);
  }

  function useCurrentLocation() {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationNotice("Current-location access is not available in this browser. Please choose your city manually.");
      return;
    }
    setDetectingLocation(true);
    setLocationNotice("");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude.toFixed(5);
        const lng = position.coords.longitude.toFixed(5);
        setLocationNotice(`Current location detected at ${lat}, ${lng}. Choose your nearest city to see nearby beds.`);
        setDetectingLocation(false);
      },
      () => {
        setLocationNotice("We could not detect your location automatically. Please select your city manually.");
        setDetectingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <main className="relative text-slate-900">
      <section className="mx-auto max-w-6xl px-5 py-14 md:px-6 md:py-20">
        <div className="glass-card animate-rise mb-8 rounded-3xl p-8 md:mb-10 md:p-11">
          <p className="mb-4 inline-block rounded-full bg-cyan-100 px-3 py-1 text-xs font-bold tracking-[0.14em] text-cyan-800">
            WEBSITE-FIRST MVP
          </p>
          <h1 className="text-3xl font-bold tracking-tight md:text-6xl">
            Chikki Beds Booking Platform
          </h1>
          <p className="mt-4 max-w-3xl text-sm text-slate-600 md:text-base">
            Book beds by city with hourly, overnight, and overday options. Fast,
            city-first discovery built for consumers.
          </p>

          <div className="mt-7 flex flex-wrap gap-3">
            {!loading && !user ? (
              <Link href="/login" className="shine-button rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50">
                Login
              </Link>
            ) : null}
            <button type="button" onClick={openConsumerWithCity} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
              Find Beds
            </button>
          </div>
        </div>

        <section className="glass-card animate-stagger rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Confirm Your Location</h2>
          <p className="mt-2 text-sm text-slate-700">
            Start with your city so we can show nearby beds around railway stations and bus stands. You can browse first and sign in only when you decide to book.
          </p>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
            <select value={cityId} onChange={(event) => setCityId(event.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500">
              <option value="">Select city manually</option>
              {cities.map((city) => (
                <option key={city.id} value={city.id}>{city.name}, {city.state}</option>
              ))}
            </select>
            <button type="button" onClick={useCurrentLocation} disabled={detectingLocation} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100 disabled:opacity-60">
              {detectingLocation ? "Detecting..." : "Use Current Location"}
            </button>
            <button type="button" onClick={openConsumerWithCity} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
              Show Beds
            </button>
          </div>
          {locationNotice ? <p className="mt-3 text-xs text-slate-500">{locationNotice}</p> : null}
        </section>

        <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Next Build Target</h2>
          <p className="mt-2 text-sm text-slate-700">
            Improve consumer booking experience with faster city discovery,
            seamless booking steps, and profile/history management.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {!loading && !user ? (
              <Link href="/login" className="shine-button rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500">
                Start with Login
              </Link>
            ) : null}
            <button type="button" onClick={openConsumerWithCity} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              Start Consumer Booking
            </button>
          </div>
        </section>

        <section className="glass-card animate-stagger mt-6 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-purple-50 p-6">
          <h2 className="text-lg font-semibold text-indigo-900">Become a Bed Owner</h2>
          <p className="mt-2 text-sm text-indigo-800">
            List your properties and earn by hosting travelers. Apply now to join our network of bed owners.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/apply-owner" className="shine-button rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
              Apply as Owner
            </Link>
            <button type="button" onClick={openConsumerWithCity} className="rounded-full border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">
              Learn More
            </button>
          </div>
        </section>
      </section>
    </main>
  );
}
