import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { COLLECTIONS } from "@/lib/firestore/collections";
import { allowOwnerDemandPricing, markCommissionDuePaid as markCommissionDuePaidCallable, stopOwnerDemandPricing } from "@/lib/cloud/security";

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

function bookingModeLabel(value) {
    return String(value ?? "").toLowerCase() === "future" ? "Future Booking" : "Book Now";
}

function bookingModeFields(data = {}, payment = {}) {
    const bookingMode = String(data.bookingMode ?? payment.bookingMode ?? "now");
    return {
        bookingMode,
        bookingModeLabel: bookingModeLabel(bookingMode),
        futureBookingSurchargePercent: Number(payment.futureBookingSurchargePercent ?? data.futureBookingSurchargePercent ?? 0),
        futureBookingSurchargeAmount: Number(payment.futureBookingSurchargeAmount ?? data.futureBookingSurchargeAmount ?? 0),
        futureBookingPriceLabel: String(payment.futureBookingPriceLabel ?? data.futureBookingPriceLabel ?? ""),
        totalAmount: Number(payment.totalAmount ?? 0),
        bedAmount: Number(payment.bedAmount ?? 0),
        platformFeeAmount: Number(payment.platformFeeAmount ?? 0),
    };
}

async function paymentSummaryByBookingIds(bookingIds = []) {
    const ids = [...new Set(bookingIds.filter(Boolean))];
    if (ids.length === 0) {
        return {};
    }
    const snapshots = await Promise.all(
        chunkArray(ids, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.payments), where("bookingId", "in", batch)))
        )
    );
    const entries = snapshots
        .flatMap((snapshot) => snapshot.docs.map((item) => item.data()))
        .map((data) => [
            String(data.bookingId ?? ""),
            {
                bookingMode: String(data.bookingMode ?? ""),
                futureBookingSurchargePercent: Number(data.futureBookingSurchargePercent ?? 0),
                futureBookingSurchargeAmount: Number(data.futureBookingSurchargeAmount ?? 0),
                futureBookingPriceLabel: String(data.futureBookingPriceLabel ?? ""),
                totalAmount: Number(data.totalAmount ?? 0),
                bedAmount: Number(data.bedAmount ?? 0),
                platformFeeAmount: Number(data.platformFeeAmount ?? 0),
                advancePaid: Number(data.advancePaid ?? 0),
            },
        ])
        .filter(([id]) => id);
    return Object.fromEntries(entries);
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
        nearRailwayName: payload.nearRailwayName ?? "",
        nearBusName: payload.nearBusName ?? "",
        nearestTransitType: payload.nearestTransitType ?? "",
        nearestTransitName: payload.nearestTransitName ?? "",
        nearestTransitKm: payload.nearestTransitKm ?? null,
        status: "pending_approval",
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
            nearRailwayName: String(data.nearRailwayName ?? ""),
            nearBusName: String(data.nearBusName ?? ""),
            nearestTransitType: String(data.nearestTransitType ?? ""),
            nearestTransitName: String(data.nearestTransitName ?? ""),
            nearestTransitKm: Number(data.nearestTransitKm ?? 0),
            status: String(data.status ?? "active"),
        };
    });
    return items.sort((a, b) => a.name.localeCompare(b.name));
}
export async function togglePropertyActive(propertyId, active) {
    const propertySnapshot = await getDoc(doc(db, COLLECTIONS.properties, propertyId));
    if (!propertySnapshot.exists()) {
        throw new Error("Property not found.");
    }
    const currentStatus = String(propertySnapshot.data()?.status ?? "");
    if (currentStatus === "pending_approval") {
        throw new Error("This property is pending operator/superadmin approval.");
    }
    if (currentStatus === "rejected") {
        throw new Error("This property was rejected and cannot be enabled.");
    }
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

function demandDocId(scope, id) {
    return `${scope}_${String(id ?? "").trim()}`;
}

function readDemandSummary(snapshot) {
    if (!snapshot.exists()) {
        return null;
    }
    const data = snapshot.data();
    return {
        id: snapshot.id,
        active: Boolean(data.active),
        scope: String(data.scope ?? ""),
        scopeId: String(data.scopeId ?? ""),
        status: String(data.status ?? ""),
        occupancyPercent: Number(data.occupancyPercent ?? 0),
        multiplierPercent: Number(data.multiplierPercent ?? 0),
        warningActive: Boolean(data.warningActive),
        stoppedByOwner: Boolean(data.stoppedByOwner),
        overrideActive: Boolean(data.overrideActive),
        reason: String(data.reason ?? ""),
        calculatedAt: String(data.calculatedAt ?? ""),
    };
}

function readDemandOverride(snapshot) {
    if (!snapshot.exists()) {
        return null;
    }
    const data = snapshot.data();
    return {
        id: snapshot.id,
        active: Boolean(data.active),
        disabled: Boolean(data.disabled),
        disabledBy: String(data.disabledBy ?? ""),
        reason: String(data.reason ?? ""),
        expiresAt: String(data.expiresAt ?? ""),
    };
}

export async function getOwnerDemandStatuses(ownerId) {
    if (!ownerId) {
        return [];
    }
    const properties = await getOwnerProperties(ownerId);
    if (properties.length === 0) {
        return [];
    }

    const statuses = await Promise.all(properties.map(async (property) => {
        const propertyPricingRef = doc(db, COLLECTIONS.demandPricing, demandDocId("property", property.id));
        const cityPricingRef = property.cityId
            ? doc(db, COLLECTIONS.demandPricing, demandDocId("city", property.cityId))
            : null;
        const overrideRef = doc(db, COLLECTIONS.demandOverrides, demandDocId("property", property.id));

        const [propertyPricingSnap, cityPricingSnap, overrideSnap] = await Promise.all([
            getDoc(propertyPricingRef),
            cityPricingRef ? getDoc(cityPricingRef) : Promise.resolve(null),
            getDoc(overrideRef),
        ]);

        const propertyPricing = readDemandSummary(propertyPricingSnap);
        const cityPricing = cityPricingSnap ? readDemandSummary(cityPricingSnap) : null;
        const override = readDemandOverride(overrideSnap);
        const effectivePricing = propertyPricing?.active ? propertyPricing : cityPricing;

        return {
            propertyId: property.id,
            propertyName: property.name,
            cityId: property.cityId,
            cityName: property.cityName,
            propertyPricing,
            cityPricing,
            override,
            active: Boolean(effectivePricing?.active) && !Boolean(override?.active && override?.disabled),
            inheritedFromCity: !propertyPricing?.active && Boolean(cityPricing?.active),
            occupancyPercent: Number(effectivePricing?.occupancyPercent ?? propertyPricing?.occupancyPercent ?? cityPricing?.occupancyPercent ?? 0),
            multiplierPercent: Number(effectivePricing?.multiplierPercent ?? 0),
            warningActive: Boolean(effectivePricing?.warningActive ?? propertyPricing?.warningActive ?? cityPricing?.warningActive),
            reason: override?.active && override?.disabled
                ? `Stopped: ${override.reason || "owner override"}`
                : String(effectivePricing?.reason ?? propertyPricing?.reason ?? cityPricing?.reason ?? "No active demand pricing"),
            stoppedUntil: String(override?.expiresAt ?? ""),
            stoppedByOwner: Boolean(override?.active && override?.disabled && override.disabledBy === "owner"),
        };
    }));

    return statuses.sort((a, b) => a.propertyName.localeCompare(b.propertyName));
}

export async function stopDemandPricingForProperty(propertyId) {
    return stopOwnerDemandPricing({ propertyId, reason: "Owner stopped demand pricing from property status page" });
}

export async function allowDemandPricingForProperty(propertyId) {
    return allowOwnerDemandPricing({ propertyId });
}
export async function updateBedPrices(ownerId, bedId, payload) {
    const hourlyPrice = Number(payload.hourlyPrice);
    const overnightPrice = Number(payload.overnightPrice);
    const overdayPrice = Number(payload.overdayPrice);
    if ([hourlyPrice, overnightPrice, overdayPrice].some((value) => Number.isNaN(value) || value <= 0)) {
        throw new Error("All bed prices must be greater than 0.");
    }

    const bedRef = doc(db, COLLECTIONS.beds, bedId);
    const bedSnap = await getDoc(bedRef);
    if (!bedSnap.exists()) {
        throw new Error("Bed not found.");
    }
    const bedData = bedSnap.data();
    if (String(bedData.ownerId ?? "") !== ownerId) {
        throw new Error("You can update only your own bed prices.");
    }

    await updateDoc(bedRef, {
        hourlyPrice: Math.round(hourlyPrice),
        overnightPrice: Math.round(overnightPrice),
        overdayPrice: Math.round(overdayPrice),
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
        nearRailwayName: payload.nearRailwayName ?? "",
        nearBusName: payload.nearBusName ?? "",
        nearestTransitType: payload.nearestTransitType ?? "",
        nearestTransitName: payload.nearestTransitName ?? "",
        nearestTransitKm: payload.nearestTransitKm ?? null,
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
                bookingMode: String(data.bookingMode ?? "now"),
                modifiedCount: Number(data.modifiedCount ?? 0),
                modifiedAt: data.modifiedAt ?? null,
                futureBookingSurchargePercent: Number(data.futureBookingSurchargePercent ?? 0),
                futureBookingSurchargeAmount: Number(data.futureBookingSurchargeAmount ?? 0),
                futureBookingPriceLabel: String(data.futureBookingPriceLabel ?? ""),
                duration: String(data.duration ?? ""),
                ratingOverall: Number(data.ratingOverall ?? 0),
                ratingComment: String(data.ratingComment ?? ""),
                ratingSubmittedAt: data.ratingSubmittedAt ?? null,
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
    const paymentMap = await paymentSummaryByBookingIds(filtered.map((item) => item.id));
    filtered = filtered.map((item) => ({
        ...item,
        ...bookingModeFields(item, paymentMap[item.id]),
    }));

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

    const liveJobs = snapshots.flatMap((snapshot) =>
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
                    bookingMode: String(data.bookingMode ?? "now"),
                    modifiedCount: Number(data.modifiedCount ?? 0),
                    modifiedAt: data.modifiedAt ?? null,
                    futureBookingSurchargePercent: Number(data.futureBookingSurchargePercent ?? 0),
                    futureBookingSurchargeAmount: Number(data.futureBookingSurchargeAmount ?? 0),
                    futureBookingPriceLabel: String(data.futureBookingPriceLabel ?? ""),
                };
            })
            .filter(Boolean)
    ).sort((a, b) => (toMillisFromDateTime(a.checkInAt) ?? 0) - (toMillisFromDateTime(b.checkInAt) ?? 0));
    const paymentMap = await paymentSummaryByBookingIds(liveJobs.map((item) => item.id));
    return liveJobs.map((item) => ({
        ...item,
        ...bookingModeFields(item, paymentMap[item.id]),
    }));
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
                bookingMode: String(data.bookingMode ?? "now"),
                modifiedCount: Number(data.modifiedCount ?? 0),
                modifiedAt: data.modifiedAt ?? null,
                futureBookingSurchargePercent: Number(data.futureBookingSurchargePercent ?? 0),
                futureBookingSurchargeAmount: Number(data.futureBookingSurchargeAmount ?? 0),
                futureBookingPriceLabel: String(data.futureBookingPriceLabel ?? ""),
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
    let paymentMap = {};

    if (activeBookingIds.length > 0) {
        const paymentSnapshots = await Promise.all(
            chunkArray(activeBookingIds, 10).map((batch) =>
                getDocs(query(collection(db, COLLECTIONS.payments), where("bookingId", "in", batch)))
            )
        );

        const payments = paymentSnapshots.flatMap((snapshot) => snapshot.docs.map((docItem) => docItem.data()));
        paymentMap = Object.fromEntries(payments.map((payment) => [
            String(payment.bookingId ?? ""),
            payment,
        ]).filter(([id]) => id));
        advanceCollected = payments
            .reduce((sum, payment) => sum + Number(payment.advancePaid ?? 0), 0);
    }

    return {
        upcomingBookings: upcomingBookings.map((item) => ({
            ...item,
            ...bookingModeFields(item, paymentMap[item.id]),
        })),
        advanceCollected,
        activeBookingCount: activeBookings.length,
    };
}

