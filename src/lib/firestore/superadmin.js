import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import {
  confirmCommissionDueSettlement,
  revealAadhaarBreakGlass,
  runCommissionDuesNow,
  setDemandScopeOverride,
  setOwnerCommissionOverride,
  setUserRole,
  updateDemandPricingSettings,
  updatePlatformDefaultCommission,
} from "@/lib/cloud/security";

export const DEFAULT_DEMAND_SETTINGS = {
  enabled: true,
  emergencyDisabled: false,
  globalMaxCapPercent: 100,
  propertyThresholds: [
    { minOccupancyPercent: 90, multiplierPercent: 50 },
    { minOccupancyPercent: 70, multiplierPercent: 20 },
  ],
  cityThresholds: [
    { minOccupancyPercent: 90, multiplierPercent: 100 },
    { minOccupancyPercent: 80, multiplierPercent: 30 },
  ],
};

// Write an audit log directly (avoids undeployed callable)
async function writeAuditLog(action, entityType, entityId, metadata) {
  try {
    const uid = getAuth().currentUser?.uid ?? "unknown";
    await addDoc(collection(db, COLLECTIONS.auditLogs), {
      action,
      entityType,
      entityId,
      metadata: metadata ?? {},
      performedBy: uid,
      createdAt: serverTimestamp(),
    });
  } catch {
    // audit log failure must never block the main operation
  }
}

function toMillis(value) {
  if (!value) return null;
  if (typeof value === "string") {
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value) {
    const date = value.toDate();
    return date.getTime();
  }
  return null;
}

function startOfTodayMillis(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

export async function getDashboardMetrics() {
  const now = new Date();
  const todayStart = startOfTodayMillis(now);
  const [bookingsSnapshot, paymentsSnapshot, propertiesSnapshot, ownersSnapshot] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.bookings)),
    getDocs(collection(db, COLLECTIONS.payments)),
    getDocs(query(collection(db, COLLECTIONS.properties), where("status", "==", "active"))),
    getDocs(query(collection(db, COLLECTIONS.users), where("role", "==", "owner"))),
  ]);

  let bookingsToday = 0;
  let grossCollectionToday = 0;
  let commissionToday = 0;

  bookingsSnapshot.docs.forEach((item) => {
    const data = item.data();
    const createdMillis = toMillis(data.createdAt);
    if (createdMillis && createdMillis >= todayStart) bookingsToday += 1;
  });

  let totalPayments = 0;
  let successfulPayments = 0;
  paymentsSnapshot.docs.forEach((item) => {
    const data = item.data();
    const createdMillis = toMillis(data.createdAt);
    const totalAmount = Number(data.totalAmount ?? 0);
    const commissionAmount = Number(data.commissionAmount ?? 0);
    const paymentStatus = String(data.paymentStatus ?? "");

    if (createdMillis && createdMillis >= todayStart) {
      grossCollectionToday += Number.isNaN(totalAmount) ? 0 : totalAmount;
      commissionToday += Number.isNaN(commissionAmount) ? 0 : commissionAmount;
    }
    totalPayments += 1;
    if (paymentStatus !== "failed") successfulPayments += 1;
  });

  const paymentSuccessRate = totalPayments === 0 ? 0 : Math.round((successfulPayments / totalPayments) * 100);
  return {
    bookingsToday,
    grossCollectionToday,
    commissionToday,
    activeProperties: propertiesSnapshot.size,
    activeOwners: ownersSnapshot.size,
    paymentSuccessRate,
  };
}

