# Work Log

## 2026-05-07

### Completed
- Added Future Booking support for check-in within 30 days, with a 10% future booking price surcharge shown as one final consumer price.
- Updated booking confirmation to send booking mode to the backend and lock future booking surcharge metadata on booking/payment records.
- Updated availability metadata so future bookings can carry a same-day hold window while checkout still resolves the actual stay.
- Extended Future Booking visibility across consumer open bookings/history, owner dashboard/history, and operator/superadmin operational snapshots.
- Added operator/superadmin platform setting control for Future Booking surcharge percent.
- Added consumer modify-booking support before check-in with backend availability validation, price relock, and modified booking visibility for consumer/owner views.
- Fixed local UI smoke permission noise by allowing public-safe pre-login listing reads while keeping bookings, payments, users, and internal platform settings protected.
- Added a localhost-only consumer listing smoke fallback so `?devAuth=consumer` can exercise Book Now, Future Booking, and Choose Bed UI without needing live Firebase Auth.
- Added checked-in bed issue reporting: backend records bed reports, tries same-property reassignment first, then nearby same-city property beds, flags repeated problem beds, and notifies owner/operator when review is needed.
- Removed the hard Aadhaar booking requirement from the consumer flow.
- Changed booking review to show Aadhaar as optional instead of blocking repeat bookings.
- Updated consumer, login, register, profile, TODO, and masterbook copy so Aadhaar is now framed as a soft add-if-you-have-it prompt.
- Added a localhost-only dev auth bypass using `?devAuth=consumer|owner|operator|superadmin` for smoke testing.
- Added a localhost-only dev booking preview so the booking page can render review-step copy without a live Firebase auth session.
- Smoked the booking page in Chromium with the dev bypass and confirmed the optional Aadhaar copy renders on the review step.
- Added a read-only superadmin history panel in the internal control UI.
- Removed UI controls for creating, editing, or deleting superadmin accounts.
- Added backend-only superadmin lifecycle script at `scripts/manage-superadmins.mjs` for create, disable, delete, and list operations.
- Switched the superadmin history tab to a generated snapshot module so the static-export build no longer hits Firestore permission errors in the browser.
- Verified the internal control UI smoke test now renders the superadmin history row with no create/edit/delete actions.
- Added a safer operator-promotion UI flow that requires an explicit `PROMOTE OPERATOR` acknowledgement before saving.

### Notes
- Consumers can still add Aadhaar later from Profile if they want it saved for repeat-booking convenience.

## 2026-05-05

### Completed
- Added route-level `prefetch={false}` on key public/auth/booking links in addition to shared menu/footer links.
- Hardened protected-route redirects for static-hosted base path handling and trailing-slash redirects.
- Deployed Hosting updates to Firebase production (`https://chikki-logs-72607.web.app`) after each mitigation pass.
- Re-ran Firestore security rules tests after each code change (`npm run test:security:rules`), all passing.

### Verification Notes
- Production network rechecks still show repeated `__next.*.__PAGE__.txt?_rsc=...` 404 responses across login/register/history/apply-owner/consumer/profile/support route sampling.
- Guest protected-route smoke checks were run on production for `/history`, `/consumer`, `/profile`, and `/apply-owner`; authenticated role-to-role checks (for example consumer -> operator) are still pending role test accounts.
- Unauthorized page and back-button behavior were sampled in production, but full per-role redirect-type validation is still pending authenticated test sessions.

## 2026-05-01

### Completed
- Added `docs/DEMAND_PRICING_LOGIC.md` as the single easy-to-read source for on-demand pricing rules, permissions, jobs, Firestore collections, UI locations, and pending verification.
- Expanded automatic peak-demand pricing into a concrete implementation checklist in `docs/TODO.md`.
- Added shared demand-pricing rule helpers in `src/lib/demand-pricing.js`:
  - property thresholds: 70-89% occupancy adds 20%, 90-100% adds 50%
  - city thresholds: 80-89% occupancy adds 30%, 90-100% can add up to 100%
  - final multiplier uses the higher applicable city/property increase, capped by the global max
  - warning threshold starts at 60% occupancy
  - owner stop-demand override expires the next day at 06:00 by default
  - price helper can apply the selected multiplier to a base amount