export async function getOwnerEarningsSummary(ownerId, filters = {}) {
    if (!ownerId) {
        return {
            bookingCount: 0,
            expectedEarnings: 0,
            paidAmount: 0,
            pendingAmount: 0,
        };
    }

    const propertyItems = await getOwnerProperties(ownerId);
    const propertyIds = propertyItems.map((item) => item.id).filter(Boolean);
    if (propertyIds.length === 0) {
        return {
            bookingCount: 0,
            expectedEarnings: 0,
            paidAmount: 0,
            pendingAmount: 0,
        };
    }

    const fromMs = filters.fromDate ? new Date(filters.fromDate).setHours(0, 0, 0, 0) : null;
    const toMs = filters.toDate ? new Date(filters.toDate).setHours(23, 59, 59, 999) : null;

    const bookingSnapshots = await Promise.all(
        chunkArray(propertyIds, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.bookings), where("propertyId", "in", batch)))
        )
    );

    const bookings = bookingSnapshots.flatMap((snapshot) =>
        snapshot.docs
            .map((item) => {
                const data = item.data();
                const checkInAt = String(data.checkInAt ?? "");
                const checkInMs = toMillisFromDateTime(checkInAt);
                return {
                    id: item.id,
                    bookingStatus: String(data.bookingStatus ?? ""),
                    checkInMs,
                };
            })
            .filter((item) => {
                const status = item.bookingStatus.toLowerCase();
                if (status === "cancelled") {
                    return false;
                }
                if (fromMs !== null && (item.checkInMs === null || item.checkInMs < fromMs)) {
                    return false;
                }
                if (toMs !== null && (item.checkInMs === null || item.checkInMs > toMs)) {
                    return false;
                }
                return true;
            })
    );

    const bookingIds = bookings.map((item) => item.id);
    if (bookingIds.length === 0) {
        return {
            bookingCount: 0,
            expectedEarnings: 0,
            paidAmount: 0,
            pendingAmount: 0,
        };
    }

    const paymentSnapshots = await Promise.all(
        chunkArray(bookingIds, 10).map((batch) =>
            getDocs(query(collection(db, COLLECTIONS.payments), where("bookingId", "in", batch)))
        )
    );

    const payments = paymentSnapshots.flatMap((snapshot) => snapshot.docs.map((item) => item.data()));
    const expectedEarnings = payments.reduce((sum, payment) => sum + Number(payment.totalAmount ?? 0), 0);
    const paidAmount = payments.reduce((sum, payment) => {
        const total = Number(payment.totalAmount ?? 0);
        const advance = Number(payment.advancePaid ?? 0);
        const remaining = Number(payment.remainingPaid ?? 0);
        const status = String(payment.paymentStatus ?? "").toLowerCase();
        if (status === "settled" || status === "paid") {
            return sum + total;
        }
        return sum + advance + (status === "pending_settlement" ? 0 : remaining);
    }, 0);

    return {
        bookingCount: bookings.length,
        expectedEarnings,
        paidAmount,
        pendingAmount: Math.max(expectedEarnings - paidAmount, 0),
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
                    bookingMode: String(data.bookingMode ?? "now"),
                    modifiedCount: Number(data.modifiedCount ?? 0),
                    modifiedAt: data.modifiedAt ?? null,
                    futureBookingSurchargePercent: Number(data.futureBookingSurchargePercent ?? 0),
                    futureBookingSurchargeAmount: Number(data.futureBookingSurchargeAmount ?? 0),
                    futureBookingPriceLabel: String(data.futureBookingPriceLabel ?? ""),
                    checkInAt: String(data.checkInAt ?? ""),
                    checkOutAt: String(data.checkOutAt ?? ""),
                };
            })
            .filter(Boolean)
    ).sort((a, b) => (toMillisFromDateTime(b.checkOutAt) ?? 0) - (toMillisFromDateTime(a.checkOutAt) ?? 0));

    const sliced = alertBookings.slice(0, 20);
    const paymentMap = await paymentSummaryByBookingIds(sliced.map((item) => item.id));
    return sliced.map((item) => ({
        ...item,
        ...bookingModeFields(item, paymentMap[item.id]),
    }));
}

