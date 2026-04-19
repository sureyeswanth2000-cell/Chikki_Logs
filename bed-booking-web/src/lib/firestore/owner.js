import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";

function toMillisFromDateTime(value) {
    if (!value)
        return null;
    const parsed = new Date(value).getTime();
    return Number.isNaN(parsed) ? null : parsed;
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
    return checkInMs <= now && checkOutMs >= now;
}

function dayKeyFromMillis(ms) {
    if (!ms)
        return "Unknown";
    const date = new Date(ms);
    if (Number.isNaN(date.getTime()))
        return "Unknown";
    return date.toISOString().slice(0, 10);
}

function chunkArray(items, size) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
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
    return bookingCodeFor(bookingId);
}
export async function getActiveCities() {
    const q = query(collection(db, COLLECTIONS.cities), where("active", "==", true));
    const snapshot = await getDocs(q);
    const cities = snapshot.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            name: String(data.name ?? ""),
            state: String(data.state ?? ""),
            active: Boolean(data.active),
        };
    });
    return cities.sort((a, b) => a.name.localeCompare(b.name));
}
export async function createProperty(ownerId, payload) {
    const q = query(
        collection(db, COLLECTIONS.properties),
        where("ownerId", "==", ownerId),
        where("name", "==", payload.name)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        throw new Error(`Property name "${payload.name}" already exists for this owner.`);
    }

    await addDoc(collection(db, COLLECTIONS.properties), {
        ownerId,
        cityId: payload.cityId,
        cityName: payload.cityName,
        name: payload.name,
        exactAddress: payload.exactAddress,
        lat: payload.lat,
        lng: payload.lng,
        nearRailwayKm: payload.nearRailwayKm,
        nearBusKm: payload.nearBusKm,
        status: "active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}
export async function getOwnerProperties(ownerId) {
    const q = query(collection(db, COLLECTIONS.properties), where("ownerId", "==", ownerId));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            ownerId,
            cityId: String(data.cityId ?? ""),
            cityName: String(data.cityName ?? ""),
            name: String(data.name ?? ""),
            exactAddress: String(data.exactAddress ?? ""),
            lat: Number(data.lat ?? 0),
            lng: Number(data.lng ?? 0),
            nearRailwayKm: Number(data.nearRailwayKm ?? 0),
            nearBusKm: Number(data.nearBusKm ?? 0),
            status: String(data.status ?? "active"),
        };
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
}
export async function togglePropertyActive(propertyId, active) {
    await updateDoc(doc(db, COLLECTIONS.properties, propertyId), {
        status: active ? "active" : "inactive",
        updatedAt: serverTimestamp(),
    });
}
export async function createRoom(ownerId, payload) {
    const q = query(
        collection(db, COLLECTIONS.rooms),
        where("propertyId", "==", payload.propertyId),
        where("roomName", "==", payload.roomName)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        throw new Error(`Room name "${payload.roomName}" already exists in this property.`);
    }

    await addDoc(collection(db, COLLECTIONS.rooms), {
        ownerId,
        propertyId: payload.propertyId,
        roomName: payload.roomName,
        totalBeds: payload.totalBeds,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}
export async function getOwnerRooms(ownerId) {
    const q = query(collection(db, COLLECTIONS.rooms), where("ownerId", "==", ownerId));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            ownerId,
            propertyId: String(data.propertyId ?? ""),
            roomName: String(data.roomName ?? ""),
            totalBeds: Number(data.totalBeds ?? 0),
            active: data.active !== false,
        };
    });
    return items.sort((a, b) => a.roomName.localeCompare(b.roomName));
}
export async function toggleRoomActive(roomId, active) {
    await updateDoc(doc(db, COLLECTIONS.rooms, roomId), {
        active,
        updatedAt: serverTimestamp(),
    });
}
export async function updateRoomTotalBeds(roomId, totalBeds) {
    const nextTotalBeds = Number(totalBeds);
    if (Number.isNaN(nextTotalBeds) || nextTotalBeds <= 0) {
        throw new Error("Total beds must be greater than 0.");
    }

    const roomRef = doc(db, COLLECTIONS.rooms, roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
        throw new Error("Room not found.");
    }

    const roomBedsSnapshot = await getDocs(query(collection(db, COLLECTIONS.beds), where("roomId", "==", roomId)));
    const existingBedsCount = roomBedsSnapshot.docs.length;
    if (nextTotalBeds < existingBedsCount) {
        throw new Error(`Total beds cannot be less than existing beds (${existingBedsCount}).`);
    }

    await updateDoc(roomRef, {
        totalBeds: nextTotalBeds,
        updatedAt: serverTimestamp(),
    });
}
export async function createBed(ownerId, payload) {
    const roomRef = doc(db, COLLECTIONS.rooms, payload.roomId);
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
        throw new Error("Selected room does not exist.");
    }
    const roomData = roomSnap.data();
    const roomCapacity = Number(roomData.totalBeds ?? 0);
    if (roomCapacity <= 0) {
        throw new Error("Room total beds is invalid. Update room capacity first.");
    }

    const roomBedsSnapshot = await getDocs(query(collection(db, COLLECTIONS.beds), where("roomId", "==", payload.roomId)));
    const existingBedsCount = roomBedsSnapshot.docs.length;
    if (existingBedsCount >= roomCapacity) {
        throw new Error(`Cannot add more beds. Room limit reached (${roomCapacity} beds).`);
    }

    const q = query(
        collection(db, COLLECTIONS.beds),
        where("roomId", "==", payload.roomId),
        where("bedCode", "==", payload.bedCode)
    );
    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        throw new Error(`Bed code "${payload.bedCode}" already exists in this room.`);
    }

    await addDoc(collection(db, COLLECTIONS.beds), {
        ownerId,
        propertyId: payload.propertyId,
        roomId: payload.roomId,
        bedCode: payload.bedCode,
        bedType: payload.bedType,
        hourlyPrice: Number(payload.hourlyPrice ?? 120),
        overnightPrice: Number(payload.overnightPrice ?? 650),
        overdayPrice: Number(payload.overdayPrice ?? 900),
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}
export async function getOwnerBeds(ownerId) {
    const q = query(collection(db, COLLECTIONS.beds), where("ownerId", "==", ownerId));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            ownerId,
            propertyId: String(data.propertyId ?? ""),
            roomId: String(data.roomId ?? ""),
            bedCode: String(data.bedCode ?? ""),
            bedType: String(data.bedType ?? "NON_AC"),
            hourlyPrice: Number(data.hourlyPrice ?? 120),
            overnightPrice: Number(data.overnightPrice ?? 650),
            overdayPrice: Number(data.overdayPrice ?? 900),
            active: Boolean(data.active),
        };
    });
    return items.sort((a, b) => a.bedCode.localeCompare(b.bedCode));
}
export async function toggleBedActive(bedId, active) {
    await updateDoc(doc(db, COLLECTIONS.beds, bedId), {
        active,
        updatedAt: serverTimestamp(),
    });
}
export async function createBedBlock(ownerId, payload) {
    await addDoc(collection(db, COLLECTIONS.bedBlocks), {
        ownerId,
        propertyId: payload.propertyId,
        roomId: payload.roomId,
        bedId: payload.bedId,
        blockStart: payload.blockStart,
        blockEnd: payload.blockEnd ?? null,
        reason: payload.reason,
        isFullBlock: payload.isFullBlock,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    });
}
export async function getOwnerBedBlocks(ownerId) {
    const q = query(collection(db, COLLECTIONS.bedBlocks), where("ownerId", "==", ownerId));
    const snapshot = await getDocs(q);
    const items = snapshot.docs.map((item) => {
        const data = item.data();
        const blockEndValue = data.blockEnd;
        return {
            id: item.id,
            ownerId,
            propertyId: String(data.propertyId ?? ""),
            roomId: String(data.roomId ?? ""),
            bedId: String(data.bedId ?? ""),
            blockStart: String(data.blockStart ?? ""),
            blockEnd: typeof blockEndValue === "string" ? blockEndValue : undefined,
            reason: String(data.reason ?? ""),
            isFullBlock: Boolean(data.isFullBlock),
            active: data.active !== false,
        };
    }).filter((item) => item.active);
    return items.sort((a, b) => a.blockStart.localeCompare(b.blockStart)).reverse();
}
export async function disableBedBlock(blockId) {
    await updateDoc(doc(db, COLLECTIONS.bedBlocks, blockId), {
        active: false,
        updatedAt: serverTimestamp(),
    });
}
export async function updateProperty(propertyId, payload) {
    const propertyRef = doc(db, COLLECTIONS.properties, propertyId);
    const propertySnap = await getDocs(query(collection(db, COLLECTIONS.properties), where("__name__", "==", propertyId)));
    
    if (propertySnap.empty) {
        throw new Error("Property not found.");
    }
    
    const currentData = propertySnap.docs[0].data();
    const ownerId = currentData.ownerId;

    // Check if another property with the same name exists for this owner
    const q = query(
        collection(db, COLLECTIONS.properties),
        where("ownerId", "==", ownerId),
        where("name", "==", payload.name)
    );
    const snapshot = await getDocs(q);
    
    // If we find a property with the same name that isn't the one we're updating
    const duplicate = snapshot.docs.find(doc => doc.id !== propertyId);
    if (duplicate) {
        throw new Error(`Another property with the name "${payload.name}" already exists.`);
    }

    await updateDoc(propertyRef, {
        cityId: payload.cityId,
        cityName: payload.cityName,
        name: payload.name,
        exactAddress: payload.exactAddress,
        lat: payload.lat,
        lng: payload.lng,
        nearRailwayKm: payload.nearRailwayKm,
        nearBusKm: payload.nearBusKm,
        updatedAt: serverTimestamp(),
    });
}
export async function submitOwnerApplication(userId, payload) {
    await addDoc(collection(db, COLLECTIONS.ownerApplications), {
        userId,
        businessName: payload.businessName,
        phone: payload.phone,
        cityId: payload.cityId,
        cityName: payload.cityName,
        propertyAddress: payload.propertyAddress,
        description: payload.description,
        status: "pending",
        createdAt: serverTimestamp(),
    });
}

