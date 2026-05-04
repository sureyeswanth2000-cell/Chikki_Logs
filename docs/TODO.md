# TODO

## Current Booking Spec
- [x] Home page should show nearby beds after location selection.
- [x] "Find Beds Near Me" should detect browser location, choose the nearest service city, and open listings with nearest properties first.
- [x] Use stored city/property coordinates for MVP nearest-city and nearest-property logic; use Google Maps directions links for navigation instead of paid Google API calls.
- [x] Distances under 1 km should display in meters; distances 1 km and above should display in km.
- [x] Each bed card should show both hourly price and overnight price before click.
- [x] "Book This" opens a dedicated `/booking` step where bed selection and start time happen before review/identity confirmation.
- [x] First booking should collect only the start time.
- [x] End time is optional during booking and can be resolved at checkout.
- [x] Advance booking is limited to the next 24 hours.
- [x] Checkout should show start time, end time, total time spent, and final amount due.
- [x] If the consumer spends less than 15 minutes, cancel the booking without payment.
- [x] If the consumer spends 15 minutes or more but less than 60 minutes, charge one full hour.
- [x] Payment should be collected at checkout.
- [x] Completed bookings can be rated once from booking history; the rating stays on the booking record.
- [x] Bed rating averages/counts should be visible during listing search and exact bed selection.
- [x] Aadhaar should be required from the second booking onward.
- [x] After the first booking completes, show a home-screen popup asking the consumer to add Aadhaar before the next booking.
- [ ] Future train tracking should accept train number or PNR number and notify the consumer like an alarm when the train is nearby.
- [ ] Future Aadhaar verification should use a third-party verification provider.
- [x] This spec supersedes the older booking-flow wording lower in the file.

## Auth Verification Runbook
- [x] Use [docs/AUTH_TEST_CHECKLIST.md](./AUTH_TEST_CHECKLIST.md) as the step-by-step method for end-to-end auth checks
- [x] Prefer manual role-by-role verification first, then automate the highest-value cases later
- [x] Re-run this checklist after any auth, role, or redirect change
- [x] Add a 30-second OTP resend flow for consumers and keep the resend button disabled until the timer ends
- [x] Fix OTP state reset when phone number is edited: old OTP attempt/timer state is still counted, and the UI does not reset to show a fresh Send OTP button for the new number
- [ ] Fix `submitBookingRating` CORS/preflight failure from history page (`No 'Access-Control-Allow-Origin' header`) so rating old bookings works on production web app — repo workflow is ready; pending manual GitHub Firebase production deploy and live verification
- [ ] Verify end-to-end old-booking rating flow in history after deploy (consumer can submit once, booking updates, bed aggregate updates, no browser CORS error)
- [x] Investigate and reduce repeated warm-up/navigation 404 requests for `__next.*.__PAGE__.txt?_rsc=...` seen across login/register/history/apply-owner/consumer/profile/support routes
- [ ] Verify in production browser network logs that disabling shared navigation prefetch reduced repeated `__next.*.__PAGE__.txt?_rsc=...` 404 noise
- [ ] Install Java / add Java to PATH so `npm run test:security:rules` can run Firebase Firestore emulator tests locally

