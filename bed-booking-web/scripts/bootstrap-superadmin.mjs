import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function initAdmin() {
  if (getApps().length) {
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

function parseArg(name) {
  const prefix = `--${name}=`;
  const value = process.argv.find((arg) => arg.startsWith(prefix));
  return value ? value.slice(prefix.length).trim() : "";
}

async function resolveUser() {
  const uid = parseArg("uid");
  const phone = parseArg("phone");
  const auth = getAuth();

  if (uid) {
    return auth.getUser(uid);
  }

  if (phone) {
    return auth.getUserByPhoneNumber(phone);
  }

  throw new Error("Pass either --uid=<firebase_uid> or --phone=<E164 phone>. Example: --phone=+919876543210");
}

async function promoteSuperadmin() {
  initAdmin();

  const userRecord = await resolveUser();
  const db = getFirestore();

  await db.collection("users").doc(userRecord.uid).set(
    {
      role: "superadmin",
      phoneNumber: userRecord.phoneNumber ?? "",
      email: userRecord.email ?? "",
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  console.log("Superadmin granted successfully.");
  console.log("UID:", userRecord.uid);
  console.log("Phone:", userRecord.phoneNumber ?? "(none)");
  console.log("Email:", userRecord.email ?? "(none)");
  console.log("Credentials for this app:");
  console.log("- Login method: Phone OTP");
  console.log(`- Phone: ${userRecord.phoneNumber ?? "N/A"}`);
  console.log("- OTP: one-time code sent by Firebase at login");
}

promoteSuperadmin().catch((error) => {
  console.error("Superadmin bootstrap failed:", error.message);
  process.exit(1);
});