export async function getOwnerBookingHistory(ownerId, filters = {}) {
    if (!ownerId) {
        throw new Error("Please login first.");
    }

    const [propertyItems, roomItems, bedItems] = await Promise.all([
        getOwnerProperties(ownerId),
        getOwnerRooms(ownerId),
        getOwnerBeds(ownerId),
    ]);

    const propertyIds = propertyItems.map((item) => item.id).filter(Boolean);
    if (propertyIds.length === 0) {
        return { total: 0, dailyCounts: [], bookings: [] };
    }

    const propertyMap = Object.fromEntries(propertyItems.map((item) => [item.id, item]));
    const roomMap = Object.fromEntries(roomItems.map((item) => [item.id, item]));
    const bedMap = Object.fromEntries(bedItems.map((item) => [item.id, item]));

    const snapshots = await Promise.all(
        chunkArray(propertyIds, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.bookings), where("propertyId", "in", batch)))
        )
    );

    const rawBookings = snapshots.flatMap((snapshot) =>
        snapshot.docs.map((item) => {
            const data = item.data();
            const property = propertyMap[String(data.propertyId ?? "")] ?? null;
            const room = roomMap[String(data.roomId ?? "")] ?? null;
            const bed = bedMap[String(data.bedId ?? "")] ?? null;
            const checkInAt = String(data.checkInAt ?? "");
            const checkOutAt = String(data.checkOutAt ?? "");
            const bookingStatus = String(data.bookingStatus ?? "");
            const checkInMs = toMillisFromDateTime(checkInAt);
            const checkOutMs = toMillisFromDateTime(checkOutAt);
            const enriched = {
                id: item.id,
                bookingCode: readBookingCode(data, item.id),
                propertyId: String(data.propertyId ?? ""),
                roomId: String(data.roomId ?? ""),
                bedId: String(data.bedId ?? ""),
                userId: String(data.userId ?? ""),
                propertyName: property?.name ?? "",
                cityName: property?.cityName ?? "",
                roomName: room?.roomName ?? "",
                bedCode: bed?.bedCode ?? "",
                checkInAt,
                checkOutAt,
                bookingStatus,
                duration: String(data.duration ?? ""),
                checkInMs,
                checkOutMs,
                bucket: isOngoingBooking({ bookingStatus, checkInAt, checkOutAt }) ? "ongoing" : "old",
            };
            return enriched;
        })
    );

    const fromMs = filters.fromDate ? new Date(filters.fromDate).setHours(0, 0, 0, 0) : null;
    const toMs = filters.toDate ? new Date(filters.toDate).setHours(23, 59, 59, 999) : null;

    let filtered = rawBookings.filter((item) => item.bucket === "old");

    if (fromMs !== null) {
        filtered = filtered.filter((item) => item.checkInMs !== null && item.checkInMs >= fromMs);
    }
    if (toMs !== null) {
        filtered = filtered.filter((item) => item.checkInMs !== null && item.checkInMs <= toMs);
    }

    filtered.sort((a, b) => (b.checkInMs ?? 0) - (a.checkInMs ?? 0));

    const dailyMap = new Map();
    filtered.forEach((item) => {
        const key = dayKeyFromMillis(item.checkInMs);
        dailyMap.set(key, (dailyMap.get(key) ?? 0) + 1);
    });

    const dailyCounts = [...dailyMap.entries()]
        .map(([day, count]) => ({ day, count }))
        .sort((a, b) => b.day.localeCompare(a.day));

    return {
        total: filtered.length,
        dailyCounts,
        bookings: filtered,
    };
}

