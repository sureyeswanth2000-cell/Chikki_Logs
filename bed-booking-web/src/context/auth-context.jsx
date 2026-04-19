"use client";
import {
    GoogleAuthProvider,
    RecaptchaVerifier,
    createUserWithEmailAndPassword,
    initializeRecaptchaConfig,
    linkWithPopup,
    onAuthStateChanged,
    signInWithEmailAndPassword,
    signInWithPhoneNumber,
    signInWithPopup,
    signOut,
    updateProfile,
    useDeviceLanguage as applyDeviceLanguage,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, } from "react";
import { db, getClientAuth } from "@/lib/firebase";
import { isUserRole } from "@/types/roles";
import { authorizeOtpRequest, ensureConsumerProfile, updateOwnProfile } from "@/lib/cloud/security";
const AuthContext = createContext(null);

const PROFILE_CACHE_KEY = "chikki_profile_cache";
const OTP_COOLDOWN_UNTIL_KEY = "chikki_otp_cooldown_until";
const OTP_SEND_COOLDOWN_SECONDS = 45;
const OTP_RATE_LIMIT_COOLDOWN_SECONDS = 15 * 60;

function isFirestoreOfflineError(error) {
    const code = typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    return code === "unavailable" ||
        code === "failed-precondition" ||
        message.includes("client is offline") ||
        message.includes("network") ||
        message.includes("offline");
}

function readCachedProfile() {
    if (typeof window === "undefined") {
        return null;
    }
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) {
        return null;
    }
    try {
        const parsed = JSON.parse(raw);
        return mapUserProfile(parsed);
    }
    catch {
        return null;
    }
}

function writeCachedProfile(profile) {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

function clearCachedProfile() {
    if (typeof window === "undefined") {
        return;
    }
    window.localStorage.removeItem(PROFILE_CACHE_KEY);
}

function readOtpCooldownUntil() {
    if (typeof window === "undefined") {
        return 0;
    }
    const raw = window.localStorage.getItem(OTP_COOLDOWN_UNTIL_KEY);
    const value = Number(raw ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
}

function writeOtpCooldownUntil(value) {
    if (typeof window === "undefined") {
        return;
    }
    if (value <= 0) {
        window.localStorage.removeItem(OTP_COOLDOWN_UNTIL_KEY);
        return;
    }
    window.localStorage.setItem(OTP_COOLDOWN_UNTIL_KEY, String(value));
}

function getReadableAuthError(error) {
    const code = typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "auth/configuration-not-found") {
        return "Phone OTP is not enabled in Firebase Auth for this project. Enable Phone provider in Firebase Console and try again.";
    }
    if (code === "auth/invalid-app-credential" || code === "auth/captcha-check-failed") {
        return "Phone OTP could not verify this app. Refresh the page and try again. If you are on localhost, add localhost to Firebase Auth > Settings > Authorized domains and disable any ad blocker that may block reCAPTCHA.";
    }
    if (code === "auth/unauthorized-domain") {
        return "This domain is not authorized for Firebase Auth. Add it in Firebase Console > Authentication > Settings > Authorized domains.";
    }
    if (code === "auth/too-many-requests") {
        return "Too many OTP attempts for this device or number. Wait 15 to 30 minutes before trying again, or use a Firebase test phone number during development.";
    }
    if (code === "auth/popup-closed-by-user") {
        return "Google sign-in popup was closed before completing login.";
    }
    if (code === "auth/popup-blocked") {
        return "Browser blocked the Google sign-in popup. Allow popups and try again.";
    }
    if (code === "auth/provider-already-linked") {
        return "Google account is already linked to this user.";
    }
    if (code === "auth/credential-already-in-use") {
        return "This Google account is already linked to another Firebase user. Use a different Google account or merge accounts first.";
    }
    if (code === "auth/operation-not-allowed") {
        return "This sign-in method is disabled in Firebase Auth. Enable Google or Email/Password provider in Firebase Console > Authentication > Sign-in method.";
    }
    if (code === "auth/email-already-in-use") {
        return "This email is already registered. Please login instead.";
    }
    if (code === "auth/invalid-email") {
        return "Enter a valid email address.";
    }
    if (code === "auth/weak-password") {
        return "Password is too weak. Use at least 6 characters.";
    }
    if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        return "Invalid email or password.";
    }
    // Fallback: show the raw Firebase error code + message for easier debugging
    const rawMessage = error instanceof Error ? error.message : String(error);
    return code ? `[${code}] ${rawMessage}` : rawMessage;
}

