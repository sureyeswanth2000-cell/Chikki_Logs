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
- [x] Book Now check-in is limited to the next 24 hours.
- [x] Future Booking check-in is limited to the next 30 days.
- [x] Future Booking adds a 10% final bed price surcharge for now; consumer sees only the final price labeled "Future booking price."
- [x] Backend locks the booking price at confirmation, including Future Booking surcharge and High Demand where applicable.
- [x] Checkout should show start time, end time, total time spent, and final amount due.
- [x] If the consumer spends less than 15 minutes, cancel the booking without payment.
- [x] If the consumer spends 15 minutes or more but less than 60 minutes, charge one full hour.
- [x] Payment should be collected at checkout.
- [x] Limit each consumer to a maximum of 4 active bookings at a time; allow the next booking only after one active booking is completed/cancelled.
- [x] If a confirmed booking remains open beyond the 15-minute no-check-in grace window, auto-cancel it and apply a minimum 1-hour charge settlement.
- [x] Completed bookings can be rated once from booking history; the rating stays on the booking record.
- [x] Bed rating averages/counts should be visible during listing search and exact bed selection.
- [x] Aadhaar should stay optional during booking; if the consumer wants to save it, show a friendly add-Aadhaar prompt in booking/profile instead of blocking checkout.
- [x] After the first booking completes, show a home-screen popup that lets the consumer add Aadhaar later for repeat-booking convenience.
- [ ] Future train tracking should accept train number or PNR number and notify the consumer like an alarm when the train is nearby.
- [ ] Future Aadhaar verification should use a third-party verification provider.
- [x] This spec supersedes the older booking-flow wording lower in the file.

## On Demand Logic
- [x] Initial search should apply URL filters before fetching listings.
- [x] Check-in minimum should refresh over time instead of staying frozen at page load.
- [x] Home-page pricing should show both hourly and overnight prices instead of collapsing to one derived price.
- [x] Checkout should cancel stays under 15 minutes without payment.
- [x] Checkout should charge one full hour for stays from 15 minutes up to less than 60 minutes.
- [x] The 30-second OTP resend flow should stay disabled until the timer ends.

## Ethical Engagement / Rewards
- [ ] Design an ethical intermittent-reward system that gives users occasional pleasant surprises tied to real value, without hiding prices, creating addiction loops, or pressuring unsafe bookings.
- [ ] Add occasional wallet cashback surprises after successful checkout only; rewards should be non-withdrawable, usable only for future bed bookings, auditable, capped, and rate-limited.
- [ ] Add milestone rewards for useful actions like first completed stay, verified Aadhaar/profile completion, repeated clean checkout behavior, and helpful ratings.
- [ ] Add small randomized upgrade-style rewards only when inventory allows, such as premium-bed discount, AC upgrade offer, or platform-fee waiver, without reducing owner payout unexpectedly.
- [ ] Add "mystery benefit" campaign support controlled by superadmin with clear rules, expiry, budget cap, per-user limits, and abuse prevention.
- [ ] Add loyalty tiers for completed stays and clean checkout behavior, such as Bronze/Silver/Gold traveler benefits.
- [ ] Add progress indicators for real benefits, such as "2 completed stays away from lower platform fee" or "complete profile to unlock wallet benefits."
- [ ] Add comeback rewards for inactive users, such as wallet credit after a successful return booking, with clear expiry and usage rules.
- [ ] Add truthful social-proof messaging only when backed by real data, such as recent bookings near the selected station or verified ratings count.
- [ ] Add train-delay/rest prompts that connect real train approach/delay context to nearby bed availability and valid wallet benefits.
- [ ] Add post-checkout engagement loop: show receipt, ask for rating, optionally grant wallet reward, and suggest next useful action.
- [ ] Do not use dark-pattern urgency, fake scarcity, misleading countdowns, hidden fees, or rewards that encourage unnecessary bookings.
- [ ] Document growth anti-patterns to avoid: fake scarcity, fake countdown timers, hidden fees, fake social proof, bait pricing, over-notification, forced streaks, confusing cancellation rules, and hard-to-exit flows.

## Auth Verification Runbook
- [x] Use [docs/AUTH_TEST_CHECKLIST.md](./AUTH_TEST_CHECKLIST.md) as the step-by-step method for end-to-end auth checks
- [x] Prefer manual role-by-role verification first, then automate the highest-value cases later
- [x] Re-run this checklist after any auth, role, or redirect change
- [x] Add a 30-second OTP resend flow for consumers and keep the resend button disabled until the timer ends
- [x] Fix OTP state reset when phone number is edited: old OTP attempt/timer state is still counted, and the UI does not reset to show a fresh Send OTP button for the new number
- [x] Fix `submitBookingRating` CORS/preflight failure from history page (`No 'Access-Control-Allow-Origin' header`) so rating old bookings works on production web app — deployed `submitBookingRating` + `submitBookingRatingHttp` on 2026-05-05 and verified preflight/POST CORS headers on production
- [ ] Verify end-to-end old-booking rating flow in history after deploy (consumer can submit once, booking updates, bed aggregate updates, no browser CORS error) — deployment complete; still pending authenticated production consumer booking validation (rechecked 2026-05-12, blocked by unavailable production consumer test session with completed booking)
- [x] Investigate and reduce repeated warm-up/navigation 404 requests for `__next.*.__PAGE__.txt?_rsc=...` seen across login/register/history/apply-owner/consumer/profile/support routes
- [ ] Verify in production browser network logs that disabling shared navigation prefetch reduced repeated `__next.*.__PAGE__.txt?_rsc=...` 404 noise — rechecked after additional route-level prefetch suppression + protected-route redirect hardening on 2026-05-05; repeated `__next.*.__PAGE__.txt?_rsc` 404 responses still present in production
- [x] Install Java / add Java to PATH so `npm run test:security:rules` can run Firebase Firestore emulator tests locally — installed Temurin JDK 21, configured `JAVA_HOME`/PATH, and passed `npm run test:security:rules` on 2026-05-05
- [x] Fix consumer listing permission-denied noise: do not read `platform_settings/main` or owner `users/{ownerId}` directly from consumer pages; use public-safe listing settings/fields instead
- [x] Add security-rules query tests for real page-level flows, not only single-doc reads, so permission bugs are caught before production
- [x] Add role-by-role browser smoke test for guest, consumer, owner, operator, and superadmin to identify pages showing "Missing or insufficient permissions"
- [x] Allow guest/consumer pre-login listing browse with public-safe active property, room, bed, bed-block, booking-availability, and demand-pricing reads; booking/payment/user docs stay protected
- [ ] Run the new role-by-role browser permission smoke test manually in production and record any remaining failures — re-run 2026-05-12: guest redirects verified for `/consumer`, `/history`, `/profile`, `/operator`, `/internal-control`, and `/apply-owner` now correctly redirects to `/login?next=%2Fapply-owner`; authenticated consumer/owner/operator/superadmin production sessions are still required for full pass

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
- [ ] Run manual end-to-end verification: login as each role and verify redirects work correctly — guest-only production smoke checks done on 2026-05-05; role-authenticated verification still pending test accounts
- [ ] Test unauthorized role access (e.g., consumer tries to access /operator) — guest protected-route checks done on 2026-05-05; authenticated consumer->operator case still pending
- [ ] Test 4-second profile load timeout triggers correctly
- [ ] Verify `/unauthorized` page displays correct recovery guidance for each redirect type
- [ ] Test back-button behavior after unauthorized redirect
- [x] Record the verified results in `docs/WORK_LOG.md`

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
- [x] Verify end-to-end routing for consumer, owner, operator, and hidden superadmin after all auth refinements — revalidated locally on 2026-05-12 with role matrix (`?devAuth=consumer|owner|operator|superadmin`) and protected-route redirects
- [x] Verify end-to-end role routing for guest -> consumer, guest -> owner intent, owner default mode, owner consumer-mode switch, operator console, and hidden superadmin flow — verified locally on 2026-05-12 with route-by-route matrix
- [x] Keep `docs/AUTH_TEST_CHECKLIST.md` aligned with any future route or role changes — checklist reviewed and aligned on 2026-05-12