export async function getOwnerLiveJobs(ownerId) {
    if (!ownerId) {
        return [];
    }
    const [propertyItems, roomItems, bedItems] = await Promise.all([
        getOwnerProperties(ownerId),
        getOwnerRooms(ownerId),
        getOwnerBeds(ownerId),
    ]);
    const propertyMap = Object.fromEntries(propertyItems.map((item) => [item.id, item]));
    const roomMap = Object.fromEntries(roomItems.map((item) => [item.id, item]));
    const bedMap = Object.fromEntries(bedItems.map((item) => [item.id, item]));

    const propertyIds = propertyItems.map((item) => item.id).filter(Boolean);
    if (propertyIds.length === 0) {
        return [];
    }

    const snapshots = await Promise.all(
        chunkArray(propertyIds, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.bookings), where("propertyId", "in", batch)))
        )
    );

    return snapshots.flatMap((snapshot) =>
        snapshot.docs
            .map((item) => {
                const data = item.data();
                const checkInAt = String(data.checkInAt ?? "");
                const checkOutAt = String(data.checkOutAt ?? "");
                const bookingStatus = String(data.bookingStatus ?? "");
                if (!isOngoingBooking({ bookingStatus, checkInAt, checkOutAt })) {
                    return null;
                }
                return {
                    id: item.id,
                    bookingCode: readBookingCode(data, item.id),
                    propertyName: propertyMap[String(data.propertyId ?? "")]?.name ?? "",
                    cityName: propertyMap[String(data.propertyId ?? "")]?.cityName ?? "",
                    roomName: roomMap[String(data.roomId ?? "")]?.roomName ?? "",
                    bedCode: bedMap[String(data.bedId ?? "")]?.bedCode ?? "",
                    checkInAt,
                    checkOutAt,
                    bookingStatus,
                };
            })
            .filter(Boolean)
    ).sort((a, b) => (toMillisFromDateTime(a.checkInAt) ?? 0) - (toMillisFromDateTime(b.checkInAt) ?? 0));
}

