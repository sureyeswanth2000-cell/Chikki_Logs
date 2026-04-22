import { cert, getApps, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function initAdmin() {
  if (getApps().length > 0) {
    return;
  }

  const privateKey = requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n");
  initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey,
    }),
  });
}

async function backfillBookingAvailability() {
  initAdmin();
  const db = getFirestore();

  const bookingsSnapshot = await db.collection("bookings").get();
  if (bookingsSnapshot.empty) {
    console.log("No bookings found. Nothing to backfill.");
    return;
  }

  let total = 0;
  let batch = db.batch();
  let opCount = 0;

  for (const bookingDoc of bookingsSnapshot.docs) {
    const data = bookingDoc.data();
    const availabilityRef = db.collection("booking_availability").doc(bookingDoc.id);

    batch.set(
      availabilityRef,
      {
        propertyId: String(data.propertyId ?? ""),
        bedId: String(data.bedId ?? ""),
        checkInAt: String(data.checkInAt ?? ""),
        checkOutAt: data.checkOutAt ?? null,
        bookingStatus: String(data.bookingStatus ?? "confirmed"),
        createdAt: data.createdAt ?? FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    total += 1;
    opCount += 1;

    if (opCount >= 450) {
      await batch.commit();
      batch = db.batch();
      opCount = 0;
    }
  }

  if (opCount > 0) {
    await batch.commit();
  }

  console.log(`Backfilled booking_availability for ${total} booking docs.`);
}

backfillBookingAvailability().catch((error) => {
  console.error("Backfill failed:", error.message);
  process.exit(1);
});
