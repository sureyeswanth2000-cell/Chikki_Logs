import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
} from "firebase/firestore";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logPass(name) {
  console.log(`[PASS] ${name}`);
}

function logFail(name, error) {
  console.error(`[FAIL] ${name}`);
  if (error) {
    console.error(String(error?.message || error));
  }
}

async function main() {
  const rulesPath = path.resolve(__dirname, "../firestore.rules");
  const rules = readFileSync(rulesPath, "utf8");

  const testEnv = await initializeTestEnvironment({
    projectId: "bed-booking-security-tests",
    firestore: { rules },
  });

  try {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await setDoc(doc(db, "users", "consumerA"), { role: "consumer" });
      await setDoc(doc(db, "users", "consumerB"), { role: "consumer" });
      await setDoc(doc(db, "users", "ownerA"), { role: "owner" });
      await setDoc(doc(db, "users", "ownerB"), { role: "owner" });
      await setDoc(doc(db, "users", "superA"), { role: "superadmin" });

      await setDoc(doc(db, "properties", "propA"), { ownerId: "ownerA" });
      await setDoc(doc(db, "properties", "propB"), { ownerId: "ownerB" });

      await setDoc(doc(db, "bookings", "bookingA"), {
        userId: "consumerA",
        propertyId: "propA",
        roomId: "roomA",
        bedId: "bedA",
        bookingStatus: "confirmed",
        checkInAt: "2026-03-27T10:00:00.000Z",
        checkOutAt: null,
        ownerCheckoutAlert: false,
      });

      await setDoc(doc(db, "bookings", "bookingB"), {
        userId: "consumerB",
        propertyId: "propB",
        roomId: "roomB",
        bedId: "bedB",
        bookingStatus: "checked_in",
        checkInAt: "2026-03-27T09:00:00.000Z",
        checkOutAt: null,
        ownerCheckoutAlert: false,
      });

      await setDoc(doc(db, "booking_availability", "bookingA"), {
        propertyId: "propA",
        bedId: "bedA",
        checkInAt: "2026-03-27T10:00:00.000Z",
        checkOutAt: null,
        bookingStatus: "confirmed",
      });

      await setDoc(doc(db, "payments", "paymentA"), {
        bookingId: "bookingA",
        basePrice: 100,
        commissionAmount: 10,
        gatewayAmount: 2,
        totalAmount: 112,
        advancePaid: 100,
        remainingPaid: 12,
        paymentStatus: "pending_settlement",
      });

      await setDoc(doc(db, "demand_watchlist", "property_propA"), {
        scope: "property",
        propertyId: "propA",
        occupancyPercent: 70,
        status: "watching",
      });

      await setDoc(doc(db, "demand_pricing", "property_propA"), {
        scope: "property",
        active: true,
        propertyId: "propA",
        multiplierPercent: 20,
      });

      await setDoc(doc(db, "demand_overrides", "property_propA"), {
        scope: "property",
        propertyId: "propA",
        disabledBy: "owner",
        disabledByUserId: "ownerA",
      });
    });

    const consumerA = testEnv.authenticatedContext("consumerA").firestore();
    const ownerA = testEnv.authenticatedContext("ownerA").firestore();
    const superA = testEnv.authenticatedContext("superA").firestore();

    const tests = [
      {
        name: "consumer can read own booking",
        run: async () => {
          await assertSucceeds(getDoc(doc(consumerA, "bookings", "bookingA")));
        },
      },
      {
        name: "consumer cannot read another consumer booking",
        run: async () => {
          await assertFails(getDoc(doc(consumerA, "bookings", "bookingB")));
        },
      },
      {
        name: "consumer cannot update payments",
        run: async () => {
          await assertFails(
            updateDoc(doc(consumerA, "payments", "paymentA"), {
              remainingPaid: 0,
              paymentStatus: "settled",
            }),
          );
        },
      },
      {
        name: "owner can read booking linked to own property",
        run: async () => {
          await assertSucceeds(getDoc(doc(ownerA, "bookings", "bookingA")));
        },
      },
      {
        name: "owner cannot read booking of another owner property",
        run: async () => {
          await assertFails(getDoc(doc(ownerA, "bookings", "bookingB")));
        },
      },
      {
        name: "signed-in user can read booking_availability",
        run: async () => {
          await assertSucceeds(getDoc(doc(consumerA, "booking_availability", "bookingA")));
        },
      },
      {
        name: "consumer cannot read demand watchlist",
        run: async () => {
          await assertFails(getDoc(doc(consumerA, "demand_watchlist", "property_propA")));
        },
      },
      {
        name: "superadmin can read demand watchlist",
        run: async () => {
          await assertSucceeds(getDoc(doc(superA, "demand_watchlist", "property_propA")));
        },
      },
      {
        name: "signed-in user can read demand pricing summary",
        run: async () => {
          await assertSucceeds(getDoc(doc(consumerA, "demand_pricing", "property_propA")));
        },
      },
      {
        name: "owner can read own property demand override",
        run: async () => {
          await assertSucceeds(getDoc(doc(ownerA, "demand_overrides", "property_propA")));
        },
      },
      {
        name: "owner cannot write own property demand override directly",
        run: async () => {
          await assertFails(
            updateDoc(doc(ownerA, "demand_overrides", "property_propA"), {
              disabledBy: "owner",
              reason: "manual",
            }),
          );
        },
      },
    ];

    let failed = 0;
    for (const testCase of tests) {
      try {
        await testCase.run();
        logPass(testCase.name);
      } catch (error) {
        failed += 1;
        logFail(testCase.name, error);
      }
    }

    if (failed > 0) {
      throw new Error(`${failed} security rule test(s) failed.`);
    }

    console.log("All security rule tests passed.");
  } finally {
    await testEnv.cleanup();
  }
}

main().catch((error) => {
  console.error("Security rules test run failed:", error.message);
  process.exit(1);
});
