"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/context/auth-context";

function unauthorizedHref(currentPath) {
    const next = encodeURIComponent(currentPath || "/");
    return `/unauthorized?from=${next}`;
}

function currentHref(pathname) {
    if (typeof window === "undefined") {
        return pathname || "/";
    }
    return `${pathname || "/"}${window.location.search || ""}`;
}

export function ProtectedRoute({ children, allowedRoles }) {
    const { loading, user, profile } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [profileTimeout, setProfileTimeout] = useState(false);

    useEffect(() => {
        if (!loading && !user) {
            const currentPath = currentHref(pathname);
            const next = encodeURIComponent(currentPath);
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
            const currentPath = currentHref(pathname);
            router.replace(unauthorizedHref(currentPath));
        }
    }, [profileTimeout, profile, allowedRoles, pathname, router]);

    useEffect(() => {
        if (!loading && user && profile && !allowedRoles.includes(profile.role)) {
            const currentPath = currentHref(pathname);
            router.replace(unauthorizedHref(currentPath));
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
