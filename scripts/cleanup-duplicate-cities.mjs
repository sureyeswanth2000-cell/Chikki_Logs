/**
 * cleanup-duplicate-cities.mjs
 *
 * Finds duplicate city documents (same name + state, case-insensitive) in Firestore
 * and deletes all but the oldest one (by createdAt) in each duplicate group.
 *
 * Usage (dry-run — no deletes):
 *   node scripts/cleanup-duplicate-cities.mjs
 *
 * Usage (actually delete):
 *   node scripts/cleanup-duplicate-cities.mjs --apply
 *
 * Required env vars: FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, FIREBASE_ADMIN_PRIVATE_KEY
 */

import { cert, initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

function requireEnv(key) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required env var: ${key}`);
  return value;
}

function initAdmin() {
  if (getApps().length) return;
  initializeApp({
    credential: cert({
      projectId: requireEnv("FIREBASE_ADMIN_PROJECT_ID"),
      clientEmail: requireEnv("FIREBASE_ADMIN_CLIENT_EMAIL"),
      privateKey: requireEnv("FIREBASE_ADMIN_PRIVATE_KEY").replace(/\\n/g, "\n"),
    }),
  });
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === "object" && "toDate" in value) return value.toDate().getTime();
  if (typeof value === "string") return new Date(value).getTime() || 0;
  if (typeof value === "number") return value;
  return 0;
}

async function run() {
  const applyMode = process.argv.includes("--apply");

  initAdmin();
  const db = getFirestore();

  console.log("\n=== Chikki: Duplicate City Cleanup ===");
  console.log(`Mode: ${applyMode ? "APPLY (will delete duplicates)" : "DRY RUN (no changes)"}\n`);

  const snapshot = await db.collection("cities").get();
  const allCities = snapshot.docs
    .filter((d) => d.id !== "_platform_cfg")
    .map((d) => {
      const data = d.data();
      return {
        id: d.id,
        name: String(data.name ?? "").trim(),
        state: String(data.state ?? "").trim(),
        active: Boolean(data.active ?? true),
        createdAtMs: toMillis(data.createdAt),
        ref: d.ref,
      };
    });

  console.log(`Total city documents found: ${allCities.length}`);

  // Group by normalized name+state
  const groups = {};
  for (const city of allCities) {
    const key = `${city.name.toLowerCase()}||${city.state.toLowerCase()}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(city);
  }

  const duplicateGroups = Object.values(groups).filter((g) => g.length > 1);

  if (duplicateGroups.length === 0) {
    console.log("\nNo duplicate cities found. Nothing to do.");
    return;
  }

  console.log(`\nFound ${duplicateGroups.length} duplicate group(s):\n`);

  let totalDeleted = 0;

  for (const group of duplicateGroups) {
    // Sort by createdAt ascending — keep the oldest, delete the rest
    group.sort((a, b) => a.createdAtMs - b.createdAtMs);
    const [keep, ...toDelete] = group;

    console.log(`  Group: "${keep.name}, ${keep.state}"`);
    console.log(`    KEEP   [${keep.id}]  createdAt: ${keep.createdAtMs ? new Date(keep.createdAtMs).toISOString() : "unknown"}`);

    for (const dup of toDelete) {
      console.log(`    DELETE [${dup.id}]  createdAt: ${dup.createdAtMs ? new Date(dup.createdAtMs).toISOString() : "unknown"}`);
      if (applyMode) {
        await dup.ref.delete();
        totalDeleted += 1;
      }
    }
    console.log();
  }

  if (applyMode) {
    console.log(`Done. Deleted ${totalDeleted} duplicate document(s).`);
  } else {
    const toDeleteCount = duplicateGroups.reduce((sum, g) => sum + g.length - 1, 0);
    console.log(`Dry run complete. Would delete ${toDeleteCount} duplicate document(s).`);
    console.log("Run with --apply to perform the actual deletion.");
  }
}

run().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
