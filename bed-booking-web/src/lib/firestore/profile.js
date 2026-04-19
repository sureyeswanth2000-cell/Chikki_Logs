import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { updateOwnProfile } from "@/lib/cloud/security";

export async function getUserProfile(uid) {
    const snap = await getDoc(doc(db, COLLECTIONS.users, uid));
    if (!snap.exists()) return null;
    return snap.data();
}

export async function updateUserProfile(uid, fields) {
    void uid;
    const payload = {
        name: String(fields?.name ?? "").trim(),
        email: String(fields?.email ?? "").trim(),
        address: String(fields?.address ?? "").trim(),
    };
    if (Object.prototype.hasOwnProperty.call(fields ?? {}, "aadhaar")) {
        payload.aadhaar = String(fields?.aadhaar ?? "").trim();
    }
    try {
        await updateOwnProfile(payload);
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save profile.";
        throw new Error(message);
    }
}