## Booking Flow
- [x] "Book This" button should navigate to a dedicated booking page/step — show time picker and bed selection first before any payment or Aadhaar input
- [x] Add a "Modify Timings" option in the booking flow so the user can adjust booking time before final confirmation
- [x] Restrict advance booking to 1 day only — do not allow bookings several hours/days too far ahead beyond the next day window
- [x] Fix booking timeout behavior — when booking time expires, the bed should become blocked/unavailable correctly and the booking timer/state should start and update reliably
- [x] If a consumer does not check in within 15 minutes after the booked check-in time, auto-cancel the booking and release/update the bed state correctly
- [x] Move Aadhaar collection to a separate step/page in the booking flow — do not show it inline on the consumer listing page
- [x] Allow consumers to rate a bed after checkout — add a post-checkout rating prompt in booking history
- [x] Add full location-to-listing flow using automatic nearest-city or nearest-property logic
- [x] Improve listing transit display: show the nearest relevant railway station or bus stand when one is close; show both railway and bus distances when neither is clearly near
- [x] Investigate and speed up the "Book This" action from listing cards; it currently takes too long before opening the dedicated booking step
- [x] Add fast booking path with recommended bed selection, while keeping manual Choose Bed option for budget/rating/type control
- [x] Add separate Future Booking option from listing cards; Book Now supports check-in within 24 hours and Future Booking supports scheduled check-in within 30 days
- [x] Add 10% Future Booking surcharge to final bed price, label it as Future booking price, and lock the backend price at confirmation
- [x] Show Future Booking type and locked amount across consumer open bookings, history, owner dashboard, and owner history
- [x] Show Future Booking counts/gross in operator and hidden superadmin dashboard snapshots
- [x] Add operator/superadmin configuration UI for Future Booking surcharge percent; default remains 10% until configured
- [x] Add missing modify-booking option for existing bookings so consumers can change check-in time and bed before check-in when allowed by booking rules
- [x] Relock modified booking price on the backend and re-check same-property bed availability before saving
- [x] Show modified booking status in consumer open bookings/history and owner dashboard/history
- [x] Add check-in bed issue flow: if consumer reports bed is not good at check-in, offer another available bed in the same property first, then nearby property beds; track repeated bed reports and suggest/require owner bed replacement or operator review
- [x] Owner can add additional properties, but every new property must require operator or superadmin approval before it becomes active/listed
- [x] Booking history should show how much the consumer paid / final amount due for each booking
- [x] Booking history should show the rating action for eligible completed bookings; do not leave only a passive "Not rated" status when the user can rate
- [x] Improve post-login return into the exact booking state, not only the consumer search context
- [ ] Verify owner-side visibility immediately after consumer booking across all booking states — owner dashboard and owner data queries are wired for active/future/checkout-pending states, but full end-to-end booking-state verification still needs authenticated consumer + owner production sessions
- [x] Harden booking flow against all dead ends and partial-state failures

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
- [x] Support owner and consumer payout/settlement accounts for Razorpay-based money flow
- [x] Evaluate and implement bank-account verification (for example, INR 1 penny-drop) before enabling owner/consumer payout flows
- [x] Track owner commission dues for cash-collected bookings and show pending platform dues in owner/operator views
- [x] Add in-app owner settlement flow for paying pending platform dues; notify operator when owner marks a due payment complete
- [x] Add operator action to run commission due creation on-demand in addition to nightly schedule
- [x] Add owner dashboard quick card for pending platform dues summary
- [x] Auto-block new consumer bookings for an owner/property when unpaid commission instances >= 10 OR pending commission due exceeds INR 500
- [x] Auto-unblock booking after due settlement is confirmed, and provide operator manual unblock control with audit trail
- [x] Owners with high platform commission % (e.g., ≥ 25%) should receive special platform privileges or dedicated support — define privilege tiers, what benefits each tier grants, and implement in-app indicators and backend enforcement
- [ ] Deploy Razorpay keys/secrets in Firebase Functions environment and run live-sandbox end-to-end checkout + webhook verification on production URL


- [x] Refine optional Aadhaar UX copy and edge-case handling
- [x] Add clearer privacy explanation for Aadhaar collection and storage
- [x] Add stronger trust cues around verified listings, payment safety, and support

## UX / UI
- [x] Role-based navigation menu — show different nav items per role (consumer sees Home/Consumer/History/Support/Apply as Owner; owner sees their dashboard links; operator/superadmin see their console links only; guest sees login/register)
- [x] Rethink owner navigation menu: decide which owner links should stay, which should be removed, and remove confusing items like Apply as Owner when the user is already an owner
- [x] Mobile/side menu should close when clicking outside it, and also provide an explicit close button inside the menu
- [x] Add dark and light mode toggle for the app shell
- [x] Keep owner dashboard focused on active bookings, future bookings, and checkout pending; move earnings, inventory, and bed controls to their own pages to reduce unnecessary database reads
- [x] Fix dark-mode contrast for shared cards, tables, forms, and fixed Tailwind color utilities so text remains readable
- [x] Add a proper background picture/visual treatment later so the header/home area does not feel blank
- [x] Improve overall UX across login, booking, and profile completion
- [x] Redesign owner inventory UX: property, room, and bed management should live in a separate clear place instead of feeling mixed into the property creation flow
- [x] Owner inventory list pages should end with clear Add actions for Add Property, Add Room, Add Bed, and Add All; clicking each action should route to the correct create flow instead of making owners hunt through the page
- [x] Rethink the Create Property map UI: current map looks poor/blank and needs clearer tiles/loading state, better sizing, and a more confidence-building exact-location selection flow
- [x] Polish UI after flow stability is confirmed
- [x] Improve current-location UX so it feels intentional and premium
- [x] Add richer trust-forward listing presentation
- [x] Improve role-console UX copy and confirmation states

## Product / Documentation
- [x] Rename canonical book to Chikki Masterbook
- [x] Update the Chikki Masterbook for operator role hierarchy and hidden superadmin flow
- [x] Add deployment and environment checklist to docs
- [x] Expand work log with future completed milestones

## Scope Lock: Data Connect Backend Architecture
- [x] Finalize storage boundary decisions in architecture roadmap: SQL/Data Connect for permanent business data, Firestore for ephemeral state, and Cloud Logging/raw store for append-only logs/debug trails
- [ ] Lock Phase 1 delivery scope for migration: bookings, payments, rating events/summaries, owner commission dues, payouts, issue reports, and role-safe read views
- [ ] Define non-negotiable acceptance criteria for Phase 1: price lock correctness, checkout charge rules, role-safe rating visibility, and no unauthorized data exposure
- [ ] Freeze schema ownership and naming convention for `core`, `engagement`, `ops`, and `analytics` domains
- [ ] Document exact cutover guardrails: dual-run period, rollback trigger conditions, and source-of-truth switch checklist

## Data Connect / SQL Migration Execution
- [ ] Create Data Connect schema files for `core` transactional entities (users, properties, rooms, beds, bookings, payments)
- [ ] Create Data Connect schema files for `engagement` entities (rating_events, rating_summaries, feedback, issue reports)
- [ ] Create Data Connect schema files for `ops` entities (job_runs, job_failures, automation_runs, watermarks, audit events)
- [ ] Create Data Connect schema files for `analytics` entities (facts, dimensions, daily snapshots)
- [ ] Add privacy-safe SQL views for app usage: owner aggregate-only rating view and consumer self-history view
- [ ] Add BI and external read-only views excluding sensitive identity and internal operational secrets
- [ ] Implement incremental job watermark model (`updated_at` and `last_processed_id`) for all scheduled sync/aggregation tasks
- [ ] Implement daily snapshot generation jobs for KPI, city, property, owner, job, and automation summaries
- [ ] Map existing Firestore collections to target SQL tables and produce migration mapping sheet
- [ ] Build migration scripts to export, transform, and import dev/test Firestore data into SQL tables
- [ ] Run row-count and sample-record reconciliation checks between Firestore source and SQL target
- [ ] Enable dual-write/dual-read verification window and log all mismatches before cutover
- [ ] Complete phased cutover by domain, leaving only temporary collections in Firestore (`bed_locks`, `rate_limit_windows`, `temporary_job_tokens`, `short_lived_heartbeats`)
- [ ] Validate production read-only external BI access against approved safe views

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