export async function getOwnerUpcomingBookings(ownerId) {
    if (!ownerId) {
        return {
            upcomingBookings: [],
            advanceCollected: 0,
            activeBookingCount: 0,
        };
    }

    const [propertyItems, roomItems, bedItems] = await Promise.all([
        getOwnerProperties(ownerId),
        getOwnerRooms(ownerId),
        getOwnerBeds(ownerId),
    ]);

    const propertyMap = Object.fromEntries(propertyItems.map((item) => [item.id, item]));
    const roomMap = Object.fromEntries(roomItems.map((item) => [item.id, item]));
    const bedMap = Object.fromEntries(bedItems.map((item) => [item.id, item]));

    const propertyIds = propertyItems.map((item) => item.id).filter(Boolean);
    if (propertyIds.length === 0) {
        return {
            upcomingBookings: [],
            advanceCollected: 0,
            activeBookingCount: 0,
        };
    }

    const snapshots = await Promise.all(
        chunkArray(propertyIds, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.bookings), where("propertyId", "in", batch)))
        )
    );

    const now = Date.now();
    const allBookings = snapshots.flatMap((snapshot) =>
        snapshot.docs.map((item) => {
            const data = item.data();
            const checkInAt = String(data.checkInAt ?? "");
            const checkOutAt = String(data.checkOutAt ?? "");
            return {
                id: item.id,
                bookingCode: readBookingCode(data, item.id),
                propertyId: String(data.propertyId ?? ""),
                roomId: String(data.roomId ?? ""),
                bedId: String(data.bedId ?? ""),
                bookingStatus: String(data.bookingStatus ?? ""),
                checkInAt,
                checkOutAt,
                checkInMs: toMillisFromDateTime(checkInAt),
                checkOutMs: toMillisFromDateTime(checkOutAt),
            };
        })
    );

    const activeBookings = allBookings.filter((item) => {
        const status = String(item.bookingStatus ?? "").toLowerCase();
        if (status === "cancelled" || status === "completed") {
            return false;
        }
        if (item.checkOutMs === null) {
            return true;
        }
        return item.checkOutMs >= now;
    });

    const upcomingBookings = activeBookings
        .filter((item) => (item.checkInMs ?? 0) > now)
        .map((item) => ({
            ...item,
            propertyName: propertyMap[item.propertyId]?.name ?? "",
            roomName: roomMap[item.roomId]?.roomName ?? "",
            bedCode: bedMap[item.bedId]?.bedCode ?? "",
        }))
        .sort((a, b) => (a.checkInMs ?? 0) - (b.checkInMs ?? 0));

    const activeBookingIds = activeBookings.map((item) => item.id);
    let advanceCollected = 0;

    if (activeBookingIds.length > 0) {
        const paymentSnapshots = await Promise.all(
            chunkArray(activeBookingIds, 10).map((batch) =>
                getDocs(query(collection(db, COLLECTIONS.payments), where("bookingId", "in", batch)))
            )
        );

        advanceCollected = paymentSnapshots
            .flatMap((snapshot) => snapshot.docs.map((docItem) => docItem.data()))
            .reduce((sum, payment) => sum + Number(payment.advancePaid ?? 0), 0);
    }

    return {
        upcomingBookings,
        advanceCollected,
        activeBookingCount: activeBookings.length,
    };
}

