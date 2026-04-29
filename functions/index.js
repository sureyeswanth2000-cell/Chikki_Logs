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
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("node:crypto");

initializeApp();
const db = getFirestore();

const PLATFORM_SETTINGS_COLLECTION = "platform_settings";
const PLATFORM_SETTINGS_DOC_ID = "main";
const DEFAULT_CHECKIN_GRACE_MINUTES = 15;
const MIN_CHECKIN_GRACE_MINUTES = 5;
const MAX_CHECKIN_GRACE_MINUTES = 120;
const SCARCITY_MIN_BEDS = 1;
const SCARCITY_MAX_BEDS = 5;
const AADHAAR_VAULT_COLLECTION = "aadhaar_identity_vault";

function randomInt(min, max) {
  const safeMin = Math.ceil(Number(min));
  const safeMax = Math.floor(Number(max));
  return Math.floor(Math.random() * (safeMax - safeMin + 1)) + safeMin;
}

function clampCheckInGraceMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_CHECKIN_GRACE_MINUTES;
  }
  return Math.max(MIN_CHECKIN_GRACE_MINUTES, Math.min(MAX_CHECKIN_GRACE_MINUTES, Math.round(parsed)));
}

async function readPlatformSettings() {
  const ref = db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID);
  const snap = await ref.get();
  if (!snap.exists) {
    return {
      checkInGraceMinutes: DEFAULT_CHECKIN_GRACE_MINUTES,
    };
  }
  const data = snap.data() || {};
  return {
    checkInGraceMinutes: clampCheckInGraceMinutes(data.checkInGraceMinutes),
  };
}

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

function aadhaarVaultKey() {
  const rawKey = String(process.env.AADHAAR_VAULT_ENCRYPTION_KEY || process.env.AADHAAR_HASH_PEPPER || "").trim();
  if (rawKey) {
    try {
      const decoded = Buffer.from(rawKey, "base64");
      if (decoded.length === 32) {
        return decoded;
      }
    } catch {
      // Fall back to deriving a key from the configured secret text.
    }
    return crypto.createHash("sha256").update(rawKey).digest();
  }
  const fallback = String(process.env.GCLOUD_PROJECT || "chikki-local-dev-aadhaar-vault-fallback");
  return crypto.createHash("sha256").update(fallback).digest();
}

function aadhaarHmac(digits) {
  return crypto.createHmac("sha256", aadhaarVaultKey()).update(digits).digest("hex");
}

function encryptAadhaar(digits) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aadhaarVaultKey(), iv);
  const encrypted = Buffer.concat([cipher.update(digits, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encryptedAadhaar: encrypted.toString("base64"),
    aadhaarIv: iv.toString("base64"),
    aadhaarTag: tag.toString("base64"),
    encryptionAlgo: "aes-256-gcm",
    keyVersion: String(process.env.AADHAAR_VAULT_KEY_VERSION || "v1"),
  };
}

function decryptAadhaar(vaultData) {
  const encryptedAadhaar = String(vaultData?.encryptedAadhaar ?? "");
  const aadhaarIv = String(vaultData?.aadhaarIv ?? "");
  const aadhaarTag = String(vaultData?.aadhaarTag ?? "");
  if (!encryptedAadhaar || !aadhaarIv || !aadhaarTag) {
    throw new HttpsError("failed-precondition", "Aadhaar vault record is incomplete.");
  }
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    aadhaarVaultKey(),
    Buffer.from(aadhaarIv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(aadhaarTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedAadhaar, "base64")),
    decipher.final(),
  ]).toString("utf8");
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