function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, "");
    
    // If it starts with '+', return it as-is with only digits
    if (raw.trim().startsWith("+")) {
        return `+${digits}`;
    }

    if (digits.length === 10) {
        // Default to Indian for any 10-digit number entries
        return `+91${digits}`;
    }
    
    if (digits.length === 12 && (digits.startsWith("91") || digits.startsWith("966"))) {
        // 12 digits starting with known country codes
        return `+${digits}`;
    }

    if (digits.length >= 11) {
        // Fallback for other international formats
        return `+${digits}`;
    }

    throw new Error("Enter a valid phone number with country code.");
}
function mapUserProfile(data) {
    const roleValue = typeof data.role === "string" ? data.role : "";
    if (!isUserRole(roleValue))
        return null;
    const legacyDigits = typeof data.aadhaar === "string" ? data.aadhaar.replace(/\D/g, "") : "";
    const aadhaarLast4 = typeof data.aadhaarLast4 === "string" && data.aadhaarLast4.trim().length > 0
        ? data.aadhaarLast4.trim().slice(-4)
        : legacyDigits.length === 12
            ? legacyDigits.slice(-4)
            : "";
    return {
        role: roleValue,
        phoneNumber: typeof data.phoneNumber === "string" ? data.phoneNumber : "",
        name: typeof data.name === "string" ? data.name : "",
        email: typeof data.email === "string" ? data.email : "",
        address: typeof data.address === "string" ? data.address : "",
        hasAadhaar: Boolean((typeof data.aadhaarHash === "string" && data.aadhaarHash) || aadhaarLast4),
        aadhaarLast4,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
    };
}
export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [otpSent, setOtpSent] = useState(false);
    const [otpCooldownUntilMs, setOtpCooldownUntilMs] = useState(0);
    const [clockNowMs, setClockNowMs] = useState(Date.now());
    const confirmationRef = useRef(null);
    const isGoogleLinked = Boolean(user?.providerData?.some((provider) => provider.providerId === "google.com"));

    const clearRecaptcha = useCallback(() => {
        if (typeof window === "undefined") {
            return;
        }
        if (window.recaptchaVerifier) {
            window.recaptchaVerifier.clear();
            window.recaptchaVerifier = null;
        }
    }, []);

    useEffect(() => {
        setOtpCooldownUntilMs(readOtpCooldownUntil());
    }, []);

    useEffect(() => {
        const timer = window.setInterval(() => {
            setClockNowMs(Date.now());
        }, 1000);
        return () => {
            window.clearInterval(timer);
        };
    }, []);

    useEffect(() => {
        if (otpCooldownUntilMs > 0 && otpCooldownUntilMs <= clockNowMs) {
            setOtpCooldownUntilMs(0);
            writeOtpCooldownUntil(0);
        }
    }, [clockNowMs, otpCooldownUntilMs]);

    useEffect(() => {
        const auth = getClientAuth();
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser);
            if (!firebaseUser) {
                setProfile(null);
                clearCachedProfile();
                setLoading(false);
                return;
            }
            try {
                const snapshot = await getDoc(doc(db, "users", firebaseUser.uid));
                if (snapshot.exists()) {
                    const nextProfile = mapUserProfile(snapshot.data());
                    setProfile(nextProfile);
                    if (nextProfile) {
                        writeCachedProfile(nextProfile);
                    }
                }
                else {
                    setProfile(null);
                }
            }
            catch (error) {
                if (isFirestoreOfflineError(error)) {
                    const cached = readCachedProfile();
                    setProfile(cached);
                }
                else {
                    setProfile(null);
                }
            }
            setLoading(false);
        });
        return unsubscribe;
    }, []);
    const setupRecaptcha = useCallback((forceReset = false) => {
        console.log("[RECAPTCHA] setupRecaptcha called, forceReset:", forceReset);
        
        if (typeof window === "undefined") {
            throw new Error("Recaptcha is only available in browser.");
        }
        
        const container = document.getElementById("recaptcha-container");
        console.log("[RECAPTCHA] Container found:", container ? "yes" : "no");
        
        if (!container) {
            throw new Error("Phone OTP widget is not ready yet. Please wait a moment and try again.");
        }
        
        console.log("[RECAPTCHA] grecaptcha available:", typeof window.grecaptcha);
        
        // Instead of throwing immediately, we log and let RecaptchaVerifier try to handle it.
        if (typeof window.grecaptcha === "undefined") {
            console.warn("[RECAPTCHA] window.grecaptcha is undefined - it might still be loading.");
        }
        
        if (forceReset) {
            console.log("[RECAPTCHA] Clearing previous verifier");
            clearRecaptcha();
        }
        
        if (window.recaptchaVerifier) {
            console.log("[RECAPTCHA] Returning existing verifier");
            return window.recaptchaVerifier;
        }
        
        console.log("[RECAPTCHA] Creating new RecaptchaVerifier...");
        const auth = getClientAuth();
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", {
            size: "invisible", // Better user experience and less prone to UI failures
            "expired-callback": () => {
                console.log("[RECAPTCHA] reCAPTCHA widget expired, clearing");
                clearRecaptcha();
            },
        });
        console.log("[RECAPTCHA] RecaptchaVerifier created successfully");
        return window.recaptchaVerifier;
    }, [clearRecaptcha]);
    const warmUpPhoneAuth = useCallback(async () => {
        console.log("[WARMUP] Starting Firebase phone auth warm-up");
        try {
            // Passive warm-up, don't let it block
            const auth = getClientAuth();
            applyDeviceLanguage(auth);
            // initializeRecaptchaConfig(auth).catch(() => {});
        }
        catch (err) {
            // Ignore
        }
    }, []);
    const sendOtp = useCallback(async (rawPhone) => {
        let auth, phoneNumber;
        try {
            const effectiveCooldownUntil = Math.max(otpCooldownUntilMs, readOtpCooldownUntil());
            if (effectiveCooldownUntil > Date.now()) {
                const secondsLeft = Math.ceil((effectiveCooldownUntil - Date.now()) / 1000);
                setOtpCooldownUntilMs(effectiveCooldownUntil);
                throw new Error(`Please wait ${secondsLeft}s before requesting another OTP.`);
            }

            console.log("[OTP] Starting sendOtp with phone:", rawPhone);
            
            phoneNumber = normalizePhone(rawPhone);
            console.log("[OTP] Normalized phone:", phoneNumber);

            // Server-side abuse checks before OTP dispatch.
            await authorizeOtpRequest(phoneNumber);
            
            auth = getClientAuth();
            console.log("[OTP] Got auth instance");
            
            console.log("[OTP] Checking grecaptcha global...", typeof window.grecaptcha);
            if (typeof window.grecaptcha === "undefined") {
                console.error("[OTP] grecaptcha global is undefined - reCAPTCHA script may not have loaded");
            }
            
            console.log("[OTP] Setting up reCAPTCHA verifier...");
            const verifier = setupRecaptcha(true);
            console.log("[OTP] Verifier created:", verifier ? "yes" : "no");
            
            console.log("[OTP] Rendering reCAPTCHA widget...");
            await verifier.render();
            console.log("[OTP] reCAPTCHA widget rendered successfully");
            
            console.log("[OTP] Sending OTP to:", phoneNumber);
            confirmationRef.current = await signInWithPhoneNumber(auth, phoneNumber, verifier);
            console.log("[OTP] OTP sent successfully");
            
            setOtpSent(true);
            const nextCooldownUntil = Date.now() + OTP_SEND_COOLDOWN_SECONDS * 1000;
            setOtpCooldownUntilMs(nextCooldownUntil);
            writeOtpCooldownUntil(nextCooldownUntil);
        }
        catch (error) {
            console.error("[OTP] Error in sendOtp:", error);
            const errorCode = typeof error === "object" && error && "code" in error
                ? String(error.code)
                : "";
            const message = error instanceof Error ? error.message : "";

            console.log("[OTP] Error code:", errorCode, "Message:", message);

            // A stale/expired widget can fail after route changes; recreate once and retry.
            if (message.includes("reCAPTCHA client element has been removed") ||
                errorCode === "auth/captcha-check-failed" ||
                errorCode === "auth/invalid-app-credential") {
                try {
                    console.log("[OTP] Retrying after recaptcha failure...");
                    clearRecaptcha();
                    const retryVerifier = setupRecaptcha(true);
                    await retryVerifier.render();
                    confirmationRef.current = await signInWithPhoneNumber(auth, phoneNumber, retryVerifier);
                    console.log("[OTP] OTP sent on retry");
                    setOtpSent(true);
                    const nextCooldownUntil = Date.now() + OTP_SEND_COOLDOWN_SECONDS * 1000;
                    setOtpCooldownUntilMs(nextCooldownUntil);
                    writeOtpCooldownUntil(nextCooldownUntil);
                }
                catch (retryError) {
                    console.error("[OTP] Retry failed:", retryError);
                    throw new Error(getReadableAuthError(retryError));
                }
            }
            else {
                if (errorCode === "auth/too-many-requests") {
                    const nextCooldownUntil = Date.now() + OTP_RATE_LIMIT_COOLDOWN_SECONDS * 1000;
                    setOtpCooldownUntilMs(nextCooldownUntil);
                    writeOtpCooldownUntil(nextCooldownUntil);
                }
                throw new Error(getReadableAuthError(error));
            }
        }
    }, [clearRecaptcha, otpCooldownUntilMs, setupRecaptcha]);
    const verifyOtp = useCallback(async (otpCode) => {
        if (!confirmationRef.current) {
            throw new Error("Send OTP first.");
        }
        let result;
        try {
            result = await confirmationRef.current.confirm(otpCode);
        }
        catch (error) {
            throw new Error(getReadableAuthError(error));
        }
        const ensuredProfile = await ensureConsumerProfile();
        const nextProfile = mapUserProfile(ensuredProfile) ?? {
            role: "consumer",
            phoneNumber: result.user.phoneNumber ?? "",
            name: "",
            email: "",
            address: "",
            hasAadhaar: false,
            aadhaarLast4: "",
            createdAt: null,
            updatedAt: null,
        };
        setProfile(nextProfile);
        writeCachedProfile(nextProfile);
        setOtpSent(false);
        confirmationRef.current = null;
    }, []);
    const signInWithGoogle = useCallback(async () => {
        const auth = getClientAuth();
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        let result;
        try {
            result = await signInWithPopup(auth, provider);
        }
        catch (error) {
            throw new Error(getReadableAuthError(error));
        }

        const nextProfile = await updateOwnProfile({
            name: result.user.displayName ?? "",
            email: result.user.email ?? "",
        });

        const mappedProfile = mapUserProfile(nextProfile) ?? {
            role: "consumer",
            phoneNumber: result.user.phoneNumber ?? "",
            name: result.user.displayName ?? "",
            email: result.user.email ?? "",
            address: "",
            hasAadhaar: false,
            aadhaarLast4: "",
            createdAt: null,
            updatedAt: null,
        };
        setProfile(mappedProfile);
        writeCachedProfile(mappedProfile);
        setOtpSent(false);
        confirmationRef.current = null;
        clearRecaptcha();
    }, [clearRecaptcha]);
    const registerWithEmail = useCallback(async ({ name, email, password }) => {
        const auth = getClientAuth();
        let result;
        try {
            result = await createUserWithEmailAndPassword(auth, email.trim(), password);
        }
        catch (error) {
            throw new Error(getReadableAuthError(error));
        }

        if (name?.trim()) {
            await updateProfile(result.user, { displayName: name.trim() });
        }

        const nextProfile = await updateOwnProfile({
            name: name?.trim() || result.user.displayName || "",
            email: result.user.email || email.trim(),
        });

        const mappedProfile = mapUserProfile(nextProfile) ?? {
            role: "consumer",
            phoneNumber: result.user.phoneNumber ?? "",
            name: name?.trim() || result.user.displayName || "",
            email: result.user.email || email.trim(),
            address: "",
            hasAadhaar: false,
            aadhaarLast4: "",
            createdAt: null,
            updatedAt: null,
        };
        setProfile(mappedProfile);
        writeCachedProfile(mappedProfile);
        setOtpSent(false);
        confirmationRef.current = null;
        clearRecaptcha();
        return mappedProfile;
    }, [clearRecaptcha]);
    const signInWithEmail = useCallback(async ({ email, password }) => {
        const auth = getClientAuth();
        let result;
        try {
            result = await signInWithEmailAndPassword(auth, email.trim(), password);
        }
        catch (error) {
            throw new Error(getReadableAuthError(error));
        }

        const nextProfile = await updateOwnProfile({
            name: result.user.displayName ?? profile?.name ?? "",
            email: result.user.email ?? email.trim(),
        });

        const mappedProfile = mapUserProfile(nextProfile) ?? {
            role: "consumer",
            phoneNumber: result.user.phoneNumber ?? "",
            name: result.user.displayName ?? profile?.name ?? "",
            email: result.user.email ?? email.trim(),
            address: profile?.address ?? "",
            hasAadhaar: profile?.hasAadhaar ?? false,
            aadhaarLast4: profile?.aadhaarLast4 ?? "",
            createdAt: profile?.createdAt ?? null,
            updatedAt: null,
        };
        setProfile(mappedProfile);
        writeCachedProfile(mappedProfile);
        setOtpSent(false);
        confirmationRef.current = null;
        clearRecaptcha();
        return mappedProfile;
    }, [clearRecaptcha, profile]);
    const linkGoogleToCurrentUser = useCallback(async () => {
        const auth = getClientAuth();
        const currentUser = auth.currentUser;
        if (!currentUser) {
            throw new Error("Sign in with your phone account first.");
        }

        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: "select_account" });

        let result;
        try {
            result = await linkWithPopup(currentUser, provider);
        }
        catch (error) {
            throw new Error(getReadableAuthError(error));
        }

        const nextProfile = await updateOwnProfile({
            name: result.user.displayName ?? profile?.name ?? "",
            email: result.user.email ?? profile?.email ?? "",
        });

        const mappedProfile = mapUserProfile(nextProfile) ?? {
            role: profile?.role ?? "consumer",
            phoneNumber: result.user.phoneNumber ?? profile?.phoneNumber ?? "",
            name: result.user.displayName ?? profile?.name ?? "",
            email: result.user.email ?? profile?.email ?? "",
            address: profile?.address ?? "",
            hasAadhaar: profile?.hasAadhaar ?? false,
            aadhaarLast4: profile?.aadhaarLast4 ?? "",
            createdAt: profile?.createdAt ?? null,
            updatedAt: null,
        };
        setProfile(mappedProfile);
        writeCachedProfile(mappedProfile);
        return mappedProfile;
    }, [profile]);
    const refreshProfile = useCallback(async () => {
        if (!user) return;
        try {
            const snapshot = await getDoc(doc(db, "users", user.uid));
            if (snapshot.exists()) {
                const next = mapUserProfile(snapshot.data());
                setProfile(next);
                if (next) writeCachedProfile(next);
            }
        } catch {
            // stay with current cached profile if offline
        }
    }, [user]);

    const signOutUser = useCallback(async () => {
        const auth = getClientAuth();
        await signOut(auth);
        setProfile(null);
        setOtpSent(false);
        confirmationRef.current = null;
        clearCachedProfile();
        clearRecaptcha();
    }, [clearRecaptcha]);
    const value = useMemo(() => ({
        user,
        profile,
        loading,
        otpSent,
        otpResendInSeconds: otpCooldownUntilMs > clockNowMs
            ? Math.ceil((otpCooldownUntilMs - clockNowMs) / 1000)
            : 0,
        isGoogleLinked,
        sendOtp,
        verifyOtp,
        registerWithEmail,
        signInWithEmail,
        signInWithGoogle,
        linkGoogleToCurrentUser,
        signOutUser,
        refreshProfile,
    }), [clockNowMs, isGoogleLinked, loading, otpCooldownUntilMs, otpSent, profile, refreshProfile, sendOtp, verifyOtp, registerWithEmail, signInWithEmail, signInWithGoogle, linkGoogleToCurrentUser, signOutUser, user]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
}
