"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { defaultPostAuthPath } from "@/types/roles";

export default function RegisterPage() {
    const router = useRouter();
    const [nextPath, setNextPath] = useState(null);
    const { user, profile, otpSent, lastOtpPhoneNumber, lastOtpIsTestNumber, otpExpiresInSeconds, sendOtp, verifyOtp, resetOtpFlow, signInWithGoogle, loading } = useAuth();
    const [phone, setPhone] = useState("");
    const [otp, setOtp] = useState("");
    const [otpSubmitting, setOtpSubmitting] = useState(false);
    const [googleSubmitting, setGoogleSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const targetPath = useMemo(() => {
        if (nextPath && nextPath.startsWith("/")) {
            return nextPath;
        }
        if (profile?.role) {
            return defaultPostAuthPath(profile.role);
        }
        return "/";
    }, [nextPath, profile?.role]);

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

    function handleEditPhone() {
        if (lastOtpPhoneNumber) {
            setPhone(lastOtpPhoneNumber);
        }
        setOtp("");
        setError(null);
        resetOtpFlow();
    }

    function formatSeconds(totalSeconds) {
        const safe = Math.max(0, Number(totalSeconds) || 0);
        const minutes = Math.floor(safe / 60);
        const seconds = safe % 60;
        return `${minutes}:${String(seconds).padStart(2, "0")}`;
    }

    return (
        <main className="mx-auto max-w-3xl px-5 py-10 md:px-6 md:py-12">
            <section className="glass-card animate-rise rounded-2xl p-8">
                <h1 className="text-3xl font-bold">Create Account</h1>
                <p className="mt-3 text-sm text-slate-700">
                    Register with your phone number or Google. You can complete missing profile details later after logging in.
                </p>

                {error && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span>Phone OTP</span>
                    <span className="h-px flex-1 bg-slate-200" />
                </div>

                {!otpSent ? (
                    <form className="mt-6 space-y-4" onSubmit={handleSendOtp}>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
                            Phone Number
                        </label>
                        <input
                            id="phone"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            placeholder="e.g., +91XXXXXXXXXX or 10-digit mobile"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 outline-none transition focus:border-sky-500"
                            required
                        />
                        <p className="text-xs text-slate-500">
                            Development tip: if OTP is throttled, add a Firebase test phone number in Authentication &gt; Sign-in method &gt; Phone.
                        </p>
                        <button
                            type="submit"
                            disabled={otpSubmitting || googleSubmitting}
                            className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                            {otpSubmitting ? "Sending OTP..." : "Send OTP"}
                        </button>
                    </form>
                ) : (
                    <form className="mt-6 space-y-4" onSubmit={handleVerifyOtp}>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            <p>
                                OTP sent to <span className="font-semibold">{lastOtpPhoneNumber || "your number"}</span>
                            </p>
                            <div className="mt-2 flex items-center gap-3">
                                <button type="button" onClick={handleEditPhone} className="text-xs font-semibold text-sky-700 underline decoration-sky-500">
                                    Edit phone number
                                </button>
                                <span className="text-xs text-slate-600">OTP expires in {formatSeconds(otpExpiresInSeconds)}</span>
                                {lastOtpIsTestNumber ? (
                                    <span className="text-xs text-amber-700">Testing number detected: Firebase may not send real SMS. Use the configured test OTP code.</span>
                                ) : null}
                            </div>
                        </div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="otp">
                            OTP Code
                        </label>
                        <input
                            id="otp"
                            value={otp}
                            onChange={(event) => setOtp(event.target.value)}
                            placeholder="Enter OTP"
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2 outline-none transition focus:border-sky-500"
                            required
                        />

                        <button
                            type="submit"
                            disabled={otpSubmitting || googleSubmitting}
                            className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                            {otpSubmitting ? "Verifying..." : "Verify OTP"}
                        </button>
                    </form>
                )}

                <div className="mt-6 flex items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span>OR</span>
                    <span className="h-px flex-1 bg-slate-200" />
                </div>

                <button
                    type="button"
                    onClick={handleGoogleLogin}
                    disabled={otpSubmitting || googleSubmitting}
                    className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
                >
                    {googleSubmitting ? "Connecting Google..." : "Google Login"}
                </button>

                <div id="recaptcha-container" className="mt-6" />

                <p className="mt-6 text-xs text-slate-500">
                    First booking is easier: Aadhaar is not required for the first booking. It becomes mandatory starting with the second booking.
                </p>

                <div className="mt-5 space-y-2">
                    <p className="text-sm text-slate-600">
                        Already have an account?{" "}
                        <Link href="/login" className="font-medium text-sky-600 underline decoration-sky-500">
                            Login
                        </Link>
                    </p>
                    <Link href="/" className="text-sm font-medium text-slate-700 underline decoration-sky-500">
                        Back to Home
                    </Link>
                </div>
            </section>
        </main>
    );
}