export async function getOwnerProfile(ownerId) {
    if (!ownerId) return null;
    const snap = await getDoc(doc(db, COLLECTIONS.users, ownerId));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return {
        ownerRevenueSharePercent: typeof data.ownerRevenueSharePercent === "number"
            ? data.ownerRevenueSharePercent
            : null,
    };
}

export async function getOwnerNotices(ownerId) {
    if (!ownerId) return [];
    const snap = await getDocs(
        query(
            collection(db, COLLECTIONS.ownerNotices),
            where("ownerId", "==", ownerId),
            where("dismissed", "==", false)
        )
    );
    return snap.docs.map((item) => {
        const data = item.data();
        return {
            id: item.id,
            type: String(data.type ?? ""),
            title: String(data.title ?? ""),
            message: String(data.message ?? ""),
            oldCommission: Number(data.oldCommission ?? 0),
            newCommission: Number(data.newCommission ?? 0),
        };
    });
}

export async function dismissOwnerNotice(noticeId) {
    if (!noticeId) return;
    await updateDoc(doc(db, COLLECTIONS.ownerNotices, noticeId), {
        dismissed: true,
        dismissedAt: serverTimestamp(),
    });
}

export async function getOwnerCommissionDues(ownerId) {
        if (!ownerId) return [];
        const snap = await getDocs(
            query(
                collection(db, COLLECTIONS.ownerCommissionDues),
                where("ownerId", "==", ownerId),
                where("status", "in", ["pending", "claimed"])
            )
        );
        return snap.docs.map((item) => {
            const data = item.data();
            return {
                id: item.id,
                bookingId: String(data.bookingId ?? ""),
                commissionPercent: Number(data.commissionPercent ?? 0),
                commissionAmountInr: Number(data.commissionAmountInr ?? 0),
                bedAmount: Number(data.bedAmount ?? 0),
                status: String(data.status ?? "pending"),
                bookingCompletedAt: String(data.bookingCompletedAt ?? ""),
            };
        });
}

