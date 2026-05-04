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
const { onCall, HttpsError, onRequest } = require("firebase-functions/v2/https");
const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const crypto = require("node:crypto");
const Razorpay = require("razorpay");

initializeApp();
const db = getFirestore();

const PLATFORM_SETTINGS_COLLECTION = "platform_settings";
const PLATFORM_SETTINGS_DOC_ID = "main";
const LEGACY_PLATFORM_SETTINGS_CITY_DOC = "_platform_cfg";
const DEFAULT_CHECKIN_GRACE_MINUTES = 15;
const MIN_CHECKIN_GRACE_MINUTES = 5;
const MAX_CHECKIN_GRACE_MINUTES = 120;
const DEFAULT_PLATFORM_BOOKING_FEE_INR = 9;
const MIN_PLATFORM_BOOKING_FEE_INR = 0;
const MAX_PLATFORM_BOOKING_FEE_INR = 999;
const SCARCITY_MIN_BEDS = 1;
const SCARCITY_MAX_BEDS = 5;
const AADHAAR_VAULT_COLLECTION = "aadhaar_identity_vault";
const DEMAND_WATCHLIST_COLLECTION = "demand_watchlist";
const DEMAND_PRICING_COLLECTION = "demand_pricing";
const DEMAND_OVERRIDES_COLLECTION = "demand_overrides";
const DEMAND_WARNING_THRESHOLD_PERCENT = 60;
const DEMAND_WATCHLIST_REFRESH_MINUTES = 15;
const DEFAULT_DEMAND_GLOBAL_MAX_CAP_PERCENT = 100;
const DEFAULT_DEMAND_PROPERTY_THRESHOLDS = [
  { minOccupancyPercent: 90, multiplierPercent: 50 },
  { minOccupancyPercent: 70, multiplierPercent: 20 },
];
const DEFAULT_DEMAND_CITY_THRESHOLDS = [
  { minOccupancyPercent: 90, multiplierPercent: 100 },
  { minOccupancyPercent: 80, multiplierPercent: 30 },
];
const DEFAULT_PLATFORM_COMMISSION_PERCENT = 5;
const MIN_PLATFORM_COMMISSION_PERCENT = 0;
const MAX_PLATFORM_COMMISSION_PERCENT = 100;
const DEFAULT_OWNER_REVENUE_SHARE_PERCENT = DEFAULT_PLATFORM_COMMISSION_PERCENT;
const DEFAULT_GATEWAY_FEE_PERCENT = 2;
const RAZORPAY_ORDER_ID_PREFIX = "chk";

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

function clampPlatformBookingFeeInr(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PLATFORM_BOOKING_FEE_INR;
  }
  return Math.max(MIN_PLATFORM_BOOKING_FEE_INR, Math.min(MAX_PLATFORM_BOOKING_FEE_INR, Math.round(parsed)));
}

function clampPlatformCommissionPercent(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PLATFORM_COMMISSION_PERCENT;
  }
  return Math.max(MIN_PLATFORM_COMMISSION_PERCENT, Math.min(MAX_PLATFORM_COMMISSION_PERCENT, Math.round(parsed)));
}

async function readPlatformSettings() {
  const [platformSettingsSnap, legacySettingsSnap] = await Promise.all([
    db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID).get(),
    db.collection("cities").doc(LEGACY_PLATFORM_SETTINGS_CITY_DOC).get(),
  ]);
  const data = platformSettingsSnap.exists ? (platformSettingsSnap.data() || {}) : {};
  const legacyData = legacySettingsSnap.exists ? (legacySettingsSnap.data() || {}) : {};
  return {
    checkInGraceMinutes: clampCheckInGraceMinutes(
      Object.prototype.hasOwnProperty.call(data, "checkInGraceMinutes")
        ? data.checkInGraceMinutes
        : legacyData.checkInGraceMinutes
    ),
    platformFeeInr: clampPlatformBookingFeeInr(
      Object.prototype.hasOwnProperty.call(data, "platformFeeInr")
        ? data.platformFeeInr
        : legacyData.platformFeeInr
    ),
    platformCommissionPercent: clampPlatformCommissionPercent(
      Object.prototype.hasOwnProperty.call(data, "platformCommissionPercent")
        ? data.platformCommissionPercent
        : DEFAULT_PLATFORM_COMMISSION_PERCENT
    ),
  };
}

function assertAuth(auth) {
  if (!auth || !auth.uid) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }
}

function assertInternalOperatorRole(auth) {
  const role = String(auth?.token?.role ?? "").trim().toLowerCase();
  if (role !== "operator" && role !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operators and superadmins can perform this action.");
  }
  return role;
}

function razorpayConfig() {
  const keyId = String(process.env.RAZORPAY_KEY_ID ?? "").trim();
  const keySecret = String(process.env.RAZORPAY_KEY_SECRET ?? "").trim();
  const webhookSecret = String(process.env.RAZORPAY_WEBHOOK_SECRET ?? "").trim();
  return { keyId, keySecret, webhookSecret };
}

