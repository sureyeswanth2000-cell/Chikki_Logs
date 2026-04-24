# Work Log

## 2026-04-24

### Completed
- **CRITICAL Security Audit: Route Protection Review**
  - Audited all 18 application routes for missing access controls
  - Found 4 unprotected routes that should require authentication/role-based access:
    - `/consumer` - public consumers browsing but dashboard requires consumer role
    - `/profile` - user profile editor requires authentication
    - `/history` - booking history requires consumer or owner role
    - `/apply-owner` - owner application form requires consumer role
  - Implemented fixes:
    - Added `ProtectedRoute` wrapper to `/consumer` with `allowedRoles={["consumer"]}`
    - Added `ProtectedRoute` wrapper to `/profile` with `allowedRoles={["consumer", "owner", "operator", "superadmin"]}`
    - Added `ProtectedRoute` wrapper to `/history` with `allowedRoles={["consumer", "owner"]}`
    - Added `ProtectedRoute` wrapper to `/apply-owner` with `allowedRoles={["consumer"]}`
  - Verified all role-specific dashboards now have proper access control:
    - `/owner` protected for owner role ✅
    - `/operator` protected for operator role ✅
    - `/internal-control` protected for superadmin role ✅
  - Public routes remain intentionally open:
    - `/` (home/landing)
    - `/login` (authentication)
    - `/register` (registration)
    - `/support` (help)
    - `/cities` (city listing)
    - `/unauthorized` (error state)
- Updated [docs/CHIKKI_MASTERBOOK.md](CHIKKI_MASTERBOOK.md) with:
  - Security audit findings and fixes (2026-04-24 section)
  - Route protection status for all pages
  - Explanation of how ProtectedRoute component enforces role-based access
- Updated [docs/TODO.md](TODO.md) with:
  - New "Security" section documenting the audit
  - Remaining manual verification tasks for role routing

### Remaining Security Tasks
- Run manual end-to-end testing:
  - Login as consumer, verify access to `/consumer`, `/profile`, `/history`, `/apply-owner`
  - Try consumer accessing `/owner`, `/operator`, `/internal-control` → should redirect to `/unauthorized`
  - Login as owner, verify access to `/owner`, `/profile`, `/history`
  - Try owner accessing `/operator`, `/internal-control` → should redirect to `/unauthorized`
  - Login as operator, verify access to `/operator`, `/profile`
  - Login as superadmin, verify access to `/internal-control`, `/profile`
  - Test 4-second profile load timeout redirects to `/unauthorized` with appropriate message
  - Verify `/unauthorized` page shows recovery guidance for each redirect scenario

### Notes
- All changes use existing `ProtectedRoute` component infrastructure - no new dependencies added
- Route protection follows established pattern: profile not loaded → wait 4s → redirect to unauthorized if no profile
- No user data was exposed in the unprotected routes (they redirected/checked auth internally), but the routes themselves were discoverable and could be indexed

## 2026-04-23

### Completed
- Created the canonical product documentation:
  - `docs/CHIKKI_MASTERBOOK.md`
- Added README link to the Chikki Masterbook.
- Made the home page the public entry point for all visitors.
- Added a location-confirmation start on the home page with:
  - manual city selection
  - current-location detection message
- Changed login and register default redirect behavior to return users to home unless a specific `next` path is present.
- Updated login/register copy to reflect the easier first-booking rule.
- Improved human-readable auth error handling for Firebase config and network issues.
- Made consumer browsing public instead of protecting the whole page behind login.
- Gated booking behind login so users can browse first and authenticate only when they are ready to book.
- Preserved booking intent through `next` redirect when a guest clicks booking CTA.
- Added first-booking Aadhaar relaxation:
  - first booking: Aadhaar optional
  - second booking onward: Aadhaar required
- Added consumer booking-count lookup to support the Aadhaar rule.
- Updated shared auth routing:
  - owners now default to `/owner` after login/register when there is no explicit `next`
  - consumers still default to `/`
- Updated the shared menu so owners can intentionally switch into consumer booking mode using a menu action instead of page-local controls.
- Removed visible superadmin navigation from shared/public chrome so it is not advertised in the UI.
- Added the `operator` role and new hierarchy:
  - consumer
  - owner
  - operator
  - superadmin
- Added a dedicated `/operator` console for monitoring, owner-application review, and consumer/owner role swaps.
- Moved superadmin to a hidden internal route:
  - `/internal-control`
- Kept `/superadmin` as a blocked legacy route so superadmin is no longer exposed through a visible public path.
- Hardened unauthorized-role recovery to show role-aware redirect guidance instead of a dead-end message.
- Moved role changes to Cloud Functions so permissions and audit logging are enforced centrally.
- Added privileged-action audit logging for:
  - role changes
  - city create/update/delete
  - owner application approve/reject
- Updated Firestore rules so operator can monitor internal operational data without superadmin-level write authority.
- Renamed the canonical product documentation from Holybook naming to Masterbook naming.

### Notes
- Automatic location currently detects browser coordinates and guides the user to continue browsing. Full nearest-city or map-driven location matching is still a future enhancement.
- Owner keeps shared login with consumers.
- Existing superadmin accounts are intentionally locked from UI role edits and should only be changed from the database side.