## 2030 A to Z Master Roadmap
- [ ] Keep this section as the big simple roadmap: what data we store, how we protect it, how the app feels, how we host it, how we debug it, and how AI watches it.
- [ ] Explain every future technical decision in plain language first, then add exact tables, jobs, APIs, and tests under it.
- [ ] Treat booking, payment, identity, and safety as the heart of the app; beautiful features come after these are reliable.
- [ ] Build for one person using it today and a city full of people using it tomorrow without changing the foundation.

### 2030 Database Plan - Simple Rule
- [ ] Use Firebase Data Connect backed by Cloud SQL PostgreSQL for permanent business truth: users, properties, beds, bookings, payments, payouts, ratings, issues, jobs, and analytics.
- [ ] Use Firestore only for short-lived state: bed locks, rate limits, temporary job tokens, notification trigger documents, and simple heartbeat documents.
- [ ] Use Cloud Logging for raw technical logs: function crashes, request failures, deploy logs, webhook debug logs, and infrastructure events.
- [ ] Use `ops` tables for machine-readable operations: jobs, failures, watermarks, anomalies, app health, payment health, and node health.
- [ ] Use `ai_logs` tables for AI-readable summaries: cleaned issue summaries that Gemini can read without scanning private raw data.
- [ ] Never make dashboards scan raw booking/payment tables repeatedly; dashboards must read facts, summaries, or snapshot tables.
- [ ] Never make AI read secret or raw private data directly; AI should read sanitized summaries with IDs and safe context.

### 2030 Database Schemas And What They Save
- [ ] `core.users`: one row per person; saves name, phone, email, role-safe profile fields, status, timestamps, and safe identity references only.
- [ ] `core.user_roles`: saves which user has which role, who assigned it, when it was assigned, and whether it is active.
- [ ] `core.cities`: saves supported cities, state, active status, latitude, longitude, service radius, and city-level controls.
- [ ] Enforce database uniqueness for cities using state + district + city name (normalized), so duplicate city rows are never inserted.
- [ ] `core.properties`: saves owner property details, address, city, location, approval status, listing status, and owner relationship.
- [ ] `core.rooms`: saves rooms inside properties, room name, floor label, active status, and property relationship.
- [ ] `core.beds`: saves bed code, room, property, bed type, base prices, active status, and bookable inventory data.
- [ ] `core.bed_blocks`: saves owner/operator bed blocks, reason, start time, end time, who created it, and active state.
- [ ] `core.bookings`: saves every booking truth: consumer, owner, property, bed, booking type, status, check-in/out, locked price, payment status, cancellation reason, modification details, and identity reference.
- [ ] `core.booking_state_events`: saves every important booking status change so we can replay what happened and debug booking timeline problems.
- [ ] `core.payments`: saves payment mode, gateway order/payment IDs, amount, platform fee, owner share, status, collected time, and booking relationship.
- [ ] `core.payment_events`: saves every payment status update from app, gateway, webhook, manual correction, and reconciliation.
- [ ] `core.owner_commission_dues`: saves platform commission owed by owners for cash bookings, due status, amount, booking link, and settlement references.
- [ ] `core.owner_payouts`: saves payout period, gross amount, commission deduction, net amount, payout status, approval, and processed time.
- [ ] `core.payout_accounts`: saves owner payout account metadata, provider reference, verification status, and masked bank/UPI details only.
- [ ] `core.platform_settings`: saves safe configurable settings like fees, booking grace minutes, demand pricing enablement, emergency switches, and limits.
- [ ] `core.owner_applications`: saves owner application details, approval state, operator/superadmin decision, decision reason, and audit references.
- [ ] `engagement.rating_events`: saves each consumer rating event, booking link, score, optional comment, aggregation state, and timestamps.
- [ ] `engagement.rating_summaries`: saves fast average rating/count per bed/property/owner so listings do not scan every rating.
- [ ] `engagement.issue_reports`: saves bed/property/booking issues, severity, reporter, replacement bed, resolution state, and SLA timestamps.
- [ ] `engagement.feedback_events`: saves app feedback, support feedback, feature feedback, tags, severity, and routing status.
- [ ] `engagement.support_threads`: saves support conversation metadata, assigned operator, status, priority, and linked booking/payment/issue.
- [ ] `ops.audit_events`: saves who did what, to which record, before/after summary, reason, and time; used for trust and investigation.
- [ ] `ops.job_definitions`: saves each job name, owner, schedule, purpose, expected runtime, allowed overlap rule, and alert threshold.
- [ ] `ops.job_runs`: saves every job run, trigger type, status, start/end time, duration, processed count, watermark used, and error summary.
- [ ] `ops.job_failures`: saves failed job details, stack summary, retry count, severity, owner, and whether human action is needed.
- [ ] `ops.job_watermarks`: saves each job's last processed time/id so jobs process only new changes, not full tables.
- [ ] `ops.app_sessions`: saves each app open session, user or guest identity, route, device, opened time, closed time, duration, and average session duration so we know who is using the app and for how long.
- [ ] `ops.table_catalog`: saves metadata for every table, including purpose, owner, source-of-truth type, update cadence, and how the table helps dashboards/jobs/AI so the schema stays understandable.
- [ ] `ops.anomaly_events`: saves unusual behavior like spam bookings, traffic spike, payment mismatch, repeated crashes, or suspicious user activity.
- [ ] `ops.app_health_checks`: saves app uptime checks, URL status, latency, error message, and region/source of the check.
- [ ] `ops.payment_reconciliation_runs`: saves payment matching results between app records and gateway/webhook data.
- [ ] `ops.node_heartbeats`: saves heartbeat from Cloud Run/n8n/worker nodes so CPO-style monitoring knows what is alive.
- [ ] `analytics.booking_facts`: saves analytics-friendly booking facts by date, city, property, owner, status, amount, and duration.
- [ ] `analytics.payment_facts`: saves analytics-friendly payment facts by date, mode, status, gateway, city, owner, and amount.
- [ ] `analytics.occupancy_facts`: saves occupied/bookable capacity by city/property/bed/time window for fast demand and dashboard reads.
- [ ] `analytics.daily_kpi_snapshots`: saves one daily row for platform health: bookings, revenue, cancellations, issues, ratings, active beds, and active properties.
- [ ] `analytics.city_daily_snapshots`: saves city-level daily rows: bookings, revenue, occupancy, issues, ratings, and growth.
- [ ] `analytics.property_daily_snapshots`: saves property-level daily rows: bookings, revenue, occupancy, issues, ratings, and problem signals.
- [ ] `analytics.owner_daily_snapshots`: saves owner-level daily rows: bookings, revenue, dues, payouts, issues, and ratings.
- [ ] `analytics.job_daily_snapshots`: saves job health per day: run count, success count, failure count, average runtime, and lag.
- [ ] `ai_logs.log_batches`: saves a safe batch of logs/findings prepared for AI review, with time range and source.
- [ ] `ai_logs.audit_findings`: saves AI-readable audit concerns like unusual role change, repeated sensitive reveal, or suspicious admin action.
- [ ] `ai_logs.payment_findings`: saves AI-readable payment issues like gateway mismatch, webhook missing, duplicate payment, or stuck checkout.
- [ ] `ai_logs.booking_risk_findings`: saves AI-readable booking risks like spam booking, repeated cancellation, stuck booking, or unusual city spike.
- [ ] `ai_logs.traffic_findings`: saves AI-readable traffic spikes, route errors, bot-like behavior, and rate-limit signals.
- [ ] `ai_logs.app_health_findings`: saves AI-readable uptime, latency, crash, and failed deployment summaries.
- [ ] `ai_logs.ai_summaries`: saves Gemini/n8n/CPO digest output, recommended actions, confidence, severity, and human review status.
- [ ] `ai_logs.ai_alerts`: saves alerts sent to email/Slack/console, delivery status, recipients, and escalation state.

