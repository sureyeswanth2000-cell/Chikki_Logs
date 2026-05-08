import { doc, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
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

/**
 * Upload a profile photo to Firebase Storage and persist the download URL
 * via the updateOwnProfile callable so it is saved on the Firestore user doc.
 * @param {string} uid  The authenticated user's UID.
 * @param {File}   file A browser File object (image/*).
 * @returns {Promise<string>} The public download URL.
 */
export async function uploadProfilePhoto(uid, file) {
    if (!uid) throw new Error("Must be signed in to upload a photo.");
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
        throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed.");
    }
    if (file.size > 2 * 1024 * 1024) {
        throw new Error("Photo must be smaller than 2 MB.");
    }
    const storageRef = ref(storage, `profile-photos/${uid}/photo`);
    await uploadBytes(storageRef, file, { contentType: file.type });
    const downloadURL = await getDownloadURL(storageRef);
    try {
        await updateOwnProfile({ photoURL: downloadURL });
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to save photo URL.";
        throw new Error(message);
    }
    return downloadURL;
}
