# QA Test Log

Date: 2026-03-27

## Step 1: Role-Based Smoke Suite

### Completed Checks
- Baseline lint: PASS (`npm run lint`)
- Baseline build: PASS (`npm run build`)
- HTTP route smoke matrix on production server (`npm run start -p 3011` + `Invoke-WebRequest`):
  - `/` -> 200
  - `/login` -> 200
  - `/register` -> 200
  - `/consumer` -> 200
  - `/owner` -> 200
  - `/owner/beds` -> 200
  - `/owner/property-status` -> 200
  - `/history` -> 200
  - `/superadmin` -> 200
  - `/support` -> 200
  - `/apply-owner` -> 200
  - `/profile` -> 200
  - `/cities` -> 200
  - `/unauthorized` -> 200
- Source-level guard audit:
  - `ProtectedRoute` redirects unauth users to login and non-allowed roles to unauthorized after profile timeout.
  - Consumer page has role check (`allowedRoles = ["consumer"]`).
  - Profile page redirects unauth users to login.

### Pending Checks (Need Authenticated Browser Session)
- Verified redirect behavior for each actual role login:
  - consumer user hitting owner/superadmin routes
  - owner user hitting consumer/superadmin routes
  - superadmin user hitting owner-only route behavior
- End-to-end client-side redirect timing validation after Firebase profile hydration.
- Authenticated navigation transitions preserving `next` query return URL.

### Verdict for Step 1
- Static and route smoke checks pass.
- Authenticated role-flow checks pending due need for real signed-in browser test users.

## Step 2: Authenticated Role-Flow Validation

### Completed Checks
- Firebase auth executable probes (with `.env.local`):
  - `node --env-file=.env.local test-anon.mjs` -> FAIL (`auth/admin-restricted-operation`)
  - `node --env-file=.env.local test-email.mjs` -> PASS (new Firebase user created)
- Source-level redirect/guard validation:
  - Login consumes `next` query and redirects to `targetPath` after auth/profile readiness.
  - `ProtectedRoute` sends unauthenticated users to `/login?next=...`.
  - `ProtectedRoute` applies a 4-second profile timeout before forcing `/unauthorized` for role mismatch/missing profile.

### Findings
- HIGH: Authenticated users with missing Firestore profile can see protected content briefly on `ProtectedRoute` pages because children render while profile is `null`.
- HIGH: `owner` and `consumer` pages are not wrapped by `ProtectedRoute`; they gate only when `profile` exists. If user is authenticated but profile is missing, page content can render without role enforcement.

### Pending Checks (Need Interactive Browser + Role Accounts)
- End-to-end redirects for signed-in `consumer` accessing owner/superadmin pages.
- End-to-end redirects for signed-in `owner` accessing consumer/superadmin pages.
- End-to-end behavior for signed-in `superadmin` against owner-only flows.
- `next` query return URL preservation after full OTP/Google login in real browser session.

### Verdict for Step 2
- PARTIAL PASS for auth wiring and redirect intent.
- FAIL for strict role isolation under missing-profile state (security/UX gap).
- Full authenticated matrix remains blocked without role-specific test accounts and browser interaction.

### Remediation Applied (Post-Step-2)
- `owner` page now wrapped with `ProtectedRoute` for strict role gating.
- `consumer` page now wrapped with `ProtectedRoute` for strict role gating.
- `ProtectedRoute` no longer renders protected children while profile is unresolved.
- Added immediate redirect to `/unauthorized` when profile resolves to a disallowed role.

### Post-Fix Validation
- `npm run lint` -> PASS
- `npm run build` -> PASS

### Updated Step 2 Status
- Security gap fixed in code.
- Remaining pending work is only interactive role-account browser validation.

## Step 3: Booking Lifecycle Hardening

### Completed Checks
- Source-level validation of booking stage pipeline (`confirmed` -> `checked_in` -> `completed`) in consumer and owner Firestore modules.
- Validation of availability lock behavior for search/listing exclusion of beds with `confirmed`/`checked_in` bookings.
- Validation of checkout recalculation path and owner checkout alert creation.

