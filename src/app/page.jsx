"use client";

import Link from "next/link";
import { useAuth } from "@/context/auth-context";
export default function Home() {
  const { user, loading } = useAuth();
    return (<main className="relative text-slate-900">
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
            {!loading && !user && (
              <Link href="/login" className="shine-button rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-300 hover:bg-sky-50">
                Login
              </Link>
            )}
            <Link href="/consumer" className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
              Consumer View
            </Link>
          </div>
        </div>

        <section className="glass-card animate-stagger rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Book Bed (Consumer)</h2>
          <p className="mt-2 text-sm text-slate-700">
            Open Consumer page to search listings, choose city, and book beds quickly.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/consumer" className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700">
              Go to Consumer Booking
            </Link>
          </div>
        </section>

        <section className="glass-card animate-stagger mt-6 rounded-2xl p-6">
          <h2 className="text-lg font-semibold">Next Build Target</h2>
          <p className="mt-2 text-sm text-slate-700">
            Improve consumer booking experience with faster city discovery,
            seamless booking steps, and profile/history management.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            {!loading && !user && (
              <Link href="/login" className="shine-button rounded-full bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-500">
                Start with Login
              </Link>
            )}
            <Link href="/consumer" className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100">
              Start Consumer Booking
            </Link>
          </div>
        </section>

        <section className="glass-card animate-stagger mt-6 rounded-2xl border-2 border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-purple-50 p-6">
          <h2 className="text-lg font-semibold text-indigo-900">Become a Bed Owner</h2>
          <p className="mt-2 text-sm text-indigo-800">
            List your properties and earn by hosting travelers. Apply now to join our network of bed owners.
          </p>

          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/apply-owner" className="shine-button rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700">
              Apply as Owner →
            </Link>
            <Link href="/consumer" className="rounded-full border border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-50">
              Learn More
            </Link>
          </div>
        </section>
      </section>
    </main>);
}
