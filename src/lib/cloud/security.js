import { getFunctions, httpsCallable } from "firebase/functions";
import { getApp } from "firebase/app";
import { getClientAuth } from "@/lib/firebase";

function functionsClient() {
  return getFunctions(getApp());
}

function toMessage(error, fallback) {
  const details = error?.details;
  if (typeof details === "string" && details.trim()) return details;
  if (error?.message) return String(error.message);
  return fallback;
}

function shouldFallbackToHttp(error) {
  const code = String(error?.code || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "functions/unavailable" ||
    code === "functions/internal" ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("access-control-allow-origin") ||
    message.includes("preflight") ||
    message.includes("cors")
  );
}

async function submitBookingRatingHttp(payload) {
  const projectId = String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "").trim();
  if (!projectId) {
    throw new Error("Missing Firebase project ID for HTTP rating fallback.");
  }

  const auth = getClientAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error("Please login first.");
  }

  const idToken = await currentUser.getIdToken();
  const endpoint = `https://us-central1-${projectId}.cloudfunctions.net/submitBookingRatingHttp`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify(payload || {}),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof body?.message === "string" && body.message.trim()
      ? body.message
      : "Could not submit rating.";
    throw new Error(message);
  }
  return body;
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

export async function submitAadhaarIdentity(payload) {
  const callable = httpsCallable(functionsClient(), "submitAadhaarIdentity");
  try {
    const result = await callable(payload || {});
    return result.data?.profile || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not save Aadhaar reference."));
  }
}

export async function revealAadhaarBreakGlass(payload) {
  const callable = httpsCallable(functionsClient(), "revealAadhaarBreakGlass");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not reveal Aadhaar."));
  }
}

export async function completeCheckout({ bookingId, paymentMethod = "cash", razorpayOrderId = "", razorpayPaymentId = "", razorpaySignature = "" }) {
  const callable = httpsCallable(functionsClient(), "completeCheckout");
  try {
    const result = await callable({
      bookingId,
      paymentMethod,
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
    });
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Checkout failed."));
  }
}

export async function createRazorpayCheckoutOrder(payload) {
  const callable = httpsCallable(functionsClient(), "createRazorpayCheckoutOrder");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not create Razorpay checkout order."));
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

export async function submitBookingRating(payload) {
  const callable = httpsCallable(functionsClient(), "submitBookingRating");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    if (shouldFallbackToHttp(error)) {
      try {
        return await submitBookingRatingHttp(payload || {});
      } catch (httpError) {
        throw new Error(toMessage(httpError, "Could not submit rating."));
      }
    }
    throw new Error(toMessage(error, "Could not submit rating."));
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

export async function getPlatformSettings() {
  const callable = httpsCallable(functionsClient(), "getPlatformSettings");
  try {
    const result = await callable({});
    return result.data?.settings || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not load platform settings."));
  }
}

export async function updatePlatformSettings(payload) {
  const callable = httpsCallable(functionsClient(), "updatePlatformSettings");
  try {
    const result = await callable(payload || {});
    return result.data?.settings || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update platform settings."));
  }
}

export async function setCityScarcityMode(payload) {
  const callable = httpsCallable(functionsClient(), "setCityScarcityMode");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update city scarcity mode."));
  }
}

export async function updateDemandPricingSettings(payload) {
  const callable = httpsCallable(functionsClient(), "updateDemandPricingSettings");
  try {
    const result = await callable(payload || {});
    return result.data?.settings || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update demand pricing settings."));
  }
}

export async function setDemandScopeOverride(payload) {
  const callable = httpsCallable(functionsClient(), "setDemandScopeOverride");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update demand override."));
  }
}

export async function stopOwnerDemandPricing(payload) {
  const callable = httpsCallable(functionsClient(), "stopOwnerDemandPricing");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not stop demand pricing."));
  }
}

export async function allowOwnerDemandPricing(payload) {
  const callable = httpsCallable(functionsClient(), "allowOwnerDemandPricing");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not allow demand pricing."));
  }
}

export async function updatePlatformDefaultCommission(payload) {
  const callable = httpsCallable(functionsClient(), "updatePlatformDefaultCommission");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update platform default commission."));
  }
}

export async function markCommissionDuePaid(dueId) {
  const callable = httpsCallable(functionsClient(), "markCommissionDuePaid");
  try {
    const result = await callable({ dueId });
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not mark due as paid."));
  }
}

export async function confirmCommissionDueSettlement(dueId) {
  const callable = httpsCallable(functionsClient(), "confirmCommissionDueSettlement");
  try {
    const result = await callable({ dueId });
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not confirm settlement."));
  }
}

export async function runCommissionDuesNow() {
  const callable = httpsCallable(functionsClient(), "runCommissionDuesNow");
  try {
    const result = await callable({});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not run commission due creation."));
  }
}

export async function setOwnerCommissionOverride(payload) {
  const callable = httpsCallable(functionsClient(), "setOwnerCommissionOverride");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update owner commission override."));
  }
}

export async function setOwnerBookingBlock(payload) {
  const callable = httpsCallable(functionsClient(), "setOwnerBookingBlock");
  try {
    const result = await callable(payload || {});
    return result.data || null;
  } catch (error) {
    throw new Error(toMessage(error, "Could not update owner booking block."));
  }
}