### 2030 Database Speed Classes
- [ ] Mark booking creation, bed lock, availability check, check-in, checkout, payment update, spam block, and app-down alert as immediate/fast paths.
- [ ] Mark owner dashboards, issue queues, notices, property approvals, and profile updates as normal paths that can be seconds late.
- [ ] Mark rating aggregation, daily snapshots, payout preparation, AI digest, and retention cleanup as scheduled paths that can be hourly or nightly.
- [ ] Add a `speed_class` or equivalent note to every planned table/job so developers know what must be fast and what must be cheap.
- [ ] Keep fast paths small: read by known ID or narrow indexed query, write only essential records, and push extra work to Pub/Sub/job queues.

### 2030 Indexes, Views, And Load Reduction
- [ ] Create indexes only for real queries: booking by user/status/date, booking by property/status/check-in, payment by booking/status/gateway ID, issue by status/severity/property, job by status/time.
- [ ] Add privacy-safe Data Connect queries/views for consumer, owner, operator, and superadmin instead of letting clients read raw tables directly.
- [ ] Add owner-safe rating views that show only aggregate ratings, never who gave each rating.
- [ ] Add consumer-safe history views that show only the consumer's own bookings, payments, ratings, and issues.
- [ ] Add BI-safe views that remove Aadhaar, phone, email, internal notes, secret metadata, and raw webhook payloads.
- [ ] Move dashboard cards to snapshot reads so superadmin/owner/operator dashboards do not scan all bookings/payments.
- [ ] Replace current full Firestore scans with incremental SQL jobs using `updated_at > watermark` or `id > last_processed_id`.

### 2030 Jobs And When They Run
- [ ] Booking lifecycle enforcer: event-driven immediately on booking changes, plus scheduled catch-up every 1-5 minutes for missed transitions.
- [ ] No-show cancellation job: query only expired confirmed bookings, not all confirmed bookings.
- [ ] Bed lock cleanup job: every 1-5 minutes, clears expired temporary locks from Firestore.
- [ ] Payment webhook processor: runs immediately from gateway webhook, verifies signature, writes payment event, and updates payment status.
- [ ] Payment reconciliation job: every 15-30 minutes for recent payments, plus daily full gateway comparison for finance safety.
- [ ] Spam booking detector: immediate signal on booking attempt, plus 5-minute rolling window job for user/IP/property/city abuse.
- [ ] High traffic detector: every 1-5 minutes, compares current traffic against normal baseline and writes anomaly if sudden spike happens.
- [ ] Issue escalation job: every 15 minutes, escalates unresolved severe issues or SLA-breached issues.
- [ ] Rating summary job: nightly, updates rating summaries from new rating events only.
- [ ] Commission due generator: nightly after payment states are settled, creates dues only for completed and payment-confirmed cash bookings.
- [ ] Payout preparation job: daily after dues generation, deducts dues and creates payout candidates.
- [ ] Booking fact sync: hourly or near-real-time using watermarks.
- [ ] Payment fact sync: hourly or near-real-time using watermarks.
- [ ] Hourly booking flow smoke check job: every 1 hour, exercise the booking flow end-to-end and record whether search, booking, payment, and post-booking states still work.
- [ ] Daily snapshot generator: after day close, writes KPI/city/property/owner/job snapshots.
- [ ] Data quality validator: daily, checks missing owner, missing payment, invalid status, impossible dates, and orphan records.
- [ ] App uptime checker: every 1-5 minutes, checks production website/app endpoint and writes health check results.
- [ ] Function crash monitor: every 5-15 minutes, summarizes Cloud Logging errors into `ops` and `ai_logs`.
- [ ] Node heartbeat monitor: every 1-5 minutes, checks whether n8n/Cloud Run/workers are alive.
- [ ] AI digest job: 4 times per day, asks Gemini to summarize safe findings and send email.
- [ ] Critical AI alert job: immediate when severity is critical; app down, payment mismatch, checkout failure spike, repeated crash, or suspected attack.
- [ ] Retention cleanup job: nightly/weekly based on table policy; archives old raw logs and keeps permanent finance/audit records.

### 2030 Pub/Sub And Workflow Rules
- [ ] Use Pub/Sub for fast events: `booking.created`, `booking.confirmed`, `booking.modified`, `booking.checked_in`, `booking.completed`, `payment.updated`, `issue.reported`.
- [ ] Use Cloud Scheduler for fixed-time jobs: snapshots, reconciliation, retention, AI digest, and daily finance chain.
- [ ] Use Cloud Workflows for ordered chains: payment reconciliation before due generation, due generation before payout preparation, fact sync before snapshots.
- [ ] Add idempotency keys to Pub/Sub handlers so retry never creates duplicate payment, due, payout, or issue records.
- [ ] Add dead-letter handling for failed events so an operator can see and replay failed work safely.
- [ ] Keep user request paths short: do not wait for analytics, AI, email, or heavy scans during booking/payment actions.

### 2030 Retention And Archive Policy
- [ ] Keep bookings, payments, dues, payouts, and audit events long-term because they are business and finance truth.
- [ ] Keep raw debug logs short-term unless tied to an incident.
- [ ] Keep AI summaries long enough to compare recurring problems, but do not store private raw user data inside summaries.
- [ ] Keep temporary Firestore locks and rate windows only for minutes/hours.
- [ ] Archive old job runs into daily/monthly summaries so ops tables stay fast.
- [ ] Define deletion and export rules for user privacy requests before public scale.
- [ ] Keep immutable finance records even when user-visible profile data is deleted or anonymized, according to legal/accounting requirements.

### 2030 Security And Privacy
- [ ] Use Firebase Auth for login identity and custom claims only for role hints; backend/database must still verify permissions.
- [ ] Enforce role-based access in Data Connect queries and server functions, not only in UI buttons.
- [ ] Use Firebase App Check for web/app clients to reduce abuse from fake clients.
- [ ] Keep Aadhaar and sensitive identity data in a protected vault with encryption, masked display, and break-glass audit.
- [ ] Add production MFA or second approval before any Aadhaar reveal or sensitive finance correction.
- [ ] Store secrets only in Secret Manager or Firebase/Google managed secret config, never in code or public env files.
- [ ] Rotate Razorpay, Gemini, email, and service credentials on a defined schedule.
- [ ] Add rate limits for OTP, booking attempts, payment attempts, support messages, AI prompts, and admin actions.
- [ ] Add security audit events for role change, settings change, payment correction, payout approval, Aadhaar reveal, owner approval, and emergency switch use.
- [ ] Add anomaly detection for repeated failed login/OTP, many bookings from one IP, many cancellations, repeated payment mismatch, and suspicious admin actions.
- [ ] Add least-privilege IAM: deployer, function runtime, Data Connect service, Cloud Logging reader, and email sender should have only required permissions.
- [ ] Add backup and restore testing for PostgreSQL/Data Connect before production-scale launch.
- [ ] Add security rules tests and Data Connect permission tests for every role: guest, consumer, owner, operator, superadmin.
- [ ] Add a privacy-safe logging rule: logs should store IDs and error context, not full Aadhaar, full phone, full payment secrets, or raw tokens.

