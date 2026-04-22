import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function requireEnv(key) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

function toDocId(name) {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

async function loadPilotCities() {
  const jsonPath = path.resolve(__dirname, "../data/pilot-cities.json");
  const raw = await readFile(jsonPath, "utf-8");
  return JSON.parse(raw);
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

async function seedCities() {
  initAdmin();

  const db = getFirestore();
  const cities = await loadPilotCities();

  if (!Array.isArray(cities) || cities.length === 0) {
    throw new Error("No pilot cities found in data/pilot-cities.json");
  }

  const batch = db.batch();
  cities.forEach((city, index) => {
    const id = toDocId(city.name);
    const ref = db.collection("cities").doc(id);

    batch.set(
      ref,
      {
        name: city.name,
        state: city.state,
        active: Boolean(city.active),
        sortOrder: index + 1,
        updatedAt: FieldValue.serverTimestamp(),
        createdAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
  console.log(`Seeded ${cities.length} cities into Firestore collection: cities`);
}

seedCities().catch((error) => {
  console.error("City seed failed:", error.message);
  process.exit(1);
});
