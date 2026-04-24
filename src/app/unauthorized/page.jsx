"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { dashboardPathByRole, roleLabel } from "@/types/roles";

export default function UnauthorizedPage() {
  const params = useSearchParams();
  const { user, profile } = useAuth();
  const attemptedPath = params.get("from") || "";
  const fallbackHref = profile?.role ? dashboardPathByRole(profile.role) : "/";
  const fallbackLabel = profile?.role
    ? `Continue to ${roleLabel(profile.role)} area`
    : "Go Home";

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">Access Redirected</h1>
        <p className="mt-3 text-sm text-slate-700">
          This page is not available for your current role. We keep consumer,
          owner, operator, and superadmin areas separate so each person lands in
          the right workflow.
        </p>

        {attemptedPath ? (
          <p className="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Attempted page: <span className="font-medium text-slate-900">{attemptedPath}</span>
          </p>
        ) : null}

        {user && profile ? (
          <p className="mt-3 text-sm text-slate-600">
            Signed in as <span className="font-semibold text-slate-900">{roleLabel(profile.role)}</span>.
            Use the correct area below.
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-600">
            Sign in again if you need to continue with a different account.
          </p>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <Link
            href={fallbackHref}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          >
            {fallbackLabel}
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Login Again
          </Link>
        </div>
      </section>
    </main>
  );
}
