import { addDoc, collection, doc, getDoc, getDocs, query, runTransaction, serverTimestamp, updateDoc, where, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { completeCheckout, createBookingWithAdvance as createBookingWithAdvanceCallable } from "@/lib/cloud/security";
import pilotCities from "../../../data/pilot-cities.json";
function toTime(value) {
    const parsed = new Date(value).getTime();
    if (Number.isNaN(parsed)) {
        throw new Error("Invalid booking time provided.");
    }
    return parsed;
}
function toTimeOrNull(value) {
    if (!value)
        return null;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
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
function isBlockActiveNow(block) {
    const now = Date.now();
    const start = new Date(block.blockStart).getTime();
    const end = block.blockEnd ? new Date(block.blockEnd).getTime() : null;
    if (Number.isNaN(start)) {
        return false;
    }
    if (block.isFullBlock) {
        return now >= start;
    }
    if (!end || Number.isNaN(end)) {
        return now >= start;
    }
    return now >= start && now <= end;
}
export function validateAadhaar(aadhaar) {
    const digits = aadhaar.replace(/\D/g, "");
    return digits.length === 12;
}

function toMillisFromDateTime(value) {
    if (!value)
        return null;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
}

function dayKeyFromMillis(ms) {
    if (!ms)
        return "Unknown";
    const date = new Date(ms);
    if (Number.isNaN(date.getTime()))
        return "Unknown";
    return date.toISOString().slice(0, 10);
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

function readBookingCode(data, bookingId) {
    const raw = String(data?.bookingCode ?? "").trim();
    if (raw.length > 0) {
        return raw;
    }
    return bookingCodeFor(bookingId, Date.now());
}

function normalizedBedTypeRequirement(value) {
    const raw = String(value ?? "all").toUpperCase();
    if (raw === "AC" || raw === "NON_AC") {
        return raw;
    }
    return null;
}

function isOngoingBooking(booking) {
    const now = Date.now();
    const status = String(booking.bookingStatus ?? "").toLowerCase();
    const checkInMs = toMillisFromDateTime(booking.checkInAt);
    const checkOutMs = toMillisFromDateTime(booking.checkOutAt);
    if (status === "cancelled" || status === "completed") {
        return false;
    }
    if (checkInMs === null) {
        return false;
    }
    if (checkOutMs === null) {
        return checkInMs <= now;
    }
    return checkInMs <= now && now <= checkOutMs;
}

export async function getConsumerBookingHistory(userId, filters = {}) {
    if (!userId) {
        throw new Error("Please login first.");
    }

    const bookingsQuery = query(collection(db, COLLECTIONS.bookings), where("userId", "==", userId));
    const bookingsSnapshot = await getDocs(bookingsQuery);

    const rawBookings = bookingsSnapshot.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            bookingCode: readBookingCode(data, item.id),
            propertyId: String(data.propertyId ?? ""),
            roomId: String(data.roomId ?? ""),
            bedId: String(data.bedId ?? ""),
            checkInAt: String(data.checkInAt ?? ""),
            checkOutAt: String(data.checkOutAt ?? ""),
            bookingStatus: String(data.bookingStatus ?? ""),
            duration: String(data.duration ?? ""),
            createdAt: data.createdAt,
        };
    });

    const uniquePropertyIds = [...new Set(rawBookings.map((item) => item.propertyId).filter(Boolean))];
    const propertyMap = {};

    await Promise.all(uniquePropertyIds.map(async (propertyId) => {
        const snap = await getDoc(doc(db, COLLECTIONS.properties, propertyId));
        if (!snap.exists()) {
            propertyMap[propertyId] = { cityName: "", propertyName: "" };
            return;
        }
        const data = snap.data();
        propertyMap[propertyId] = {
            cityName: String(data.cityName ?? ""),
            propertyName: String(data.name ?? ""),
        };
    }));

    const enriched = rawBookings.map((item) => {
        const propertyInfo = propertyMap[item.propertyId] ?? { cityName: "", propertyName: "" };
        const checkInMs = toMillisFromDateTime(item.checkInAt);
        const checkOutMs = toMillisFromDateTime(item.checkOutAt);
        const ongoing = isOngoingBooking(item);
        return {
            ...item,
            cityName: propertyInfo.cityName,
            propertyName: propertyInfo.propertyName,
            checkInMs,
            checkOutMs,
            bucket: ongoing ? "ongoing" : "old",
        };
    });

    const bookingType = String(filters.bookingType ?? "all");
    const cityQuery = String(filters.cityQuery ?? "").trim().toLowerCase();
    const fromMs = filters.fromDate ? new Date(filters.fromDate).setHours(0, 0, 0, 0) : null;
    const toMs = filters.toDate ? new Date(filters.toDate).setHours(23, 59, 59, 999) : null;

    let filtered = enriched;
    if (bookingType === "ongoing") {
        filtered = filtered.filter((item) => item.bucket === "ongoing");
    }
    else if (bookingType === "old") {
        filtered = filtered.filter((item) => item.bucket === "old");
    }

    if (cityQuery) {
        filtered = filtered.filter((item) =>
            String(item.cityName ?? "").toLowerCase().includes(cityQuery)
        );
    }

    if (fromMs !== null) {
        filtered = filtered.filter((item) => item.checkInMs !== null && item.checkInMs >= fromMs);
    }
    if (toMs !== null) {
        filtered = filtered.filter((item) => item.checkInMs !== null && item.checkInMs <= toMs);
    }

    filtered.sort((a, b) => (b.checkInMs ?? 0) - (a.checkInMs ?? 0));

    const dailyCountMap = {};
    filtered.forEach((item) => {
        const key = dayKeyFromMillis(item.checkInMs);
        dailyCountMap[key] = (dailyCountMap[key] ?? 0) + 1;
    });

    const dailyCounts = Object.entries(dailyCountMap)
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => b.day.localeCompare(a.day));

    return {
        total: filtered.length,
        dailyCounts,
        bookings: filtered,
    };
}