### 2030 App Features - Website And Mobile
- [ ] Build a fast PWA first: installable web app, offline shell, push notifications, and home-screen icon.
- [ ] Plan Android app publishing through Google Play Console after core booking/payment flows are stable.
- [ ] Add app store readiness: app icon, screenshots, privacy policy, data safety answers, content rating, testing track, production release checklist.
- [ ] Use the same backend for website and mobile app so bookings/payments stay consistent.
- [ ] Add live booking tracker: shows booking state, check-in deadline, bed status, payment status, issue status, and next action.
- [ ] Add smart bed recommendation: fastest nearby available bed, best value bed, highest rated bed, and quiet/rest-friendly bed.
- [ ] Add train tracking flow: consumer can enter train number/PNR and receive bed/rest reminders near destination.
- [ ] Add geofenced check-in support only where safe: suggest check-in when near property, but never block valid support cases without operator override.
- [ ] Add in-app support assistant for booking/payment/bed issues with human handoff.
- [ ] Add owner command center: live bookings, beds needing attention, unpaid dues, issue SLA, and payout readiness.
- [ ] Add operator control tower: city health, payment health, booking anomalies, owner approvals, issue queue, and job health.
- [ ] Add superadmin future dashboard: revenue, growth, risk, AI findings, cost, uptime, and launch readiness.
- [ ] Add smart notifications: booking reminders, checkout reminder, payment receipt, issue updates, owner alerts, operator escalations.
- [ ] Add accessibility and language readiness: simple English first, Telugu/Hindi later, large tap targets, clear error messages.
- [ ] Add trusted listing signals: verified owner, verified location, recent clean checkout count, rating count, and support response status.
- [ ] Add ethical rewards only after real actions: cashback wallet, loyalty tiers, profile completion benefit, and no fake urgency.
- [ ] Add AI-assisted listing quality checks: detect missing photos, suspicious descriptions, duplicate properties, and poor owner response patterns.
- [ ] Add voice-friendly support later: user can speak issue details and app converts to support ticket summary.

### 2030 Firebase Hosting, App Hosting, And Deployment
- [ ] Keep current Firebase Hosting path stable for static export until the backend architecture is ready.
- [ ] Evaluate Firebase App Hosting for the Next.js app because it supports modern full-stack Next.js, GitHub rollouts, Cloud Run, Cloud CDN, and Secret Manager integration.
- [ ] Use preview channels for every risky UI/backend change before production.
- [ ] Add separate environments: local, preview, staging, and production.
- [ ] Keep production deploy manual or protected until tests, security checks, and smoke tests pass.
- [ ] Add deployment checklist: build, lint, security rules tests, function deploy, hosting deploy, smoke test, rollback note.
- [ ] Add rollback plan: previous hosting release, previous function version, database migration rollback, and incident note.
- [ ] Add deployment health check: after deploy, app uptime checker and browser smoke test must pass before closing release.
- [ ] Store production environment config and secrets outside repository.
- [ ] Remove localhost-only auth bypass and dev booking preview before production app launch.

### 2030 Debugging And Quality
- [ ] Add local debugging guide for website, functions, Firestore emulator, Data Connect emulator, and payment sandbox.
- [ ] Add standard bug report template: what happened, user role, booking/payment ID, time, browser/app version, expected result, actual result.
- [ ] Add correlation IDs across booking, payment, webhook, function logs, audit logs, and AI findings.
- [ ] Add automated smoke tests for guest browse, consumer booking, checkout, owner view, operator issue queue, and superadmin dashboard.
- [ ] Add end-to-end payment sandbox tests before enabling live payment.
- [ ] Add performance budgets for listing page, booking page, checkout, dashboard, and app startup.
- [ ] Add monitoring for slow pages, slow Data Connect queries, expensive jobs, and failed Firestore/Data Connect permissions.
- [ ] Add production incident runbook: app down, payments failing, bookings stuck, owner payout wrong, login broken, high traffic spike, and database cost spike.
- [ ] Add QA checklist before Google Play launch: install, login, booking, payment, notification, offline behavior, privacy, permissions, and uninstall/reinstall behavior.

### 2030 AI Orchestration And Monitoring
- [ ] Use deterministic rules for detection first, then Gemini for explanation and summary.
- [ ] Use Gemini/Genkit on the server side for audit summaries, payment issue summaries, crash summaries, and recommended actions.
- [ ] Use Firebase AI Logic for future user-facing app AI features only when client-side Gemini access is needed and protected by App Check/rate limits.
- [ ] Send AI email digest 4 times per day: morning health, midday booking/payment, evening operations, and end-of-day summary.
- [ ] Send immediate alert when severity is critical: app down, checkout failure spike, payment mismatch, webhook failure, suspicious attack, or job chain stopped.
- [ ] Add a CPO-style monitor that checks whether all AI/jobs are alive: log reader, payment monitor, booking monitor, traffic monitor, email sender, and ticket creator.
- [ ] Add AI summary format: what happened, why it matters, affected IDs, likely cause, recommended next action, severity, confidence, and owner.
- [ ] Add human approval before AI creates code changes, deploys fixes, changes settings, refunds payment, blocks users, or reveals sensitive data.
- [ ] Add n8n only as an orchestrator where it helps: email routing, ticket creation, scheduled summaries, and cross-service workflow visibility.
- [ ] Keep e2-medium server lightweight: do not depend on local LLM for serious monitoring; use Gemini API for analysis and keep local services for orchestration/heartbeats.
- [ ] Add AI cost controls: summarize batches, cap prompt size, skip duplicate incidents, and store only one summary per repeated issue window.

### 2030 Launch And Growth Readiness
- [ ] Create launch checklist for first city: verified properties, owner training, support operator, payment test, refund policy, privacy policy, and emergency contact.
- [ ] Create Google Play launch checklist: developer account, package name, signing key, app bundle, privacy policy URL, data safety form, screenshots, content rating, test track, production rollout.
- [ ] Create web launch checklist: custom domain, HTTPS, SEO basics, PWA manifest, robots/sitemap, error pages, analytics, uptime monitoring, and support page.
- [ ] Create operations checklist for each launch day: app health, payment health, booking health, traffic health, support queue, owner response, and AI digest review.
- [ ] Add city expansion readiness score: active beds, verified owners, payment reliability, support coverage, demand signals, and issue rate.
- [ ] Add post-launch learning loop: every week review bookings, failed payments, cancelled bookings, issue reports, owner response, user feedback, and AI findings.

### 2030 Missing Maturity Layer
- [ ] Add this layer before public scale so the app is not only smart, but also legally safe, financially safe, recoverable, and trusted.
- [ ] Keep the rule simple: every risky user action needs policy, audit, support recovery, and rollback thinking.

### 2030 Legal, Policy, And Consent
- [ ] Write plain Terms and Conditions for consumers: what booking means, payment responsibility, checkout rules, cancellation rules, and support boundaries.
- [ ] Write plain Owner Agreement: listing rules, property truth, commission, payout timing, bad-bed handling, safety expectations, and platform suspension rights.
- [ ] Write Privacy Policy: what data is collected, why it is collected, how long it is kept, who can see it, and how users request deletion/export.
- [ ] Write Cancellation and Refund Policy: no-show, short stay, failed payment, duplicate payment, owner issue, bad bed, and operator-approved refund.
- [ ] Write Payment Dispute Policy: what happens when consumer says paid but app says unpaid, or gateway webhook is delayed.
- [ ] Add user consent records for location, notifications, analytics, optional Aadhaar, AI-assisted support, and marketing messages.
- [ ] Add policy version tracking so each user/owner record knows which policy version they accepted.
- [ ] Add in-app policy screens and short child-simple summaries before the full legal text.

### 2030 Payment, Refund, And Accounting Safety
- [ ] Add refund request table: booking, payment, reason, requested by, status, approved by, amount, gateway refund ID, and timestamps.
- [ ] Add duplicate payment detector: same booking, same gateway order, same amount, repeated success, or webhook replay.
- [ ] Add failed payment retry flow: show safe retry, never double-book, and never mark paid until gateway verification succeeds.
- [ ] Add chargeback/dispute tracking for gateway disputes, evidence, operator notes, and final outcome.
- [ ] Add receipt/invoice generation after successful checkout with booking ID, payment ID, amount, taxes/fees if applicable, and support contact.
- [ ] Add Razorpay settlement reconciliation: compare app payment, Razorpay payment, Razorpay settlement, owner payout, and platform fee.
- [ ] Add tax/GST/accounting export planning before scale: daily revenue export, owner payout export, commission due export, and refund export.
- [ ] Add manual finance correction flow with two-person approval and audit trail.
- [ ] Add payment incident playbook: gateway down, webhook delayed, duplicate payment, refund stuck, and settlement mismatch.