function profileResponse(data, phoneNumber) {
  const aadhaarRefId = typeof data?.aadhaarRefId === "string" ? data.aadhaarRefId.trim() : "";
  const last4Raw = typeof data?.aadhaarLast4 === "string" ? data.aadhaarLast4 : "";
  const legacyDigits = legacyAadhaarDigits(data?.aadhaar);
  const aadhaarLast4 = last4Raw ? last4Raw : legacyDigits.slice(-4);
  const hasAadhaar = Boolean(aadhaarRefId && aadhaarLast4);

  return {
    role: String(data?.role || "consumer"),
    phoneNumber: String(phoneNumber || data?.phoneNumber || ""),
    name: String(data?.name || ""),
    email: String(data?.email || ""),
    address: String(data?.address || ""),
    hasAadhaar,
    aadhaarRefId,
    aadhaarLast4: aadhaarLast4 ? String(aadhaarLast4) : "",
    aadhaarStatus: String(data?.aadhaarStatus || ""),
    createdAt: data?.createdAt || null,
    updatedAt: data?.updatedAt || null,
  };
}

function assertAllowedRole(role) {
  const allowed = new Set(["consumer", "owner", "operator", "superadmin"]);
  if (!allowed.has(role)) {
    throw new HttpsError("invalid-argument", "Invalid role requested.");
  }
}

function assertAllowedEntityType(entityType) {
  const allowed = new Set(["city", "user", "owner_application", "access"]);
  if (!allowed.has(entityType)) {
    throw new HttpsError("invalid-argument", "Invalid entity type for privileged action log.");
  }
}

