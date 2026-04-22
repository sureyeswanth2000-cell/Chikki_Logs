// Cross-entity anomaly detection: triggered by audit_logs writes
// Last modified for redeploy force: 2026-03-27-01
const { onDocumentCreated } = require("firebase-functions/v2/firestore");

exports.detectCrossEntityAnomaly = onDocumentCreated("audit_logs/{logId}", async (event) => {
  const log = event.data?.data() || {};
  const actorUserId = String(log.actorUserId || "").trim();
  const actorRole = String(log.actorRole || "").trim();
  const action = String(log.action || "").trim();
  const ipKey = typeof log.metadata?.ipKey === "string" ? log.metadata.ipKey : null;
  const nowMs = Date.now();
  const windowMs = 60 * 60 * 1000; // 1 hour
  const minEvents = 3;

  // Only consider security anomaly actions
  const anomalyActions = new Set([
    "booking_rate_limited",
    "otp_rate_limited",
    "payment_status_anomaly",
  ]);
  if (!anomalyActions.has(action)) return;

  // Check for user-based anomaly
  if (actorUserId && actorUserId !== "system" && actorUserId !== "anonymous") {
    const logsSnap = await db.collection("audit_logs")
      .where("actorUserId", "==", actorUserId)
      .where("action", "in", Array.from(anomalyActions))
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    const recent = logsSnap.docs
      .map(d => d.data())
      .filter(d => d && d.createdAt && nowMs - timestampToMillis(d.createdAt) <= windowMs);
    if (recent.length >= minEvents) {
      await db.collection("audit_logs").add({
        actorUserId,
        actorRole,
        action: "cross_entity_anomaly",
        entityType: "security",
        entityId: actorUserId,
        metadata: {
          anomalyType: "user",
          count: recent.length,
          actions: recent.map(d => d.action),
          windowMinutes: windowMs / 60000,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }

  // Check for IP-based anomaly
  if (ipKey) {
    const logsSnap = await db.collection("audit_logs")
      .where("metadata.ipKey", "==", ipKey)
      .where("action", "in", Array.from(anomalyActions))
      .orderBy("createdAt", "desc")
      .limit(10)
      .get();
    const recent = logsSnap.docs
      .map(d => d.data())
      .filter(d => d && d.createdAt && nowMs - timestampToMillis(d.createdAt) <= windowMs);
    if (recent.length >= minEvents) {
      await db.collection("audit_logs").add({
        actorUserId: "system",
        actorRole: "system",
        action: "cross_entity_anomaly",
        entityType: "security",
        entityId: ipKey,
        metadata: {
          anomalyType: "ip",
          count: recent.length,
          actions: recent.map(d => d.action),
          windowMinutes: windowMs / 60000,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
});
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();

function assertAuth(auth) {
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
}

function normalizeText(value, maxLen) {
  const text = String(value ?? "").trim();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function sanitizeAadhaar(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length !== 12) {
    throw new HttpsError("invalid-argument", "Aadhaar must be exactly 12 digits.");
  }
  return digits;
}

function legacyAadhaarDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 12 ? digits : "";
}

function hashAadhaar(digits) {
  if (!digits) return "";
  const pepper = process.env.AADHAAR_HASH_PEPPER || "";
  return crypto.createHash("sha256").update(`${pepper}:${digits}`).digest("hex");
}

function normalizePhoneForOtp(rawValue) {
  const raw = String(rawValue ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (!digits) {
    throw new HttpsError("invalid-argument", "Phone number is required.");
  }

  if (raw.startsWith("+")) {
    if (digits.length < 8 || digits.length > 15) {
      throw new HttpsError("invalid-argument", "Enter a valid phone number with country code.");
    }
    return `+${digits}`;
  }

  if (digits.length === 10) {
    return `+91${digits}`;
  }

  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new HttpsError("invalid-argument", "Enter a valid phone number with country code.");
}

function fingerprint(value) {
  const text = String(value ?? "").trim();
  if (!text) return "unknown";
  return crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

function requestIp(request) {
  const forwarded = request?.rawRequest?.headers?.["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return String(request?.rawRequest?.ip ?? "unknown");
}

function aadhaarMutation(inputValue) {
  const digits = sanitizeAadhaar(inputValue);
  if (!digits) {
    return {
      aadhaarHash: FieldValue.delete(),
      aadhaarLast4: FieldValue.delete(),
      aadhaarUpdatedAt: FieldValue.serverTimestamp(),
      aadhaar: FieldValue.delete(),
    };
  }

  return {
    aadhaarHash: hashAadhaar(digits),
    aadhaarLast4: digits.slice(-4),
    aadhaarUpdatedAt: FieldValue.serverTimestamp(),
    aadhaar: FieldValue.delete(),
  };
}

function profileResponse(data, phoneNumber) {
  const last4Raw = typeof data?.aadhaarLast4 === "string" ? data.aadhaarLast4 : "";
  const legacyDigits = legacyAadhaarDigits(data?.aadhaar);
  const aadhaarLast4 = last4Raw ? last4Raw : legacyDigits.slice(-4);
  const hasAadhaar = Boolean(aadhaarLast4 || (typeof data?.aadhaarHash === "string" && data.aadhaarHash));

  return {
    role: String(data?.role || "consumer"),
    phoneNumber: String(phoneNumber || data?.phoneNumber || ""),
    name: String(data?.name || ""),
    email: String(data?.email || ""),
    address: String(data?.address || ""),
    hasAadhaar,
    aadhaarLast4: aadhaarLast4 ? String(aadhaarLast4) : "",
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
  };
}

function assertAllowedRole(role) {
  const allowed = new Set(["consumer", "owner", "superadmin"]);
  if (!allowed.has(role)) {
    throw new HttpsError("invalid-argument", "Invalid role requested.");
  }
}

function toMillisOrNull(value) {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function toRequiredMillis(value, fieldName) {
  const parsed = new Date(value).getTime();
  if (Number.isNaN(parsed)) {
    throw new HttpsError("invalid-argument", `Invalid ${fieldName} provided.`);
  }
  return parsed;
}

function hasOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function computeBasePrice(duration, bedType, ownerPrices = {}) {
  const baseByDuration = {
    hourly: Number(ownerPrices.hourlyPrice ?? 120),
    overnight: Number(ownerPrices.overnightPrice ?? 650),
    overday: Number(ownerPrices.overdayPrice ?? 900),
  };
  const acExtra = bedType === "AC" ? 50 : 0;
  return baseByDuration[duration] + acExtra;
}

function finalTotalFromBase(basePrice) {
  const commission = Math.round(basePrice * 0.1);
  const gateway = Math.round(basePrice * 0.02);
  return basePrice + commission + gateway;
}

function normalizedBedTypeRequirement(value) {
  const raw = String(value ?? "all").toUpperCase();
  if (raw === "AC" || raw === "NON_AC") {
    return raw;
  }
  return null;
}

function isBlockActiveForTime(block, requestedStartMs, requestedEndMs) {
  const blockStart = toMillisOrNull(block.blockStart);
  if (blockStart === null) {
    return false;
  }
  const blockEndValue = toMillisOrNull(block.blockEnd);
  const blockEnd = block.isFullBlock ? Number.POSITIVE_INFINITY : blockEndValue ?? Number.POSITIVE_INFINITY;
  return hasOverlap(requestedStartMs, requestedEndMs, blockStart, blockEnd);
}

function bookingCodeFor(bookingId, createdAtMs = Date.now()) {
  const date = new Date(createdAtMs);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const source = String(bookingId ?? "");
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 33 + source.charCodeAt(index)) % 1000000;
  }
  const numericSuffix = String(hash).padStart(6, "0");
  return `${y}${m}${d}-${numericSuffix}`;
}

async function logSecurityEvent({ actorUserId, action, metadata }) {
  await db.collection("audit_logs").add({
    actorUserId,
    actorRole: "consumer",
    action,
    entityType: "security",
    entityId: actorUserId,
    metadata: metadata || {},
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function enforceRateLimit(transaction, key, limit, windowMs) {
  const ref = db.collection("security_rate_limits").doc(key);
  const snap = await transaction.get(ref);
  const now = Date.now();

  if (!snap.exists) {
    transaction.set(ref, {
      count: 1,
      windowStartMs: now,
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { count: 1, limited: false };
  }

  const data = snap.data() || {};
  const windowStartMs = typeof data.windowStartMs === "number" ? data.windowStartMs : now;
  const count = typeof data.count === "number" ? data.count : 0;

  if (now - windowStartMs >= windowMs) {
    transaction.set(ref, {
      count: 1,
      windowStartMs: now,
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { count: 1, limited: false };
  }

  if (count >= limit) {
    transaction.set(ref, {
      lastAttemptAt: now,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return { count, limited: true };
  }

  transaction.set(ref, {
    count: count + 1,
    windowStartMs,
    lastAttemptAt: now,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return { count: count + 1, limited: false };
}

function computeCheckoutTotals(hourlyPrice, bedType, elapsedHours, advancePaid) {
  const baseRate = Number(hourlyPrice ?? 120) + (String(bedType ?? "").toUpperCase() === "AC" ? 50 : 0);
  const safeHours = Math.max(1, elapsedHours);
  const basePrice = baseRate * safeHours;
  const commissionAmount = Math.round(basePrice * 0.1);
  const gatewayAmount = Math.round(basePrice * 0.02);
  const totalAmount = basePrice + commissionAmount + gatewayAmount;
  const remainingPaid = Math.max(totalAmount - Number(advancePaid ?? 100), 0);
  return {
    basePrice,
    commissionAmount,
    gatewayAmount,
    totalAmount,
    remainingPaid,
  };
}

function timestampToMillis(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "object" && typeof value.toMillis === "function") {
    try {
      return value.toMillis();
    } catch {
      return null;
    }
  }
  return null;
}

exports.updateOwnProfile = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const uid = request.auth.uid;
  const phoneNumber = request.auth.token.phone_number || "";
  const input = request.data || {};
  const initOnly = Boolean(input.initOnly);

  const payload = {
    name: normalizeText(input.name, 120),
    email: normalizeText(input.email, 160),
    address: normalizeText(input.address, 500),
    updatedAt: FieldValue.serverTimestamp(),
  };

  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) {
    const profile = {
      role: "consumer",
      phoneNumber,
      name: payload.name,
      email: payload.email,
      address: payload.address,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };
    if (Object.prototype.hasOwnProperty.call(input, "aadhaar")) {
      Object.assign(profile, aadhaarMutation(input.aadhaar));
    }
    await userRef.set(profile, { merge: true });
    const createdSnap = await userRef.get();
    return {
      ok: true,
      profile: profileResponse(createdSnap.data() || {}, phoneNumber),
    };
  }

  const existing = snap.data() || {};
  const role = typeof existing.role === "string" && existing.role ? existing.role : "consumer";

  const updateData = initOnly
    ? {
        role,
        phoneNumber,
        updatedAt: FieldValue.serverTimestamp(),
      }
    : {
        role,
        phoneNumber,
        ...payload,
      };

  const legacyDigits = legacyAadhaarDigits(existing.aadhaar);
  if (legacyDigits) {
    Object.assign(updateData, {
      aadhaarHash: hashAadhaar(legacyDigits),
      aadhaarLast4: legacyDigits.slice(-4),
      aadhaarUpdatedAt: FieldValue.serverTimestamp(),
      aadhaar: FieldValue.delete(),
    });
  }

  if (Object.prototype.hasOwnProperty.call(input, "aadhaar")) {
    Object.assign(updateData, aadhaarMutation(input.aadhaar));
  }

  await userRef.set(updateData, { merge: true });
  const mergedSnap = await userRef.get();

  return {
    ok: true,
    profile: profileResponse(mergedSnap.data() || {}, phoneNumber),
  };
});

exports.setUserRole = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const targetUid = String(request.data?.targetUid ?? "").trim();
  const targetRole = String(request.data?.role ?? "").trim();

  if (!targetUid) {
    throw new HttpsError("invalid-argument", "targetUid is required.");
  }
  assertAllowedRole(targetRole);

  const callerRef = db.collection("users").doc(callerUid);
  const callerSnap = await callerRef.get();
  if (!callerSnap.exists || callerSnap.data()?.role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmin can assign roles.");
  }

  const targetRef = db.collection("users").doc(targetUid);
  await targetRef.set(
    {
      role: targetRole,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: "superadmin",
    action: "user_role_changed",
    entityType: "user",
    entityId: targetUid,
    metadata: {
      role: targetRole,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    targetUid,
    role: targetRole,
  };
});

exports.createBookingWithAdvance = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const userId = request.auth.uid;
  const input = request.data || {};
  const listing = input.listing || {};
  const propertyId = String(listing.propertyId ?? "").trim();
  const duration = String(input.duration ?? "").trim();
  const checkInAt = String(input.checkInAt ?? "").trim();
  const requirementBedType = normalizedBedTypeRequirement(input.requirementBedType);
  const selectedBed = input.selectedBed || {};
  const requestedBedId = String(selectedBed.bedId ?? "").trim();

  if (!propertyId) {
    throw new HttpsError("invalid-argument", "Invalid listing selected for booking.");
  }
  if (!["hourly", "overnight", "overday"].includes(duration)) {
    throw new HttpsError("invalid-argument", "Invalid duration selected.");
  }

  const checkInMillis = toRequiredMillis(checkInAt, "check-in time");
  if (checkInMillis < Date.now()) {
    throw new HttpsError("failed-precondition", "Check-in time cannot be in the past.");
  }
  const requestedEndMillis = Number.POSITIVE_INFINITY;

  const bedsSnapshot = await db.collection("beds").where("propertyId", "==", propertyId).get();
  const blocksSnapshot = await db.collection("bed_blocks").where("propertyId", "==", propertyId).get();
  const availabilitySnapshot = await db.collection("booking_availability").where("propertyId", "==", propertyId).get();

  const allCandidateBeds = bedsSnapshot.docs
    .map((item) => ({
      bedId: item.id,
      roomId: String(item.data().roomId ?? ""),
      bedCode: String(item.data().bedCode ?? ""),
      bedType: String(item.data().bedType ?? "NON_AC"),
      hourlyPrice: Number(item.data().hourlyPrice ?? 120),
      overnightPrice: Number(item.data().overnightPrice ?? 650),
      overdayPrice: Number(item.data().overdayPrice ?? 900),
      active: item.data().active !== false,
    }))
    .filter((item) => item.active)
    .filter((item) => !requirementBedType || item.bedType === requirementBedType)
    .filter((item) => !requestedBedId || item.bedId === requestedBedId);

  if (allCandidateBeds.length === 0) {
    throw new HttpsError("failed-precondition", "No beds match the selected requirement.");
  }

  const blocks = blocksSnapshot.docs
    .map((item) => ({
      bedId: String(item.data().bedId ?? ""),
      blockStart: String(item.data().blockStart ?? ""),
      blockEnd: typeof item.data().blockEnd === "string" ? item.data().blockEnd : null,
      isFullBlock: Boolean(item.data().isFullBlock),
      active: item.data().active !== false,
    }))
    .filter((item) => item.active);

  const bookings = availabilitySnapshot.docs
    .map((item) => ({
      bedId: String(item.data().bedId ?? ""),
      checkInAt: String(item.data().checkInAt ?? ""),
      checkOutAt: String(item.data().checkOutAt ?? ""),
      bookingStatus: String(item.data().bookingStatus ?? ""),
    }))
    .filter((item) => item.bookingStatus === "confirmed" || item.bookingStatus === "checked_in");

  const availableBeds = allCandidateBeds.filter((candidate) => {
    const hasConflictingBlock = blocks
      .filter((block) => block.bedId === candidate.bedId)
      .some((block) => isBlockActiveForTime(block, checkInMillis, requestedEndMillis));
    if (hasConflictingBlock) {
      return false;
    }

    const hasBookingConflict = bookings
      .filter((booking) => booking.bedId === candidate.bedId)
      .some((booking) => {
        const bookingStart = toMillisOrNull(booking.checkInAt);
        const bookingEnd = toMillisOrNull(booking.checkOutAt) ?? Number.POSITIVE_INFINITY;
        if (bookingStart === null) {
          return false;
        }
        return hasOverlap(checkInMillis, requestedEndMillis, bookingStart, bookingEnd);
      });

    return !hasBookingConflict;
  });

  if (availableBeds.length === 0) {
    throw new HttpsError("failed-precondition", "No beds are currently available for your requirement.");
  }

  const chosenBed = availableBeds
    .map((bed) => ({
      ...bed,
      finalTotal: finalTotalFromBase(computeBasePrice(duration, bed.bedType, {
        hourlyPrice: bed.hourlyPrice,
        overnightPrice: bed.overnightPrice,
        overdayPrice: bed.overdayPrice,
      })),
    }))
    .sort((a, b) => (a.finalTotal !== b.finalTotal ? a.finalTotal - b.finalTotal : a.bedCode.localeCompare(b.bedCode)))[0];

  const basePrice = computeBasePrice(duration, chosenBed.bedType, {
    hourlyPrice: chosenBed.hourlyPrice,
    overnightPrice: chosenBed.overnightPrice,
    overdayPrice: chosenBed.overdayPrice,
  });
  const commissionAmount = Math.round(basePrice * 0.1);
  const gatewayAmount = Math.round(basePrice * 0.02);
  const totalAmount = finalTotalFromBase(basePrice);
  const advancePaid = 100;
  const remainingPaid = Math.max(totalAmount - advancePaid, 0);
  const bookingRef = db.collection("bookings").doc();
  const bookingAvailabilityRef = db.collection("booking_availability").doc(bookingRef.id);
  const paymentRef = db.collection("payments").doc();
  const lockRef = db.collection("bed_locks").doc(chosenBed.bedId);
  const bookingCode = bookingCodeFor(bookingRef.id, Date.now());

  try {
    await db.runTransaction(async (transaction) => {
      const rate = await enforceRateLimit(transaction, `booking_create_${userId}`, 4, 10 * 60 * 1000);
      if (rate.limited) {
        throw new HttpsError("resource-exhausted", "Too many booking attempts. Wait a few minutes and try again.");
      }

      const lockSnap = await transaction.get(lockRef);
      const now = Date.now();
      if (lockSnap.exists) {
        const lockData = lockSnap.data() || {};
        const lockedUntilMs = typeof lockData.lockedUntilMs === "number" ? lockData.lockedUntilMs : 0;
        if (lockedUntilMs > now) {
          throw new HttpsError("aborted", "This bed is currently being booked by another user. Please try again.");
        }
      }

      transaction.set(lockRef, {
        userId,
        lockedUntilMs: now + 30000,
        bookingId: bookingRef.id,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(bookingRef, {
        bookingCode,
        userId,
        propertyId,
        roomId: chosenBed.roomId,
        bedId: chosenBed.bedId,
        duration,
        checkInAt,
        checkOutAt: null,
        bookingStatus: "confirmed",
        ownerCheckoutAlert: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(bookingAvailabilityRef, {
        propertyId,
        bedId: chosenBed.bedId,
        checkInAt,
        checkOutAt: null,
        bookingStatus: "confirmed",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(paymentRef, {
        bookingId: bookingRef.id,
        basePrice,
        commissionAmount,
        gatewayAmount,
        totalAmount,
        advancePaid,
        remainingPaid,
        paymentStatus: "advance_paid_placeholder",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(db.collection("audit_logs").doc(), {
        actorUserId: userId,
        actorRole: "consumer",
        action: "booking_created",
        entityType: "booking",
        entityId: bookingRef.id,
        metadata: {
          paymentId: paymentRef.id,
          bedId: chosenBed.bedId,
          bedCode: chosenBed.bedCode,
          bedType: chosenBed.bedType,
          attemptCount: rate.count,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    if (error instanceof HttpsError && error.code === "resource-exhausted") {
      await logSecurityEvent({
        actorUserId: userId,
        action: "booking_rate_limited",
        metadata: { propertyId, duration },
      });
    }
    throw error;
  }

  return {
    ok: true,
    bookingId: bookingRef.id,
    bookingCode,
    paymentId: paymentRef.id,
    allocatedBedId: chosenBed.bedId,
    allocatedBedCode: chosenBed.bedCode,
    allocatedBedType: chosenBed.bedType,
  };
});

exports.authorizeOtpRequest = onCall({ cors: true }, async (request) => {
  const phoneNumber = normalizePhoneForOtp(request?.data?.phoneNumber);
  const phoneKey = fingerprint(phoneNumber);
  const ipKey = fingerprint(requestIp(request));
  const actorUserId = request?.auth?.uid || "anonymous";

  const isTestNumber = ["+918374532598", "+919876543210", "+910123456789"].includes(phoneNumber);
  
  let phoneRate;
  let ipRate;
  
  if (isTestNumber) {
    console.log(`[authorizeOtpRequest] Bypassing rate limit for test number: ${phoneNumber}`);
    return {
      ok: true,
      cooldownSeconds: 0,
      isTest: true,
    };
  }

  await db.runTransaction(async (transaction) => {
    phoneRate = await enforceRateLimit(transaction, `otp_phone_${phoneKey}`, 5, 15 * 60 * 1000);
    ipRate = await enforceRateLimit(transaction, `otp_ip_${ipKey}`, 20, 15 * 60 * 1000);
  });

  if (phoneRate?.limited || ipRate?.limited) {
    await logSecurityEvent({
      actorUserId,
      action: "otp_rate_limited",
      metadata: {
        phoneKey,
        ipKey,
        phoneLimited: Boolean(phoneRate?.limited),
        ipLimited: Boolean(ipRate?.limited),
      },
    });
    throw new HttpsError("resource-exhausted", "Too many OTP requests. Please wait before trying again.");
  }

  return {
    ok: true,
    cooldownSeconds: 45,
  };
});

exports.completeCheckout = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const userId = request.auth.uid;
  const bookingId = String(request.data?.bookingId ?? "").trim();

  console.log(`[completeCheckout] Starting checkout for bookingId: ${bookingId}, userId: ${userId}`);

  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId is required.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    console.error(`[completeCheckout] Booking not found: ${bookingId}`);
    throw new HttpsError("not-found", "Booking not found.");
  }

  const bookingData = bookingSnap.data() || {};
  if (String(bookingData.userId ?? "") !== userId) {
    console.error(`[completeCheckout] Permission denied. Owner: ${bookingData.userId}, Requester: ${userId}`);
    throw new HttpsError("permission-denied", "You are not allowed to checkout this booking.");
  }

  const bookingStatus = String(bookingData.bookingStatus ?? "").toLowerCase();
  if (bookingStatus === "completed" || bookingStatus === "cancelled") {
    throw new HttpsError("failed-precondition", "This booking is already closed.");
  }
  if (bookingStatus !== "checked_in") {
    throw new HttpsError("failed-precondition", "Only checked-in bookings can be checked out.");
  }

  let checkInMs = timestampToMillis(bookingData.checkInAt);
  if (checkInMs === null) {
    console.warn(`[completeCheckout] Invalid checkInAt for ${bookingId}. Defaulting to now.`);
    checkInMs = Date.now();
  }

  const checkoutMs = Date.now();
  if (checkoutMs < checkInMs) {
    console.warn(`[completeCheckout] Checkout before check-in for ${bookingId}. Adjusting check-in.`);
    checkInMs = checkoutMs - (1000 * 60 * 5); // Fallback to 5 mins stay if clock skew
  }

  const elapsedHours = Math.max(1, Math.ceil((checkoutMs - checkInMs) / (1000 * 60 * 60)));
  const bedId = String(bookingData.bedId ?? "");
  const bedSnap = await db.collection("beds").doc(bedId).get();
  const bedData = bedSnap.exists ? bedSnap.data() : { hourlyPrice: 120, bedType: "NON_AC" };

  if (!bedSnap.exists) {
    console.warn(`[completeCheckout] Bed record ${bedId} missing for booking ${bookingId}`);
  }

  const paymentSnapshot = await db.collection("payments").where("bookingId", "==", bookingId).limit(1).get();
  if (paymentSnapshot.empty) {
    console.error(`[completeCheckout] Payment record missing for booking ${bookingId}`);
    throw new HttpsError("not-found", "Payment record not found for this booking.");
  }

  const paymentDoc = paymentSnapshot.docs[0];
  const paymentRef = paymentDoc.ref;
  const paymentData = paymentDoc.data() || {};
  const advancePaid = Number(paymentData.advancePaid ?? 100);

  const totals = computeCheckoutTotals(
    Number(bedData?.hourlyPrice ?? 120),
    String(bedData?.bedType ?? "NON_AC"),
    elapsedHours,
    advancePaid,
  );

  const checkoutIso = new Date(checkoutMs).toISOString();
  const bookingAvailabilityRef = db.collection("booking_availability").doc(bookingId);

  try {
    await db.runTransaction(async (transaction) => {
      transaction.update(bookingRef, {
        checkOutAt: checkoutIso,
        bookingStatus: "completed",
        ownerCheckoutAlert: true,
        elapsedHours,
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(bookingAvailabilityRef, {
        propertyId: String(bookingData.propertyId ?? ""),
        bedId,
        checkInAt: String(bookingData.checkInAt ?? ""),
        checkOutAt: checkoutIso,
        bookingStatus: "completed",
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      transaction.update(paymentRef, {
        basePrice: totals.basePrice,
        commissionAmount: totals.commissionAmount,
        gatewayAmount: totals.gatewayAmount,
        totalAmount: totals.totalAmount,
        remainingPaid: totals.remainingPaid,
        paymentStatus: totals.remainingPaid > 0 ? "pending_settlement" : "settled",
        updatedAt: FieldValue.serverTimestamp(),
      });

      transaction.set(db.collection("audit_logs").doc(), {
        actorUserId: userId,
        actorRole: "consumer",
        action: "booking_checked_out",
        entityType: "booking",
        entityId: bookingId,
        metadata: {
          elapsedHours,
          remainingPaid: totals.remainingPaid,
          checkoutTime: checkoutIso,
        },
        createdAt: FieldValue.serverTimestamp(),
      });
    });
  } catch (error) {
    console.error(`[completeCheckout] Transaction failed for ${bookingId}:`, error);
    throw new HttpsError("internal", "Checkout transaction failed. Please try again.");
  }

  return {
    ok: true,
    bookingId,
    bookingCode: String(bookingData.bookingCode ?? bookingId),
    elapsedHours,
    totalAmount: totals.totalAmount,
    advancePaid,
    remainingPaid: totals.remainingPaid,
    checkOutAt: checkoutIso,
  };
});

exports.detectPaymentStatusAnomaly = onDocumentUpdated("payments/{paymentId}", async (event) => {
  const before = event.data?.before?.data() || null;
  const after = event.data?.after?.data() || null;
  if (!after) {
    return;
  }

  const beforeStatus = String(before?.paymentStatus ?? "").trim().toLowerCase();
  const afterStatus = String(after?.paymentStatus ?? "").trim().toLowerCase();
  if (!afterStatus || beforeStatus === afterStatus) {
    return;
  }

  const paymentId = String(event.params?.paymentId ?? "");
  if (!paymentId) {
    return;
  }

  const bookingId = String(after?.bookingId ?? "");
  const nowMs = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const watchRef = db.collection("security_payment_watch").doc(paymentId);

  let shouldLog = false;
  let stats = null;

  await db.runTransaction(async (transaction) => {
    const watchSnap = await transaction.get(watchRef);
    const watch = watchSnap.exists ? (watchSnap.data() || {}) : {};
    const existingHistory = Array.isArray(watch.history) ? watch.history : [];

    const prunedHistory = existingHistory
      .filter((item) => item && typeof item.status === "string" && typeof item.atMs === "number")
      .filter((item) => nowMs - item.atMs <= windowMs);

    const nextHistory = [...prunedHistory, { status: afterStatus, atMs: nowMs }].slice(-12);
    const transitions = Math.max(0, nextHistory.length - 1);
    const uniqueStatuses = new Set(nextHistory.map((item) => item.status)).size;
    const backAndForth =
      nextHistory.length >= 3 &&
      nextHistory[nextHistory.length - 1].status === nextHistory[nextHistory.length - 3].status;

    const suspicious = transitions >= 4 || uniqueStatuses >= 3 || backAndForth;
    const lastAnomalyAtMs = typeof watch.lastAnomalyAtMs === "number" ? watch.lastAnomalyAtMs : 0;
    shouldLog = suspicious && (nowMs - lastAnomalyAtMs >= 60 * 60 * 1000);

    stats = {
      transitions,
      uniqueStatuses,
      backAndForth,
      windowHours: 24,
      historySize: nextHistory.length,
    };

    transaction.set(watchRef, {
      bookingId,
      history: nextHistory,
      transitions24h: transitions,
      uniqueStatuses24h: uniqueStatuses,
      suspicious,
      lastSeenStatus: afterStatus,
      lastStatusAtMs: nowMs,
      updatedAt: FieldValue.serverTimestamp(),
      ...(shouldLog ? {
        lastAnomalyAtMs: nowMs,
        anomalyCount: Number(watch.anomalyCount ?? 0) + 1,
      } : {}),
    }, { merge: true });
  });

  if (!shouldLog || !stats) {
    return;
  }

  await db.collection("audit_logs").add({
    actorUserId: "system",
    actorRole: "system",
    action: "payment_status_anomaly",
    entityType: "payment",
    entityId: paymentId,
    metadata: {
      bookingId,
      previousStatus: beforeStatus || null,
      currentStatus: afterStatus,
      ...stats,
      changedAtMs: nowMs,
      changedAt: new Date(nowMs).toISOString(),
      paymentUpdatedAtMs: timestampToMillis(after?.updatedAt),
    },
    createdAt: FieldValue.serverTimestamp(),
  });
});
