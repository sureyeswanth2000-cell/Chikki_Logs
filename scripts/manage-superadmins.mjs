import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SNAPSHOT_FILE = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "generated",
  "superadmins-snapshot.js"
);

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

function arg(name) {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : "";
}

function actionName() {
  return (arg("action") || process.argv[2] || "list").trim().toLowerCase();
}

function normalizedPhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length >= 11) return `+${digits}`;
  return "";
}

function audit(db, action, entityId, metadata = {}) {
  return db.collection("audit_logs").add({
    action,
    entityType: "superadmin",
    entityId,
    metadata,
    performedBy: "admin-script",
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function resolveAuthUser(auth) {
  const uid = arg("uid");
  const phone = normalizedPhone(arg("phone"));

  if (uid) {
    return auth.getUser(uid);
  }

  if (phone) {
    return auth.getUserByPhoneNumber(phone);
  }

  throw new Error("Pass --uid=<firebase_uid> or --phone=<E164 phone>.");
}

async function listSuperadmins(db) {
  const snapshot = await db.collection("users").where("role", "==", "superadmin").get();
  const rows = snapshot.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: String(data.name ?? ""),
        phoneNumber: String(data.phoneNumber ?? ""),
        email: String(data.email ?? ""),
        role: String(data.role ?? "superadmin"),
        accountStatus: String(data.accountStatus ?? data.status ?? "active"),
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : String(data.createdAt ?? ""),
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : String(data.updatedAt ?? ""),
        source: "admin-sdk",
      };
    })
    .sort((a, b) => {
      const statusRank = (status) => {
        switch (String(status ?? "").toLowerCase()) {
          case "active":
            return 0;
          case "inactive":
            return 1;
          case "disabled":
            return 2;
          case "deleted":
            return 3;
          default:
            return 4;
        }
      };
      return statusRank(a.accountStatus) - statusRank(b.accountStatus) || a.id.localeCompare(b.id);
    });

  console.table(rows);
  console.log(`Superadmins found: ${rows.length}`);
  await writeSnapshot(rows);
}

async function writeSnapshot(rows) {
  await mkdir(dirname(SNAPSHOT_FILE), { recursive: true });
  const contents = `export const SUPERADMIN_SNAPSHOT = ${JSON.stringify(rows, null, 2)};\n\nexport default SUPERADMIN_SNAPSHOT;\n`;
  await writeFile(SNAPSHOT_FILE, contents, "utf8");
}

async function upsertSuperadmin(db, auth, accountStatus = "active") {
  const userRecord = await resolveAuthUser(auth);
  const ref = db.collection("users").doc(userRecord.uid);
  const snapshot = await ref.get();
  const current = snapshot.exists ? snapshot.data() : {};

  await ref.set(
    {
      name: userRecord.displayName ?? current?.name ?? "",
      phoneNumber: userRecord.phoneNumber ?? current?.phoneNumber ?? "",
      email: userRecord.email ?? current?.email ?? "",
      role: "superadmin",
      accountStatus,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: current?.createdAt ?? FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await audit(db, accountStatus === "active" ? "superadmin_created" : "superadmin_restored", userRecord.uid, {
    phoneNumber: userRecord.phoneNumber ?? "",
    email: userRecord.email ?? "",
    accountStatus,
  });

  console.log(`Superadmin saved: ${userRecord.uid} (${accountStatus})`);
}

async function disableSuperadmin(db, auth) {
  const userRecord = await resolveAuthUser(auth);
  const ref = db.collection("users").doc(userRecord.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error("User record not found in Firestore.");
  }
  const current = snapshot.data() ?? {};
  if (String(current.role ?? "") !== "superadmin") {
    throw new Error("The selected account is not a superadmin.");
  }

  await ref.set(
    {
      accountStatus: "inactive",
      disabledAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  await audit(db, "superadmin_disabled", userRecord.uid, {
    phoneNumber: userRecord.phoneNumber ?? current.phoneNumber ?? "",
    email: userRecord.email ?? current.email ?? "",
  });

  console.log(`Superadmin disabled: ${userRecord.uid}`);
}

async function deleteSuperadmin(db, auth) {
  const userRecord = await resolveAuthUser(auth);
  const ref = db.collection("users").doc(userRecord.uid);
  const snapshot = await ref.get();
  if (!snapshot.exists) {
    throw new Error("User record not found in Firestore.");
  }
  const current = snapshot.data() ?? {};
  if (String(current.role ?? "") !== "superadmin") {
    throw new Error("The selected account is not a superadmin.");
  }

  await ref.set(
    {
      accountStatus: "deleted",
      deletedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  try {
    await auth.deleteUser(userRecord.uid);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") {
      throw error;
    }
  }

  await audit(db, "superadmin_deleted", userRecord.uid, {
    phoneNumber: userRecord.phoneNumber ?? current.phoneNumber ?? "",
    email: userRecord.email ?? current.email ?? "",
  });

  console.log(`Superadmin deleted: ${userRecord.uid}`);
}

async function main() {
  initAdmin();
  const db = getFirestore();
  const auth = getAuth();
  const action = actionName();

  if (action === "list") {
    await listSuperadmins(db);
    return;
  }

  if (action === "create" || action === "promote") {
    await upsertSuperadmin(db, auth, "active");
    await listSuperadmins(db);
    return;
  }

  if (action === "disable" || action === "deactivate") {
    await disableSuperadmin(db, auth);
    await listSuperadmins(db);
    return;
  }

  if (action === "delete" || action === "remove") {
    await deleteSuperadmin(db, auth);
    await listSuperadmins(db);
    return;
  }

  throw new Error(`Unknown action: ${action}`);
}

main().catch((error) => {
  console.error("manage-superadmins failed:", error.message);
  process.exit(1);
});