export async function getActiveCities() {
    try {
        const q = query(collection(db, COLLECTIONS.cities));
        const snapshot = await getDocs(q);
        const cities = snapshot.docs.map((item) => {
            const data = item.data();
            return {
                id: item.id,
                name: String(data.name ?? ""),
                state: String(data.state ?? ""),
            };
        });
        if (cities.length > 0) {
            return cities.sort((a, b) => a.name.localeCompare(b.name));
        }

        // Fallback 1: derive cities from all properties if cities collection is not seeded.
        const propsSnapshot = await getDocs(collection(db, COLLECTIONS.properties));
        const byId = new Map();
        propsSnapshot.docs.forEach((item) => {
            const data = item.data();
            const cityId = String(data.cityId ?? "").trim();
            const cityName = String(data.cityName ?? "").trim();
            if (!cityId || !cityName || byId.has(cityId)) {
                return;
            }
            byId.set(cityId, {
                id: cityId,
                name: cityName,
                state: String(data.cityState ?? ""),
            });
        });
        if (byId.size > 0) {
            return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
        }
    } catch {
        // Firestore unavailable — fall through to static list below.
    }

    // Fallback 2: static pilot list so city dropdown is never empty in new environments.
    const staticCities = pilotCities
        .map((item) => ({
        id: item.name.trim().toLowerCase().replace(/\s+/g, "-"),
        name: String(item.name ?? ""),
        state: String(item.state ?? ""),
    }));
    return staticCities.sort((a, b) => a.name.localeCompare(b.name));
}
export async function getListingsByCity(filters) {
    const propertiesQuery = query(collection(db, COLLECTIONS.properties), where("cityId", "==", filters.cityId), where("status", "==", "active"));
    const propertySnapshot = await getDocs(propertiesQuery);
    const properties = propertySnapshot.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            cityId: String(data.cityId ?? ""),
            cityName: String(data.cityName ?? ""),
            name: String(data.name ?? ""),
            exactAddress: String(data.exactAddress ?? ""),
            lat: Number(data.lat ?? 0),
            lng: Number(data.lng ?? 0),
            nearRailwayKm: Number(data.nearRailwayKm ?? 0),
            nearBusKm: Number(data.nearBusKm ?? 0),
            status: String(data.status ?? "inactive"),
        };
    });
    const listings = [];
    for (const property of properties) {
        const roomsQuery = query(collection(db, COLLECTIONS.rooms), where("propertyId", "==", property.id));
        const roomsSnapshot = await getDocs(roomsQuery);
        const rooms = roomsSnapshot.docs.map((item) => {
            const data = item.data();
            return {
                id: item.id,
                propertyId: String(data.propertyId ?? ""),
                roomName: String(data.roomName ?? ""),
            };
        });
        const bedsQuery = query(collection(db, COLLECTIONS.beds), where("propertyId", "==", property.id));
        const bedsSnapshot = await getDocs(bedsQuery);
        const allBeds = bedsSnapshot.docs
            .map((item) => {
            const data = item.data();
            return {
                id: item.id,
                propertyId: String(data.propertyId ?? ""),
                roomId: String(data.roomId ?? ""),
                bedCode: String(data.bedCode ?? ""),
                bedType: String(data.bedType ?? "NON_AC"),
                hourlyPrice: Number(data.hourlyPrice ?? 120),
                overnightPrice: Number(data.overnightPrice ?? 650),
                overdayPrice: Number(data.overdayPrice ?? 900),
                active: Boolean(data.active),
            };
        })
            .filter((item) => item.active);
        const blocksQuery = query(collection(db, COLLECTIONS.bedBlocks), where("propertyId", "==", property.id));
        const blocksSnapshot = await getDocs(blocksQuery);
        const activeBlockedBedIds = new Set(blocksSnapshot.docs
            .map((item) => item.data())
            .map((data) => ({
            bedId: String(data.bedId ?? ""),
            blockStart: String(data.blockStart ?? ""),
            blockEnd: typeof data.blockEnd === "string" ? data.blockEnd : undefined,
            isFullBlock: Boolean(data.isFullBlock),
        }))
            .filter((block) => isBlockActiveNow(block))
            .map((block) => block.bedId));
        const bookingsQuery = query(collection(db, COLLECTIONS.bookingAvailability), where("propertyId", "==", property.id));
        const bookingsSnapshot = await getDocs(bookingsQuery);
        const activeBookedBedIds = new Set(bookingsSnapshot.docs
            .map((item) => item.data())
            .filter((data) => data.bookingStatus === "confirmed" || data.bookingStatus === "checked_in")
            .map((data) => ({
            bedId: String(data.bedId ?? ""),
            checkOutAt: String(data.checkOutAt ?? ""),
        }))
            .filter((booking) => {
            const checkOutMs = toTimeOrNull(booking.checkOutAt);
            return checkOutMs === null || checkOutMs > Date.now();
        })
            .map((booking) => booking.bedId));
        const availableBeds = allBeds.filter((bed) => !activeBlockedBedIds.has(bed.id) && !activeBookedBedIds.has(bed.id));
        const availableInKnownRooms = availableBeds.filter((bed) => rooms.some((room) => room.id === bed.roomId));
        const bedOptions = availableInKnownRooms.map((bed) => ({
            bedId: bed.id,
            roomId: bed.roomId,
            bedCode: bed.bedCode,
            bedType: bed.bedType,
            hourlyPrice: bed.hourlyPrice,
            overnightPrice: bed.overnightPrice,
            overdayPrice: bed.overdayPrice,
        }));
        const filteredBedOptions = filters.bedFilter === "all"
            ? bedOptions
            : bedOptions.filter((item) => item.bedType === filters.bedFilter);
        if (filteredBedOptions.length === 0) {
            continue;
        }
        const priceCandidates = filteredBedOptions.map((item) => finalTotalFromBase(computeBasePrice(filters.duration, item.bedType, {
            hourlyPrice: item.hourlyPrice,
            overnightPrice: item.overnightPrice,
            overdayPrice: item.overdayPrice,
        })));
        const minFinalPrice = Math.min(...priceCandidates);
        if (filters.maxFinalPrice && minFinalPrice > filters.maxFinalPrice) {
            continue;
        }
        listings.push({
            propertyId: property.id,
            propertyName: property.name,
            cityName: property.cityName,
            exactAddress: property.exactAddress,
            lat: property.lat,
            lng: property.lng,
            nearRailwayKm: property.nearRailwayKm,
            nearBusKm: property.nearBusKm,
            availableBeds: filteredBedOptions.length,
            acBeds: filteredBedOptions.filter((item) => item.bedType === "AC").length,
            nonAcBeds: filteredBedOptions.filter((item) => item.bedType === "NON_AC").length,
            minFinalPrice,
            bedOptions: filteredBedOptions,
        });
    }
    return listings.sort((a, b) => a.minFinalPrice - b.minFinalPrice);
}
export async function createBookingWithAdvance(payload) {
    const result = await createBookingWithAdvanceCallable(payload);
    if (!result || !result.bookingId) {
        throw new Error("Booking failed.");
    }
    return {
        bookingId: String(result.bookingId),
        bookingCode: String(result.bookingCode || result.bookingId),
        paymentId: String(result.paymentId || ""),
        allocatedBedId: String(result.allocatedBedId || ""),
        allocatedBedCode: String(result.allocatedBedCode || ""),
        allocatedBedType: String(result.allocatedBedType || ""),
    };
}