### 2030 Trust, Safety, And Abuse Prevention
- [ ] Add owner verification workflow: phone, identity, payout account, property ownership/permission, and operator approval.
- [ ] Add property verification workflow: photos, address, map pin, nearby landmark, city validity, and operator/superadmin approval.
- [ ] Add fake property detector: duplicate address, reused photos, impossible location, repeated complaints, or suspicious owner pattern.
- [ ] Add unsafe listing reporting: consumer can report unsafe/closed/wrong-location property and operator reviews it.
- [ ] Add bad owner/user review queue with reasons, evidence, decision, appeal status, and unblock path.
- [ ] Add temporary suspension controls for property, bed, owner, or consumer with required reason and audit.
- [ ] Add operator override rules for emergency support, but every override must be logged and reviewable.
- [ ] Add trust badges only when backed by real data: verified property, verified owner, clean checkout history, fast support response, and low issue rate.

### 2030 Mobile App Security
- [ ] Use Firebase App Check for web and mobile so backend requests come from trusted app clients where possible.
- [ ] Use Play Integrity through Firebase App Check for Android builds distributed through Google Play.
- [ ] Add app signing and key management checklist for Android release builds.
- [ ] Add deep link and app link plan for login return, booking continuation, payment result, support ticket, and train tracking.
- [ ] Add push notification token table with device ID, user ID, platform, token status, app version, last seen, and opt-in status.
- [ ] Add forced update flow: minimum supported app version, soft update message, hard block only for unsafe old versions.
- [ ] Add rooted/tampered device risk handling where possible, but keep support fallback for real users.
- [ ] Add mobile permission education for location and notification: explain why it helps before asking the OS permission.

### 2030 Cost And Capacity Monitoring
- [ ] Add Google Cloud Billing budgets and alerts for total project cost, with warning levels before money surprises happen.
- [ ] Add monthly cost dashboard: Firebase Hosting/App Hosting, Cloud Functions, Cloud Run, Cloud SQL, Firestore, Cloud Logging, Gemini, and network egress.
- [ ] Add per-job cost thinking: runtime, records processed, reads/writes, API calls, and whether it scanned too much data.
- [ ] Add Gemini cost guardrails: prompt size limit, batch size limit, duplicate incident suppression, daily spend cap target, and fallback summary without AI.
- [ ] Add Cloud Logging retention controls so debug logs do not become a hidden cost problem.
- [ ] Add database growth forecast: bookings/day, payments/day, logs/day, snapshots/day, and expected storage after 3/6/12 months.
- [ ] Add cost anomaly alert: if today's cloud spend is much higher than normal, create an ops anomaly and email summary.
- [ ] Add scale plan for first 100, 1,000, 10,000, and 100,000 bookings.

### 2030 Disaster Recovery And Incident Management
- [ ] Define RPO: how much recent data loss is acceptable for booking, payment, audit, and analytics data.
- [ ] Define RTO: how quickly the website/app, booking, payment, and operator console must recover after an outage.
- [ ] Enable Cloud SQL automated backups and point-in-time recovery planning for the Data Connect PostgreSQL database.
- [ ] Run backup restore drills before production scale: restore to test instance, verify row counts, verify sample booking/payment records.
- [ ] Add migration rollback tests for every database migration before production deployment.
- [ ] Add incident severity levels: SEV1 app/payment down, SEV2 booking degraded, SEV3 dashboard/job issue, SEV4 minor bug.
- [ ] Add incident timeline table: detected at, acknowledged at, owner, status, impact, actions, fixed at, and postmortem link.
- [ ] Add emergency production freeze process: stop risky deploys during payment incident, booking incident, or database migration issue.
- [ ] Add public/internal status note template for outages and recovery updates.

### 2030 AI Safety And Quality Control
- [ ] Add AI prompt/version table so every Gemini summary can be traced to the prompt version that produced it.
- [ ] Add AI output review: human marks each important AI finding as useful, wrong, duplicate, or needs action.
- [ ] Add false-positive tracking so AI alerts improve over time and do not create alert fatigue.
- [ ] Add PII redaction before AI reads logs: remove full phone, full Aadhaar, payment secrets, tokens, and private notes.
- [ ] Add Gemini API failure fallback: deterministic alert still sends even if AI summary fails.
- [ ] Add AI confidence and severity rules: low-confidence findings go to digest, high-confidence critical findings can alert immediately.
- [ ] Add human approval before AI creates tickets, code changes, setting changes, user blocks, refunds, payouts, or production deploys.
- [ ] Add AI safety tests with fake logs: payment mismatch, app down, spam bookings, sensitive data leak, and duplicate incident.

### 2030 Notifications And Communication
- [ ] Add notification preference center: booking, payment, support, owner alerts, marketing, train alerts, and emergency alerts.
- [ ] Add notification delivery table: channel, recipient, template, status, provider message ID, retry count, and failure reason.
- [ ] Add channel strategy: in-app first, push for app users, email for receipts/admin digests, SMS/WhatsApp only for high-value urgent events.
- [ ] Add failed notification retry job with backoff and final operator visibility.
- [ ] Add emergency broadcast workflow for app outage, payment outage, city-wide issue, or safety warning.
- [ ] Add message template approval for payment, refund, Aadhaar, owner suspension, support, and emergency messages.
- [ ] Add quiet-hours and anti-spam rules so users do not get too many messages.

### 2030 Data Governance And Compliance
- [ ] Add data classification per table/column: public, internal, confidential, financial, identity, secret, or AI-safe.
- [ ] Add column-level sensitivity labels in schema docs before implementation.
- [ ] Add access review checklist every month: who can see finance, identity, audit, AI logs, and superadmin controls.
- [ ] Add schema migration versioning and migration owner for every Data Connect/PostgreSQL change.
- [ ] Add data lineage for dashboard metrics: metric name, source table, job, snapshot, refresh time, and owner.
- [ ] Add data quality rules for each critical table: required fields, valid status transitions, uniqueness, foreign key integrity, and timestamp sanity.
- [ ] Add user data export process: consumer can request profile/booking/payment/rating data in safe format.
- [ ] Add data deletion/anonymization process that protects privacy while preserving required finance/audit records.

### 2030 Scale, Load, And Chaos Testing
- [ ] Load test booking creation so two consumers cannot book the same bed at the same time.
- [ ] Load test payment webhook spikes so duplicate/retry webhooks do not corrupt payment state.
- [ ] Load test city search during high traffic so listing reads stay fast and cheap.
- [ ] Load test owner dashboard and superadmin dashboard to confirm they read snapshots, not raw full tables.
- [ ] Add overbooking race-condition test around bed locks, booking availability, checkout, modification, and cancellation.
- [ ] Add chaos tests: gateway down, Gemini down, email provider down, database slow, function timeout, and Pub/Sub retry storm.
- [ ] Add browser/mobile performance testing on low-end Android devices and slow mobile network.
- [ ] Add launch-day traffic simulation before every new city launch.

### 2030 Final Completeness Layer
- [ ] Keep this layer as the final checklist before saying the roadmap is complete enough for real production planning.
- [ ] For every future feature, define owner, rollout flag, support path, analytics event, abuse risk, failure mode, and rollback plan.

### 2030 Feature Flags And Rollout Control
- [ ] Add feature flag table/config for turning features on or off by city, role, user segment, app version, and environment.
- [ ] Add percentage rollout support: release a feature to 1%, 10%, 50%, then 100% after monitoring health.
- [ ] Add emergency kill switches for booking, payment, demand pricing, train tracking, rewards, AI summaries, notifications, and owner payouts.
- [ ] Add feature flag audit logs: who changed what flag, old value, new value, reason, and when.
- [ ] Add safe default rule: if feature flag service/config fails, critical booking/payment paths should fall back to the safest stable behavior.
- [ ] Add release gate checklist: feature flag exists, rollback works, monitoring exists, support team knows the feature, and analytics event is defined.