export async function markOwnerDueAsPaid(dueId) {
        if (!dueId) throw new Error("dueId is required.");
        await markCommissionDuePaidCallable(dueId);
}

export async function getOwnerDuesSummary(ownerId) {
        if (!ownerId) {
            return {
                pendingCommissionInr: 0,
                pendingDueCount: 0,
                claimedDueCount: 0,
            };
        }

        const [ownerSnap, duesSnap] = await Promise.all([
            getDoc(doc(db, COLLECTIONS.users, ownerId)),
            getDocs(
                query(
                    collection(db, COLLECTIONS.ownerCommissionDues),
                    where("ownerId", "==", ownerId),
                    where("status", "in", ["pending", "claimed"])
                )
            ),
        ]);

        const ownerData = ownerSnap.exists() ? ownerSnap.data() || {} : {};
        let pendingDueCount = 0;
        let claimedDueCount = 0;
        duesSnap.docs.forEach((item) => {
            const data = item.data() || {};
            const status = String(data.status ?? "pending").toLowerCase();
            if (status === "claimed") {
                claimedDueCount += 1;
            } else {
                pendingDueCount += 1;
            }
        });

        return {
            pendingCommissionInr: Number(ownerData.pendingCommissionInr ?? 0),
            pendingDueCount,
            claimedDueCount,
        };
}