export async function getOpenConsumerBookings(userId) {
    if (!userId) {
        return [];
    }

    const bookingsSnapshot = await getDocs(query(collection(db, COLLECTIONS.bookings), where("userId", "==", userId)));
    const openBookings = bookingsSnapshot.docs
        .map((item) => {
            const data = item.data();
            const status = String(data.bookingStatus ?? "").toLowerCase();
            const checkOutAt = data.checkOutAt;
            const isOpen = (status === "checked_in" || status === "confirmed") && !checkOutAt;
            if (!isOpen) {
                return null;
            }
            return {
                id: item.id,
                bookingCode: readBookingCode(data, item.id),
                propertyId: String(data.propertyId ?? ""),
                roomId: String(data.roomId ?? ""),
                bedId: String(data.bedId ?? ""),
                checkInAt: String(data.checkInAt ?? ""),
                bookingStatus: String(data.bookingStatus ?? ""),
                checkInMs: toMillisFromDateTime(data.checkInAt),
            };
        })
        .filter(Boolean);

    if (openBookings.length === 0) {
        return [];
    }

    const uniquePropertyIds = [...new Set(openBookings.map((item) => item.propertyId).filter(Boolean))];
    const uniqueRoomIds = [...new Set(openBookings.map((item) => item.roomId).filter(Boolean))];
    const uniqueBedIds = [...new Set(openBookings.map((item) => item.bedId).filter(Boolean))];

    const [propertyEntries, roomEntries, bedEntries] = await Promise.all([
        Promise.all(uniquePropertyIds.map(async (id) => {
            const snapshot = await getDoc(doc(db, COLLECTIONS.properties, id));
            return [id, snapshot.exists() ? snapshot.data() : null];
        })),
        Promise.all(uniqueRoomIds.map(async (id) => {
            const snapshot = await getDoc(doc(db, COLLECTIONS.rooms, id));
            return [id, snapshot.exists() ? snapshot.data() : null];
        })),
        Promise.all(uniqueBedIds.map(async (id) => {
            const snapshot = await getDoc(doc(db, COLLECTIONS.beds, id));
            return [id, snapshot.exists() ? snapshot.data() : null];
        })),
    ]);

    const propertyMap = Object.fromEntries(propertyEntries);
    const roomMap = Object.fromEntries(roomEntries);
    const bedMap = Object.fromEntries(bedEntries);

    return openBookings
        .map((item) => {
            const bed = bedMap[item.bedId] ?? {};
            return {
                ...item,
                propertyName: String(propertyMap[item.propertyId]?.name ?? ""),
                roomName: String(roomMap[item.roomId]?.roomName ?? ""),
                bedCode: String(bed?.bedCode ?? ""),
                bedType: String(bed?.bedType ?? "NON_AC"),
                hourlyPrice: Number(bed?.hourlyPrice ?? 120),
                canCheckIn: String(item.bookingStatus ?? "").toLowerCase() === "confirmed" && (item.checkInMs ?? 0) <= Date.now(),
            };
        })
        .sort((a, b) => (toMillisFromDateTime(b.checkInAt) ?? 0) - (toMillisFromDateTime(a.checkInAt) ?? 0));
}

