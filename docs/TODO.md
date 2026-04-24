# TODO

## Security (2026-04-24 Audit Complete)
- [x] **CRITICAL: Audit missing route protections** - Found 4 unprotected pages
- [x] Protect `/consumer` page for consumer role
- [x] Protect `/profile` page for all authenticated roles
- [x] Protect `/history` page for consumer & owner roles
- [x] Protect `/apply-owner` page for consumer role
- [x] Verify all role-specific dashboards have `ProtectedRoute` wrapper
- [x] Document route protection status in CHIKKI_MASTERBOOK
- [ ] Run manual end-to-end verification: login as each role and verify redirects work correctly
- [ ] Test unauthorized role access (e.g., consumer tries to access /operator)
- [ ] Test 4-second profile load timeout triggers correctly
- [ ] Verify `/unauthorized` page displays correct recovery guidance for each redirect type
- [ ] Test back-button behavior after unauthorized redirect

## Auth And Routing
- [ ] Fix superadmin page incorrectly redirecting to consumer page — superadmin should stay on the superadmin dashboard after login
- [ ] Add "Approve Owner" button on the superadmin dashboard — owner approval action is currently missing from the superadmin UI
- [ ] After approving an owner application, mark the card as "Approved" (disable buttons, show status badge) instead of removing it from the list — gives superadmin a visible confirmation trail
- [ ] On approve/reject, update only that single application in local state — do not re-fetch all applications from Firestore (avoids unnecessary DB reads)
- [x] Create hidden/internal-only superadmin entry that is not exposed in public/shared UI
- [x] Add superadmin capability to create another superadmin
- [x] Add superadmin UX for changing roles directly from the admin side
- [x] Add stronger unauthorized-role guidance and recovery path
- [x] Add stronger unauthorized-role handling in both UX and route behavior
- [x] Add route protection to all role-specific pages (2026-04-24)
- [ ] Verify end-to-end routing for consumer, owner, operator, and hidden superadmin after all auth refinements
- [ ] Verify end-to-end role routing for guest -> consumer, guest -> owner intent, owner default mode, owner consumer-mode switch, operator console, and hidden superadmin flow

## Booking Flow
- [ ] "Book This" button should navigate to a dedicated booking page/step — show time picker and bed selection first before any payment or Aadhaar input
- [ ] Add a "Modify Timings" option in the booking flow so the user can adjust booking time before final confirmation
- [ ] Restrict advance booking to 1 day only — do not allow bookings several hours/days too far ahead beyond the next day window
- [ ] Fix booking timeout behavior — when booking time expires, the bed should become blocked/unavailable correctly and the booking timer/state should start and update reliably
- [ ] If a consumer does not check in within 15 minutes after the booked check-in time, auto-cancel the booking and release/update the bed state correctly
- [ ] Move Aadhaar collection to a separate step/page in the booking flow — do not show it inline on the consumer listing page
- [ ] Allow consumers to rate a bed after checkout — add a post-checkout rating prompt in booking history
- [ ] Add full location-to-listing flow using automatic nearest-city or nearest-property logic
- [ ] Improve post-login return into the exact booking state, not only the consumer search context
- [ ] Verify owner-side visibility immediately after consumer booking across all booking states
- [ ] Harden booking flow against all dead ends and partial-state failures

## Pricing & Revenue Model
- [ ] Remove hardcoded default platform commission percentage from bed prices — operator/superadmin should set a per-owner revenue share percentage during owner onboarding or approval
- [ ] Add an "Agreement" step during owner approval (superadmin/operator side) to record the agreed platform revenue share percentage per owner
- [ ] Store agreed revenue share % on the owner's record (set by operator/superadmin, not editable by owner)
- [ ] Bed price shown to consumer must reflect a single all-inclusive price (owner base price + platform revenue share + gateway fee) — do not show the breakdown separately
- [ ] Remove the separate "commission" and "gateway" line items from consumer-facing UI; show only the final bed price
- [ ] Operator/superadmin can review and update agreed revenue share % per owner from their console


- [ ] Refine first-booking / second-booking Aadhaar UX copy and edge-case handling
- [ ] Add clearer privacy explanation for Aadhaar collection and storage
- [ ] Add stronger trust cues around verified listings, payment safety, and support

## UX / UI
- [ ] Role-based navigation menu — show different nav items per role (consumer sees Home/Consumer/History/Support/Apply as Owner; owner sees their dashboard links; operator/superadmin see their console links only; guest sees login/register)
- [ ] Mobile/side menu should close when clicking outside it, and also provide an explicit close button inside the menu
- [ ] Improve overall UX across login, booking, and profile completion
- [ ] Polish UI after flow stability is confirmed
- [ ] Improve current-location UX so it feels intentional and premium
- [ ] Add richer trust-forward listing presentation
- [ ] Improve role-console UX copy and confirmation states

## Product / Documentation
- [x] Rename canonical book to Chikki Masterbook
- [x] Update the Chikki Masterbook for operator role hierarchy and hidden superadmin flow
- [ ] Add deployment and environment checklist to docs
- [ ] Expand work log with future completed milestones

## City Management
- [ ] Prevent duplicate cities — reject add/save if a city with the same name + state combination already exists
- [ ] Remove the Status field from the Add City form — new cities should default to Active without user input
- [ ] Replace the Delete button on each city row with a Disable / Mark Inactive action — cities should never be hard-deleted
- [ ] Script or one-time admin tool to remove existing duplicate city records (e.g., two "kavali, andhrapradesh" entries)

## Internal Roles
- [ ] Add role-change history view inside operator and superadmin consoles
- [ ] Add superadmin-only UX for promoting users into operator role more safely with confirmation language

## Bed Blocking & Extended Stay
- [ ] Keep a booking open and the bed blocked until BOTH owner AND consumer have confirmed checkout — do not release the bed until both sides confirm
- [ ] After the originally booked duration ends and the stay is extended, apply hourly pricing automatically — charge the owner's configured hourly rate per additional hour
- [ ] Add operator-controlled toggle: "First-hour new-user pricing" — when enabled, charge a separately configured first-hour price for first-time users instead of the standard hourly rate; operator can enable or disable this per-property or globally
- [ ] Add alert system: send an in-app notification (and optionally SMS/email) to the consumer when their booked time is about to expire, warning them to check out or extend

## Train Tracking (Future)
- [ ] If a consumer books a bed near a railway station, show a "Track My Train" option in their active booking view
- [ ] When "Track My Train" is enabled, monitor train arrival using a train status API and send an in-app alert (or call the consumer) when the train is nearby — prompt them to head to the bed/facility
- [ ] Add database-seeded superadmin management runbook so UI never edits existing superadmins
- [ ] Add operator audit review surface for monitoring sensitive changes
