"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { updateUserProfile } from "@/lib/firestore/profile";

function maskAadhaar(value) {
    const digits = String(value ?? "").replace(/\D/g, "").slice(-4);
    if (digits.length !== 4) return "—";
    return `XXXX XXXX ${digits}`;
}

export default function ProfilePage() {
    const { user, loading } = useAuth();
    const router = useRouter();

    useEffect(() => {
        if (!loading && !user) {
            router.replace("/login?next=/profile");
        }
    }, [loading, user, router]);

    if (loading) {
        return (
            <main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
                <div className="rounded-xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
                    Loading...
                </div>
            </main>
        );
    }

    if (!user) return null;

    return <ProfileContent />;
}

function ProfileContent() {
    const { user, profile, refreshProfile, linkGoogleToCurrentUser, isGoogleLinked } = useAuth();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [linkingGoogle, setLinkingGoogle] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [linkSuccess, setLinkSuccess] = useState(false);

    const [form, setForm] = useState({
        name: profile?.name ?? "",
        email: profile?.email ?? "",
        address: profile?.address ?? "",
        aadhaar: "",
    });

    // Sync form state whenever profile changes
    useEffect(() => {
        setForm({
            name: profile?.name ?? "",
            email: profile?.email ?? "",
            address: profile?.address ?? "",
            aadhaar: "",
        });
    }, [profile]);

    function handleChange(e) {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    }

    function startEdit() {
        setForm({
            name: profile?.name ?? "",
            email: profile?.email ?? "",
            address: profile?.address ?? "",
            aadhaar: "",
        });
        setError(null);
        setSuccess(false);
        setEditing(true);
    }

    async function handleSave(e) {
        e.preventDefault();
        if (!user?.uid) return;

        const aadhaarRaw = form.aadhaar.trim();
        const aadhaarDigits = aadhaarRaw.replace(/\D/g, "");
        if (aadhaarRaw && aadhaarDigits.length !== 12) {
            setError("Aadhaar must be exactly 12 digits.");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const payload = {
                name: form.name,
                email: form.email,
                address: form.address,
            };
            if (aadhaarRaw) {
                payload.aadhaar = aadhaarDigits;
            }
            await updateUserProfile(user.uid, payload);
            await refreshProfile();
            setSuccess(true);
            setEditing(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save profile.");
        } finally {
            setSaving(false);
        }
    }

    async function handleLinkGoogle() {
        setError(null);
        setSuccess(false);
        setLinkSuccess(false);
        setLinkingGoogle(true);
        try {
            await linkGoogleToCurrentUser();
            await refreshProfile();
            setLinkSuccess(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to link Google account.");
        } finally {
            setLinkingGoogle(false);
        }
    }

    return (
        <main className="mx-auto max-w-2xl px-5 py-10 md:px-6 md:py-12">
            <section className="glass-card animate-rise rounded-2xl p-8">
                <div className="flex items-center justify-between gap-3">
                    <h1 className="text-3xl font-bold">My Profile</h1>
                    {!editing && (
                        <button
                            type="button"
                            onClick={startEdit}
                            className="shine-button rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                        >
                            Edit Profile
                        </button>
                    )}
                </div>

                {success && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        Profile updated successfully.
                    </div>
                )}

                {linkSuccess && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                        Google account linked successfully to this same login.
                    </div>
                )}

                {error && (
                    <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                        {error}
                    </div>
                )}

                {!editing ? (
                    <div className="mt-6 space-y-4">
                        <ProfileField label="Phone" value={user?.phoneNumber ?? profile?.phoneNumber ?? "—"} />
                        <ProfileField label="Name" value={profile?.name || "—"} />
                        <ProfileField label="Email" value={profile?.email || "—"} />
                        <ProfileField label="Address" value={profile?.address || "—"} />
                        <ProfileField
                            label="Aadhaar"
                            value={profile?.hasAadhaar ? maskAadhaar(profile.aadhaarLast4) : "—"}
                        />
                        <div className="pt-2">
                            <span className="inline-block rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                Role: {profile?.role ?? "—"}
                            </span>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-slate-900">Login methods</p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Phone: {user?.phoneNumber ?? profile?.phoneNumber ?? "—"}
                                    </p>
                                    <p className="mt-1 text-sm text-slate-600">
                                        Google: {isGoogleLinked ? (profile?.email || user?.email || "Linked") : "Not linked"}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleLinkGoogle}
                                    disabled={linkingGoogle || isGoogleLinked}
                                    className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                    {isGoogleLinked ? "Google Linked" : linkingGoogle ? "Linking Google..." : "Link Google to This Account"}
                                </button>
                            </div>
                            <p className="mt-3 text-xs text-slate-500">
                                Use this while signed in with your phone account to attach the same Firebase user to a Google email such as sure.yeswanth@gmail.com.
                            </p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleSave} className="mt-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700" htmlFor="phone">
                                Phone (cannot be changed)
                            </label>
                            <input
                                id="phone"
                                value={user?.phoneNumber ?? profile?.phoneNumber ?? ""}
                                disabled
                                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-2 text-sm text-slate-500 outline-none"
                            />
                        </div>

                        <FormField
                            id="name"
                            label="Full Name"
                            placeholder="Enter your full name"
                            value={form.name}
                            onChange={handleChange}
                        />
                        <FormField
                            id="email"
                            label="Email"
                            type="email"
                            placeholder="Enter your email"
                            value={form.email}
                            onChange={handleChange}
                        />
                        <FormField
                            id="address"
                            label="Address"
                            placeholder="Enter your address"
                            value={form.address}
                            onChange={handleChange}
                            multiline
                        />
                        <FormField
                            id="aadhaar"
                            label="Aadhaar Number"
                            placeholder={profile?.hasAadhaar ? "Enter new 12-digit Aadhaar to replace saved value" : "12-digit Aadhaar number"}
                            value={form.aadhaar}
                            onChange={handleChange}
                            maxLength={12}
                            inputMode="numeric"
                        />

                        {profile?.hasAadhaar && (
                            <p className="text-xs text-slate-500">
                                Saved Aadhaar on file: {maskAadhaar(profile.aadhaarLast4)}. Leave the field blank to keep the existing saved value.
                            </p>
                        )}

                        <p className="text-xs text-slate-500">
                            Aadhaar is stored as secure metadata only and masked in display. Required at booking stage.
                        </p>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="submit"
                                disabled={saving}
                                className="shine-button rounded-full bg-slate-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                                {saving ? "Saving..." : "Save Changes"}
                            </button>
                            <button
                                type="button"
                                onClick={() => setEditing(false)}
                                className="rounded-full border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </main>
    );
}

function ProfileField({ label, value }) {
    return (
        <div className="grid grid-cols-3 gap-2 border-b border-slate-100 pb-3">
            <span className="text-sm font-medium text-slate-500">{label}</span>
            <span className="col-span-2 text-sm text-slate-900 break-words">{value}</span>
        </div>
    );
}

function FormField({ id, label, value, onChange, type = "text", placeholder, multiline, maxLength, inputMode }) {
    const cls = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm outline-none transition focus:border-sky-500";
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700" htmlFor={id}>
                {label}
            </label>
            {multiline ? (
                <textarea
                    id={id}
                    name={id}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    rows={3}
                    className={cls}
                />
            ) : (
                <input
                    id={id}
                    name={id}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    maxLength={maxLength}
                    inputMode={inputMode}
                    className={cls}
                />
            )}
        </div>
    );
}
