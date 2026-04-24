"use client";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuth } from "@/context/auth-context";

const basePrimaryNav = [
  { href: "/", label: "Home" },
  { href: "/consumer", label: "Consumer" },
  { href: "/history", label: "History" },
  { href: "/support", label: "Support" },
  { href: "/apply-owner", label: "Apply as Owner" },
];

const ownerPrimaryNav = [
  { href: "/owner", label: "Owner Portal" },
  { href: "/consumer", label: "Switch to Consumer Mode" },
  { href: "/owner/beds", label: "Create Inventory" },
  { href: "/owner/property-status", label: "Inventory Status" },
  { href: "/history", label: "Service History" },
  { href: "/support", label: "Support" },
];

const operatorPrimaryNav = [
  { href: "/operator", label: "Operator Console" },
  { href: "/history", label: "Service History" },
  { href: "/support", label: "Support" },
];

function isActive(pathname, href) {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function SiteChrome({ children }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const { user, profile, signOutUser } = useAuth();

  const primaryNav =
    profile?.role === "owner"
      ? ownerPrimaryNav
      : profile?.role === "operator"
      ? operatorPrimaryNav
      : basePrimaryNav;

  const profileLabel = profile?.name || user?.phoneNumber || "Profile";
  const profileHref = user ? "/profile" : "/login";

  async function handleSignOut() {
    await signOutUser();
    setMenuOpen(false);
  }

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <div className="aurora-bg" aria-hidden="true" />
      <header
        className="sticky top-0 z-40 border-b border-slate-200/80 backdrop-blur-lg"
        style={{
          backgroundColor: "rgba(255,255,255,0.88)",
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.82), rgba(255,255,255,0.82)), url('/Chikki_Logs/globe.svg')",
          backgroundRepeat: "repeat",
          backgroundSize: "120px 120px",
        }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3 md:px-6">
          {/* Logo - Start */}
          <Link href="/" className="group flex items-center gap-2">
            <Image
              src="/Chikki_Logs/window.svg"
              alt="Demo"
              width={32}
              height={32}
              className="rounded-full border border-slate-200 bg-white p-1"
            />

            <span className="font-semibold tracking-tight text-slate-900 transition group-hover:text-sky-700">
              Chikki Logs
            </span>
          </Link>

          {/* Unified Menu - Right */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex rounded-lg border border-slate-300 p-2 text-slate-700 transition hover:bg-slate-50"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
            >
              <span className="sr-only">Toggle menu</span>
              <span className="space-y-1">
                <span
                  className={`block h-0.5 w-5 bg-current transition ${
                    menuOpen ? "translate-y-1.5 rotate-45" : ""
                  }`}
                />
                <span
                  className={`block h-0.5 w-5 bg-current transition ${
                    menuOpen ? "opacity-0" : ""
                  }`}
                />
                <span
                  className={`block h-0.5 w-5 bg-current transition ${
                    menuOpen ? "-translate-y-1.5 -rotate-45" : ""
                  }`}
                />
              </span>
            </button>
          </div>
        </div>

        {menuOpen && (
          <>
            {/* Backdrop for closing */}
            <div
              className="fixed inset-0 z-40 bg-slate-900/10 backdrop-blur-sm"
              onClick={() => setMenuOpen(false)}
            />

            <div className="absolute right-5 top-[68px] z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl md:right-6">
              <nav className="grid gap-1">
                <div className="mb-2 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Navigation
                </div>
                {primaryNav.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={[
                        "block rounded-lg px-3 py-2 text-sm font-medium transition",
                        active
                          ? "bg-slate-900 text-white shadow-sm"
                          : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                      ].join(" ")}
                    >
                      {item.label}
                    </Link>
                  );
                })}

                <div className="my-2 border-t border-slate-100" />
                <div className="mb-2 px-3 py-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                  Account
                </div>

                {user ? (
                  <>
                    <div className="mb-2 px-3 text-xs text-slate-500">
                      Logged in as {profileLabel}
                    </div>
                    <Link
                      href={profileHref}
                      onClick={() => setMenuOpen(false)}
                      className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                    >
                      My Profile
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="mt-1 w-full rounded-lg bg-rose-50 px-3 py-2 text-left text-sm font-semibold text-rose-600 transition hover:bg-rose-100"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <div className="grid gap-2 p-1">
                    <Link
                      href="/login"
                      onClick={() => setMenuOpen(false)}
                      className="flex h-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white transition hover:bg-slate-800"
                    >
                      Login
                    </Link>
                    <Link
                      href="/register"
                      onClick={() => setMenuOpen(false)}
                      className="flex h-10 items-center justify-center rounded-lg border border-slate-200 text-sm font-semibold text-slate-900 transition hover:bg-slate-50"
                    >
                      Register
                    </Link>
                  </div>
                )}

                <div className="mt-2 border-t border-slate-100 pt-2">
                  <Link
                    href="/apply-owner"
                    onClick={() => setMenuOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm font-semibold text-sky-600 transition hover:bg-sky-50"
                  >
                    Apply as Owner
                  </Link>
                </div>
              </nav>
            </div>
          </>
        )}
      </header>
      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto grid max-w-6xl gap-6 px-6 py-8 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold tracking-wide text-slate-900">
              Chikki Logs Platform
            </p>
            <p className="mt-2 max-w-md text-sm text-slate-600">
              Designed for quick city-first bed discovery with a smooth booking
              flow for consumers.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Link
              href="/"
              className="text-slate-600 transition hover:text-slate-900"
            >
              Home
            </Link>
            <Link
              href="/login"
              className="text-slate-600 transition hover:text-slate-900"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="text-slate-600 transition hover:text-slate-900"
            >
              Register
            </Link>
            <Link
              href="/history"
              className="text-slate-600 transition hover:text-slate-900"
            >
              History
            </Link>
            <Link
              href="/apply-owner"
              className="text-slate-600 transition hover:text-slate-900"
            >
              Apply as Owner
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
