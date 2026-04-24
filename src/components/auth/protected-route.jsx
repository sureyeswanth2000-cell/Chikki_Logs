"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

function unauthorizedHref(pathname) {
    const next = encodeURIComponent(pathname || "/");
    return `/unauthorized?from=${next}`;
}

export function ProtectedRoute({ children, allowedRoles }) {
    const { loading, user, profile } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [profileTimeout, setProfileTimeout] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            const next = encodeURIComponent(pathname || "/");
            router.replace(`/login?next=${next}`);
        }
    }, [loading, user, pathname, router]);

    // Give Firestore up to 4 s to load profile before treating it as a real failure
    useEffect(() => {
        if (loading || !user || profile) return;
        const timer = setTimeout(() => setProfileTimeout(true), 4000);
        return () => clearTimeout(timer);
    }, [loading, user, profile]);

    useEffect(() => {
        if (!profileTimeout) return;
        if (!profile || !allowedRoles.includes(profile.role)) {
            router.replace(unauthorizedHref(pathname));
        }
    }, [profileTimeout, profile, allowedRoles, pathname, router]);

    useEffect(() => {
        if (!loading && user && profile && !allowedRoles.includes(profile.role)) {
            router.replace(unauthorizedHref(pathname));
        }
    }, [loading, user, profile, allowedRoles, pathname, router]);

    if (loading || !user) {
        return (<main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
        <div className="rounded-xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
          Checking access...
        </div>
      </main>);
    }

        // Wait for profile resolution before rendering protected children.
    if (!profile) {
                return (<main className="mx-auto min-h-screen max-w-4xl px-6 py-16">
                <div className="rounded-xl bg-white p-6 text-sm text-slate-600 ring-1 ring-slate-200">
                    Loading profile...
                </div>
            </main>);
    }

    if (!allowedRoles.includes(profile.role)) {
        return null;
    }
    return <>{children}</>;
}
