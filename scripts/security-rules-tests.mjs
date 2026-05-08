import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
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
      await setDoc(doc(db, "users", "operatorA"), { role: "operator" });

      await setDoc(doc(db, "platform_settings", "main"), {
        platformCommissionPercent: 5,
        platformFeeInr: 9,
        checkInGraceMinutes: 30,
      });

      await setDoc(doc(db, "cities", "_platform_cfg"), {
        _type: "platform_settings",
        platformFeeInr: 9,
        platformCommissionPercent: 5,
      });

      await setDoc(doc(db, "cities", "cityA"), {
        name: "City A",
        active: true,
      });

      await setDoc(doc(db, "properties", "propA"), {
        ownerId: "ownerA",
        cityId: "cityA",
        status: "active",
        publicOwnerRevenueSharePercent: 5,
      });
      await setDoc(doc(db, "properties", "propB"), {
        ownerId: "ownerB",
        cityId: "cityA",
        status: "active",
      });

      await setDoc(doc(db, "rooms", "roomA"), {
        ownerId: "ownerA",
        propertyId: "propA",
        roomName: "101",
      });

      await setDoc(doc(db, "beds", "bedA"), {
        ownerId: "ownerA",
        propertyId: "propA",
        roomId: "roomA",
        bedCode: "A1",
        active: true,
      });

      await setDoc(doc(db, "bed_blocks", "blockA"), {
        ownerId: "ownerA",
        propertyId: "propA",
        bedId: "bedA",
        active: true,
      });

      await setDoc(doc(db, "bed_issue_reports", "reportA"), {
        userId: "consumerA",
        ownerId: "ownerA",
        propertyId: "propA",
        bookingId: "bookingA",
        originalBedId: "bedA",
        status: "reported_no_replacement",
      });

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
        propertyId: "propA",
        basePrice: 100,
        commissionAmount: 10,
        gatewayAmount: 2,
        totalAmount: 112,
        advancePaid: 100,
        remainingPaid: 12,
        paymentStatus: "pending_settlement",
      });

      await setDoc(doc(db, "owner_commission_dues", "dueA"), {
        ownerId: "ownerA",
        bookingId: "bookingA",
        status: "pending",
      });

      await setDoc(doc(db, "owner_notices", "ownerNoticeA"), {
        ownerId: "ownerA",
        dismissed: false,
      });

      await setDoc(doc(db, "operator_notices", "operatorNoticeA"), {
        dismissed: false,
      });

      await setDoc(doc(db, "owner_applications", "applicationA"), {
        userId: "consumerA",
        status: "pending",
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
    const operatorA = testEnv.authenticatedContext("operatorA").firestore();
    const guest = testEnv.unauthenticatedContext().firestore();

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
        name: "signed-in user can read city demand pricing summary",
        run: async () => {
          await assertSucceeds(getDoc(doc(consumerA, "demand_pricing", "city_cityA")));
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
      {
        name: "consumer can read own bed issue report",
        run: async () => {
          await assertSucceeds(getDoc(doc(consumerA, "bed_issue_reports", "reportA")));
        },
      },
      {
        name: "owner can read own property bed issue report",
        run: async () => {
          await assertSucceeds(getDoc(doc(ownerA, "bed_issue_reports", "reportA")));
        },
      },
      {
        name: "consumer cannot write bed issue reports directly",
        run: async () => {
          await assertFails(
            setDoc(doc(consumerA, "bed_issue_reports", "reportClientWrite"), {
              userId: "consumerA",
              propertyId: "propA",
            }),
          );
        },
      },

      // --- page-level query shape tests ---
      {
        name: "guest listing can query active properties by city before login",
        run: async () => {
          await assertSucceeds(
            getDocs(query(
              collection(guest, "properties"),
              where("cityId", "==", "cityA"),
              where("status", "==", "active"),
            )),
          );
        },
      },
      {
        name: "guest listing can query rooms by active property before login",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(guest, "rooms"), where("propertyId", "==", "propA"))),
          );
        },
      },
      {
        name: "guest listing can query active beds by active property before login",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(guest, "beds"), where("propertyId", "==", "propA"), where("active", "==", true))),
          );
        },
      },
      {
        name: "guest listing can query active bed blocks by active property before login",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(guest, "bed_blocks"), where("propertyId", "==", "propA"), where("active", "==", true))),
          );
        },
      },
      {
        name: "guest listing can query booking availability by active property before login",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(guest, "booking_availability"), where("propertyId", "==", "propA"))),
          );
        },
      },
      {
        name: "guest listing can read public demand pricing before login",
        run: async () => {
          await assertSucceeds(getDoc(doc(guest, "demand_pricing", "property_propA")));
        },
      },
      {
        name: "guest listing must not read bookings before login",
        run: async () => {
          await assertFails(getDoc(doc(guest, "bookings", "bookingA")));
        },
      },
      {
        name: "guest listing must not read payments before login",
        run: async () => {
          await assertFails(getDoc(doc(guest, "payments", "paymentA")));
        },
      },
      {
        name: "guest listing must not read internal platform_settings before login",
        run: async () => {
          await assertFails(getDoc(doc(guest, "platform_settings", "main")));
        },
      },
      {
        name: "guest listing must not read owner user doc before login",
        run: async () => {
          await assertFails(getDoc(doc(guest, "users", "ownerA")));
        },
      },
      {
        name: "consumer listing can query active properties by city",
        run: async () => {
          await assertSucceeds(
            getDocs(query(
              collection(consumerA, "properties"),
              where("cityId", "==", "cityA"),
              where("status", "==", "active"),
            )),
          );
        },
      },
      {
        name: "consumer listing can query rooms by property",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(consumerA, "rooms"), where("propertyId", "==", "propA"))),
          );
        },
      },
      {
        name: "consumer listing can query beds by property",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(consumerA, "beds"), where("propertyId", "==", "propA"), where("active", "==", true))),
          );
        },
      },
      {
        name: "consumer listing can query bed blocks by property",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(consumerA, "bed_blocks"), where("propertyId", "==", "propA"), where("active", "==", true))),
          );
        },
      },
      {
        name: "consumer listing can read public legacy platform config",
        run: async () => {
          await assertSucceeds(getDoc(doc(consumerA, "cities", "_platform_cfg")));
        },
      },
      {
        name: "consumer listing must not read internal platform_settings",
        run: async () => {
          await assertFails(getDoc(doc(consumerA, "platform_settings", "main")));
        },
      },
      {
        name: "consumer listing must not read owner user commission doc",
        run: async () => {
          await assertFails(getDoc(doc(consumerA, "users", "ownerA")));
        },
      },
      {
        name: "owner history can query own bookings by property",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(ownerA, "bookings"), where("propertyId", "in", ["propA"]))),
          );
        },
      },
      {
        name: "owner earnings can query own payments by booking",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(ownerA, "payments"), where("bookingId", "in", ["bookingA"]))),
          );
        },
      },
      {
        name: "owner dashboard can query own pending commission dues",
        run: async () => {
          await assertSucceeds(
            getDocs(query(
              collection(ownerA, "owner_commission_dues"),
              where("ownerId", "==", "ownerA"),
              where("status", "in", ["pending", "claimed"]),
            )),
          );
        },
      },
      {
        name: "owner dashboard can query own undismissed notices",
        run: async () => {
          await assertSucceeds(
            getDocs(query(
              collection(ownerA, "owner_notices"),
              where("ownerId", "==", "ownerA"),
              where("dismissed", "==", false),
            )),
          );
        },
      },
      {
        name: "operator console can query users by phone",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(operatorA, "users"), where("phoneNumber", "==", "+100"))),
          );
        },
      },
      {
        name: "operator console can query pending owner applications",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(operatorA, "owner_applications"), where("status", "==", "pending"))),
          );
        },
      },
      {
        name: "operator console can query undismissed operator notices",
        run: async () => {
          await assertSucceeds(
            getDocs(query(collection(operatorA, "operator_notices"), where("dismissed", "==", false))),
          );
        },
      },

      // --- platform_settings rules ---
      {
        name: "superadmin can read platform_settings",
        run: async () => {
          await assertSucceeds(getDoc(doc(superA, "platform_settings", "main")));
        },
      },
      {
        name: "operator can read platform_settings",
        run: async () => {
          await assertSucceeds(getDoc(doc(operatorA, "platform_settings", "main")));
        },
      },
      {
        name: "consumer cannot read platform_settings",
        run: async () => {
          await assertFails(getDoc(doc(consumerA, "platform_settings", "main")));
        },
      },
      {
        name: "owner cannot read platform_settings",
        run: async () => {
          await assertFails(getDoc(doc(ownerA, "platform_settings", "main")));
        },
      },
      {
        name: "superadmin can write platform_settings",
        run: async () => {
          await assertSucceeds(
            setDoc(doc(superA, "platform_settings", "main"), {
              platformCommissionPercent: 5,
              platformFeeInr: 9,
              checkInGraceMinutes: 30,
            }),
          );
        },
      },
      {
        name: "operator can write platform_settings",
        run: async () => {
          await assertSucceeds(
            setDoc(doc(operatorA, "platform_settings", "main"), {
              platformCommissionPercent: 7,
              platformFeeInr: 9,
              checkInGraceMinutes: 30,
            }),
          );
        },
      },
      {
        name: "consumer cannot write platform_settings",
        run: async () => {
          await assertFails(
            setDoc(doc(consumerA, "platform_settings", "main"), {
              platformFeeInr: 0,
            }),
          );
        },
      },
      {
        name: "owner cannot write platform_settings",
        run: async () => {
          await assertFails(
            setDoc(doc(ownerA, "platform_settings", "main"), {
              platformFeeInr: 0,
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