## Security (2026-04-24 Audit Complete)
- [x] **CRITICAL: Audit missing route protections** - Found 4 unprotected pages
- [x] Protect `/consumer` page for consumer role
- [x] Protect `/profile` page for all authenticated roles
- [x] Protect `/history` page for consumer & owner roles
- [x] Protect `/apply-owner` page for consumer role
- [x] Verify all role-specific dashboards have `ProtectedRoute` wrapper
- [x] Document route protection status in CHIKKI_MASTERBOOK
- [x] Move Aadhaar into a dedicated protected identity table/collection instead of storing Aadhaar directly on user or booking records
- [x] Store only an Aadhaar reference ID on user/profile/booking records; never expose raw Aadhaar in normal Firestore documents
- [x] Mask Aadhaar everywhere in UI and operational views; show only safe last-4 style display when needed
- [x] Restrict the Aadhaar identity table/collection so only backend logic can access it; consumers, owners, operators, and superadmin UI must not read raw Aadhaar directly
- [x] Add audit logging for Aadhaar reference create/update and duplicate detection
- [x] Add superadmin break-glass Aadhaar reveal flow with required reason and audit log
- [x] Deploy Aadhaar vault/reveal functions and Firestore vault-blocking rules to Firebase
- [x] Deploy hidden superadmin Identity Access UI to Firebase Hosting
- [ ] Add production MFA/second-approval guard before Aadhaar break-glass reveal
- [ ] Run manual end-to-end verification: login as each role and verify redirects work correctly
- [ ] Test unauthorized role access (e.g., consumer tries to access /operator)
- [ ] Test 4-second profile load timeout triggers correctly
- [ ] Verify `/unauthorized` page displays correct recovery guidance for each redirect type
- [ ] Test back-button behavior after unauthorized redirect
- [ ] Record the verified results in `docs/WORK_LOG.md`

## Auth And Routing
- [x] Fix superadmin page incorrectly redirecting to consumer page — superadmin should stay on the superadmin dashboard after login
- [x] Add "Approve Owner" button on the superadmin dashboard — owner approval action is currently missing from the superadmin UI
- [x] After approving an owner application, mark the card as "Approved" (disable buttons, show status badge) instead of removing it from the list — gives superadmin a visible confirmation trail
- [x] On approve/reject, update only that single application in local state — do not re-fetch all applications from Firestore (avoids unnecessary DB reads)
- [x] Create hidden/internal-only superadmin entry that is not exposed in public/shared UI
- [x] Add superadmin capability to create another superadmin
- [x] Add superadmin UX for changing roles directly from the admin side
- [x] Add stronger unauthorized-role guidance and recovery path
- [x] Add stronger unauthorized-role handling in both UX and route behavior
- [x] Add route protection to all role-specific pages (2026-04-24)
- [ ] Verify end-to-end routing for consumer, owner, operator, and hidden superadmin after all auth refinements
- [ ] Verify end-to-end role routing for guest -> consumer, guest -> owner intent, owner default mode, owner consumer-mode switch, operator console, and hidden superadmin flow
- [ ] Keep `docs/AUTH_TEST_CHECKLIST.md` aligned with any future route or role changes

## Booking Flow
- [x] "Book This" button should navigate to a dedicated booking page/step — show time picker and bed selection first before any payment or Aadhaar input
- [x] Add a "Modify Timings" option in the booking flow so the user can adjust booking time before final confirmation
- [x] Restrict advance booking to 1 day only — do not allow bookings several hours/days too far ahead beyond the next day window
- [x] Fix booking timeout behavior — when booking time expires, the bed should become blocked/unavailable correctly and the booking timer/state should start and update reliably
- [x] If a consumer does not check in within 15 minutes after the booked check-in time, auto-cancel the booking and release/update the bed state correctly
- [x] Move Aadhaar collection to a separate step/page in the booking flow — do not show it inline on the consumer listing page
- [x] Allow consumers to rate a bed after checkout — add a post-checkout rating prompt in booking history
- [x] Add full location-to-listing flow using automatic nearest-city or nearest-property logic
- [ ] Investigate and speed up the "Book This" action from listing cards; it currently takes too long before opening the dedicated booking step
- [ ] Add missing modify-booking option for existing bookings so consumers can change booking timing/details after creation when allowed by booking rules
- [ ] Owner can add additional properties, but every new property must require operator or superadmin approval before it becomes active/listed
- [x] Booking history should show how much the consumer paid / final amount due for each booking
- [x] Booking history should show the rating action for eligible completed bookings; do not leave only a passive "Not rated" status when the user can rate
- [ ] Improve post-login return into the exact booking state, not only the consumer search context
- [ ] Verify owner-side visibility immediately after consumer booking across all booking states
- [ ] Harden booking flow against all dead ends and partial-state failures