function razorpayClient() {
  const { keyId, keySecret } = razorpayConfig();
  if (!keyId || !keySecret) {
    throw new HttpsError("failed-precondition", "Razorpay is not configured. Missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET.");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

function razorpayPaymentSignature(orderId, paymentId) {
  const { keySecret } = razorpayConfig();
  if (!keySecret) {
    throw new HttpsError("failed-precondition", "Razorpay key secret is not configured.");
  }
  return crypto
    .createHmac("sha256", keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

function verifyRazorpayCheckoutSignature(orderId, paymentId, signature) {
  const expected = razorpayPaymentSignature(orderId, paymentId);
  return expected === String(signature ?? "").trim();
}

function verifyRazorpayWebhookSignature(rawBody, signature) {
  const { webhookSecret } = razorpayConfig();
  if (!webhookSecret) {
    throw new HttpsError("failed-precondition", "Razorpay webhook secret is not configured.");
  }
  const expected = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  return expected === String(signature ?? "").trim();
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

function clampPercent(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, parsed));
}

function resolveOwnerRevenueSharePercent(value) {
  return clampPercent(value, DEFAULT_OWNER_REVENUE_SHARE_PERCENT);
}

function resolveGatewayFeePercent(value) {
  return clampPercent(value, DEFAULT_GATEWAY_FEE_PERCENT);
}

function pricingConfigForOwner(ownerData = {}, platformCommissionPercent = DEFAULT_PLATFORM_COMMISSION_PERCENT) {
  const platformDefault = clampPlatformCommissionPercent(platformCommissionPercent);
  // If owner has no explicit commission set, fall back to platform default.
  // If owner has a custom rate (e.g. 25%), use that — even if platform default is higher.
  const ownerHasCustomRate = Object.prototype.hasOwnProperty.call(ownerData, "ownerRevenueSharePercent")
    && ownerData.ownerRevenueSharePercent !== null
    && ownerData.ownerRevenueSharePercent !== undefined;
  const effectiveCommission = ownerHasCustomRate
    ? clampPlatformCommissionPercent(ownerData.ownerRevenueSharePercent)
    : platformDefault;
  return {
    ownerRevenueSharePercent: effectiveCommission,
    gatewayFeePercent: resolveGatewayFeePercent(ownerData.gatewayFeePercent),
  };
}

function finalTotalFromBase(basePrice, pricingConfig = {}) {
  const ownerRevenueSharePercent = resolveOwnerRevenueSharePercent(pricingConfig.ownerRevenueSharePercent);
  const gatewayFeePercent = resolveGatewayFeePercent(pricingConfig.gatewayFeePercent);
  const platformRevenueAmount = Math.round(basePrice * (ownerRevenueSharePercent / 100));
  const gatewayAmount = Math.round(basePrice * (gatewayFeePercent / 100));
  return {
    ownerRevenueSharePercent,
    gatewayFeePercent,
    platformRevenueAmount,
    gatewayAmount,
    totalAmount: basePrice + platformRevenueAmount + gatewayAmount,
  };
}

function applyDemandMultiplier(baseAmount, multiplierPercent = 0) {
  const amount = Math.max(0, Number(baseAmount) || 0);
  const multiplier = Math.max(0, Number(multiplierPercent) || 0);
  return Math.round(amount * (1 + (multiplier / 100)));
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

function isBlockActiveNow(block, nowMs) {
  return isBlockActiveForTime(block, nowMs, nowMs + 1);
}

function isBookingAvailabilityActiveNow(booking, nowMs) {
  const status = String(booking.bookingStatus ?? "").toLowerCase();
  if (status !== "confirmed" && status !== "checked_in") {
    return false;
  }
  const checkOutMs = toMillisOrNull(booking.checkOutAt);
  return checkOutMs === null || checkOutMs > nowMs;
}

function demandScopeDocId(scope, id) {
  return `${scope}_${String(id ?? "").trim()}`;
}

function occupancyPercent(occupiedBeds, activeBookableBeds) {
  if (activeBookableBeds <= 0) {
    return 0;
  }
  return Number(Math.min(100, (occupiedBeds / activeBookableBeds) * 100).toFixed(2));
}

function safePercent(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(0, fallback);
  }
  return Math.max(0, parsed);
}

function normalizeDemandThresholds(value, fallback) {
  const source = Array.isArray(value) && value.length > 0 ? value : fallback;
  return source
    .map((item) => ({
      minOccupancyPercent: safePercent(item?.minOccupancyPercent ?? item?.min),
      multiplierPercent: safePercent(item?.multiplierPercent ?? item?.increasePercent),
    }))
    .filter((item) => item.minOccupancyPercent > 0)
    .sort((a, b) => b.minOccupancyPercent - a.minOccupancyPercent);
}

async function readDemandPricingSettings() {
  const ref = db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return {
    enabled: data.demandPricingEnabled !== false,
    emergencyDisabled: Boolean(data.demandPricingEmergencyDisabled),
    globalMaxCapPercent: safePercent(
      data.demandPricingGlobalMaxCapPercent,
      DEFAULT_DEMAND_GLOBAL_MAX_CAP_PERCENT
    ),
    propertyThresholds: normalizeDemandThresholds(
      data.demandPricingPropertyThresholds,
      DEFAULT_DEMAND_PROPERTY_THRESHOLDS
    ),
    cityThresholds: normalizeDemandThresholds(
      data.demandPricingCityThresholds,
      DEFAULT_DEMAND_CITY_THRESHOLDS
    ),
  };
}

function demandThresholdsFor(scope, settings) {
  return scope === "city" ? settings.cityThresholds : settings.propertyThresholds;
}

function getDemandMultiplierPercent(scope, occupancy, settings) {
  if (!settings.enabled || settings.emergencyDisabled) {
    return 0;
  }
  const percent = safePercent(occupancy);
  const matched = demandThresholdsFor(scope, settings)
    .find((threshold) => percent >= threshold.minOccupancyPercent);
  if (!matched) {
    return 0;
  }
  return Math.min(matched.multiplierPercent, settings.globalMaxCapPercent);
}

function normalizeDemandScope(value) {
  const scope = String(value ?? "").trim().toLowerCase();
  if (scope !== "city" && scope !== "property") {
    throw new HttpsError("invalid-argument", "Demand scope must be city or property.");
  }
  return scope;
}

function clampDemandPercent(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpsError("invalid-argument", `${fieldName} must be a number.`);
  }
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeDemandThresholdPayload(value, fieldName, fallback) {
  if (value === undefined) {
    return fallback;
  }
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) {
    throw new HttpsError("invalid-argument", `${fieldName} must include 1 to 5 threshold rows.`);
  }
  return value
    .map((item) => ({
      minOccupancyPercent: clampDemandPercent(item?.minOccupancyPercent ?? item?.min, `${fieldName} occupancy`),
      multiplierPercent: clampDemandPercent(item?.multiplierPercent ?? item?.increasePercent, `${fieldName} increase`),
    }))
    .filter((item) => item.minOccupancyPercent > 0)
    .sort((a, b) => b.minOccupancyPercent - a.minOccupancyPercent);
}

function nextOwnerDemandOverrideExpiry(nowMs = Date.now()) {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(nowMs + istOffsetMs);
  const year = istNow.getUTCFullYear();
  const month = istNow.getUTCMonth();
  const date = istNow.getUTCDate();
  // Next day 06:00 IST is 00:30 UTC on that next IST date.
  return new Date(Date.UTC(year, month, date + 1, 0, 30, 0, 0));
}

async function getPropertyForDemandControl(propertyId) {
  const propertySnap = await db.collection("properties").doc(propertyId).get();
  if (!propertySnap.exists) {
    throw new HttpsError("not-found", "Property not found.");
  }
  const property = propertySnap.data() || {};
  return {
    propertyId,
    propertyName: String(property.name ?? "").trim(),
    ownerId: String(property.ownerId ?? "").trim(),
    cityId: String(property.cityId ?? "").trim(),
    cityName: String(property.cityName ?? "").trim(),
  };
}

async function getCityForDemandControl(cityId) {
  const citySnap = await db.collection("cities").doc(cityId).get();
  if (!citySnap.exists) {
    throw new HttpsError("not-found", "City not found.");
  }
  const city = citySnap.data() || {};
  return {
    cityId,
    cityName: String(city.name ?? "").trim(),
  };
}

function isDemandOverrideActive(override, nowMs) {
  if (!override || override.active === false) {
    return false;
  }
  const disabledBy = String(override.disabledBy ?? override.manuallyDisabledBy ?? "").trim();
  const explicitlyDisabled = override.disabled === true || disabledBy.length > 0;
  if (!explicitlyDisabled) {
    return false;
  }
  const expiresAtMs = typeof override.expiresAtMs === "number"
    ? override.expiresAtMs
    : timestampToMillis(override.expiresAt);
  return expiresAtMs === null || expiresAtMs > nowMs;
}

function demandReason(scope, occupancy, multiplier) {
  const label = scope === "city" ? "city" : "property";
  const roundedOccupancy = Math.round(safePercent(occupancy));
  const roundedMultiplier = Math.round(safePercent(multiplier));
  if (roundedMultiplier <= 0) {
    return `${label} occupancy is ${roundedOccupancy}%, so demand pricing is not active`;
  }
  return `${label} occupancy is ${roundedOccupancy}%, so demand pricing adds ${roundedMultiplier}%`;
}

function normalizeDemandSummaryData(data, fallbackScope = "") {
  if (!data) {
    return {
      active: false,
      warningActive: false,
      multiplierPercent: 0,
      occupancyPercent: 0,
      source: fallbackScope,
      reason: "",
    };
  }
  const active = Boolean(data.active);
  const warningActive = Boolean(data.warningActive);
  const multiplierPercent = Math.max(0, Number(data.multiplierPercent ?? 0));
  const occupancyPercent = Math.max(0, Number(data.occupancyPercent ?? 0));
  return {
    active,
    warningActive: warningActive || occupancyPercent >= DEMAND_WARNING_THRESHOLD_PERCENT,
    multiplierPercent: active ? multiplierPercent : 0,
    occupancyPercent,
    source: String(data.scope ?? fallbackScope),
    reason: String(data.reason ?? ""),
  };
}

function chooseEffectiveDemandSummary(propertySummary, citySummary) {
  if (propertySummary.active) {
    return propertySummary;
  }
  if (citySummary.active) {
    return citySummary;
  }
  const warningSource = propertySummary.warningActive ? propertySummary : citySummary;
  return {
    ...warningSource,
    active: false,
    multiplierPercent: 0,
  };
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

function computeCheckoutTotals({
  lockedHourlyRate,
  lockedHourlyBaseRate,
  lockedPlatformHourlyRate,
  lockedGatewayHourlyRate,
  platformFeeInr,
  elapsedHours,
  advancePaid,
}) {
  const safeHours = Math.max(1, elapsedHours);
  const legacyPlatformHourlyRate = Number(lockedPlatformHourlyRate ?? 0);
  const legacyGatewayHourlyRate = Number(lockedGatewayHourlyRate ?? 0);
  const hasLegacyRateBreakdown = legacyPlatformHourlyRate > 0 || legacyGatewayHourlyRate > 0;

  let basePrice;
  let commissionAmount;
  let gatewayAmount;
  let bedAmount;
  let platformFeeAmount;
  let totalAmount;

  if (hasLegacyRateBreakdown) {
    basePrice = Math.round(Number(lockedHourlyBaseRate ?? 120) * safeHours);
    commissionAmount = Math.round(legacyPlatformHourlyRate * safeHours);
    gatewayAmount = Math.round(legacyGatewayHourlyRate * safeHours);
    bedAmount = basePrice + commissionAmount + gatewayAmount;
    platformFeeAmount = 0;
    totalAmount = Math.round(Number(lockedHourlyRate ?? bedAmount) * safeHours);
  } else {
    bedAmount = Math.round(Number(lockedHourlyRate ?? 120) * safeHours);
    platformFeeAmount = bedAmount > 0 ? clampPlatformBookingFeeInr(platformFeeInr) : 0;
    basePrice = bedAmount;
    commissionAmount = 0;
    gatewayAmount = 0;
    totalAmount = bedAmount + platformFeeAmount;
  }

  const remainingPaid = Math.max(totalAmount - Number(advancePaid ?? 100), 0);
  return {
    basePrice,
    bedAmount,
    commissionAmount,
    gatewayAmount,
    platformFeeAmount,
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
  const hasOwnerRevenueSharePercent = Object.prototype.hasOwnProperty.call(request.data || {}, "ownerRevenueSharePercent");
  const ownerRevenueSharePercent = hasOwnerRevenueSharePercent
    ? resolveOwnerRevenueSharePercent(request.data?.ownerRevenueSharePercent)
    : null;

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

  const shouldUpdateOwnerRevenueShare = targetRole === "owner" && ownerRevenueSharePercent !== null;
  if (currentTargetRole === targetRole && !shouldUpdateOwnerRevenueShare) {
    return {
      ok: true,
      targetUid,
      role: targetRole,
      previousRole: currentTargetRole,
      changed: false,
    };
  }

  const roleUpdate = {
    role: targetRole,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (shouldUpdateOwnerRevenueShare) {
    roleUpdate.ownerRevenueSharePercent = ownerRevenueSharePercent;
  }

  await targetRef.set(roleUpdate, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "user_role_changed",
    entityType: "user",
    entityId: targetUid,
    metadata: {
      previousRole: currentTargetRole,
      nextRole: targetRole,
      ownerRevenueSharePercent,
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

exports.updatePlatformDefaultCommission = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only superadmin can update the platform default commission.");
  }

  const input = request.data || {};
  if (!Object.prototype.hasOwnProperty.call(input, "platformCommissionPercent")) {
    throw new HttpsError("invalid-argument", "platformCommissionPercent is required.");
  }
  const newDefault = clampPlatformCommissionPercent(input.platformCommissionPercent);

  const currentSettings = await readPlatformSettings();
  const oldDefault = currentSettings.platformCommissionPercent;

  // Save new platform default
  const settingsRef = db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID);
  await settingsRef.set({
    platformCommissionPercent: newDefault,
    updatedBy: callerUid,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  // If increasing, bump all owners whose commission < new default and notify them
  const affectedOwnerIds = [];
  if (newDefault > oldDefault) {
    const ownersSnap = await db.collection("users").where("role", "==", "owner").get();
    const bumpBatch = db.batch();
    for (const ownerDoc of ownersSnap.docs) {
      const ownerData = ownerDoc.data() || {};
      const current = typeof ownerData.ownerRevenueSharePercent === "number"
        ? ownerData.ownerRevenueSharePercent
        : oldDefault;
      if (current < newDefault) {
        bumpBatch.update(ownerDoc.ref, {
          ownerRevenueSharePercent: newDefault,
          updatedAt: FieldValue.serverTimestamp(),
        });
        // Write notice for this owner
        const noticeRef = db.collection("owner_notices").doc();
        bumpBatch.set(noticeRef, {
          ownerId: ownerDoc.id,
          type: "commission_updated",
          title: "Platform commission updated",
          message: `The platform commission has been updated from ${oldDefault}% to ${newDefault}%. Your bed pricing commission is now ${newDefault}%. Consider reviewing your bed prices.`,
          oldCommission: oldDefault,
          newCommission: newDefault,
          dismissed: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        affectedOwnerIds.push(ownerDoc.id);
      }
    }
    await bumpBatch.commit();
  }

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "platform_commission_updated",
    entityType: "access",
    entityId: PLATFORM_SETTINGS_DOC_ID,
    metadata: {
      oldDefault,
      newDefault,
      affectedOwnerCount: affectedOwnerIds.length,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    platformCommissionPercent: newDefault,
    affectedOwnerCount: affectedOwnerIds.length,
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
  const hasCheckInGraceMinutes = Object.prototype.hasOwnProperty.call(input, "checkInGraceMinutes");
  const hasPlatformFeeInr = Object.prototype.hasOwnProperty.call(input, "platformFeeInr");
  if (!hasCheckInGraceMinutes && !hasPlatformFeeInr) {
    throw new HttpsError("invalid-argument", "At least one platform setting is required.");
  }
  const currentSettings = await readPlatformSettings();
  const nextCheckInGraceMinutes = hasCheckInGraceMinutes
    ? clampCheckInGraceMinutes(input.checkInGraceMinutes)
    : currentSettings.checkInGraceMinutes;
  const nextPlatformFeeInr = hasPlatformFeeInr
    ? clampPlatformBookingFeeInr(input.platformFeeInr)
    : currentSettings.platformFeeInr;

  const settingsRef = db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID);
  await settingsRef.set({
    checkInGraceMinutes: nextCheckInGraceMinutes,
    platformFeeInr: nextPlatformFeeInr,
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
      platformFeeInr: nextPlatformFeeInr,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    settings: {
      checkInGraceMinutes: nextCheckInGraceMinutes,
      platformFeeInr: nextPlatformFeeInr,
      platformCommissionPercent: currentSettings.platformCommissionPercent,
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

exports.updateDemandPricingSettings = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "operator" && callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operator or superadmin can update demand pricing settings.");
  }

  const input = request.data || {};
  const currentSettings = await readDemandPricingSettings();
  const nextSettings = {
    enabled: Object.prototype.hasOwnProperty.call(input, "enabled")
      ? Boolean(input.enabled)
      : currentSettings.enabled,
    emergencyDisabled: Object.prototype.hasOwnProperty.call(input, "emergencyDisabled")
      ? Boolean(input.emergencyDisabled)
      : currentSettings.emergencyDisabled,
    globalMaxCapPercent: Object.prototype.hasOwnProperty.call(input, "globalMaxCapPercent")
      ? clampDemandPercent(input.globalMaxCapPercent, "global max cap")
      : currentSettings.globalMaxCapPercent,
    propertyThresholds: normalizeDemandThresholdPayload(
      input.propertyThresholds,
      "property thresholds",
      currentSettings.propertyThresholds
    ),
    cityThresholds: normalizeDemandThresholdPayload(
      input.cityThresholds,
      "city thresholds",
      currentSettings.cityThresholds
    ),
  };

  const settingsRef = db.collection(PLATFORM_SETTINGS_COLLECTION).doc(PLATFORM_SETTINGS_DOC_ID);
  await settingsRef.set({
    demandPricingEnabled: nextSettings.enabled,
    demandPricingEmergencyDisabled: nextSettings.emergencyDisabled,
    demandPricingGlobalMaxCapPercent: nextSettings.globalMaxCapPercent,
    demandPricingPropertyThresholds: nextSettings.propertyThresholds,
    demandPricingCityThresholds: nextSettings.cityThresholds,
    demandPricingUpdatedBy: callerUid,
    demandPricingUpdatedByRole: callerRole,
    demandPricingUpdatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "demand_pricing_settings_updated",
    entityType: "demand_pricing",
    entityId: PLATFORM_SETTINGS_DOC_ID,
    metadata: {
      enabled: nextSettings.enabled,
      emergencyDisabled: nextSettings.emergencyDisabled,
      globalMaxCapPercent: nextSettings.globalMaxCapPercent,
      propertyThresholds: nextSettings.propertyThresholds,
      cityThresholds: nextSettings.cityThresholds,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    settings: nextSettings,
  };
});

exports.setDemandScopeOverride = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "operator" && callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operator or superadmin can control demand overrides.");
  }

  const scope = normalizeDemandScope(request.data?.scope);
  const scopeId = String(request.data?.scopeId ?? request.data?.cityId ?? request.data?.propertyId ?? "").trim();
  const disabled = Boolean(request.data?.disabled);
  const reason = normalizeText(request.data?.reason, 240);
  if (!scopeId) {
    throw new HttpsError("invalid-argument", "scopeId is required.");
  }
  if (disabled && !reason) {
    throw new HttpsError("invalid-argument", "Reason is required when disabling demand pricing.");
  }

  const docId = demandScopeDocId(scope, scopeId);
  const overrideRef = db.collection(DEMAND_OVERRIDES_COLLECTION).doc(docId);
  const nowMs = Date.now();
  let scopeData = {};
  if (scope === "property") {
    scopeData = await getPropertyForDemandControl(scopeId);
  } else {
    scopeData = await getCityForDemandControl(scopeId);
  }

  const updateData = {
    scope,
    scopeId,
    cityId: scope === "city" ? scopeId : scopeData.cityId || null,
    cityName: scopeData.cityName || "",
    propertyId: scope === "property" ? scopeId : null,
    propertyName: scopeData.propertyName || "",
    ownerId: scopeData.ownerId || null,
    active: disabled,
    disabled,
    disabledBy: disabled ? callerRole : null,
    disabledByUserId: disabled ? callerUid : null,
    manuallyDisabledBy: disabled ? callerRole : null,
    reason: disabled ? reason : "",
    canOperatorOverride: true,
    disabledAtMs: disabled ? nowMs : null,
    disabledAt: disabled ? new Date(nowMs).toISOString() : null,
    expiresAtMs: null,
    expiresAt: null,
    clearedAtMs: disabled ? null : nowMs,
    clearedAt: disabled ? null : new Date(nowMs).toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await overrideRef.set(updateData, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: disabled ? "demand_override_disabled" : "demand_override_enabled",
    entityType: "demand_override",
    entityId: docId,
    metadata: {
      scope,
      scopeId,
      reason: reason || null,
      source: "internal_demand_control",
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    scope,
    scopeId,
    overrideId: docId,
    disabled,
  };
});

exports.stopOwnerDemandPricing = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "owner") {
    throw new HttpsError("permission-denied", "Only owners can stop demand pricing for their property.");
  }

  const propertyId = String(request.data?.propertyId ?? "").trim();
  const reason = normalizeText(request.data?.reason || "Owner stopped demand pricing", 240);
  if (!propertyId) {
    throw new HttpsError("invalid-argument", "propertyId is required.");
  }
  const property = await getPropertyForDemandControl(propertyId);
  if (property.ownerId !== callerUid) {
    throw new HttpsError("permission-denied", "You can stop demand pricing only for your own property.");
  }

  const nowMs = Date.now();
  const expiresAt = nextOwnerDemandOverrideExpiry(nowMs);
  const overrideId = demandScopeDocId("property", propertyId);
  await db.collection(DEMAND_OVERRIDES_COLLECTION).doc(overrideId).set({
    scope: "property",
    scopeId: propertyId,
    propertyId,
    propertyName: property.propertyName,
    cityId: property.cityId || null,
    cityName: property.cityName || "",
    ownerId: callerUid,
    active: true,
    disabled: true,
    disabledBy: "owner",
    disabledByUserId: callerUid,
    manuallyDisabledBy: "owner",
    reason,
    canOperatorOverride: true,
    disabledAtMs: nowMs,
    disabledAt: new Date(nowMs).toISOString(),
    expiresAtMs: expiresAt.getTime(),
    expiresAt: expiresAt.toISOString(),
    clearedAtMs: null,
    clearedAt: null,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "owner_demand_pricing_stopped",
    entityType: "demand_override",
    entityId: overrideId,
    metadata: {
      propertyId,
      cityId: property.cityId || null,
      reason,
      expiresAt: expiresAt.toISOString(),
      expiresAtMs: expiresAt.getTime(),
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    propertyId,
    overrideId,
    disabled: true,
    expiresAt: expiresAt.toISOString(),
    expiresAtMs: expiresAt.getTime(),
  };
});

exports.allowOwnerDemandPricing = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);

  const callerUid = request.auth.uid;
  const callerRole = await getCurrentRole(callerUid);
  if (callerRole !== "owner") {
    throw new HttpsError("permission-denied", "Only owners can allow demand pricing for their property.");
  }

  const propertyId = String(request.data?.propertyId ?? "").trim();
  if (!propertyId) {
    throw new HttpsError("invalid-argument", "propertyId is required.");
  }
  const property = await getPropertyForDemandControl(propertyId);
  if (property.ownerId !== callerUid) {
    throw new HttpsError("permission-denied", "You can allow demand pricing only for your own property.");
  }

  const nowMs = Date.now();
  const overrideId = demandScopeDocId("property", propertyId);
  await db.collection(DEMAND_OVERRIDES_COLLECTION).doc(overrideId).set({
    scope: "property",
    scopeId: propertyId,
    propertyId,
    propertyName: property.propertyName,
    cityId: property.cityId || null,
    cityName: property.cityName || "",
    ownerId: callerUid,
    active: false,
    disabled: false,
    disabledBy: null,
    disabledByUserId: null,
    manuallyDisabledBy: null,
    reason: "",
    canOperatorOverride: true,
    expiresAtMs: null,
    expiresAt: null,
    clearedAtMs: nowMs,
    clearedAt: new Date(nowMs).toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  await db.collection("audit_logs").add({
    actorUserId: callerUid,
    actorRole: callerRole,
    action: "owner_demand_pricing_allowed",
    entityType: "demand_override",
    entityId: overrideId,
    metadata: {
      propertyId,
      cityId: property.cityId || null,
    },
    createdAt: FieldValue.serverTimestamp(),
  });

  return {
    ok: true,
    propertyId,
    overrideId,
    disabled: false,
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

  const propertyRef = db.collection("properties").doc(propertyId);
  const propertySnap = await propertyRef.get();
  if (!propertySnap.exists) {
    throw new HttpsError("not-found", "Property not found.");
  }
  const propertyData = propertySnap.data() || {};
  const ownerId = String(propertyData.ownerId ?? "").trim();
  const cityId = String(propertyData.cityId ?? "").trim();

  const ownerSnap = ownerId ? await db.collection("users").doc(ownerId).get() : null;
  const ownerData = ownerSnap && ownerSnap.exists ? (ownerSnap.data() || {}) : {};
  const platformSettings = await readPlatformSettings();
  const platformFeeInr = clampPlatformBookingFeeInr(platformSettings.platformFeeInr);
  const pricingConfig = pricingConfigForOwner(ownerData, platformSettings.platformCommissionPercent);

  const [propertyDemandSnap, cityDemandSnap] = await Promise.all([
    db.collection(DEMAND_PRICING_COLLECTION).doc(demandScopeDocId("property", propertyId)).get(),
    cityId
      ? db.collection(DEMAND_PRICING_COLLECTION).doc(demandScopeDocId("city", cityId)).get()
      : Promise.resolve(null),
  ]);
  const propertyDemandSummary = normalizeDemandSummaryData(propertyDemandSnap?.exists ? propertyDemandSnap.data() : null, "property");
  const cityDemandSummary = normalizeDemandSummaryData(cityDemandSnap?.exists ? cityDemandSnap.data() : null, "city");
  const demandSummary = chooseEffectiveDemandSummary(propertyDemandSummary, cityDemandSummary);
  const demandMultiplierPercent = Math.max(0, Number(demandSummary.multiplierPercent ?? 0));

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
      finalTotal: applyDemandMultiplier(
        computeBasePrice(duration, bed.bedType, {
          hourlyPrice: bed.hourlyPrice,
          overnightPrice: bed.overnightPrice,
          overdayPrice: bed.overdayPrice,
        }),
        demandMultiplierPercent
      ),
    }))
    .sort((a, b) => (a.finalTotal !== b.finalTotal ? a.finalTotal - b.finalTotal : a.bedCode.localeCompare(b.bedCode)))[0];

  const durationBasePrice = computeBasePrice(duration, chosenBed.bedType, {
    hourlyPrice: chosenBed.hourlyPrice,
    overnightPrice: chosenBed.overnightPrice,
    overdayPrice: chosenBed.overdayPrice,
  });
  const durationRateLocked = applyDemandMultiplier(durationBasePrice, demandMultiplierPercent);

  const hourlyBasePrice = computeBasePrice("hourly", chosenBed.bedType, {
    hourlyPrice: chosenBed.hourlyPrice,
    overnightPrice: chosenBed.overnightPrice,
    overdayPrice: chosenBed.overdayPrice,
  });
  const lockedHourlyRate = applyDemandMultiplier(hourlyBasePrice, demandMultiplierPercent);

  const bedAmount = durationRateLocked;
  const basePrice = durationBasePrice;
  const commissionAmount = 0;
  const gatewayAmount = 0;
  const totalAmount = bedAmount + platformFeeInr;
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
        bedAmount,
        commissionAmount,
        gatewayAmount,
        platformFeeAmount: platformFeeInr,
        platformFeePerBooking: platformFeeInr,
        totalAmount,
        advancePaid,
        remainingPaid,
        ownerRevenueSharePercent: pricingConfig.ownerRevenueSharePercent,
        gatewayFeePercent: pricingConfig.gatewayFeePercent,
        demandMultiplierPercent,
        demandLabelSnapshot: demandSummary.active ? "high_demand" : "normal",
        demandSource: demandSummary.source,
        demandReason: demandSummary.reason,
        demandOccupancyPercent: Number(demandSummary.occupancyPercent ?? 0),
        lockedDurationRate: durationRateLocked,
        lockedHourlyRate,
        lockedHourlyBaseRate: lockedHourlyRate,
        lockedPlatformHourlyRate: 0,
        lockedGatewayHourlyRate: 0,
        lockedBookingPlatformFeeInr: platformFeeInr,
        priceLockedAt: FieldValue.serverTimestamp(),
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
          ownerRevenueSharePercent: pricingConfig.ownerRevenueSharePercent,
          gatewayFeePercent: pricingConfig.gatewayFeePercent,
          platformFeeInr,
          demandActiveAtBooking: Boolean(demandSummary.active),
          demandWarningAtBooking: Boolean(demandSummary.warningActive),
          demandMultiplierPercent,
          demandSource: demandSummary.source,
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

exports.createRazorpayCheckoutOrder = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const userId = request.auth.uid;
  const bookingId = String(request.data?.bookingId ?? "").trim();

  if (!bookingId) {
    throw new HttpsError("invalid-argument", "bookingId is required.");
  }

  const bookingRef = db.collection("bookings").doc(bookingId);
  const bookingSnap = await bookingRef.get();
  if (!bookingSnap.exists) {
    throw new HttpsError("not-found", "Booking not found.");
  }
  const bookingData = bookingSnap.data() || {};
  if (String(bookingData.userId ?? "") !== userId) {
    throw new HttpsError("permission-denied", "You are not allowed to create a payment order for this booking.");
  }
  if (String(bookingData.bookingStatus ?? "").toLowerCase() !== "checked_in") {
    throw new HttpsError("failed-precondition", "Only checked-in bookings can initiate online checkout payment.");
  }

  let checkInMs = timestampToMillis(bookingData.checkInAt);
  if (checkInMs === null) {
    checkInMs = Date.now();
  }
  const checkoutMs = Date.now();
  const elapsedHours = Math.max(1, Math.ceil((checkoutMs - checkInMs) / (1000 * 60 * 60)));
  const bedId = String(bookingData.bedId ?? "");

  const paymentSnapshot = await db.collection("payments").where("bookingId", "==", bookingId).limit(1).get();
  if (paymentSnapshot.empty) {
    throw new HttpsError("not-found", "Payment record not found for this booking.");
  }
  const paymentDoc = paymentSnapshot.docs[0];
  const paymentData = paymentDoc.data() || {};
  const advancePaid = Number(paymentData.advancePaid ?? 100);
  const platformSettings = await readPlatformSettings();
  const defaultPlatformFeeInr = clampPlatformBookingFeeInr(platformSettings.platformFeeInr);

  const hasLockedRateSnapshot = Number.isFinite(Number(paymentData.lockedHourlyRate));
  let checkoutTotalsInput;
  if (hasLockedRateSnapshot) {
    checkoutTotalsInput = {
      lockedHourlyRate: Number(paymentData.lockedHourlyRate),
      lockedHourlyBaseRate: Number(paymentData.lockedHourlyBaseRate ?? 120),
      lockedPlatformHourlyRate: Number(paymentData.lockedPlatformHourlyRate ?? 12),
      lockedGatewayHourlyRate: Number(paymentData.lockedGatewayHourlyRate ?? 2),
      platformFeeInr: Number(
        paymentData.lockedBookingPlatformFeeInr
        ?? paymentData.platformFeePerBooking
        ?? paymentData.platformFeeAmount
        ?? defaultPlatformFeeInr
      ),
      elapsedHours,
      advancePaid,
    };
  } else {
    const bedSnap = await db.collection("beds").doc(bedId).get();
    const bedData = bedSnap.exists ? bedSnap.data() : { hourlyPrice: 120, bedType: "NON_AC" };
    const fallbackBaseRate = Number(bedData?.hourlyPrice ?? 120) + (String(bedData?.bedType ?? "NON_AC").toUpperCase() === "AC" ? 50 : 0);
    checkoutTotalsInput = {
      lockedHourlyRate: fallbackBaseRate,
      lockedHourlyBaseRate: fallbackBaseRate,
      lockedPlatformHourlyRate: 0,
      lockedGatewayHourlyRate: 0,
      platformFeeInr: defaultPlatformFeeInr,
      elapsedHours,
      advancePaid,
    };
  }

  const totals = computeCheckoutTotals(checkoutTotalsInput);
  if (totals.remainingPaid <= 0) {
    return {
      ok: true,
      paymentRequired: false,
      bookingId,
      amountInr: 0,
      amountPaise: 0,
      keyId: null,
      orderId: null,
      currency: "INR",
    };
  }

  const client = razorpayClient();
  const { keyId } = razorpayConfig();
  const amountPaise = Math.round(totals.remainingPaid * 100);
  const receipt = `${RAZORPAY_ORDER_ID_PREFIX}_${bookingId.slice(0, 20)}_${Date.now()}`;

  let order;
  try {
    order = await client.orders.create({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: {
        bookingId,
        userId,
        purpose: "checkout_remaining",
      },
    });
  } catch (error) {
    console.error("[createRazorpayCheckoutOrder] Razorpay order creation failed:", error);
    throw new HttpsError("internal", "Could not create Razorpay order. Try again.");
  }

  await paymentDoc.ref.set({
    razorpayOrderId: String(order.id ?? ""),
    razorpayOrderAmountPaise: amountPaise,
    razorpayCurrency: "INR",
    razorpayOrderStatus: String(order.status ?? "created"),
    razorpayOrderCreatedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    ok: true,
    paymentRequired: true,
    bookingId,
    keyId,
    orderId: String(order.id ?? ""),
    amountInr: totals.remainingPaid,
    amountPaise,
    currency: "INR",
    bookingCode: String(bookingData.bookingCode ?? bookingId),
  };
});

exports.completeCheckout = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const userId = request.auth.uid;
  const bookingId = String(request.data?.bookingId ?? "").trim();
  const rawPaymentMethod = String(request.data?.paymentMethod ?? "cash").trim().toLowerCase();
  const paymentMethod = rawPaymentMethod === "online" ? "online" : "cash";
  const razorpayOrderId = String(request.data?.razorpayOrderId ?? "").trim();
  const razorpayPaymentId = String(request.data?.razorpayPaymentId ?? "").trim();
  const razorpaySignature = String(request.data?.razorpaySignature ?? "").trim();

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

  const paymentSnapshot = await db.collection("payments").where("bookingId", "==", bookingId).limit(1).get();
  if (paymentSnapshot.empty) {
    console.error(`[completeCheckout] Payment record missing for booking ${bookingId}`);
    throw new HttpsError("not-found", "Payment record not found for this booking.");
  }

  const paymentDoc = paymentSnapshot.docs[0];
  const paymentRef = paymentDoc.ref;
  const paymentData = paymentDoc.data() || {};
  const advancePaid = Number(paymentData.advancePaid ?? 100);
  const platformSettings = await readPlatformSettings();
  const defaultPlatformFeeInr = clampPlatformBookingFeeInr(platformSettings.platformFeeInr);

  const hasLockedRateSnapshot = Number.isFinite(Number(paymentData.lockedHourlyRate));
  let checkoutTotalsInput;

  if (hasLockedRateSnapshot) {
    checkoutTotalsInput = {
      lockedHourlyRate: Number(paymentData.lockedHourlyRate),
      lockedHourlyBaseRate: Number(paymentData.lockedHourlyBaseRate ?? 120),
      lockedPlatformHourlyRate: Number(paymentData.lockedPlatformHourlyRate ?? 12),
      lockedGatewayHourlyRate: Number(paymentData.lockedGatewayHourlyRate ?? 2),
      platformFeeInr: Number(
        paymentData.lockedBookingPlatformFeeInr
        ?? paymentData.platformFeePerBooking
        ?? paymentData.platformFeeAmount
        ?? defaultPlatformFeeInr
      ),
      elapsedHours,
      advancePaid,
    };
  } else {
    const bedSnap = await db.collection("beds").doc(bedId).get();
    const bedData = bedSnap.exists ? bedSnap.data() : { hourlyPrice: 120, bedType: "NON_AC" };
    const fallbackBaseRate = Number(bedData?.hourlyPrice ?? 120) + (String(bedData?.bedType ?? "NON_AC").toUpperCase() === "AC" ? 50 : 0);

    checkoutTotalsInput = {
      lockedHourlyRate: fallbackBaseRate,
      lockedHourlyBaseRate: fallbackBaseRate,
      lockedPlatformHourlyRate: 0,
      lockedGatewayHourlyRate: 0,
      platformFeeInr: defaultPlatformFeeInr,
      elapsedHours,
      advancePaid,
    };
  }

  const totals = computeCheckoutTotals(checkoutTotalsInput);
  let onlineSettlement = null;
  if (paymentMethod === "online" && totals.remainingPaid > 0) {
    const storedOrderId = String(paymentData.razorpayOrderId ?? "").trim();
    if (!storedOrderId || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
      throw new HttpsError("invalid-argument", "Online checkout requires Razorpay orderId, paymentId, and signature.");
    }
    if (storedOrderId !== razorpayOrderId) {
      throw new HttpsError("failed-precondition", "Razorpay order mismatch for this booking.");
    }
    const signatureValid = verifyRazorpayCheckoutSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
    if (!signatureValid) {
      throw new HttpsError("permission-denied", "Invalid Razorpay payment signature.");
    }
    onlineSettlement = {
      razorpayOrderId,
      razorpayPaymentId,
      razorpaySignature,
      onlinePaidInr: totals.remainingPaid,
    };
  }

  const checkoutIso = new Date(checkoutMs).toISOString();
  const bookingAvailabilityRef = db.collection("booking_availability").doc(bookingId);
  const finalRemainingPaid = paymentMethod === "online" ? 0 : totals.remainingPaid;

  try {
    await db.runTransaction(async (transaction) => {
      transaction.update(bookingRef, {
        checkOutAt: checkoutIso,
        bookingStatus: "completed",
        ownerCheckoutAlert: true,
        elapsedHours,
        paymentMethod,
        ...(paymentMethod === "cash" ? { commissionDueCreated: false } : {}),
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
        bedAmount: totals.bedAmount,
        commissionAmount: totals.commissionAmount,
        gatewayAmount: totals.gatewayAmount,
        platformFeeAmount: totals.platformFeeAmount,
        totalAmount: totals.totalAmount,
        remainingPaid: finalRemainingPaid,
        paymentMethod,
        paymentStatus: finalRemainingPaid > 0 ? "pending_settlement" : "settled",
        ...(onlineSettlement
          ? {
              razorpayOrderId: onlineSettlement.razorpayOrderId,
              razorpayPaymentId: onlineSettlement.razorpayPaymentId,
              razorpaySignature: onlineSettlement.razorpaySignature,
              razorpayCapturedAt: FieldValue.serverTimestamp(),
            }
          : {}),
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
          remainingPaid: finalRemainingPaid,
          paymentMethod,
          razorpayPaymentId: onlineSettlement?.razorpayPaymentId ?? null,
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
    bedAmount: totals.bedAmount,
    platformFeeAmount: totals.platformFeeAmount,
    totalAmount: totals.totalAmount,
    advancePaid,
    remainingPaid: finalRemainingPaid,
    paymentMethod,
    razorpayPaymentId: onlineSettlement?.razorpayPaymentId ?? null,
    checkOutAt: checkoutIso,
  };
});

exports.razorpayWebhook = onRequest(async (request, response) => {
  if (request.method !== "POST") {
    response.status(405).send("Method not allowed");
    return;
  }

  try {
    const signature = String(request.headers["x-razorpay-signature"] ?? "").trim();
    const rawBody = request.rawBody;
    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      response.status(400).send("Missing raw body");
      return;
    }

    const verified = verifyRazorpayWebhookSignature(rawBody, signature);
    if (!verified) {
      response.status(401).send("Invalid signature");
      return;
    }

    const event = request.body || {};
    const eventType = String(event.event ?? "").trim();
    const paymentEntity = event?.payload?.payment?.entity || null;
    const orderEntity = event?.payload?.order?.entity || null;
    const orderId = String(paymentEntity?.order_id ?? orderEntity?.id ?? "").trim();
    const paymentId = String(paymentEntity?.id ?? "").trim();

    if (!orderId) {
      response.status(200).json({ ok: true, ignored: true, reason: "missing_order_id" });
      return;
    }

    const paymentSnap = await db.collection("payments").where("razorpayOrderId", "==", orderId).limit(1).get();
    if (paymentSnap.empty) {
      response.status(200).json({ ok: true, ignored: true, reason: "payment_not_found" });
      return;
    }

    const paymentDoc = paymentSnap.docs[0];
    const paymentData = paymentDoc.data() || {};
    const bookingId = String(paymentData.bookingId ?? "").trim();
    const bookingSnap = bookingId ? await db.collection("bookings").doc(bookingId).get() : null;
    const bookingStatus = String(bookingSnap?.data()?.bookingStatus ?? "").toLowerCase();

    const updateData = {
      razorpayWebhookLastEvent: eventType,
      razorpayWebhookLastAt: FieldValue.serverTimestamp(),
      razorpayPaymentId: paymentId || String(paymentData.razorpayPaymentId ?? ""),
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (eventType === "payment.captured") {
      updateData.paymentStatus = bookingStatus === "completed" ? "settled" : "online_paid_pending_checkout";
      updateData.razorpayCapturedAt = FieldValue.serverTimestamp();
    }

    await paymentDoc.ref.set(updateData, { merge: true });

    await db.collection("audit_logs").add({
      actorUserId: "system",
      actorRole: "system",
      action: "razorpay_webhook_received",
      entityType: "payment",
      entityId: paymentDoc.id,
      metadata: {
        bookingId,
        eventType,
        orderId,
        paymentId: paymentId || null,
      },
      createdAt: FieldValue.serverTimestamp(),
    });

    response.status(200).json({ ok: true });
  } catch (error) {
    console.error("[razorpayWebhook] failed:", error);
    response.status(500).send("Internal error");
  }
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

exports.refreshDemandWatchlist = onSchedule("every 15 minutes", async () => {
  const nowMs = Date.now();
  const [
    propertiesSnap,
    bedsSnap,
    blocksSnap,
    availabilitySnap,
    existingWatchlistSnap,
  ] = await Promise.all([
    db.collection("properties").where("status", "==", "active").get(),
    db.collection("beds").where("active", "==", true).get(),
    db.collection("bed_blocks").where("active", "==", true).get(),
    db.collection("booking_availability").where("bookingStatus", "in", ["confirmed", "checked_in"]).get(),
    db.collection(DEMAND_WATCHLIST_COLLECTION).get(),
  ]);

  const propertyMap = new Map();
  propertiesSnap.docs.forEach((propertyDoc) => {
    const data = propertyDoc.data() || {};
    propertyMap.set(propertyDoc.id, {
      propertyId: propertyDoc.id,
      cityId: String(data.cityId ?? "").trim(),
      cityName: String(data.cityName ?? "").trim(),
      propertyName: String(data.name ?? "").trim(),
      ownerId: String(data.ownerId ?? "").trim(),
    });
  });

  const activeBedsByProperty = new Map();
  bedsSnap.docs.forEach((bedDoc) => {
    const bed = bedDoc.data() || {};
    const propertyId = String(bed.propertyId ?? "").trim();
    if (!propertyId || !propertyMap.has(propertyId)) {
      return;
    }
    if (!activeBedsByProperty.has(propertyId)) {
      activeBedsByProperty.set(propertyId, []);
    }
    activeBedsByProperty.get(propertyId).push({
      bedId: bedDoc.id,
      propertyId,
    });
  });

  const blockedBedIds = new Set(blocksSnap.docs
    .map((blockDoc) => blockDoc.data() || {})
    .filter((block) => isBlockActiveNow(block, nowMs))
    .map((block) => String(block.bedId ?? "").trim())
    .filter(Boolean));

  const activeBookedBedIds = new Set(availabilitySnap.docs
    .map((bookingDoc) => bookingDoc.data() || {})
    .filter((booking) => isBookingAvailabilityActiveNow(booking, nowMs))
    .map((booking) => String(booking.bedId ?? "").trim())
    .filter(Boolean));

  const propertyStats = [];
  const cityStatsMap = new Map();

  propertyMap.forEach((property) => {
    const beds = activeBedsByProperty.get(property.propertyId) || [];
    const activeBookableBedIds = beds
      .map((bed) => bed.bedId)
      .filter((bedId) => !blockedBedIds.has(bedId));
    const activeBookableBeds = activeBookableBedIds.length;
    const occupiedBeds = activeBookableBedIds
      .filter((bedId) => activeBookedBedIds.has(bedId))
      .length;
    const percent = occupancyPercent(occupiedBeds, activeBookableBeds);

    const item = {
      ...property,
      scope: "property",
      activeBookableBeds,
      occupiedBeds,
      occupancyPercent: percent,
    };
    propertyStats.push(item);

    if (property.cityId) {
      const currentCity = cityStatsMap.get(property.cityId) || {
        scope: "city",
        cityId: property.cityId,
        cityName: property.cityName,
        activeBookableBeds: 0,
        occupiedBeds: 0,
        propertyCount: 0,
      };
      currentCity.activeBookableBeds += activeBookableBeds;
      currentCity.occupiedBeds += occupiedBeds;
      currentCity.propertyCount += 1;
      cityStatsMap.set(property.cityId, currentCity);
    }
  });

  const cityStats = [...cityStatsMap.values()].map((city) => ({
    ...city,
    occupancyPercent: occupancyPercent(city.occupiedBeds, city.activeBookableBeds),
  }));
  const watchItems = [...propertyStats, ...cityStats]
    .filter((item) => item.occupancyPercent >= DEMAND_WARNING_THRESHOLD_PERCENT);

  const activeWatchIds = new Set(watchItems.map((item) => (
    item.scope === "city"
      ? demandScopeDocId("city", item.cityId)
      : demandScopeDocId("property", item.propertyId)
  )));

  let batch = db.batch();
  let opCount = 0;
  let watching = 0;
  let belowThreshold = 0;

  async function flushBatch() {
    if (opCount === 0) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  }

  for (const item of watchItems) {
    const scopeId = item.scope === "city" ? item.cityId : item.propertyId;
    const docId = demandScopeDocId(item.scope, scopeId);
    const ref = db.collection(DEMAND_WATCHLIST_COLLECTION).doc(docId);
    batch.set(ref, {
      scope: item.scope,
      scopeId,
      cityId: item.cityId || null,
      cityName: item.cityName || "",
      propertyId: item.propertyId || null,
      propertyName: item.propertyName || "",
      ownerId: item.ownerId || null,
      occupancyPercent: item.occupancyPercent,
      activeBookableBeds: item.activeBookableBeds,
      occupiedBeds: item.occupiedBeds,
      warningActive: true,
      status: "watching",
      refreshWindowMinutes: DEMAND_WATCHLIST_REFRESH_MINUTES,
      lastCheckedAtMs: nowMs,
      lastCheckedAt: new Date(nowMs).toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    watching += 1;
    opCount += 1;
    if (opCount >= 450) {
      await flushBatch();
    }
  }

  for (const watchDoc of existingWatchlistSnap.docs) {
    if (activeWatchIds.has(watchDoc.id)) {
      continue;
    }
    const data = watchDoc.data() || {};
    if (String(data.status ?? "") === "below_threshold") {
      continue;
    }
    batch.set(watchDoc.ref, {
      warningActive: false,
      status: "below_threshold",
      lastCheckedAtMs: nowMs,
      lastCheckedAt: new Date(nowMs).toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    belowThreshold += 1;
    opCount += 1;
    if (opCount >= 450) {
      await flushBatch();
    }
  }

  batch.set(db.collection("audit_logs").doc(), {
    actorUserId: "system",
    actorRole: "system",
    action: "demand_watchlist_refreshed",
    entityType: "demand_watchlist",
    entityId: "all_scopes",
    metadata: {
      warningThresholdPercent: DEMAND_WARNING_THRESHOLD_PERCENT,
      refreshWindowMinutes: DEMAND_WATCHLIST_REFRESH_MINUTES,
      propertyScopesChecked: propertyStats.length,
      cityScopesChecked: cityStats.length,
      watching,
      belowThreshold,
    },
    createdAt: FieldValue.serverTimestamp(),
  });
  opCount += 1;
  await flushBatch();

  return {
    ok: true,
    warningThresholdPercent: DEMAND_WARNING_THRESHOLD_PERCENT,
    propertyScopesChecked: propertyStats.length,
    cityScopesChecked: cityStats.length,
    watching,
    belowThreshold,
  };
});

exports.refreshDemandPricing = onSchedule("every 15 minutes", async () => {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const settings = await readDemandPricingSettings();
  const [
    watchlistSnap,
    overridesSnap,
    existingPricingSnap,
  ] = await Promise.all([
    db.collection(DEMAND_WATCHLIST_COLLECTION).where("status", "==", "watching").get(),
    db.collection(DEMAND_OVERRIDES_COLLECTION).get(),
    db.collection(DEMAND_PRICING_COLLECTION).get(),
  ]);

  const overridesById = new Map();
  overridesSnap.docs.forEach((overrideDoc) => {
    overridesById.set(overrideDoc.id, overrideDoc.data() || {});
  });

  const watchItems = watchlistSnap.docs
    .map((watchDoc) => ({ id: watchDoc.id, ...(watchDoc.data() || {}) }))
    .filter((item) => String(item.scope ?? "") === "city" || String(item.scope ?? "") === "property");

  const cityMultipliers = new Map();
  watchItems
    .filter((item) => String(item.scope ?? "") === "city")
    .forEach((item) => {
      const cityId = String(item.cityId ?? item.scopeId ?? "").trim();
      if (!cityId) {
        return;
      }
      const docId = demandScopeDocId("city", cityId);
      const override = overridesById.get(docId);
      const overrideActive = isDemandOverrideActive(override, nowMs);
      const multiplier = overrideActive
        ? 0
        : getDemandMultiplierPercent("city", item.occupancyPercent, settings);
      cityMultipliers.set(cityId, {
        multiplier,
        overrideActive,
      });
    });

  let batch = db.batch();
  let opCount = 0;
  let activeSummaries = 0;
  let inactiveSummaries = 0;
  let ownerStopped = 0;
  const seenPricingIds = new Set();

  async function flushBatch() {
    if (opCount === 0) {
      return;
    }
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  }

  for (const item of watchItems) {
    const scope = String(item.scope ?? "");
    const scopeId = scope === "city"
      ? String(item.cityId ?? item.scopeId ?? "").trim()
      : String(item.propertyId ?? item.scopeId ?? "").trim();
    if (!scopeId) {
      continue;
    }

    const docId = demandScopeDocId(scope, scopeId);
    const override = overridesById.get(docId);
    const overrideActive = isDemandOverrideActive(override, nowMs);
    const scopeMultiplier = overrideActive
      ? 0
      : getDemandMultiplierPercent(scope, item.occupancyPercent, settings);
    const cityContext = scope === "property"
      ? cityMultipliers.get(String(item.cityId ?? "").trim()) || { multiplier: 0, overrideActive: false }
      : { multiplier: scopeMultiplier, overrideActive };
    const finalMultiplier = overrideActive
      ? 0
      : Math.min(
        Math.max(scopeMultiplier, scope === "property" ? cityContext.multiplier : 0),
        settings.globalMaxCapPercent
      );
    const active = settings.enabled &&
      !settings.emergencyDisabled &&
      !overrideActive &&
      finalMultiplier > 0;
    const disabledBy = String(override?.disabledBy ?? override?.manuallyDisabledBy ?? "").trim();
    const stoppedByOwner = overrideActive && disabledBy === "owner";
    if (stoppedByOwner) {
      ownerStopped += 1;
    }

    const ref = db.collection(DEMAND_PRICING_COLLECTION).doc(docId);
    batch.set(ref, {
      active,
      scope,
      scopeId,
      cityId: item.cityId || null,
      cityName: item.cityName || "",
      propertyId: item.propertyId || null,
      propertyName: item.propertyName || "",
      ownerId: item.ownerId || null,
      occupancyPercent: safePercent(item.occupancyPercent),
      activeBookableBeds: Number(item.activeBookableBeds ?? 0),
      occupiedBeds: Number(item.occupiedBeds ?? 0),
      scopeMultiplierPercent: scopeMultiplier,
      cityMultiplierPercent: scope === "property" ? cityContext.multiplier : scopeMultiplier,
      multiplierPercent: finalMultiplier,
      globalMaxCapPercent: settings.globalMaxCapPercent,
      warningActive: safePercent(item.occupancyPercent) >= DEMAND_WARNING_THRESHOLD_PERCENT,
      stoppedByOwner,
      overrideActive,
      overrideReason: String(override?.reason ?? ""),
      overrideExpiresAt: override?.expiresAt ?? null,
      manuallyDisabledBy: disabledBy || null,
      emergencyDisabled: settings.emergencyDisabled,
      pricingEnabled: settings.enabled,
      reason: active
        ? demandReason(scope, item.occupancyPercent, finalMultiplier)
        : (overrideActive
          ? "Demand pricing is disabled by override"
          : demandReason(scope, item.occupancyPercent, finalMultiplier)),
      status: active ? "active" : (overrideActive ? "override_disabled" : "inactive"),
      calculatedAtMs: nowMs,
      calculatedAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    seenPricingIds.add(docId);
    if (active) {
      activeSummaries += 1;
    } else {
      inactiveSummaries += 1;
    }
    opCount += 1;
    if (opCount >= 450) {
      await flushBatch();
    }
  }

  for (const overrideDoc of overridesSnap.docs) {
    const override = overrideDoc.data() || {};
    if (!isDemandOverrideActive(override, nowMs)) {
      continue;
    }
    if (seenPricingIds.has(overrideDoc.id)) {
      continue;
    }
    const scope = String(override.scope ?? "").trim();
    if (scope !== "property") {
      continue;
    }
    const propertyId = String(override.propertyId ?? "").trim();
    if (!propertyId) {
      continue;
    }
    const disabledBy = String(override.disabledBy ?? override.manuallyDisabledBy ?? "").trim();
    const ref = db.collection(DEMAND_PRICING_COLLECTION).doc(overrideDoc.id);
    batch.set(ref, {
      active: false,
      scope: "property",
      scopeId: propertyId,
      propertyId,
      cityId: override.cityId || null,
      ownerId: override.ownerId || null,
      multiplierPercent: 0,
      scopeMultiplierPercent: 0,
      cityMultiplierPercent: 0,
      globalMaxCapPercent: settings.globalMaxCapPercent,
      warningActive: false,
      stoppedByOwner: disabledBy === "owner",
      overrideActive: true,
      overrideReason: String(override.reason ?? ""),
      overrideExpiresAt: override.expiresAt ?? null,
      manuallyDisabledBy: disabledBy || null,
      emergencyDisabled: settings.emergencyDisabled,
      pricingEnabled: settings.enabled,
      reason: "Demand pricing is disabled by override",
      status: "override_disabled",
      calculatedAtMs: nowMs,
      calculatedAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    seenPricingIds.add(overrideDoc.id);
    inactiveSummaries += 1;
    if (disabledBy === "owner") {
      ownerStopped += 1;
    }
    opCount += 1;
    if (opCount >= 450) {
      await flushBatch();
    }
  }

  for (const pricingDoc of existingPricingSnap.docs) {
    if (seenPricingIds.has(pricingDoc.id)) {
      continue;
    }
    const data = pricingDoc.data() || {};
    if (data.active === false && String(data.status ?? "") === "below_threshold") {
      continue;
    }
    batch.set(pricingDoc.ref, {
      active: false,
      multiplierPercent: 0,
      scopeMultiplierPercent: 0,
      cityMultiplierPercent: 0,
      warningActive: false,
      reason: "Demand pricing is below threshold",
      status: "below_threshold",
      calculatedAtMs: nowMs,
      calculatedAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    inactiveSummaries += 1;
    opCount += 1;
    if (opCount >= 450) {
      await flushBatch();
    }
  }

  batch.set(db.collection("audit_logs").doc(), {
    actorUserId: "system",
    actorRole: "system",
    action: "demand_pricing_refreshed",
    entityType: "demand_pricing",
    entityId: "all_scopes",
    metadata: {
      watchItems: watchItems.length,
      activeSummaries,
      inactiveSummaries,
      ownerStopped,
      pricingEnabled: settings.enabled,
      emergencyDisabled: settings.emergencyDisabled,
      globalMaxCapPercent: settings.globalMaxCapPercent,
      refreshWindowMinutes: DEMAND_WATCHLIST_REFRESH_MINUTES,
    },
    createdAt: FieldValue.serverTimestamp(),
  });
  opCount += 1;
  await flushBatch();

  return {
    ok: true,
    watchItems: watchItems.length,
    activeSummaries,
    inactiveSummaries,
    ownerStopped,
    pricingEnabled: settings.enabled,
    emergencyDisabled: settings.emergencyDisabled,
    globalMaxCapPercent: settings.globalMaxCapPercent,
  };
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

// ─── Commission Due Tracking ──────────────────────────────────────────────────

const OWNER_COMMISSION_DUES_COLLECTION = "owner_commission_dues";
const OPERATOR_NOTICES_COLLECTION = "operator_notices";

async function createCommissionDuesNow({ actorUserId = "system", actorRole = "system", trigger = "schedule" } = {}) {
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Query completed cash bookings that have not had a commission due created yet
  const completedSnap = await db.collection("bookings")
    .where("bookingStatus", "==", "completed")
    .where("paymentMethod", "==", "cash")
    .where("commissionDueCreated", "==", false)
    .get();

  if (completedSnap.empty) {
    return { ok: true, created: 0 };
  }

  const platformSettings = await readPlatformSettings();
  const platformCommissionPercent = clampPlatformCommissionPercent(
    platformSettings.platformCommissionPercent
  );

  let created = 0;
  let batch = db.batch();
  let opCount = 0;

  async function flushCommissionBatch() {
    if (opCount === 0) return;
    await batch.commit();
    batch = db.batch();
    opCount = 0;
  }

  for (const bookingDoc of completedSnap.docs) {
    const booking = bookingDoc.data() || {};
    const bookingId = bookingDoc.id;
    const ownerId = String(booking.ownerId ?? "").trim();
    const propertyId = String(booking.propertyId ?? "").trim();
    const bedId = String(booking.bedId ?? "").trim();
    if (!ownerId) continue;

    // Fetch the payment record to get the actual bedAmount settled
    const paymentSnap = await db.collection("payments")
      .where("bookingId", "==", bookingId)
      .limit(1)
      .get();
    if (paymentSnap.empty) continue;

    const payment = paymentSnap.docs[0].data() || {};
    const bedAmount = Number(payment.bedAmount ?? 0);
    if (bedAmount <= 0) continue;

    // Get per-owner commission if set, else use platform default
    const ownerSnap = await db.collection("users").doc(ownerId).get();
    const ownerData = ownerSnap.exists ? (ownerSnap.data() || {}) : {};
    const effectiveCommissionPercent = Number.isFinite(Number(ownerData.ownerRevenueSharePercent))
      ? clampPlatformCommissionPercent(Number(ownerData.ownerRevenueSharePercent))
      : platformCommissionPercent;

    const commissionAmountInr = Math.round(bedAmount * effectiveCommissionPercent / 100);

    // Write due doc
    const dueRef = db.collection(OWNER_COMMISSION_DUES_COLLECTION).doc();
    batch.set(dueRef, {
      ownerId,
      bookingId,
      propertyId,
      bedId,
      commissionPercent: effectiveCommissionPercent,
      commissionAmountInr,
      bedAmount,
      status: "pending",
      bookingCompletedAt: booking.checkOutAt ?? nowIso,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    opCount += 1;

    // Mark booking so it won't be re-processed
    batch.set(bookingDoc.ref, { commissionDueCreated: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    opCount += 1;

    // Increment owner's running total
    batch.set(db.collection("users").doc(ownerId), {
      pendingCommissionInr: FieldValue.increment(commissionAmountInr),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    opCount += 1;

    created += 1;

    if (opCount >= 450) {
      await flushCommissionBatch();
    }
  }

  await flushCommissionBatch();

  await db.collection("audit_logs").add({
    actorUserId,
    actorRole,
    action: "commission_dues_created",
    entityType: "platform",
    entityId: "commission_dues_job",
    metadata: { created, ranAt: nowIso, trigger },
    createdAt: FieldValue.serverTimestamp(),
  });

  return { ok: true, created, ranAt: nowIso };
}

// Runs daily at 02:00 IST (UTC+5:30 = 20:30 UTC previous day)
exports.createCommissionDues = onSchedule("every day 20:30", async () => {
  return createCommissionDuesNow({
    actorUserId: "system",
    actorRole: "system",
    trigger: "schedule",
  });
});

exports.runCommissionDuesNow = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const callerRole = assertInternalOperatorRole(request.auth);
  const actorUserId = request.auth.uid;
  const result = await createCommissionDuesNow({
    actorUserId,
    actorRole: callerRole,
    trigger: "manual",
  });
  return result;
});

exports.markCommissionDuePaid = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const userId = request.auth.uid;
  const dueId = String(request.data?.dueId ?? "").trim();
  if (!dueId) throw new HttpsError("invalid-argument", "dueId is required.");

  const dueRef = db.collection(OWNER_COMMISSION_DUES_COLLECTION).doc(dueId);
  const dueSnap = await dueRef.get();
  if (!dueSnap.exists) throw new HttpsError("not-found", "Commission due not found.");

  const due = dueSnap.data() || {};
  if (String(due.ownerId ?? "") !== userId) {
    throw new HttpsError("permission-denied", "You can only mark your own dues as paid.");
  }
  if (String(due.status ?? "") !== "pending") {
    throw new HttpsError("failed-precondition", "This due is not in pending state.");
  }

  const nowIso = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    transaction.update(dueRef, {
      status: "claimed",
      claimedAt: nowIso,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Notify operator
    transaction.set(db.collection(OPERATOR_NOTICES_COLLECTION).doc(), {
      type: "commission_due_claimed",
      title: "Owner marked commission as paid",
      message: `Owner ${userId} has claimed payment of ₹${due.commissionAmountInr} for booking ${due.bookingId}. Please confirm receipt.`,
      ownerId: userId,
      dueId,
      bookingId: String(due.bookingId ?? ""),
      commissionAmountInr: Number(due.commissionAmountInr ?? 0),
      dismissed: false,
      createdAt: FieldValue.serverTimestamp(),
    });

    transaction.set(db.collection("audit_logs").doc(), {
      actorUserId: userId,
      actorRole: "owner",
      action: "commission_due_claimed",
      entityType: "commission_due",
      entityId: dueId,
      metadata: { bookingId: String(due.bookingId ?? ""), commissionAmountInr: Number(due.commissionAmountInr ?? 0) },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, dueId, status: "claimed" };
});

exports.confirmCommissionDueSettlement = onCall({ cors: true }, async (request) => {
  assertAuth(request.auth);
  const callerRole = request.auth.token?.role ?? "";
  if (callerRole !== "operator" && callerRole !== "superadmin") {
    throw new HttpsError("permission-denied", "Only operators and superadmins can confirm settlements.");
  }
  const operatorId = request.auth.uid;
  const dueId = String(request.data?.dueId ?? "").trim();
  if (!dueId) throw new HttpsError("invalid-argument", "dueId is required.");

  const dueRef = db.collection(OWNER_COMMISSION_DUES_COLLECTION).doc(dueId);
  const dueSnap = await dueRef.get();
  if (!dueSnap.exists) throw new HttpsError("not-found", "Commission due not found.");

  const due = dueSnap.data() || {};
  const currentStatus = String(due.status ?? "");
  if (currentStatus !== "claimed" && currentStatus !== "pending") {
    throw new HttpsError("failed-precondition", "This due has already been confirmed or is in an invalid state.");
  }

  const ownerId = String(due.ownerId ?? "");
  const commissionAmountInr = Number(due.commissionAmountInr ?? 0);
  const nowIso = new Date().toISOString();

  await db.runTransaction(async (transaction) => {
    transaction.update(dueRef, {
      status: "confirmed",
      confirmedAt: nowIso,
      confirmedByOperatorId: operatorId,
      updatedAt: FieldValue.serverTimestamp(),
    });

    if (ownerId && commissionAmountInr > 0) {
      transaction.set(db.collection("users").doc(ownerId), {
        pendingCommissionInr: FieldValue.increment(-commissionAmountInr),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(db.collection("audit_logs").doc(), {
      actorUserId: operatorId,
      actorRole: callerRole,
      action: "commission_due_confirmed",
      entityType: "commission_due",
      entityId: dueId,
      metadata: { ownerId, bookingId: String(due.bookingId ?? ""), commissionAmountInr },
      createdAt: FieldValue.serverTimestamp(),
    });
  });

  return { ok: true, dueId, status: "confirmed" };
});
