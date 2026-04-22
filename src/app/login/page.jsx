"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { dashboardPathByRole } from "@/types/roles";
export default function LoginPage() {
    const router = useRouter();
    const [nextPath, setNextPath] = useState(null);
  const { user, profile, otpSent, otpResendInSeconds, sendOtp, verifyOtp, signInWithGoogle, loading } = useAuth();
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [otpSubmitting, setOtpSubmitting] = useState(false);
    const [googleSubmitting, setGoogleSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const targetPath = useMemo(() => {
        if (nextPath && nextPath.startsWith("/")) {
            return nextPath;
        }
        if (profile) {
            return dashboardPathByRole(profile.role);
        }
        return "/";
    }, [nextPath, profile]);
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const next = params.get("next");
        setNextPath(next);
    }, []);
    useEffect(() => {
        if (!loading && user && profile) {
            router.replace(targetPath);
        }
    }, [loading, profile, router, targetPath, user]);
    async function handleSendOtp(event) {
        event.preventDefault();
      setOtpSubmitting(true);
        setError(null);
        try {
            await sendOtp(phone);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Could not send OTP.");
        }
        finally {
          setOtpSubmitting(false);
        }
    }
    async function handleVerifyOtp(event) {
        event.preventDefault();
        setOtpSubmitting(true);
        setError(null);
        try {
        await verifyOtp(otp);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "OTP verification failed.");
          setOtpSubmitting(false);
            return;
        }
        setOtpSubmitting(false);
        router.replace(targetPath);
    }
    async function handleGoogleLogin() {
        setGoogleSubmitting(true);
        setError(null);
        try {
            await signInWithGoogle();
            router.replace(targetPath);
        }
        catch (e) {
            setError(e instanceof Error ? e.message : "Google sign-in failed.");
        }
        finally {
          setGoogleSubmitting(false);
        }
    }
    return (<main className="mx-auto max-w-3xl px-5 py-10 md:px-6 md:py-12">
      <section className="glass-card animate-rise rounded-2xl p-8">
        <h1 className="text-3xl font-bold">Login</h1>
        <p className="mt-3 text-sm text-slate-700">
          Use phone OTP or Google login. Role access is controlled from Firestore user role.
        </p>

        {error && (<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>)}

        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>Phone OTP</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        {!otpSent ? (<form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
              Phone Number
            </label>
            <input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="e.g., +966... or 10-digit mobile" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 outline-none transition focus:border-sky-500" required/>
            <p className="text-xs text-slate-500">
              Development tip: if OTP is throttled, add a Firebase test phone number in Authentication &gt; Sign-in method &gt; Phone.
            </p>
            <button type="submit" disabled={otpSubmitting || googleSubmitting || otpResendInSeconds > 0} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400">
              {otpSubmitting ? "Sending OTP..." : otpResendInSeconds > 0 ? `Resend in ${otpResendInSeconds}s` : "Send OTP"}
            </button>
            {otpResendInSeconds > 0 ? (<p className="text-xs text-amber-700">
                OTP resend is temporarily locked to reduce abuse attempts.
              </p>) : null}
          </form>) : (<form className="mt-6 space-y-4" onSubmit={handleVerifyOtp}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="otp">
              OTP Code
            </label>
            <input id="otp" value={otp} onChange={(event) => setOtp(event.target.value)} placeholder="Enter OTP" className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 outline-none transition focus:border-sky-500" required/>

            <button type="submit" disabled={otpSubmitting || googleSubmitting} className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400">
              {otpSubmitting ? "Verifying..." : "Verify OTP"}
            </button>
          </form>)}

        <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          <span>OR</span>
          <span className="h-px flex-1 bg-slate-200" />
        </div>

        <button type="button" onClick={handleGoogleLogin} disabled={otpSubmitting || googleSubmitting} className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100">
          {googleSubmitting ? "Connecting Google..." : "Google Login"}
        </button>

        <div id="recaptcha-container" className="mt-6"/>

        <p className="mt-6 text-xs text-slate-500">
          By continuing, you agree that Aadhaar is mandatory at booking stage.
        </p>

        <div className="mt-5 mb-5">
          <Link href="/" className="text-sm font-medium text-slate-700 underline decoration-sky-500">
            Back to Home
          </Link>
        </div>
      </section>
    </main>);
}