- Added collection names for future demand watchlist, pricing summary, and override documents.
- Added Firestore rules for demand pricing collections:
  - `demand_watchlist` is readable only by operator/superadmin
  - `demand_pricing/{scopeId}` is readable by signed-in users for future consumer labels
  - `demand_overrides/{scopeId}` is readable by operator/superadmin and the matching property owner
  - all demand writes are backend-only
- Added the 15-minute `refreshDemandWatchlist` Firebase scheduled Function:
  - scans active properties and active beds
  - excludes currently blocked beds from bookable capacity
  - counts confirmed/checked-in booking availability against active bookable beds
  - writes city/property watchlist records only at or above the 60% warning threshold
  - marks old watchlist records `below_threshold` when demand drops
  - writes a system audit log for each refresh
- Added the 15-minute `refreshDemandPricing` Firebase scheduled Function:
  - reads only `demand_watchlist` records with `status == "watching"`
  - applies default city/property demand thresholds and global cap
  - writes `demand_pricing/{scopeId}` summaries for city/property scopes
  - uses the higher applicable property/city multiplier for property summaries
  - respects platform emergency disable and active owner/operator overrides
  - writes inactive summaries when demand drops below threshold
  - writes a system audit log for each pricing refresh
- Added secure demand-pricing callable controls:
  - `updateDemandPricingSettings` for operator/superadmin threshold, cap, enable, and emergency-disable changes
  - `setDemandScopeOverride` for operator/superadmin city/property demand override control
  - `stopOwnerDemandPricing` for owners to disable demand pricing on their own property until next day 06:00 IST
  - `allowOwnerDemandPricing` for owners to allow demand pricing again
  - client wrappers in `src/lib/cloud/security.js`
  - audit logs for settings changes, internal override changes, owner stop, and owner allow
- Added shared internal `DemandPricingPanel` UI for operator and superadmin:
  - enable/disable demand pricing
  - emergency disable
  - global max cap
  - property and city threshold editing
  - manual city/property override by scope ID
  - current demand pricing summary table
- Added owner demand status UI on `/owner/property-status`:
  - shows property/city demand source, occupancy, increase %, status, and reason
  - lets owners stop demand pricing for their own property until next day 06:00 IST
  - lets owners allow demand pricing again
  - reads property and city demand summaries so city-level demand is visible to owners
- Added consumer demand visibility:
  - listing cards read city/property demand summaries and show Demand Rising above 60% occupancy
  - listings and exact booking bed selection show a clean High Demand label when active demand pricing applies
  - displayed listing and bed prices include the active demand adjustment without exposing the internal multiplier
- Added TODO to install Java / fix PATH so Firebase Firestore emulator rules tests can run locally.

### Pending
- Booking price locking and final all-inclusive owner revenue-share pricing are still open.

## 2026-04-29

### Completed
- Started owner-dashboard completion before payment work:
  - simplified owner navigation to Dashboard, Inventory, Earnings, and Support
  - removed owner-facing Apply as Owner menu placement and moved Switch to Consumer Mode into account/dashboard context
  - added light/dark mode toggle in the shared app menu
  - corrected the owner dashboard to focus on active bookings, future bookings, and checkout pending only
  - kept owner earnings on the dedicated `/owner/earnings` page with today, week, month, custom date, and total received since starting so Firestore reads happen only when the owner requests earnings
  - moved simple bed Block/Unblock controls to the top of the owner inventory page without the long scheduled block form
  - added Add Property, Add Room, Add Bed, and Add All actions from owner inventory
  - added anchors on the create-inventory page so add actions can route to the right form section
  - expanded dark-mode overrides for shared cards, tables, forms, and fixed color utilities so text remains readable
  - added root static export files with `.nojekyll` so GitHub Pages branch publishing can serve the app routes while the repository keeps one `main` branch
  - removed duplicate owner-dashboard shortcut buttons, moved mode switching into the shared header, restored Home in owner navigation, and moved Sign Out into Profile
  - fixed owner earnings filters so selected ranges show only that period, with all-time earnings available as an explicit range option
  - added inline owner bed price editing from Inventory / Bed Control for hourly, overnight, and overday prices

### Notes
- Earnings currently show owner-facing expected/paid booking totals without exposing Chikki contribution or commission breakdown.
- Owner dashboard intentionally does not load earnings to avoid unnecessary database reads.
- Header/home background image treatment is intentionally left for a later design pass.
- Property approval for newly added owner properties is still open and should be implemented before payment.
- Map/property creation UX is still open and should be redesigned in the next owner-dashboard pass.

## 2026-04-29

