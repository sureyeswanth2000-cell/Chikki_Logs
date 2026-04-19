import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeApp } from "firebase/app";
import { getFirestore, writeBatch, doc, serverTimestamp } from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

function toDocId(name) {
    return String(name || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "-");
}

async function loadPilotCities() {
    const raw = await readFile(path.resolve(__dirname, "./data/pilot-cities.json"), "utf-8");
    return JSON.parse(raw);
}

async function seed() {
    try {
        const cities = await loadPilotCities();
        if (!Array.isArray(cities) || cities.length === 0) {
            throw new Error("No cities found in data/pilot-cities.json");
        }

        const batch = writeBatch(db);
        cities.forEach((city, index) => {
            const cityId = toDocId(city.name);
            batch.set(doc(db, "cities", cityId), {
                name: city.name,
                state: city.state,
                active: Boolean(city.active),
                sortOrder: index + 1,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            }, { merge: true });
        });

        await batch.commit();
        console.log(`Seeded ${cities.length} cities into collection: cities`);
    } catch (e) {
        console.error("Seed failed:", e);
        process.exit(1);
    }
}

seed();