## Pricing & Revenue Model
- [x] Replace hardcoded commission defaults with configurable platform commission defaults (start at 5%) controlled by operator/superadmin
- [x] Allow operator/superadmin to set per-owner commission overrides (can be below or above platform default) and use that override as the effective owner commission
- [x] Show consumers bed price only in listings/selection views; do not expose internal owner commission settlement details
- [x] Add fixed platform fee (default INR 9) at booking/checkout calculation time and allow superadmin to edit this fee from UI/platform settings
- [x] Show platform fee as a separate line item in booking/checkout summary for consumers (bed price + platform fee = final total)
- [x] Apply platform fee per booking (not per bed)
- [x] Do not charge platform fee on cancelled/no-charge bookings
- [x] Add an "Agreement" step during owner approval (superadmin/operator side) to record the agreed platform revenue share percentage per owner
- [x] Store agreed revenue share % on the owner's record (set by operator/superadmin, not editable by owner)
- [x] Owner earnings page should show owner received earnings by today, week, month, custom date, and total since starting only when the owner opens/requests earnings
- [x] Fix owner earnings date filters: Today, week, month, and custom should show only that period's received/expected amounts, not all-time totals mixed into the selected-period cards
- [x] Add owner edit-price action for each bed in Inventory / Bed Control so owners can update hourly, overnight, and overday base prices without recreating the bed
- [x] Convert automatic peak-demand pricing discussion into implementation checklist with owner/operator/superadmin rules
- [x] Add shared peak-demand pricing rule helper for occupancy thresholds, higher-multiplier selection, warnings, caps, and owner-disable expiry
- [x] Add demand pricing Firestore rules for `demand_watchlist`, `demand_pricing`, `demand_overrides`, and related audit logs
- [x] Add 15-minute Demand Watchlist backend job: scan city/property occupancy, exclude blocked beds, track only city/property scopes at or above 60% occupancy
- [x] Add 15-minute Demand Pricing backend job: read `demand_watchlist`, apply thresholds, write city/property demand summaries, and respect emergency disable / owner stop overrides
- [x] Add callable backend controls for demand pricing settings, internal city/property overrides, owner stop demand, and owner allow demand again
- [x] Add operator/superadmin peak-pricing settings UI: enable/disable, city/property thresholds, increase %, max cap %, emergency disable, and manual city/property demand controls
- [x] Add owner demand status UI for own properties: show active demand, reason, increase %, Stop Demand Pricing, and Allow Demand Pricing Again when stopped
- [x] Implement owner stop-demand override until next business day 06:00 local time; do not restart automatically on the next 15-minute run
- [x] Show consumer demand warning when city/property occupancy is above 60%: demand is rising and booking now can avoid later price increases
- [x] Show High Demand labels and demand-adjusted displayed bed prices on listing search and exact booking bed selection without exposing multiplier breakdown to consumers
- [x] Lock booking price at confirmation time, including any demand multiplier and High Demand label snapshot, so checkout never surprises the consumer
- [x] Show final all-inclusive bed price with a High Demand label when demand pricing applies; do not expose internal multiplier breakdown to consumers
- [x] Add demand-pricing audit logs for automatic updates, owner stop/allow, operator/superadmin enable/disable, settings edits, and emergency disable
- [x] Listing card hourly and overnight prices must be calculated from the owner's configured bed amount plus the owner-specific platform commission/revenue share; do not show stale hardcoded values like fixed INR 150/650
- [x] Bed price shown to consumer must reflect a single all-inclusive price (owner base price + platform revenue share + gateway fee) — do not show the breakdown separately
- [x] Remove the separate "commission" and "gateway" line items from consumer-facing UI; show only the final bed price
- [x] Operator/superadmin can review and update agreed revenue share % per owner from their console
- [x] Prepare Razorpay online payment integration (order creation, signature verification, webhook handling) so API keys can be added later
- [ ] Support owner and consumer payout/settlement accounts for Razorpay-based money flow
- [ ] Evaluate and implement bank-account verification (for example, INR 1 penny-drop) before enabling owner/consumer payout flows
- [x] Track owner commission dues for cash-collected bookings and show pending platform dues in owner/operator views
- [x] Add in-app owner settlement flow for paying pending platform dues; notify operator when owner marks a due payment complete
- [x] Add operator action to run commission due creation on-demand in addition to nightly schedule
- [x] Add owner dashboard quick card for pending platform dues summary
- [x] Auto-block new consumer bookings for an owner/property when unpaid commission instances >= 10 OR pending commission due exceeds INR 500
- [x] Auto-unblock booking after due settlement is confirmed, and provide operator manual unblock control with audit trail
- [ ] Owners with high platform commission % (e.g., ≥ 25%) should receive special platform privileges or dedicated support — define privilege tiers, what benefits each tier grants, and implement in-app indicators and backend enforcement
- [ ] Deploy Razorpay keys/secrets in Firebase Functions environment and run live-sandbox end-to-end checkout + webhook verification on production URL