export async function checkInConfirmedBooking(payload) {
    const bookingRef = doc(db, COLLECTIONS.bookings, payload.bookingId);
    const bookingAvailabilityRef = doc(db, COLLECTIONS.bookingAvailability, payload.bookingId);
    const bookingSnap = await getDoc(bookingRef);
    if (!bookingSnap.exists()) {
        throw new Error("Booking not found.");
    }

    const bookingData = bookingSnap.data();
    if (String(bookingData.userId ?? "") !== payload.userId) {
        throw new Error("You are not allowed to check in this booking.");
    }

    const bookingStatus = String(bookingData.bookingStatus ?? "").toLowerCase();
    if (bookingStatus !== "confirmed") {
        throw new Error("Only confirmed bookings can be checked in.");
    }

    const checkInMs = toTimeOrNull(bookingData.checkInAt);
    if (checkInMs === null) {
        throw new Error("Invalid check-in time in booking.");
    }
    if (Date.now() < checkInMs) {
        throw new Error("Check-in is not available before booking time.");
    }

    await runTransaction(db, async (transaction) => {
        transaction.update(bookingRef, {
            bookingStatus: "checked_in",
            updatedAt: serverTimestamp(),
        });
        transaction.set(bookingAvailabilityRef, {
            propertyId: String(bookingData.propertyId ?? ""),
            bedId: String(bookingData.bedId ?? ""),
            checkInAt: String(bookingData.checkInAt ?? ""),
            checkOutAt: null,
            bookingStatus: "checked_in",
            updatedAt: serverTimestamp(),
        }, { merge: true });
    });

    await addDoc(collection(db, COLLECTIONS.auditLogs), {
        actorUserId: payload.userId,
        actorRole: "consumer",
        action: "booking_checked_in",
        entityType: "booking",
        entityId: payload.bookingId,
        createdAt: serverTimestamp(),
    });

    return {
        bookingId: payload.bookingId,
        bookingCode: readBookingCode(bookingData, payload.bookingId),
    };
}

export async function checkoutOpenBooking(payload) {
    const summary = await completeCheckout(payload.bookingId);
    if (!summary || !summary.bookingId) {
        throw new Error("Checkout failed.");
    }
    return {
        bookingId: String(summary.bookingId),
        bookingCode: String(summary.bookingCode || summary.bookingId),
        elapsedHours: Number(summary.elapsedHours ?? 0),
        totalAmount: Number(summary.totalAmount ?? 0),
        advancePaid: Number(summary.advancePaid ?? 0),
        remainingPaid: Number(summary.remainingPaid ?? 0),
        checkOutAt: String(summary.checkOutAt ?? ""),
    };
}