### Completed
- Started Phase 1 production stabilization before payment work.
- Fixed phone OTP state handling:
  - client cooldowns are now stored per normalized phone number
  - editing the phone number clears the active OTP attempt, OTP expiry, visible cooldown state, and reCAPTCHA verifier
  - an old phone number's client cooldown no longer blocks sending OTP to a different number
- Cleaned the Firebase production deployment path:
  - Firebase production deploy is now manual-only from GitHub Actions on `main`
  - production deploy installs web and Functions dependencies
  - production deploy builds the static app with Firebase public env secrets
  - production deploy prepares the `/Chikki_Logs` hosting base path
  - production deploy generates `functions/.env` from the `AADHAAR_VAULT_ENCRYPTION_KEY` GitHub secret
  - production deploy includes hosting, Functions, and Firestore rules together
- Removed the obsolete GitHub Pages workflow for the deleted `test` branch.
- Reduced likely static-export RSC 404 noise by disabling Next prefetch on shared header/menu/footer navigation links.
- Added `docs/DEPLOYMENT_ENVIRONMENT_CHECKLIST.md`.
- Expanded auth checklist with OTP edit, rating, callable deployment, CORS, and RSC network checks.

### Verification Notes
- Before this stabilization deploy, Firebase production did not list `submitBookingRating`; that explains why the history rating failure looked like a CORS/preflight problem.
- Live rating verification remains pending until the manual GitHub Firebase production deploy runs from `main`.

## 2026-04-26

### Completed
- Added an end-to-end auth test checklist in `docs/AUTH_TEST_CHECKLIST.md`
- Updated `README.md` to link the auth checklist from the main setup docs
- Updated `docs/CHIKKI_MASTERBOOK.md` with a plain-language explanation of end-to-end auth and the preferred manual test method
- Updated `docs/TODO.md` so the remaining auth verification tasks point to the same checklist
- Updated `docs/CHIKKI_MASTERBOOK.md` and `docs/TODO.md` with the new booking spec:
  - home page shows hourly and overnight prices
  - first booking uses start time only
  - end time is optional until checkout
  - checkout shows actual stay time and collects payment
  - stays under 15 minutes cancel without payment
  - stays from 15 minutes up to less than 60 minutes are charged as a full hour
  - Aadhaar is optional in the booking flow and can be added later from Profile for repeat-booking convenience
  - train tracking is a future feature using train number or PNR
  - third-party Aadhaar verification is a future feature
- Added an "On Demand Logic" section to `docs/TODO.md` so the completed search, pricing, check-in, checkout, and OTP resend rules are easy to track
- Fixed review findings in the consumer booking flow:
  - initial search now applies URL filters before fetching listings
  - check-in minimum updates over time instead of freezing at page load
  - home cards now show both hourly and overnight prices instead of only one derived price
- Added consumer OTP resend flow with a 30-second cooldown and a disabled resend button until the timer ends
- Added a dedicated `/booking` page for the consumer booking path:
  - `Book This` now routes from listing cards into `/booking` with city, property, duration, and bed-filter context
  - consumers choose the exact bed and start time before review
  - Aadhaar appears only as an optional review-step prompt when the user wants it saved
  - `Modify Timings` returns the consumer to the bed/time step before final confirmation
  - advance booking is limited to the next 24 hours
- Preserved full query-string booking intent through protected-route login redirects so selected booking context survives authentication
- Updated the auth checklist with `/booking` and booking-query redirect coverage
- Fixed the local Next build config by changing `ignoreDeprecations` from `6.0` to the supported `5.0` value
- Added booking-history bed ratings:
  - consumers can rate completed bookings once from `/history`
  - rating and optional note are stored on the booking record
  - duplicate rating is blocked by the backend callable `submitBookingRating`
  - bed-level rating average/count is updated for consumer listing and booking display
  - owners can see rating status in service history without submitting ratings
- Added full location-to-listing flow:
  - home `Find Beds Near Me` detects browser location and chooses the nearest service city
  - consumer listings can be sorted by nearest property from the detected location
  - location context is preserved from listing search into `/booking`
  - station and bus-stand distances show meters when under 1 km and km otherwise
  - directions open in Google Maps with the property as destination and the detected location as origin when available
  - pilot city seed data now includes latitude, longitude, and service radius fields