### Findings
- HIGH: `checkoutOpenBooking` allowed checkout from any non-closed state, which could bypass the required `checked_in` stage.
- HIGH: Firestore rules allowed consumer transition to `completed` without requiring previous state `checked_in`.
- MEDIUM: Owner active-booking summary excluded open bookings with `checkOutAt = null`, undercounting active bookings and advance totals.

### Remediation Applied
- Enforced `checked_in` prerequisite in `checkoutOpenBooking` before completion update.
- Tightened Firestore booking update rule to allow `completed` only from `checked_in`.
- Fixed owner active-booking filter to treat null-checkout active records as active.

### Post-Fix Validation
- `npm run lint` -> PASS
- `npm run build` -> PASS

### Verdict for Step 3
- PASS for lifecycle enforcement and owner-summary consistency at code level.
- Pending: interactive browser and role-account E2E confirmation remains required for 100% operational sign-off.

## Step 4: Runtime Startup Reliability

### Completed Checks
- Reproduced `npm run dev` failure and captured root-cause output.
- Verified conflicting process on port 3000 and lock contention at `.next/dev/lock`.
- Cleared stale process/lock and revalidated dev startup.
- Re-ran lint/build after cleanup.

### Findings
- MEDIUM: local dev startup was failing due to concurrent Next.js dev instance and lock file contention.
- LOW: duplicate root route definition (`src/app/page.jsx` and `src/app/page.tsx`) caused duplicate-page warnings and ambiguous route source.

### Remediation Applied
- Terminated stale process holding port 3000 and removed stale `.next/dev/lock`.
- Removed duplicate root file `src/app/page.tsx` and kept canonical `src/app/page.jsx`.

### Post-Fix Validation
- `npm run dev` -> STARTS cleanly (no errors, no duplicate-page warning)
- `npm run lint` -> PASS
- `npm run build` -> PASS

### Verdict for Step 4
- PASS for local runtime reliability and route-source consistency.
- Remaining global pending item: authenticated browser role-account E2E matrix for final 100% QA sign-off.

## Step 5: Authenticated Browser E2E Matrix

### Preconditions
- Firestore rules deployed from latest `firestore.rules`.
- Three valid accounts available: `consumer`, `owner`, `superadmin`.
- Browser cache cleared between role sessions or use separate incognito windows.

### Route-Access Matrix (Fill During Run)
- Consumer account
  - `/consumer` expected: access granted | actual: [ ] PASS [ ] FAIL | notes:
  - `/owner` expected: redirect to `/unauthorized` | actual: [ ] PASS [ ] FAIL | notes:
  - `/superadmin` expected: redirect to `/unauthorized` | actual: [ ] PASS [ ] FAIL | notes:
- Owner account
  - `/owner` expected: access granted | actual: [ ] PASS [ ] FAIL | notes:
  - `/consumer` expected: redirect to `/unauthorized` | actual: [ ] PASS [ ] FAIL | notes:
  - `/superadmin` expected: redirect to `/unauthorized` | actual: [ ] PASS [ ] FAIL | notes:
- Superadmin account
  - `/superadmin` expected: access granted | actual: [ ] PASS [ ] FAIL | notes:
  - `/owner` expected: redirect to `/unauthorized` | actual: [ ] PASS [ ] FAIL | notes:
  - `/consumer` expected: redirect to `/unauthorized` | actual: [ ] PASS [ ] FAIL | notes:

### Next-Query Return Validation
- Signed out, open `/owner` -> expected redirect to `/login?next=%2Fowner` | actual: [ ] PASS [ ] FAIL | notes:
- Login as owner from this state -> expected redirect back to `/owner` | actual: [ ] PASS [ ] FAIL | notes:
- Signed out, open `/superadmin` -> expected redirect to `/login?next=%2Fsuperadmin` | actual: [ ] PASS [ ] FAIL | notes:
- Login as superadmin from this state -> expected redirect back to `/superadmin` | actual: [ ] PASS [ ] FAIL | notes:

### Evidence Capture
- Screenshot links / file names:
  - consumer checks:
  - owner checks:
  - superadmin checks:
  - next-query checks:

### Step 5 Verdict
- Result: [ ] PASS [ ] FAIL
- Blocking issues (if any):