export async function getGrowthStats() {
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

  const [bookingsSnap, paymentsSnap, propertiesSnap, citiesSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.bookings)),
    getDocs(collection(db, COLLECTIONS.payments)),
    getDocs(collection(db, COLLECTIONS.properties)),
    getDocs(collection(db, COLLECTIONS.cities)),
  ]);

  // property → cityId
  const propCityMap = {};
  propertiesSnap.docs.forEach((d) => {
    propCityMap[d.id] = String(d.data().cityId ?? "");
  });

  // cityId → name
  const cityNameMap = {};
  citiesSnap.docs.forEach((d) => {
    if (d.id !== "_platform_cfg") cityNameMap[d.id] = String(d.data().name ?? d.id);
  });

  // Init 7-day buckets (today is index 0, 6 days ago is index 6)
  const dailyMap = {};
  for (let i = 6; i >= 0; i--) {
    const key = new Date(now - i * 86400000).toISOString().slice(0, 10);
    dailyMap[key] = { date: key, bookings: 0 };
  }

  // Tally bookings per day
  bookingsSnap.docs.forEach((d) => {
    const data = d.data();
    const ms = toMillis(data.createdAt);
    if (!ms || ms < sevenDaysAgo) return;
    const key = new Date(ms).toISOString().slice(0, 10);
    if (dailyMap[key]) dailyMap[key].bookings += 1;
  });

  // Tally payments per day (gross) and per city
  const dailyGrossMap = {};
  const cityMap = {};

  paymentsSnap.docs.forEach((d) => {
    const data = d.data();
    const ms = toMillis(data.createdAt);
    const gross = Number(data.totalAmount ?? 0);
    const status = String(data.paymentStatus ?? "");
    if (status === "failed") return;

    if (ms && ms >= sevenDaysAgo) {
      const key = new Date(ms).toISOString().slice(0, 10);
      dailyGrossMap[key] = (dailyGrossMap[key] ?? 0) + gross;
    }

    // city breakdown uses all-time payments
    const cityId = propCityMap[String(data.propertyId ?? "")] ?? "";
    if (cityId) {
      if (!cityMap[cityId]) cityMap[cityId] = { name: cityNameMap[cityId] ?? "Unknown", bookings: 0, gross: 0 };
      cityMap[cityId].gross += gross;
    }
  });

  // Count all-time bookings per city
  bookingsSnap.docs.forEach((d) => {
    const data = d.data();
    const cityId = propCityMap[String(data.propertyId ?? "")] ?? "";
    if (cityId) {
      if (!cityMap[cityId]) cityMap[cityId] = { name: cityNameMap[cityId] ?? "Unknown", bookings: 0, gross: 0 };
      cityMap[cityId].bookings += 1;
    }
  });

  const dailyTrend = Object.values(dailyMap).map((row) => ({
    ...row,
    gross: dailyGrossMap[row.date] ?? 0,
  }));

  const cityBreakdown = Object.values(cityMap).sort((a, b) => b.bookings - a.bookings);

  return { dailyTrend, cityBreakdown };
}

function normalizeDemandSettings(data = {}) {
  return {
    enabled: data.demandPricingEnabled !== false,
    emergencyDisabled: Boolean(data.demandPricingEmergencyDisabled),
    globalMaxCapPercent: Number(data.demandPricingGlobalMaxCapPercent ?? DEFAULT_DEMAND_SETTINGS.globalMaxCapPercent),
    propertyThresholds: Array.isArray(data.demandPricingPropertyThresholds) && data.demandPricingPropertyThresholds.length > 0
      ? data.demandPricingPropertyThresholds
      : DEFAULT_DEMAND_SETTINGS.propertyThresholds,
    cityThresholds: Array.isArray(data.demandPricingCityThresholds) && data.demandPricingCityThresholds.length > 0
      ? data.demandPricingCityThresholds
      : DEFAULT_DEMAND_SETTINGS.cityThresholds,
  };
}

export async function getDemandPricingSettings() {
  const snap = await getDoc(doc(db, COLLECTIONS.platformSettings, "main"));
  return normalizeDemandSettings(snap.exists() ? snap.data() : {});
}

export async function saveDemandPricingSettings(payload) {
  const result = await updateDemandPricingSettings(payload);
  return result ?? DEFAULT_DEMAND_SETTINGS;
}