### 2030 Support Operations
- [ ] Add support ticket table: user, role, booking/payment/property link, issue type, priority, SLA, assigned operator, status, and resolution.
- [ ] Add support SLA rules: payment issues fastest, active booking issues next, safety issues immediate, profile/general issues slower.
- [ ] Add operator assignment flow: unassigned queue, assigned to me, escalated, waiting for user, waiting for owner, resolved.
- [ ] Add support escalation ladder: operator -> senior operator -> superadmin -> engineering/finance.
- [ ] Add refund/support handoff: support ticket can create refund request, but finance approval is separate.
- [ ] Add canned response templates for common problems: payment pending, bed issue, owner not responding, refund requested, login issue.
- [ ] Add support quality metrics: first response time, resolution time, reopened tickets, refund rate, owner response time, and user satisfaction.
- [ ] Add support audit view so every sensitive support action is reviewable.

### 2030 Photos, Media, And Storage Safety
- [ ] Add property photo upload rules: allowed formats, max file size, max photo count, required minimum photos, and owner/operator permissions.
- [ ] Add image compression/resizing pipeline so listing photos are fast on low-end phones and cheap to serve.
- [ ] Add storage path design by environment, owner, property, room, bed, and verification state.
- [ ] Add photo moderation queue for unsafe, fake, duplicate, or misleading property images.
- [ ] Add duplicate image detection for reused property photos across multiple listings.
- [ ] Add image metadata stripping before public display to avoid leaking device/location metadata.
- [ ] Add broken image fallback and owner prompt to replace missing/poor photos.
- [ ] Add storage cost monitoring for image uploads, transformations, and CDN delivery.

### 2030 Maps, Location, And Navigation Fallbacks
- [ ] Add location fallback rule: if GPS fails, let user pick city/station manually.
- [ ] Add map fallback rule: if map tiles fail, show address, landmark, distance text, and Google Maps directions link.
- [ ] Add directions fallback rule: if directions link fails, copyable address and landmark should still be available.
- [ ] Add location accuracy indicator so users know whether location is exact, approximate, manual, or unavailable.
- [ ] Add city/station alias table for common spelling mistakes and local names.
- [ ] Add map/API cost guardrails before using paid location APIs heavily.
- [ ] Add safety rule: do not expose exact consumer location to owners; owners only need booking and arrival context.
- [ ] Add location abuse monitoring for fake GPS, repeated suspicious check-ins, and impossible travel patterns.

### 2030 Product Analytics Event Taxonomy
- [ ] Define clean analytics events before scaling: `app_opened`, `city_selected`, `listing_viewed`, `bed_selected`, `booking_started`, `booking_confirmed`, `checkin_completed`, `checkout_started`, `payment_started`, `payment_success`, `payment_failed`, `issue_reported`, `rating_submitted`, `support_ticket_created`.
- [ ] Add event naming rules: lowercase snake_case, clear actor, safe IDs only, no secret/private raw data.
- [ ] Add event property rules: city_id, property_id, booking_type, payment_mode, app_version, platform, role, and experiment/feature flag where safe.
- [ ] Add funnel dashboards: browse -> bed select -> booking start -> booking confirmed -> check-in -> checkout -> payment success -> rating.
- [ ] Add failure funnels: booking abandoned, payment failed, check-in missed, issue reported, refund requested.
- [ ] Add product analytics retention and privacy rules.
- [ ] Add analytics validation job so impossible or missing event sequences are detected.

### 2030 Accessibility And Inclusive Design
- [ ] Add accessibility checklist for every main flow: login, browse, booking, payment, support, owner dashboard, operator console.
- [ ] Support screen readers with meaningful labels, form errors, button names, and status announcements.
- [ ] Support keyboard navigation for web users and predictable focus order.
- [ ] Maintain strong color contrast in light and dark mode.
- [ ] Support large text and small screens without broken layouts.
- [ ] Add low-end Android usability testing: slow CPU, low memory, small screen, patchy network.
- [ ] Avoid using color alone to communicate status; pair color with text/icon.
- [ ] Add accessibility acceptance tests before public app launch.

### 2030 Localization And Regional Readiness
- [ ] Prepare English-first copy with a structure that can later support Telugu, Hindi, and other local languages.
- [ ] Add translation key strategy so text is not scattered hardcoded across UI.
- [ ] Format currency, date, time, duration, and distance consistently for Indian users.
- [ ] Add local city/station/landmark wording so search feels natural.
- [ ] Add simple-language mode for important rules: payment, refund, Aadhaar, cancellation, support, and owner agreement.
- [ ] Add support message templates per language before city expansion.
- [ ] Add fallback when translation is missing: show English, not blank text.

### 2030 Feature Abuse And Fraud Controls
- [ ] Add fake rating detection: repeated ratings from same device/user pattern, suspicious timing, or owner-linked accounts.
- [ ] Add rewards/coupon abuse controls before launching wallet, cashback, loyalty, or referral features.
- [ ] Add support abuse controls: repeated fake issue reports, refund farming, owner harassment, or spam tickets.
- [ ] Add referral abuse controls if referrals are added: same device, same payment method, same location, repeated self-referral signals.
- [ ] Add wallet abuse controls: non-withdrawable credits, expiry, max balance, per-user campaign limits, and audit trail.
- [ ] Add account risk score from cancellations, payment failures, fake issues, OTP abuse, and suspicious device/IP patterns.
- [ ] Add human review before permanent blocks; automatic blocks should be temporary unless risk is extreme.

### 2030 Vendor Exit And Fallback Plan
- [ ] Add Razorpay fallback plan: what happens if gateway is down, account is limited, fees change, or settlement APIs fail.
- [ ] Add Gemini fallback plan: deterministic monitoring continues, summaries degrade gracefully, and no critical alert depends only on AI.
- [ ] Add Firebase/Google Cloud exit awareness: document what data lives where and how to export it if needed.
- [ ] Add n8n fallback plan: core jobs stay in Firebase/Cloud Scheduler/Workflows; n8n should not be the only path for critical booking/payment logic.
- [ ] Add email/SMS/WhatsApp provider fallback plan for critical notifications.
- [ ] Add train API fallback plan: if train data provider fails, app still supports manual reminder and ordinary booking flow.
- [ ] Add vendor cost review every quarter.

### 2030 Admin, Owner, And Operator Training
- [ ] Create operator manual for owner approval, property verification, payment issue, refund request, bad-bed issue, user block, and emergency switch.
- [ ] Create owner manual for adding property, adding beds, handling bookings, checkout, dues, payouts, issue response, and photo quality.
- [ ] Create superadmin manual for settings, role changes, finance controls, AI alerts, incident response, and release approval.
- [ ] Add short training videos or screenshots for high-risk workflows.
- [ ] Add internal checklist for new operator onboarding and permission review.
- [ ] Add periodic training refresh after major feature changes.

### 2030 Release Notes And Changelog
- [ ] Maintain user-facing release notes for important visible changes.
- [ ] Maintain internal changelog for operators and support: what changed, what can break, what to verify, and rollback notes.
- [ ] Link every production release to commit, deployment, tests passed, feature flags changed, and monitoring result.
- [ ] Add release health review after 24 hours: errors, payments, bookings, support tickets, owner issues, and AI findings.
- [ ] Add known issues list so support can answer users honestly during rollout.

### 2030 Data Migration Rehearsal
- [ ] Run Firestore-to-Data Connect migration dry run in a non-production environment before any real cutover.
- [ ] Create migration mapping for every Firestore collection to SQL table/view, including skipped temporary data.
- [ ] Create row count, sample record, financial total, and booking state reconciliation checks.
- [ ] Define mismatch threshold: which mismatches block cutover and which can be fixed later.
- [ ] Add rollback rehearsal: switch app back to old source during test if migration fails.
- [ ] Add dual-read/dual-write verification window before final source-of-truth switch.
- [ ] Add final cutover checklist with owner, time, freeze window, verification steps, and rollback deadline.

