import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";

function functionsClient() {
  return getFunctions(getApp());
}

function toMessage(error, fallback) {
  const details = error?.details;
  if (typeof details === "string" && details.trim()) return details;
  if (error?.message) return String(error.message);
  return fallback;
}

export async function ensureConsumerProfile() {
  const callable = httpsCallable(functionsClient(), "updateOwnProfile");
  try {
    const result = await callable({ initOnly: true });
    return result.data?.profile || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not initialize profile."));
  }
}

export async function updateOwnProfile(fields) {
  const callable = httpsCallable(functionsClient(), "updateOwnProfile");
  try {
    const result = await callable(fields || {});
    return result.data?.profile || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update profile."));
  }
}

export async function completeCheckout(bookingId) {
  const callable = httpsCallable(functionsClient(), "completeCheckout");
  try {
    const result = await callable({ bookingId });
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Checkout failed."));
  }
}

export async function createBookingWithAdvance(payload) {
  const callable = httpsCallable(functionsClient(), "createBookingWithAdvance");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Booking failed."));
  }
}

export async function authorizeOtpRequest(phoneNumber) {
  const callable = httpsCallable(functionsClient(), "authorizeOtpRequest");
  try {
    const result = await callable({ phoneNumber });
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "OTP request temporarily blocked. Please try again shortly."));
  }
}

export async function setUserRole(payload) {
  const callable = httpsCallable(functionsClient(), "setUserRole");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update the user role."));
  }
}

export async function recordPrivilegedAction(payload) {
  const callable = httpsCallable(functionsClient(), "recordPrivilegedAction");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not record the privileged action log."));
  }
}
