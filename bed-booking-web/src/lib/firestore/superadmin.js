import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";

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

  const cities = citiesSnap.docs.map((d) => {
    const data = d.data();
    const ownerSet = cityOwnerMap[d.id] ?? new Set();
    return {
      id: d.id,
      name: String(data.name ?? ""),
      state: String(data.state ?? ""),
      active: Boolean(data.active ?? true),
      ownerCount: ownerSet.size,
      owners: [...ownerSet].map((uid) => ownerMap[uid] ?? { uid, name: "Unknown", phone: "" }),
    };
  });

  return cities.sort((a, b) => a.name.localeCompare(b.name));
}

export async function addCity({ name, state, active = true }) {
  await addDoc(collection(db, COLLECTIONS.cities), {
    name: name.trim(),
    state: state.trim(),
    active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function updateCity(cityId, { name, state, active }) {
  await updateDoc(doc(db, COLLECTIONS.cities, cityId), {
    name: name.trim(),
    state: state.trim(),
    active,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCity(cityId) {
  await deleteDoc(doc(db, COLLECTIONS.cities, cityId));
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
  };
}

export async function promoteUserToOwner(userId) {
  await updateDoc(doc(db, COLLECTIONS.users, userId), {
    role: "owner",
    updatedAt: serverTimestamp(),
  });
}

export async function demoteOwnerToConsumer(userId) {
  await updateDoc(doc(db, COLLECTIONS.users, userId), {
    role: "consumer",
    updatedAt: serverTimestamp(),
  });
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
  await updateDoc(doc(db, COLLECTIONS.users, userId), {
    role: "owner",
    updatedAt: serverTimestamp(),
  });
  await updateDoc(doc(db, COLLECTIONS.ownerApplications, applicationId), {
    status: "approved",
    updatedAt: serverTimestamp(),
  });
}

export async function rejectOwnerApplication(applicationId) {
  await updateDoc(doc(db, COLLECTIONS.ownerApplications, applicationId), {
    status: "rejected",
    updatedAt: serverTimestamp(),
  });
}