async function getCurrentRole(uid) {
  const snap = await db.collection("users").doc(uid).get();
  if (!snap.exists) {
    return "";
  }
  return String(snap.data()?.role ?? "").trim();
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

async function upsertAadhaarIdentity({ userId, aadhaar, source }) {
  const digits = sanitizeAadhaar(aadhaar);
  if (!digits) {
    return null;
  }

  const aadhaarRefId = crypto.randomUUID();
  const hmac = aadhaarHmac(digits);
  const existingSnap = await db.collection(AADHAAR_VAULT_COLLECTION)
    .where("aadhaarHmac", "==", hmac)
    .limit(1)
    .get();

  if (!existingSnap.empty) {
    const existingDoc = existingSnap.docs[0];
    const existing = existingDoc.data() || {};
    const existingUserId = String(existing.userId ?? "");
    if (existingUserId && existingUserId !== userId) {
      await db.collection("audit_logs").add({
        actorUserId: userId,
        actorRole: "consumer",
        action: "aadhaar_duplicate_detected",
        entityType: "identity",
        entityId: existingDoc.id,
        metadata: {
          source: String(source || "unknown"),
        },
        createdAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("already-exists", "This Aadhaar is already linked to another account.");
    }

    await existingDoc.ref.set({
      ...encryptAadhaar(digits),
      last4: digits.slice(-4),
      status: "submitted",
      source: String(source || "profile"),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await db.collection("audit_logs").add({
      actorUserId: userId,
      actorRole: "consumer",
      action: "aadhaar_reference_updated",
      entityType: "identity",
      entityId: existingDoc.id,
      metadata: {
        source: String(source || "profile"),
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    return {
      aadhaarRefId: existingDoc.id,
      aadhaarLast4: digits.slice(-4),
      aadhaarStatus: "submitted",
    };
  }

  await db.collection(AADHAAR_VAULT_COLLECTION).doc(aadhaarRefId).set({
    aadhaarRefId,
    userId,
    aadhaarHmac: hmac,
    ...encryptAadhaar(digits),
    last4: digits.slice(-4),
    status: "submitted",
    source: String(source || "profile"),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  await db.collection("audit_logs").add({
    actorUserId: userId,
    actorRole: "consumer",
    action: "aadhaar_reference_created",
    entityType: "identity",
    entityId: aadhaarRefId,
    metadata: {
      source: String(source || "profile"),
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    aadhaarRefId,
    aadhaarLast4: digits.slice(-4),
    aadhaarStatus: "submitted",
  };
}

function aadhaarProfileMutation(identity) {
  if (!identity) {
    return {
      aadhaar: FieldValue.delete(),
      aadhaarHash: FieldValue.delete(),
    };
  }
  return {
    aadhaarRefId: identity.aadhaarRefId,
    aadhaarLast4: identity.aadhaarLast4,
    aadhaarStatus: identity.aadhaarStatus,
    aadhaarUpdatedAt: FieldValue.serverTimestamp(),
    aadhaar: FieldValue.delete(),
    aadhaarHash: FieldValue.delete(),
  };
}

async function enforceRateLimit(transaction, key, limit, windowMs) {
  const ref = db.collection("security_rate_limits").doc(key);
  const snap = await transaction.get(ref);
  return enforceRateLimitWithSnapshot(transaction, ref, snap, limit, windowMs);
}

function enforceRateLimitWithSnapshot(transaction, ref, snap, limit, windowMs) {
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

function normalizeRatingComment(value) {
  return normalizeText(value, 500);
}

exports.updateOwnProfile = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const uid = request.auth.uid;
  const phoneNumber = request.auth.token.phone_number || "";
  const input = request.data || {};
  const initOnly = Boolean(input.initOnly);
  const submittedAadhaar = Object.prototype.hasOwnProperty.call(input, "aadhaar")
    ? sanitizeAadhaar(input.aadhaar)
    : "";
  const submittedIdentity = submittedAadhaar
    ? await upsertAadhaarIdentity({ userId: uid, aadhaar: submittedAadhaar, source: initOnly ? "profile_init" : "profile" })
    : null;

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
    if (submittedAadhaar) {
      Object.assign(profile, aadhaarProfileMutation(submittedIdentity));
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
    const legacyIdentity = await upsertAadhaarIdentity({ userId: uid, aadhaar: legacyDigits, source: "legacy_profile_migration" });
    Object.assign(updateData, aadhaarProfileMutation(legacyIdentity));
  }

  if (submittedAadhaar) {
    Object.assign(updateData, aadhaarProfileMutation(submittedIdentity));
  }

  await userRef.set(updateData, { merge: true });
  const mergedSnap = await userRef.get();

  return {
    ok: true,
    profile: profileResponse(mergedSnap.data() || {}, phoneNumber),
  };
});

exports.submitAadhaarIdentity = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const uid = request.auth.uid;
  const aadhaar = sanitizeAadhaar(request.data?.aadhaar);
  const source = normalizeText(request.data?.source || "identity_submission", 80);
  const identity = await upsertAadhaarIdentity({ userId: uid, aadhaar, source });

  const userRef = db.collection("users").doc(uid);
  await userRef.set({
    ...aadhaarProfileMutation(identity),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  const snap = await userRef.get();
  return {
    ok: true,
    profile: profileResponse(snap.data() || {}, request.auth.token.phone_number || ""),
  };
});

exports.revealAadhaarBreakGlass = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmin can reveal Aadhaar in break-glass mode.");
  }

  let aadhaarRefId = normalizeText(request.data?.aadhaarRefId, 120);
  const targetUserId = normalizeText(request.data?.targetUserId, 120);
  const bookingId = normalizeText(request.data?.bookingId, 120);
  const reason = normalizeText(request.data?.reason, 500);

  if (reason.length < 20) {
    throw new HttpsError("invalid-argument", "A detailed reason with at least 20 characters is required.");
  }

  let resolvedTargetUserId = targetUserId;
  if (!aadhaarRefId && bookingId) {
    const bookingSnap = await db.collection("bookings").doc(bookingId).get();
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }
    const booking = bookingSnap.data() || {};
    aadhaarRefId = String(booking.aadhaarRefId ?? "").trim();
    resolvedTargetUserId = resolvedTargetUserId || String(booking.userId ?? "").trim();
  }

  if (!aadhaarRefId && resolvedTargetUserId) {
    const userSnap = await db.collection("users").doc(resolvedTargetUserId).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User not found.");
    }
    aadhaarRefId = String(userSnap.data()?.aadhaarRefId ?? "").trim();
  }

  if (!aadhaarRefId) {
    throw new HttpsError("invalid-argument", "Aadhaar reference ID, user ID, or booking ID is required.");
  }

  const vaultRef = db.collection(AADHAAR_VAULT_COLLECTION).doc(aadhaarRefId);
  const vaultSnap = await vaultRef.get();
  if (!vaultSnap.exists) {
    throw new HttpsError("not-found", "Aadhaar vault record not found.");
  }

  const vaultData = vaultSnap.data() || {};
  const vaultUserId = String(vaultData.userId ?? "").trim();
  if (resolvedTargetUserId && vaultUserId && vaultUserId !== resolvedTargetUserId) {
    throw new HttpsError("failed-precondition", "Aadhaar reference does not match the target user.");
  }

  const aadhaar = decryptAadhaar(vaultData);
  const revealExpiresInSeconds = 60;

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: "superadmin",
    action: "aadhaar_break_glass_revealed",
    entityType: "identity",
    entityId: aadhaarRefId,
    metadata: {
      targetUserId: resolvedTargetUserId || vaultUserId || null,
      bookingId: bookingId || null,
      reason,
      ipKey: fingerprint(requestIp(request)),
      revealExpiresInSeconds,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    aadhaarRefId,
    targetUserId: resolvedTargetUserId || vaultUserId || "",
    aadhaar,
    last4: String(vaultData.last4 ?? aadhaar.slice(-4)),
    revealExpiresInSeconds,
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

  const callerRole = await getCurrentRole(callerUid);
  if (!callerRole) {
    throw new HttpsError("permission-denied", "Only privileged internal roles can assign roles.");
  }
  const targetRef = db.collection("users").doc(targetUid);
  const targetSnap = await targetRef.get();
  const currentTargetRole = String(targetSnap.data()?.role ?? "consumer").trim() || "consumer";

  if (currentTargetRole === "superadmin") {
    throw new HttpsError("permission-denied", "Superadmin accounts cannot be modified from the UI.");
  }

  if (callerRole === "operator") {
    const allowedOperatorRoles = new Set(["consumer", "owner"]);
    if (!allowedOperatorRoles.has(currentTargetRole) || !allowedOperatorRoles.has(targetRole)) {
      throw new HttpsError(
        "permission-denied",
        "Operator can only swap roles between consumer and owner."
      );
    }
  } else if (callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operator or superadmin can assign roles.");
  }

  if (currentTargetRole === targetRole) {
    return {
      ok: true,
      targetUid,
      role: targetRole,
      previousRole: currentTargetRole,
      changed: false,
    };
  }

  await targetRef.set(
    {
      role: targetRole,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "user_role_changed",
    entityType: "user",
    entityId: targetUid,
    metadata: {
      previousRole: currentTargetRole,
      nextRole: targetRole,
      source: "internal_role_console",
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    targetUid,
    role: targetRole,
    previousRole: currentTargetRole,
    changed: true,
  };
});

exports.recordPrivilegedAction = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "operator" && callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operator or superadmin can write privileged action logs.");
  }

  const action = normalizeText(request.data?.action, 120);
  const entityType = normalizeText(request.data?.entityType, 60);
  const entityId = normalizeText(request.data?.entityId, 120);
  const metadata = request.data?.metadata && typeof request.data.metadata === "object"
    ? request.data.metadata
    : {};

  if (!action || !entityType || !entityId) {
    throw new HttpsError("invalid-argument", "action, entityType, and entityId are required.");
  }

  assertAllowedEntityType(entityType);

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action,
    entityType,
    entityId,
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true };
});

exports.getPlatformSettings = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const callerRole = await getCurrentRole(request.auth.uid);
  if (callerRole !== "operator" && callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operator or superadmin can read platform settings.");
  }

  const settings = await readPlatformSettings();
  return {
    ok: true,
    settings,
  };
});

exports.updatePlatformSettings = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmin can update platform settings.");
  }

  const input = request.data || {};
  if (!Object.prototype.hasOwnProperty.call(input, "checkInGraceMinutes")) {
    throw new HttpsError("invalid-argument", "checkInGraceMinutes is required.");
  }
  const nextCheckInGraceMinutes = clampCheckInGraceMinutes(input.checkInGraceMinutes);

  const settingsRef = db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID);
  await settingsRef.set({
    checkInGraceMinutes: nextCheckInGraceMinutes,
    updatedBy: callerUid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "platform_settings_updated",
    entityType: "access",
    entityId: PLATFORM_SETTINGS_DOC_ID,
    metadata: {
      checkInGraceMinutes: nextCheckInGraceMinutes,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    settings: {
      checkInGraceMinutes: nextCheckInGraceMinutes,
    },
  };
});

exports.setCityScarcityMode = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "operator" && callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operator or superadmin can update scarcity mode.");
  }

  const cityId = normalizeText(request.data?.cityId, 120);
  if (!cityId) {
    throw new HttpsError("invalid-argument", "cityId is required.");
  }

  const enabled = Boolean(request.data?.enabled);
  const cityRef = db.collection("cities").doc(cityId);
  const citySnap = await cityRef.get();
  if (!citySnap.exists) {
    throw new HttpsError("not-found", "City not found.");
  }

  const scarcityValue = enabled ? randomInt(SCARCITY_MIN_BEDS, SCARCITY_MAX_BEDS) : null;
  const updateData = {
    scarcityEnabled: enabled,
    scarcityMin: SCARCITY_MIN_BEDS,
    scarcityMax: SCARCITY_MAX_BEDS,
    scarcityValue: scarcityValue,
    scarcityUpdatedAtMs: Date.now(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await cityRef.set(updateData, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: enabled ? "city_scarcity_enabled" : "city_scarcity_disabled",
    entityType: "city",
    entityId: cityId,
    metadata: {
      scarcityMin: SCARCITY_MIN_BEDS,
      scarcityMax: SCARCITY_MAX_BEDS,
      scarcityValue,
      refreshWindowMinutes: 15,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    cityId,
    scarcityEnabled: enabled,
    scarcityValue,
    scarcityMin: SCARCITY_MIN_BEDS,
    scarcityMax: SCARCITY_MAX_BEDS,
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
  const submittedAadhaar = sanitizeAadhaar(input.aadhaar ?? input.aadhaarNumber ?? "");

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

  const userRef = db.collection("users").doc(userId);
  const [userSnap, previousBookingsSnap] = await Promise.all([
    userRef.get(),
    db.collection("bookings").where("userId", "==", userId).limit(1).get(),
  ]);
  const userData = userSnap.data() || {};
  let aadhaarRefId = String(userData.aadhaarRefId ?? "").trim();
  let aadhaarStatus = String(userData.aadhaarStatus ?? "").trim();

  if (submittedAadhaar) {
    const identity = await upsertAadhaarIdentity({
      userId,
      aadhaar: submittedAadhaar,
      source: previousBookingsSnap.empty ? "first_booking_optional" : "repeat_booking_required",
    });
    await userRef.set({
      ...aadhaarProfileMutation(identity),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    aadhaarRefId = identity.aadhaarRefId;
    aadhaarStatus = identity.aadhaarStatus;
  }

  if (!previousBookingsSnap.empty && !aadhaarRefId) {
    throw new HttpsError("failed-precondition", "Aadhaar reference is required from your second booking onward.");
  }

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
      const lockSnap = await transaction.get(lockRef);
      const now = Date.now();
      if (lockSnap.exists) {
        const lockData = lockSnap.data() || {};
        const lockedUntilMs = typeof lockData.lockedUntilMs === "number" ? lockData.lockedUntilMs : 0;
        if (lockedUntilMs > now) {
          throw new HttpsError("aborted", "This bed is currently being booked by another user. Please try again.");
        }
      }

      const rate = await enforceRateLimit(transaction, `booking_create_${userId}`, 4, 10 * 60 * 1000);
      if (rate.limited) {
        throw new HttpsError("resource-exhausted", "Too many booking attempts. Wait a few minutes and try again.");
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
        aadhaarRefId: aadhaarRefId || null,
        identityStatusAtBooking: aadhaarRefId ? aadhaarStatus || "submitted" : "not_required_first_booking",
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
          aadhaarRefAttached: Boolean(aadhaarRefId),
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
    const phoneRef = db.collection("security_rate_limits").doc(`otp_phone_${phoneKey}`);
    const ipRef = db.collection("security_rate_limits").doc(`otp_ip_${ipKey}`);

    // Read all transaction docs first, then perform writes to satisfy Firestore ordering rules.
    const phoneSnap = await transaction.get(phoneRef);
    const ipSnap = await transaction.get(ipRef);

    phoneRate = enforceRateLimitWithSnapshot(transaction, phoneRef, phoneSnap, 5, 15 * 60 * 1000);
    ipRate = enforceRateLimitWithSnapshot(transaction, ipRef, ipSnap, 20, 15 * 60 * 1000);
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

exports.submitBookingRating = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const userId = request.auth.uid;
  const bookingId = String(request.data?.bookingId ?? "").trim();
  const ratingOverall = Number(request.data?.ratingOverall ?? 0);
  const ratingComment = normalizeRatingComment(request.data?.ratingComment ?? "");

  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId is required.");
  }
  if (!Number.isInteger(ratingOverall) || ratingOverall < 1 || ratingOverall > 5) {
    throw new HttpsError("invalid-argument", "Rating must be between 1 and 5.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  let bookingCode = bookingId;
  let nextBedRatingAverage = 0;
  let nextBedRatingCount = 0;

  await db.runTransaction(async (transaction) => {
    const bookingSnap = await transaction.get(bookingRef);
    if (!bookingSnap.exists) {
      throw new HttpsError("not-found", "Booking not found.");
    }

    const booking = bookingSnap.data() || {};
    bookingCode = String(booking.bookingCode ?? bookingId);
    if (String(booking.userId ?? "") !== userId) {
      throw new HttpsError("permission-denied", "You can rate only your own booking.");
    }
    if (String(booking.bookingStatus ?? "").toLowerCase() !== "completed") {
      throw new HttpsError("failed-precondition", "Only completed bookings can be rated.");
    }
    if (Number(booking.ratingOverall ?? 0) > 0 || booking.ratingSubmittedAt) {
      throw new HttpsError("already-exists", "This booking has already been rated.");
    }

    const bedId = String(booking.bedId ?? "").trim();
    const bedRef = bedId ? db.collection("beds").doc(bedId) : null;
    const bedSnap = bedRef ? await transaction.get(bedRef) : null;
    const bed = bedSnap?.exists ? bedSnap.data() || {} : {};
    const currentCount = Math.max(0, Number(bed.ratingCount ?? 0));
    const currentAverage = Math.max(0, Number(bed.ratingAverage ?? 0));
    const currentTotal = Number.isFinite(Number(bed.ratingTotal))
      ? Number(bed.ratingTotal)
      : currentAverage * currentCount;
    const nextTotal = currentTotal + ratingOverall;
    nextBedRatingCount = currentCount + 1;
    nextBedRatingAverage = Math.round((nextTotal / nextBedRatingCount) * 10) / 10;

    transaction.update(bookingRef, {
      ratingOverall,
      ratingComment,
      ratingStatus: "submitted",
      ratingSubmittedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (bedRef && bedSnap?.exists) {
      transaction.set(bedRef, {
        ratingAverage: nextBedRatingAverage,
        ratingCount: nextBedRatingCount,
        ratingTotal: nextTotal,
        lastRatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(db.collection("audit_logs").doc(), {
      actorUserId: userId,
      actorRole: "consumer",
      action: "booking_rated",
      entityType: "booking",
      entityId: bookingId,
      metadata: {
        bedId,
        ratingOverall,
        hasComment: ratingComment.length > 0,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return {
    ok: true,
    bookingId,
    bookingCode,
    ratingOverall,
    bedRatingAverage: nextBedRatingAverage,
    bedRatingCount: nextBedRatingCount,
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

exports.refreshCityScarcityValues = onSchedule("every 15 minutes", async () => {
  const citiesSnap = await db.collection("cities").where("scarcityEnabled", "==", true).get();
  if (citiesSnap.empty) {
    return { ok: true, refreshed: 0 };
  }

  const batch = db.batch();
  let refreshed = 0;
  citiesSnap.docs.forEach((cityDoc) => {
    const data = cityDoc.data() || {};
    const min = Number.isFinite(Number(data.scarcityMin)) ? Number(data.scarcityMin) : SCARCITY_MIN_BEDS;
    const max = Number.isFinite(Number(data.scarcityMax)) ? Number(data.scarcityMax) : SCARCITY_MAX_BEDS;
    const safeMin = Math.max(SCARCITY_MIN_BEDS, Math.min(SCARCITY_MAX_BEDS, Math.round(min)));
    const safeMax = Math.max(safeMin, Math.min(SCARCITY_MAX_BEDS, Math.round(max)));
    const scarcityValue = randomInt(safeMin, safeMax);

    batch.set(cityDoc.ref, {
      scarcityValue,
      scarcityUpdatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    refreshed += 1;
  });
  await batch.commit();

  await db.collection("audit_logs").add({
    actorUserId: "system",
    actorRole: "system",
    action: "city_scarcity_refreshed",
    entityType: "city",
    entityId: "all_enabled_cities",
    metadata: {
      refreshed,
      refreshWindowMinutes: 15,
      min: SCARCITY_MIN_BEDS,
      max: SCARCITY_MAX_BEDS,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, refreshed };
});

exports.cancelNoShowBookings = onSchedule("every 1 minutes", async () => {
  const settings = await readPlatformSettings();
  const graceMinutes = clampCheckInGraceMinutes(settings.checkInGraceMinutes);
  const graceMs = graceMinutes * 60 * 1000;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  const confirmedSnap = await db.collection("bookings").where("bookingStatus", "==", "confirmed").get();
  if (confirmedSnap.empty) {
    return { ok: true, cancelled: 0, graceMinutes };
  }

  let cancelled = 0;
  let opCount = 0;
  let batch = db.batch();

  async function flushBatch() {
    if (opCount === 0) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  }

  for (const bookingDoc of confirmedSnap.docs) {
    const booking = bookingDoc.data() || {};
    const checkInMs = toMillisOrNull(booking.checkInAt);
    if (checkInMs === null) {
      continue;
    }
    if (nowMs < checkInMs + graceMs) {
      continue;
    }

    const bookingRef = bookingDoc.ref;
    const bookingAvailabilityRef = db.collection("booking_availability").doc(bookingDoc.id);

    batch.set(bookingRef, {
      bookingStatus: "cancelled",
      cancelReason: "no_check_in_timeout",
      cancelledAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    batch.set(bookingAvailabilityRef, {
      propertyId: String(booking.propertyId ?? ""),
      bedId: String(booking.bedId ?? ""),
      checkInAt: String(booking.checkInAt ?? ""),
      checkOutAt: nowIso,
      bookingStatus: "cancelled",
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    batch.set(db.collection("audit_logs").doc(), {
      actorUserId: "system",
      actorRole: "system",
      action: "booking_auto_cancelled_no_check_in",
      entityType: "booking",
      entityId: bookingDoc.id,
      metadata: {
        graceMinutes,
        checkInAt: String(booking.checkInAt ?? ""),
        cancelledAt: nowIso,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    cancelled += 1;
    opCount += 3;
    if (opCount >= 450) {
      await flushBatch();
    }
  }

  await flushBatch();
  return { ok: true, cancelled, graceMinutes };
});
