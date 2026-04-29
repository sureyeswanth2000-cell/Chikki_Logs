import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { revealAadhaarBreakGlass, setUserRole } from "@/lib/cloud/security";

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
    email: String(data.email ?? ""),
    aadhaarRefId: String(data.aadhaarRefId ?? ""),
    aadhaarLast4: String(data.aadhaarLast4 ?? ""),
    aadhaarStatus: String(data.aadhaarStatus ?? ""),
  };
}

export async function updateManagedUserRole(userId, role) {
  return setUserRole({ targetUid: userId, role });
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
    };
  });
}

export async function approveOwnerApplication(applicationId, userId) {
  await setUserRole({ targetUid: userId, role: "owner" });
  await updateDoc(doc(db, COLLECTIONS.ownerApplications, applicationId), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
  await writeAuditLog("owner_application_approved", "owner_application", applicationId, { userId });
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

export async function getPlatformSettings() {
  const snap = await getDoc(doc(db, COLLECTIONS.cities, PLATFORM_SETTINGS_CITY_DOC));
  const data = snap.exists() ? snap.data() : {};
  return {
    checkInGraceMinutes: Number(data.checkInGraceMinutes ?? 15),
  };
}

export async function updatePlatformSettings({ checkInGraceMinutes }) {
  const clamped = Math.min(120, Math.max(5, Number(checkInGraceMinutes) || 15));
  await setDoc(
    doc(db, COLLECTIONS.cities, PLATFORM_SETTINGS_CITY_DOC),
    { _type: "platform_settings", checkInGraceMinutes: clamped, updatedAt: serverTimestamp() },
    { merge: true }
  );
  await writeAuditLog("platform_settings_updated", "platform_settings", PLATFORM_SETTINGS_CITY_DOC, { checkInGraceMinutes: clamped });
  return { checkInGraceMinutes: clamped };
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