- [ ] Refine first-booking / second-booking Aadhaar UX copy and edge-case handling
- [ ] Add clearer privacy explanation for Aadhaar collection and storage
- [ ] Add stronger trust cues around verified listings, payment safety, and support

## UX / UI
- [x] Role-based navigation menu — show different nav items per role (consumer sees Home/Consumer/History/Support/Apply as Owner; owner sees their dashboard links; operator/superadmin see their console links only; guest sees login/register)
- [x] Rethink owner navigation menu: decide which owner links should stay, which should be removed, and remove confusing items like Apply as Owner when the user is already an owner
- [ ] Mobile/side menu should close when clicking outside it, and also provide an explicit close button inside the menu
- [x] Add dark and light mode toggle for the app shell
- [x] Keep owner dashboard focused on active bookings, future bookings, and checkout pending; move earnings, inventory, and bed controls to their own pages to reduce unnecessary database reads
- [x] Fix dark-mode contrast for shared cards, tables, forms, and fixed Tailwind color utilities so text remains readable
- [ ] Add a proper background picture/visual treatment later so the header/home area does not feel blank
- [ ] Improve overall UX across login, booking, and profile completion
- [x] Redesign owner inventory UX: property, room, and bed management should live in a separate clear place instead of feeling mixed into the property creation flow
- [x] Owner inventory list pages should end with clear Add actions for Add Property, Add Room, Add Bed, and Add All; clicking each action should route to the correct create flow instead of making owners hunt through the page
- [ ] Rethink the Create Property map UI: current map looks poor/blank and needs clearer tiles/loading state, better sizing, and a more confidence-building exact-location selection flow
- [ ] Polish UI after flow stability is confirmed
- [ ] Improve current-location UX so it feels intentional and premium
- [ ] Add richer trust-forward listing presentation
- [ ] Improve role-console UX copy and confirmation states

## Product / Documentation
- [x] Rename canonical book to Chikki Masterbook
- [x] Update the Chikki Masterbook for operator role hierarchy and hidden superadmin flow
- [x] Add deployment and environment checklist to docs
- [ ] Expand work log with future completed milestones

## Autonomous SRE & Dev Pipeline (Future)
- [ ] Design 6-hour self-healing monitoring loop for Firebase logs using n8n on Cloud Run
- [ ] Query Google Cloud Logging for Firebase Data Connect and Firestore errors from the last 6 hours
- [ ] Add Gemini 2.5 Flash log analysis step to summarize root cause and required fix
- [ ] Build n8n to Jira handoff that creates remediation tickets when Gemini identifies a valid bug
- [ ] Add `ai-remediation-pending` Jira label and assignment path for GitHub Copilot remediation
- [ ] Define Copilot remediation workflow for Data Connect migrations, Functions changes, and test execution
- [ ] Deploy AI-generated fixes to Firebase Hosting Preview Channels before production
- [ ] Add Antigravity E2E verification against preview URLs with bug-specific browser actions
- [ ] Add human-in-the-loop Antigravity dashboard artifact with `PUSH TO PROD` approval
- [ ] Enforce SQL safety: Data Connect schema changes must include generated migration scripts
- [ ] Store Jira, GitHub, Gemini, and Antigravity secrets in Google Secret Manager for n8n
- [ ] Generate the initial n8n JSON workflow for Firebase log analysis and Jira ticket creation