### 2030 SLOs And Service Targets
- [ ] Define booking creation target: normal booking confirmation should complete under 2 seconds when services are healthy.
- [ ] Define availability check target: listing/bed availability should feel fast and avoid heavy scans.
- [ ] Define payment update target: payment success should reflect in app under 5 seconds after verified gateway signal.
- [ ] Define checkout target: checkout calculation and payment start should be reliable under normal mobile network.
- [ ] Define uptime target for web/app, booking path, payment path, and operator console.
- [ ] Define job freshness targets: no-show job lag, payment reconciliation lag, snapshot freshness, AI digest freshness.
- [ ] Define alert target: critical app/payment issue should notify owner/operator/admin within 1-2 minutes.
- [ ] Track SLO violations in `ops` tables and review weekly.

### 2030 Degraded Mode And Partial Outage UX
- [ ] Define what users see when payment gateway is down: booking can pause safely or show clear retry/support path.
- [ ] Define what users see when AI is down: app continues normally; only summaries/recommendations pause.
- [ ] Define what users see when maps/location fail: manual city/station selection and address directions still work.
- [ ] Define what users see when notifications fail: in-app status remains source of truth.
- [ ] Define what owners/operators see when analytics snapshots are late: show last updated time and avoid wrong fresh-looking data.
- [ ] Define what happens when database is slow: protect booking/payment first, delay dashboards and AI jobs.
- [ ] Add maintenance mode banner for planned downtime or degraded operations.
- [ ] Add clear support path for users caught in partial failure: payment pending, booking stuck, checkout failed, or issue not submitted.

### 2030 Minor Engineering Standards
- [ ] Define database naming standards: schema names, table names, column names, indexes, views, enum names, and job names must use one clear convention.
- [ ] Define ID strategy: when to use Firebase UID, UUID, readable booking code, gateway ID, idempotency key, and human-safe short code.
- [ ] Define timezone rule: store timestamps in UTC, display in IST/local city time, and document day-close boundaries for snapshots/jobs.
- [ ] Define money rule: store money as integer paise, never floating rupees, and keep currency code on finance records.
- [ ] Define valid status transitions for booking, payment, payout, issue, owner application, support ticket, refund, and job run.
- [ ] Define standard error code catalog for app/backend errors so users, operators, logs, and AI summaries use the same language.
- [ ] Define API/Data Connect versioning so old mobile app versions survive backend changes during rollout.
- [ ] Define seed/test data plan: fake consumers, owners, properties, beds, bookings, payments, issues, and payouts for repeatable QA.
- [ ] Define safe admin search: booking code, payment ID, owner/property ID, and phone last digits only; avoid broad private-data search.
- [ ] Define attachment policy for support tickets, issue photos, receipts, property verification documents, and evidence files.
- [ ] Define supported browser/device matrix for web, PWA, and Android app launch.
- [ ] Define observability naming: logs, metrics, job names, Pub/Sub topics, event names, and AI finding names must match one convention.
- [ ] Define manual correction policy: what operators can fix, what needs superadmin, and what needs two-person approval.
- [ ] Define ownership map: every schema, table, job, dashboard, policy, and alert must have a clear business/engineering owner.

### 2030 Merged Planning Notes
- [ ] Keep `docs/TODO.md` as the planning backlog after merging old planning notes; avoid creating duplicate planning files unless they are implementation specs or runbooks.
- [ ] Keep durable runbooks separate: README, Masterbook, deployment checklist, auth checklist, QA log, and work log remain useful outside TODO.
- [ ] Preserve current policy over old MVP notes: Aadhaar is optional in booking unless future policy changes, consumer sees final safe pricing, and backend remains source of truth.
- [ ] Keep pilot-city readiness in launch planning: Kavali, Nellore, Ongole, Chennai, Bangalore, Vijayawada, Guntur, Vizag, Hyderabad, and Tirupati need city-by-city readiness checks before expansion.
- [ ] Finalize cancellation/no-show policy in one place: booking cancellation window, no-show grace, short-stay no-charge rule, refund rule, and operator override rule.
- [ ] Add QR/app-based payment-at-property flow planning only after online checkout and reconciliation are stable.
- [ ] Define exact Phase 1 SQL/Data Connect columns, relationships, indexes, views, and role-safe queries before implementation begins.
- [ ] Define exact Data Connect migration mapping from every current Firestore collection to SQL table/view, including skipped temporary collections.
- [ ] Define exact snapshot fields for KPI, city, property, owner, job, and automation snapshots before dashboard migration.
- [ ] Verify demand-pricing production deployment: scheduled functions deployed, summaries updating, owner overrides working, consumer labels correct, and booking checkout uses locked demand price.
- [ ] Keep demand-pricing defaults documented before implementation: warning at 60%, property thresholds around 70/90%, city thresholds around 80/90%, higher city/property increase wins, global cap applies.
- [ ] Keep demand-pricing anti-abuse rule: blocked beds do not count as available capacity, so owners cannot fake high occupancy by blocking beds.
- [ ] Add Aadhaar/security deploy follow-up: production secret/pepper/key configuration must be set before identity features are trusted.
- [ ] Add backfill readiness check: admin credentials must be available before running booking availability or SQL migration backfills.
- [ ] Add checkout manual QA checklist: platform fee lock, no fee on cancelled/no-charge bookings, old bookings keep old fee, checkout shows correct amount, and payment record matches booking.
- [ ] Add route/role manual QA checklist: consumer, owner, operator, and superadmin access must be checked with real authenticated accounts.
- [ ] Add superadmin/operator KPI acceptance list: bookings today/week/month, gross collection, net revenue, active properties/owners, occupancy by city, payment success/failure, and top cities.
- [ ] Add concurrency acceptance test: temporary bed lock, payment timeout release, transaction conflict check, and no double booking for the same bed/time.
- [ ] Add payment webhook signature verification and replay/idempotency checks before live payment launch.
- [ ] Add old planning document cleanup rule: once content is merged into TODO or a runbook, remove the duplicate planning file to avoid conflicting instructions.

## City Management
- [x] Allow both operator and superadmin to add, edit, and disable cities — currently only superadmin can; operator should have the same city management access
- [x] Prevent duplicate cities — reject add/save if a city with the same name + state combination already exists
- [x] Remove the Status field from the Add City form — new cities should default to Active without user input
- [x] Replace the Delete button on each city row with a Disable / Mark Inactive action — cities should never be hard-deleted
- [x] Script or one-time admin tool to remove existing duplicate city records (e.g., two "kavali, andhrapradesh" entries) — `scripts/cleanup-duplicate-cities.mjs`

## Internal Roles
- [x] Add role-change history view inside operator and superadmin consoles
- [x] Verify the read-only superadmin history panel smoke test in the browser, with no UI create/edit/delete actions and no Firestore permission error in the panel
- [x] Add superadmin-only UX for promoting users into operator role more safely with confirmation language
- [ ] Smoke test the safer operator-promotion flow in the internal control panel at end of day
- [x] Add superadmin-only platform setting to control no-check-in timeout minutes
- [x] Add city-level safe scarcity controls for superadmin and operator
- [x] Add global emergency off switch for scarcity mode from superadmin platform settings

## Superadmin Growth Dashboard
- [x] 7-day booking trend bar chart — daily booking counts + gross revenue per day displayed in the Growth tab
- [x] All-time city breakdown table — city ranking by total bookings and gross revenue
- [x] Add a daily growth overview section in the superadmin Overview tab — show total bookings, check-ins, cancellations, and revenue for today vs. yesterday
- [x] Break down daily metrics by city — each city row shows today's booking count, revenue, and active beds so superadmin can spot high/low performing cities at a glance
- [x] Add a top-performing cities ranking on the overview — sorted by bookings today or revenue today
- [x] Persist daily snapshot data to Firestore (e.g., `daily_snapshots/{date}`) so historical growth data survives page reloads and can be charted over time

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
- [x] Add database-seeded superadmin management runbook so UI never edits existing superadmins
- [ ] Add operator audit review surface for monitoring sensitive changes
- [ ] Remove the localhost-only auth bypass and dev booking preview before pushing to production