export async function getOwnerCheckoutAlerts(ownerId) {
    if (!ownerId) {
        return [];
    }

    const [propertyItems, roomItems, bedItems] = await Promise.all([
        getOwnerProperties(ownerId),
        getOwnerRooms(ownerId),
        getOwnerBeds(ownerId),
    ]);

    const propertyMap = Object.fromEntries(propertyItems.map((item) => [item.id, item]));
    const roomMap = Object.fromEntries(roomItems.map((item) => [item.id, item]));
    const bedMap = Object.fromEntries(bedItems.map((item) => [item.id, item]));
    const propertyIds = propertyItems.map((item) => item.id).filter(Boolean);
    if (propertyIds.length === 0) {
        return [];
    }

    const snapshots = await Promise.all(
        chunkArray(propertyIds, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.bookings), where("propertyId", "in", batch)))
        )
    );

    const alertBookings = snapshots.flatMap((snapshot) =>
        snapshot.docs
            .map((item) => {
                const data = item.data();
                if (!Boolean(data.ownerCheckoutAlert)) {
                    return null;
                }
                return {
                    id: item.id,
                    bookingCode: readBookingCode(data, item.id),
                    propertyName: propertyMap[String(data.propertyId ?? "")]?.name ?? "",
                    roomName: roomMap[String(data.roomId ?? "")]?.roomName ?? "",
                    bedCode: bedMap[String(data.bedId ?? "")]?.bedCode ?? "",
                    bookingStatus: String(data.bookingStatus ?? ""),
                    checkInAt: String(data.checkInAt ?? ""),
                    checkOutAt: String(data.checkOutAt ?? ""),
                };
            })
            .filter(Boolean)
    ).sort((a, b) => (toMillisFromDateTime(b.checkOutAt) ?? 0) - (toMillisFromDateTime(a.checkOutAt) ?? 0));

    return alertBookings.slice(0, 20);
}