export async function getDemandPricingOverview() {
  const [pricingSnap, overrideSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.demandPricing)),
    getDocs(collection(db, COLLECTIONS.demandOverrides)),
  ]);

  const pricing = pricingSnap.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        scope: String(data.scope ?? ""),
        scopeId: String(data.scopeId ?? ""),
        cityId: String(data.cityId ?? ""),
        cityName: String(data.cityName ?? ""),
        propertyId: String(data.propertyId ?? ""),
        propertyName: String(data.propertyName ?? ""),
        active: Boolean(data.active),
        status: String(data.status ?? ""),
        occupancyPercent: Number(data.occupancyPercent ?? 0),
        multiplierPercent: Number(data.multiplierPercent ?? 0),
        warningActive: Boolean(data.warningActive),
        stoppedByOwner: Boolean(data.stoppedByOwner),
        reason: String(data.reason ?? ""),
        calculatedAt: String(data.calculatedAt ?? ""),
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.occupancyPercent - a.occupancyPercent);

  const overrides = overrideSnap.docs
    .map((item) => {
      const data = item.data();
      return {
        id: item.id,
        scope: String(data.scope ?? ""),
        scopeId: String(data.scopeId ?? ""),
        cityId: String(data.cityId ?? ""),
        cityName: String(data.cityName ?? ""),
        propertyId: String(data.propertyId ?? ""),
        propertyName: String(data.propertyName ?? ""),
        active: Boolean(data.active),
        disabled: Boolean(data.disabled),
        disabledBy: String(data.disabledBy ?? ""),
        reason: String(data.reason ?? ""),
        expiresAt: String(data.expiresAt ?? ""),
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || a.id.localeCompare(b.id));

  return { pricing, overrides };
}

export async function updateDemandOverride(payload) {
  return setDemandScopeOverride(payload);
}

export async function getCitiesWithOwners() {
  const [citiesSnap, propsSnap, ownersSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.cities)),
    getDocs(collection(db, COLLECTIONS.properties)),
    getDocs(query(collection(db, COLLECTIONS.users), where("role", "==", "owner"))),
  ]);

  const ownerMap = {};
  ownersSnap.docs.forEach((d) => {
    const data = d.data();
    ownerMap[d.id] = {
      uid: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
    };
  });

  const cityOwnerMap = {};
  propsSnap.docs.forEach((d) => {
    const { cityId, ownerId } = d.data();
    if (!cityId || !ownerId) return;
    if (!cityOwnerMap[cityId]) cityOwnerMap[cityId] = new Set();
    cityOwnerMap[cityId].add(ownerId);
  });

  const cities = citiesSnap.docs
    .filter((d) => d.id !== "_platform_cfg")
    .map((d) => {
      const data = d.data();
      const ownerSet = cityOwnerMap[d.id] ?? new Set();
      return {
        id: d.id,
        name: String(data.name ?? ""),
        state: String(data.state ?? ""),
        active: Boolean(data.active ?? true),
        scarcityEnabled: Boolean(data.scarcityEnabled),
        scarcityValue: Number(data.scarcityValue ?? 0),
        scarcityUpdatedAtMs: Number(data.scarcityUpdatedAtMs ?? 0),
        ownerCount: ownerSet.size,
        owners: [...ownerSet].map((uid) => ownerMap[uid] ?? { uid, name: "Unknown", phone: "" }),
      };
    });

  return cities.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addCity({ name, state, active = true }) {
  const ref = await addDoc(collection(db, COLLECTIONS.cities), {
    name: name.trim(),
    state: state.trim(),
    active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog("city_created", "city", ref.id, { name: name.trim(), state: state.trim(), active });
}

export async function updateCity(cityId, { name, state, active }) {
  await updateDoc(doc(db, COLLECTIONS.cities, cityId), {
    name: name.trim(),
    state: state.trim(),
    active,
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog("city_updated", "city", cityId, { name: name.trim(), state: state.trim(), active });
}

export async function deleteCity(cityId) {
  await deleteDoc(doc(db, COLLECTIONS.cities, cityId));
  await writeAuditLog("city_deleted", "city", cityId, {});
}

export async function searchUserByPhone(phone) {
  const normalized = String(phone).trim();
  const q = query(collection(db, COLLECTIONS.users), where("phoneNumber", "==", normalized));
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;
  const d = snapshot.docs[0];
  const data = d.data();
  return {
    id: d.id,
    name: String(data.name ?? ""),
    phoneNumber: String(data.phoneNumber ?? ""),
    role: String(data.role ?? ""),
    ownerRevenueSharePercent: Number(data.ownerRevenueSharePercent ?? 10),
    email: String(data.email ?? ""),
    aadhaarRefId: String(data.aadhaarRefId ?? ""),
    aadhaarLast4: String(data.aadhaarLast4 ?? ""),
    aadhaarStatus: String(data.aadhaarStatus ?? ""),
  };
}

export async function updateManagedUserRole(userId, role, ownerRevenueSharePercent) {
  const payload = { targetUid: userId, role };
  if (Object.prototype.hasOwnProperty.call({ ownerRevenueSharePercent }, "ownerRevenueSharePercent") && ownerRevenueSharePercent !== undefined && ownerRevenueSharePercent !== null && ownerRevenueSharePercent !== "") {
    payload.ownerRevenueSharePercent = Number(ownerRevenueSharePercent);
  }
  return setUserRole(payload);
}

export async function revealAadhaarForInvestigation(payload) {
  return revealAadhaarBreakGlass(payload);
}

export async function promoteUserToOwner(userId) {
  return updateManagedUserRole(userId, "owner");
}

export async function demoteOwnerToConsumer(userId) {
  return updateManagedUserRole(userId, "consumer");
}

export async function getOwnerApplications() {
  const q = query(
    collection(db, COLLECTIONS.ownerApplications),
    where("status", "==", "pending"),
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      userId: String(data.userId ?? ""),
      businessName: String(data.businessName ?? ""),
      phone: String(data.phone ?? ""),
      cityName: String(data.cityName ?? ""),
      propertyAddress: String(data.propertyAddress ?? ""),
      description: String(data.description ?? ""),
      status: String(data.status ?? "pending"),
      agreedOwnerRevenueSharePercent: Number(data.agreedOwnerRevenueSharePercent ?? 10),
    };
  });
}

export async function approveOwnerApplication(applicationId, userId, ownerRevenueSharePercent = 10) {
  const agreedPercent = Math.max(0, Math.min(100, Number(ownerRevenueSharePercent) || 10));
  await setUserRole({ targetUid: userId, role: "owner", ownerRevenueSharePercent: agreedPercent });
  await updateDoc(doc(db, COLLECTIONS.ownerApplications, applicationId), {
    status: "approved",
    agreedOwnerRevenueSharePercent: agreedPercent,
    agreementUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog("owner_application_approved", "owner_application", applicationId, {
    userId,
    ownerRevenueSharePercent: agreedPercent,
  });
}

export async function rejectOwnerApplication(applicationId) {
  await updateDoc(doc(db, COLLECTIONS.ownerApplications, applicationId), {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog("owner_application_rejected", "owner_application", applicationId, {});
}

// Platform settings are stored as a special doc inside the cities collection
// (cities already has allow write: if isSuperadmin() — no new rule deployment needed)
const PLATFORM_SETTINGS_CITY_DOC = "_platform_cfg";
const SCARCITY_MIN = 1;
const SCARCITY_MAX = 5;
const DEFAULT_PLATFORM_FEE_INR = 9;
const DEFAULT_PLATFORM_COMMISSION_PERCENT = 5;

export async function getPlatformSettings() {
  const [legacySnap, mainSnap] = await Promise.all([
    getDoc(doc(db, COLLECTIONS.cities, PLATFORM_SETTINGS_CITY_DOC)),
    getDoc(doc(db, COLLECTIONS.platformSettings, "main")),
  ]);
  const legacy = legacySnap.exists() ? legacySnap.data() : {};
  const main = mainSnap.exists() ? mainSnap.data() : {};
  return {
    checkInGraceMinutes: Number(main.checkInGraceMinutes ?? legacy.checkInGraceMinutes ?? 15),
    platformFeeInr: Math.max(0, Number(main.platformFeeInr ?? legacy.platformFeeInr ?? DEFAULT_PLATFORM_FEE_INR) || DEFAULT_PLATFORM_FEE_INR),
    platformCommissionPercent: Math.max(0, Math.min(100, Number(main.platformCommissionPercent ?? DEFAULT_PLATFORM_COMMISSION_PERCENT))),
  };
}

export async function savePlatformDefaultCommission(platformCommissionPercent) {
  const result = await updatePlatformDefaultCommission({ platformCommissionPercent });
  return {
    platformCommissionPercent: result?.platformCommissionPercent ?? platformCommissionPercent,
    affectedOwnerCount: result?.affectedOwnerCount ?? 0,
  };
}

export async function getOwnerCommissionDuesForOperator() {
  const [duesSnap, usersSnap] = await Promise.all([
    getDocs(query(collection(db, COLLECTIONS.ownerCommissionDues), where("status", "in", ["pending", "claimed"]))),
    getDocs(query(collection(db, COLLECTIONS.users), where("role", "==", "owner"))),
  ]);

  const ownerById = new Map();
  usersSnap.docs.forEach((docSnap) => {
    const data = docSnap.data() || {};
    ownerById.set(docSnap.id, {
      ownerId: docSnap.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      pendingCommissionInr: Number(data.pendingCommissionInr ?? 0),
    });
  });

  return duesSnap.docs.map((docSnap) => {
    const data = docSnap.data() || {};
    const ownerId = String(data.ownerId ?? "");
    const owner = ownerById.get(ownerId) || {};
    return {
      id: docSnap.id,
      ownerId,
      ownerName: String(owner.name ?? ""),
      ownerPhone: String(owner.phone ?? ""),
      bookingId: String(data.bookingId ?? ""),
      commissionAmountInr: Number(data.commissionAmountInr ?? 0),
      commissionPercent: Number(data.commissionPercent ?? 0),
      bedAmount: Number(data.bedAmount ?? 0),
      status: String(data.status ?? "pending"),
      bookingCompletedAt: String(data.bookingCompletedAt ?? ""),
      ownerPendingCommissionInr: Number(owner.pendingCommissionInr ?? 0),
    };
  });
}

export async function confirmOwnerCommissionDueSettlement(dueId) {
  if (!dueId) throw new Error("dueId is required.");
  await confirmCommissionDueSettlement(dueId);
}

export async function runCommissionDuesManual() {
  const result = await runCommissionDuesNow();
  return {
    created: Number(result?.created ?? 0),
    ranAt: String(result?.ranAt ?? ""),
  };
}

export async function getOperatorNotices() {
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.operatorNotices),
      where("dismissed", "==", false)
    )
  );
  return snap.docs.map((item) => {
    const data = item.data() || {};
    return {
      id: item.id,
      type: String(data.type ?? ""),
      title: String(data.title ?? ""),
      message: String(data.message ?? ""),
      ownerId: String(data.ownerId ?? ""),
      dueId: String(data.dueId ?? ""),
      bookingId: String(data.bookingId ?? ""),
      commissionAmountInr: Number(data.commissionAmountInr ?? 0),
    };
  });
}

export async function dismissOperatorNotice(noticeId) {
  if (!noticeId) return;
  await updateDoc(doc(db, COLLECTIONS.operatorNotices, noticeId), {
    dismissed: true,
    dismissedAt: serverTimestamp(),
  });
}

export async function updatePlatformSettings({ checkInGraceMinutes, platformFeeInr }) {
  const clamped = Math.min(120, Math.max(5, Number(checkInGraceMinutes) || 15));
  const nextPlatformFee = Math.min(999, Math.max(0, Number(platformFeeInr) || DEFAULT_PLATFORM_FEE_INR));
  // Write to both canonical platform_settings/main AND legacy _platform_cfg for backward compat
  await Promise.all([
    setDoc(
      doc(db, COLLECTIONS.platformSettings, "main"),
      {
        checkInGraceMinutes: clamped,
        platformFeeInr: nextPlatformFee,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
    setDoc(
      doc(db, COLLECTIONS.cities, PLATFORM_SETTINGS_CITY_DOC),
      {
        _type: "platform_settings",
        checkInGraceMinutes: clamped,
        platformFeeInr: nextPlatformFee,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    ),
  ]);
  await writeAuditLog("platform_settings_updated", "platform_settings", "main", {
    checkInGraceMinutes: clamped,
    platformFeeInr: nextPlatformFee,
  });
  return { checkInGraceMinutes: clamped, platformFeeInr: nextPlatformFee };
}

export async function getOwnersForCommissionManagement() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.users), where("role", "==", "owner")));
  return snap.docs.map((d) => {
    const data = d.data() || {};
    return {
      id: d.id,
      name: String(data.name ?? ""),
      phone: String(data.phone ?? ""),
      ownerRevenueSharePercent:
        typeof data.ownerRevenueSharePercent === "number" ? data.ownerRevenueSharePercent : null,
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveOwnerCommissionOverride(ownerId, percent, clear = false) {
  const result = await setOwnerCommissionOverride({ ownerId, percent, clear });
  return {
    ownerId,
    ownerRevenueSharePercent: result?.ownerRevenueSharePercent ?? null,
  };
}

export async function setCityScarcityMode({ cityId, enabled }) {
  const scarcityValue = enabled
    ? Math.floor(Math.random() * (SCARCITY_MAX - SCARCITY_MIN + 1)) + SCARCITY_MIN
    : 0;
  await updateDoc(doc(db, COLLECTIONS.cities, cityId), {
    scarcityEnabled: Boolean(enabled),
    scarcityValue,
    scarcityUpdatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog(
    enabled ? "city_scarcity_enabled" : "city_scarcity_disabled",
    "city",
    cityId,
    { scarcityEnabled: Boolean(enabled), scarcityValue }
  );
  return {
    cityId,
    scarcityEnabled: Boolean(enabled),
    scarcityValue,
  };
}

// Daily growth overview: today vs yesterday bookings, check-ins, cancellations, revenue
export async function getDailyGrowthOverview() {
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const tMs = todayStart.getTime();
  const yMs = yesterdayStart.getTime();

  const [bookingsSnap, paymentsSnap] = await Promise.all([
    getDocs(collection(db, COLLECTIONS.bookings)),
    getDocs(collection(db, COLLECTIONS.payments)),
  ]);

  const metrics = {
    today: { bookings: 0, checkIns: 0, cancellations: 0, revenue: 0 },
    yesterday: { bookings: 0, checkIns: 0, cancellations: 0, revenue: 0 },
  };

  bookingsSnap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const createdMs = typeof d.createdAt?.toMillis === "function" ? d.createdAt.toMillis() : 0;
    const checkInMs = typeof d.checkInAt?.toMillis === "function" ? d.checkInAt.toMillis() : 0;
    const cancelledMs = typeof d.cancelledAt?.toMillis === "function" ? d.cancelledAt.toMillis() : 0;

    const bucket = createdMs >= tMs ? "today" : createdMs >= yMs ? "yesterday" : null;
    if (bucket) metrics[bucket].bookings += 1;

    if (checkInMs) {
      const cBucket = checkInMs >= tMs ? "today" : checkInMs >= yMs ? "yesterday" : null;
      if (cBucket) metrics[cBucket].checkIns += 1;
    }
    if (cancelledMs) {
      const xBucket = cancelledMs >= tMs ? "today" : cancelledMs >= yMs ? "yesterday" : null;
      if (xBucket) metrics[xBucket].cancellations += 1;
    }
  });

  paymentsSnap.docs.forEach((docSnap) => {
    const d = docSnap.data() || {};
    const createdMs = typeof d.createdAt?.toMillis === "function" ? d.createdAt.toMillis() : 0;
    const amount = Number(d.totalAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const bucket = createdMs >= tMs ? "today" : createdMs >= yMs ? "yesterday" : null;
    if (bucket) metrics[bucket].revenue += amount;
  });

  return metrics;
}

// Role-change audit log
export async function getRoleChangeHistory(limitCount = 50) {
  const snap = await getDocs(
    query(
      collection(db, COLLECTIONS.auditLogs),
      where("action", "==", "user_role_changed"),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )
  );
  return snap.docs.map((docSnap) => {
    const d = docSnap.data() || {};
    const createdAt = typeof d.createdAt?.toDate === "function" ? d.createdAt.toDate().toISOString() : "";
    return {
      id: docSnap.id,
      actorUserId: String(d.actorUserId ?? ""),
      actorRole: String(d.actorRole ?? ""),
      targetUserId: String(d.entityId ?? d.targetUserId ?? ""),
      previousRole: String(d.metadata?.previousRole ?? d.metadata?.prevRole ?? ""),
      nextRole: String(d.metadata?.nextRole ?? ""),
      source: String(d.metadata?.source ?? ""),
      createdAt,
    };
  });
}

// Booking block override for an owner (calls Cloud Function)
export async function setOwnerBookingBlockOverride(ownerId, unblock, reason = "") {
  const { setOwnerBookingBlock } = await import("@/lib/cloud/security");
  return setOwnerBookingBlock({ ownerId, unblock, reason });
}

// Fetch owners with their bookingBlockOverride status
export async function getOwnersWithBlockStatus() {
  const snap = await getDocs(query(collection(db, COLLECTIONS.users), where("role", "==", "owner")));
  return snap.docs.map((docSnap) => {
    const d = docSnap.data() || {};
    return {
      id: docSnap.id,
      name: String(d.name ?? ""),
      phone: String(d.phone ?? ""),
      pendingCommissionInr: Number(d.pendingCommissionInr ?? 0),
      bookingBlockOverride: Boolean(d.bookingBlockOverride),
    };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