- Added Aadhaar reference-vault storage:
  - full Aadhaar is submitted only to backend callables and encrypted into `aadhaar_identity_vault`
  - normal `users` records keep only `aadhaarRefId`, `aadhaarLast4`, and `aadhaarStatus`
  - repeat bookings attach only `aadhaarRefId` and identity status to the booking
  - direct client access to `aadhaar_identity_vault` is denied in Firestore rules
  - Aadhaar reference create/update and duplicate detection write audit logs
  - profile and booking copy now explain protected vault storage rather than ordinary metadata storage
- Added superadmin break-glass Aadhaar reveal:
  - callable `revealAadhaarBreakGlass` decrypts Aadhaar only for superadmin
  - reveal requires Aadhaar ref ID, user ID, or booking ID plus a detailed reason
  - every reveal writes `aadhaar_break_glass_revealed` to audit logs with reason, target user, booking, and IP fingerprint
  - hidden internal-control UI now has an `Identity Access` tab with a temporary 60-second reveal display
- Verified guest-route behavior in the local browser on `http://localhost:3000/Chikki_Logs`:
  - `/consumer` redirected to `/login?next=%2Fconsumer`
  - `/profile` redirected to `/login?next=/profile`
  - `/history` redirected to `/login?next=%2Fhistory`
  - `/apply-owner` redirected to `/login?next=%2Fapply-owner`
  - `/owner` redirected to `/login?next=%2Fowner`
  - `/operator` redirected to `/login?next=%2Foperator`
  - `/internal-control` redirected to `/login?next=%2Finternal-control`
- Verified public and support pages stayed accessible:
  - `/unauthorized` rendered the recovery guidance page
  - `/support` rendered the support page
  - `/cities` rendered the public cities table
- Verified one back-button case from the login redirect:
  - after visiting a protected route from home, pressing back returned to `/Chikki_Logs`

### Notes
- The auth checklist is now the shared runbook for role-by-role verification, unauthorized redirects, profile timeout behavior, and back-button checks.
- Signed-in role verification still needs real test accounts or an auth harness for consumer, owner, operator, and superadmin.

## 2026-04-25

### Completed
- Implemented server-side no-show cancellation automation in `functions/index.js`:
  - Added scheduled function `cancelNoShowBookings` (runs every minute)
  - Reads configurable check-in grace timeout from platform settings
  - Cancels bookings that remain `confirmed` beyond check-in + grace window
  - Updates both `bookings` and `booking_availability` to `cancelled`
  - Writes system audit logs for each auto-cancel action
- Added superadmin-controlled timeout setting in `functions/index.js`:
  - Added callable `getPlatformSettings` (operator + superadmin read)
  - Added callable `updatePlatformSettings` (superadmin-only write)
  - Stores settings in `platform_settings/main`
- Implemented safe scarcity mode backend in `functions/index.js`:
  - Added callable `setCityScarcityMode` (operator + superadmin)
  - Added scheduled function `refreshCityScarcityValues` (runs every 15 minutes)
  - Uses bounded city-level range (1 to 5)
  - Keeps one shared scarcity value per city for all consumers in the same refresh window
- Wired new backend callables in `src/lib/cloud/security.js`:
  - `getPlatformSettings`
  - `updatePlatformSettings`
  - `setCityScarcityMode`
- Extended superadmin data layer in `src/lib/firestore/superadmin.js`:
  - Added platform settings read/write helpers
  - Added city scarcity toggle helper
  - Added scarcity fields to city records returned by admin queries
- Updated superadmin UI in `src/app/internal-control/page.jsx`:
  - Added new `Platform Settings` tab with timeout minutes control
  - Added per-city scarcity status badge and enable/disable action
  - Kept superadmin-only access on hidden internal control route
- Updated operator UI in `src/app/operator/page.jsx`:
  - Added city-level safe scarcity control section
  - Operator can enable/disable scarcity mode per city
- Updated consumer listing behavior in `src/lib/firestore/consumer.js` and `src/app/consumer/page.jsx`:
  - Applies safe scarcity display value (`min(realAvailableBeds, cityScarcityValue)`)
  - Shows demand-style availability messaging when scarcity mode is active
  - Preserves real inventory logic for allocation and conflict checks

### Notes
- Timeout auto-cancel is enforced server-side and does not rely on the user keeping the app open.
- Safe scarcity mode is city-scoped and consistent across consumers for each 15-minute refresh window.
- City writes remain restricted in Firestore rules; operator access to scarcity updates is enforced via callable backend role checks.

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