## City Management
- [x] Allow both operator and superadmin to add, edit, and disable cities — currently only superadmin can; operator should have the same city management access
- [x] Prevent duplicate cities — reject add/save if a city with the same name + state combination already exists
- [x] Remove the Status field from the Add City form — new cities should default to Active without user input
- [x] Replace the Delete button on each city row with a Disable / Mark Inactive action — cities should never be hard-deleted
- [x] Script or one-time admin tool to remove existing duplicate city records (e.g., two "kavali, andhrapradesh" entries) — `scripts/cleanup-duplicate-cities.mjs`

## Internal Roles
- [x] Add role-change history view inside operator and superadmin consoles
- [ ] Add superadmin-only UX for promoting users into operator role more safely with confirmation language
- [x] Add superadmin-only platform setting to control no-check-in timeout minutes
- [x] Add city-level safe scarcity controls for superadmin and operator
- [ ] Add global emergency off switch for scarcity mode from superadmin platform settings

## Superadmin Growth Dashboard
- [x] 7-day booking trend bar chart — daily booking counts + gross revenue per day displayed in the Growth tab
- [x] All-time city breakdown table — city ranking by total bookings and gross revenue
- [x] Add a daily growth overview section in the superadmin Overview tab — show total bookings, check-ins, cancellations, and revenue for today vs. yesterday
- [ ] Break down daily metrics by city — each city row shows today's booking count, revenue, and active beds so superadmin can spot high/low performing cities at a glance
- [ ] Add a top-performing cities ranking on the overview — sorted by bookings today or revenue today
- [ ] Persist daily snapshot data to Firestore (e.g., `daily_snapshots/{date}`) so historical growth data survives page reloads and can be charted over time

## Bed Blocking & Extended Stay
- [ ] Keep a booking open and the bed blocked until BOTH owner AND consumer have confirmed checkout — do not release the bed until both sides confirm
- [x] Owner should have simple manual bed block/unblock buttons without selecting start time, end time, property, room, and bed through a long flow
- [ ] After the originally booked duration ends and the stay is extended, apply hourly pricing automatically — charge the owner's configured hourly rate per additional hour
- [ ] Add operator-controlled toggle: "First-hour new-user pricing" — when enabled, charge a separately configured first-hour price for first-time users instead of the standard hourly rate; operator can enable or disable this per-property or globally
- [ ] Add alert system: send an in-app notification (and optionally SMS/email) to the consumer when their booked time is about to expire, warning them to check out or extend
- [ ] Owner confirms cash-received at checkout; send consumer notification confirming payment receipt
- [ ] Detect unusually high cancellation rate per bed/location; temporarily block affected bed(s), require owner reason, and allow only operator-approved unblock
- [ ] Detect consumers with repeated cancellations near bed locations (threshold: >10 cancellations); auto-block consumer booking access until operator review and manual unblock
- [ ] Even when cancelled bookings have no platform fee, continue counting cancellations for near-bed/location risk tracking and enforcement

## Train Tracking (Future)
- [ ] If a consumer books a bed near a railway station, show a "Track My Train" option in their active booking view
- [ ] When "Track My Train" is enabled, monitor train arrival using a train status API and send an in-app alert (or call the consumer) when the train is nearby — prompt them to head to the bed/facility
- [ ] Add database-seeded superadmin management runbook so UI never edits existing superadmins
- [ ] Add operator audit review surface for monitoring sensitive changes
