import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

const ROLE_ORDER = ["consumer", "owner", "operator", "superadmin"];

function parseArg(name, fallback = "") {
  const prefix = `--${name}=`;
  const found = process.argv.find((value) => value.startsWith(prefix));
  return found ? found.slice(prefix.length).trim() : fallback;
}

function normalizeRole(value) {
  const role = String(value ?? "").trim().toLowerCase();
  if (!ROLE_ORDER.includes(role)) {
    throw new Error(`Invalid role '${value}'. Allowed: ${ROLE_ORDER.join(", ")}`);
  }
  return role;
}

function initAdmin() {
  if (getApps().length) {
    return;
  }

  const projectId = String(
    process.env.FIREBASE_ADMIN_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  ).trim();
  const clientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || "").trim();
  const privateKeyRaw = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || "").trim();

  if (projectId && clientEmail && privateKeyRaw) {
    initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey: privateKeyRaw.replace(/\\n/g, "\n"),
      }),
    });
    return;
  }

  initializeApp({
    credential: applicationDefault(),
    ...(projectId ? { projectId } : {}),
  });
}

function buildRolesList() {
  const argValue = parseArg("roles", "");
  if (!argValue) {
    return ROLE_ORDER;
  }

  const roles = argValue
    .split(",")
    .map((item) => normalizeRole(item))
    .filter(Boolean);

  if (!roles.length) {
    throw new Error("No valid roles provided in --roles.");
  }

  return [...new Set(roles)];
}

function baseUserDataForRole({ role, email }) {
  const now = FieldValue.serverTimestamp();
  const data = {
    role,
    accountStatus: "active",
    email,
    phoneNumber: "",
    name: `Role Test ${role}`,
    updatedAt: now,
    createdAt: now,
  };

  if (role === "owner") {
    data.ownerRevenueSharePercent = 8;
    data.ownerPrivilegeTier = "standard";
    data.ownerPrivilegeTierSource = "manual";
    data.ownerPrivilegeTierUpdatedAt = now;
  }

  return data;
}

async function upsertRoleUser({ auth, db, role, suffix, domain, password }) {
  const localPart = `test.${role}.${suffix}`;
  const email = `${localPart}@${domain}`;

  let user;
  let created = false;

  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (code !== "auth/user-not-found") {
      throw error;
    }

    user = await auth.createUser({
      email,
      emailVerified: true,
      password,
      displayName: `Role Test ${role}`,
      disabled: false,
    });
    created = true;
  }

  await auth.setCustomUserClaims(user.uid, { role });

  await db.collection("users").doc(user.uid).set(baseUserDataForRole({ role, email }), { merge: true });

  return {
    role,
    uid: user.uid,
    email,
    password,
    status: created ? "created" : "updated",
  };
}

async function main() {
  initAdmin();

  const roles = buildRolesList();
  const suffix = parseArg("suffix", new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14));
  const domain = parseArg("domain", "chikki.local");
  const password = parseArg("password", "Test@123456");

  const auth = getAuth();
  const db = getFirestore();

  const rows = [];
  for (const role of roles) {
    const row = await upsertRoleUser({ auth, db, role, suffix, domain, password });
    rows.push(row);
  }

  console.log("Created/updated role test users:");
  console.table(rows);
}

main().catch((error) => {
  console.error("create-role-test-users failed:", error.message);
  process.exit(1);
});
