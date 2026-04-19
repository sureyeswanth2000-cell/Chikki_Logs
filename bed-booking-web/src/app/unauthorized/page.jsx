import Link from "next/link";
export default function UnauthorizedPage() {
    return (<main className="mx-auto min-h-screen max-w-3xl px-6 py-16">
      <section className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200">
        <h1 className="text-2xl font-bold">Unauthorized Access</h1>
        <p className="mt-3 text-sm text-slate-700">
          Your account role does not have permission to access this page.
        </p>
        <div className="mt-5 flex gap-3">
          <Link href="/" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            Go Home
          </Link>
          <Link href="/login" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
            Login Again
          </Link>
        </div>
      </section>
    </main>);
}
