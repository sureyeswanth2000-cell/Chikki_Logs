# Security Audit Action List

Date: 2026-03-27

## Critical (Fix First)
- Restrict consumer booking reads to own records only.
  - Current risk: any signed-in consumer can read all bookings.
  - Status: completed on 2026-03-27.
  - File: `firestore.rules` (`match /bookings`, read condition)
- Prevent consumer-side payment tampering.
  - Current risk: consumer can update `basePrice`, `totalAmount`, `remainingPaid`, `paymentStatus` in payments.
  - Status: completed on 2026-03-27 by moving checkout/payment mutation to backend callable `completeCheckout` and making payment updates superadmin-only in rules.
  - File: `firestore.rules` (`match /payments`, update condition)
- Remove plaintext Aadhaar from broadly readable booking documents.
  - Current risk: Aadhaar and phone are stored in booking docs and exposed if booking read rule is broad.
  - Status: completed on 2026-03-27 by removing `aadhaarNumber` and `userPhone` from booking writes.
  - Files: `src/lib/firestore/consumer.js`, `firestore.rules`

## High
- Enforce server-side validation for booking create fields (allowed keys and valid states only).
  - Current risk: direct client write can send unexpected fields and invalid initial status.
  - Status: completed on 2026-03-27 with create key whitelist + state constraints.
  - File: `firestore.rules` (`match /bookings`, create condition)
- Enforce rule-level check-in time constraint (server-time, not only client code).
  - Current risk: direct API callers may bypass UI checks for early check-in and check in before scheduled time.
  - Status: completed on 2026-03-27 by adding a server-time check-in window constraint to Firestore rules. Now, check-in is only allowed if `request.time` is after or equal to the scheduled `checkInAt` time (parsed from resource data). This closes the last known bypass for early check-in.
  - File: `firestore.rules` (`match /bookings`, update condition)
- Move pricing and settlement calculations to trusted backend functions.
  - Current risk: client-driven calculations are tamper-prone.
  - Status: completed on 2026-03-27 for booking creation and checkout flows by moving pricing, bed allocation, payment creation, and checkout settlement into callable backend functions and closing direct client create paths in rules.
  - Files: `src/lib/firestore/consumer.js`, `firestore.rules`

## Medium
- Encrypt sensitive identity fields at write-time (Aadhaar) and store only masked/hashed derivatives where possible.
  - Status: completed on 2026-03-27 with hash + last4 strategy and no plaintext Aadhaar returned to client profile state.
  - Files: `functions/index.js`, `src/app/profile/page.jsx`, `src/app/consumer/page.jsx`, `src/context/auth-context.jsx`
- Add anti-automation/rate-limits for booking attempts and OTP attempts in backend controls.
  - Status: completed on 2026-03-27 for booking attempts via callable `createBookingWithAdvance` and for OTP via callable `authorizeOtpRequest` (server-side phone/IP windows) plus client resend cooldown/countdown lock on login.
  - Files: `functions/index.js`, `src/lib/cloud/security.js`, `src/context/auth-context.jsx`, `src/app/login/page.jsx`
- Add anomaly audit alerts (sudden booking bursts, repeated payment status flips, cross-entity anomaly detection).
  - Status: completed on 2026-03-27 via security audit events `booking_rate_limited`, `otp_rate_limited`, Firestore-triggered `payment_status_anomaly` detection, and Firestore-triggered `cross_entity_anomaly` for repeated anomalies by user or IP.
  - Files: `functions/index.js`

## Verification Checklist
- Firestore emulator tests for unauthorized reads/writes across all roles.
- Negative tests for payment field tampering and cross-user booking reads.
- Confirm no plaintext Aadhaar in queryable collections.
- Re-run lint/build and role-matrix E2E after rule changes.

## Recommendation 3 Status (Automated Security Tests)
- Implemented: emulator-backed rules test harness at `scripts/security-rules-tests.mjs`.
- Implemented: npm script `test:security:rules`.
- Implemented: test dependency `@firebase/rules-unit-testing@^5.0.0`.
- Resolved blocker: Java installed (Temurin 21).
- Validation run: `npm run test:security:rules` -> PASS (all security rule tests passed).

## Recommendation 4 Status (Aadhaar Hardening)
- Implemented: plaintext Aadhaar removed from profile storage path; Cloud Function now stores `aadhaarHash` and `aadhaarLast4` only.
- Implemented: client profile state no longer carries raw Aadhaar digits.
- Implemented: booking UI no longer auto-prefills Aadhaar from saved profile data.
- Deploy follow-up: set Cloud Function env `AADHAAR_HASH_PEPPER` for stronger hash hardening before production deploy.

## Migration Note
- Added secure non-PII availability index collection: `booking_availability`.
- Added backfill script: `npm run backfill:booking-availability`.
- Current blocker: local `.env.local` is missing `FIREBASE_ADMIN_PRIVATE_KEY`, so backfill could not run in this environment.
- New deploy dependency: deploy Cloud Functions after adding `completeCheckout`, `createBookingWithAdvance`, and `authorizeOtpRequest` callables (`firebase deploy --only functions`).
- New deploy dependency: deploy Cloud Functions after adding Firestore triggers `detectPaymentStatusAnomaly` and `detectCrossEntityAnomaly` (`firebase deploy --only functions`).
- New deploy dependency: deploy Firestore rules after closing direct client creates for `bookings`, `payments`, `booking_availability`, and `bed_locks` (`firebase deploy --only firestore:rules`).
