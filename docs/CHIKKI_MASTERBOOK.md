# Chikki Masterbook

Last updated: 2026-04-29
Audience: Founders + Builders
Role: Canonical internal operating manual for Chikki Beds

## How To Use This Book
This document is the single source of truth for how Chikki works today and how it should evolve next.

Use it when you need to answer:
- What problem Chikki solves in India
- How the current booking system works
- How the codebase is organized
- Which features are already implemented
- Which parts are blocked by environment or deployment setup
- Where premium product opportunities exist
- Which product and technical decisions are already fixed

This book should be updated whenever product rules, architecture, user flows, or strategic priorities change.

## Current Deployment Rule
- Local laptop is development.
- GitHub `main` is the test/source-of-truth branch.
- Firebase is production.
- Firebase production deploys are manual-only from GitHub Actions on `main`.
- Direct local-to-Firebase production deploys should be avoided except for explicit emergency recovery.

## 1. Vision And Market Context

### Current State
Chikki is a city-first bed booking platform for India focused on dormitory-style and bed-based stays near transport hubs such as railway stations and bus stations. The user does not book a full hotel room. The user books one bed inside an owner-managed property.

The platform is designed around four actors:
- Consumer: finds and books a bed
- Owner: lists and manages property, rooms, beds, pricing, and availability
- Operator: handles day-to-day platform monitoring, owner application review, and consumer/owner role swaps
- Superadmin: handles platform control, city rollout, hidden internal access, and higher-order role management

Consumer discovery is location-first:
- the home page asks for location first
- the home page can detect browser location, choose the nearest service city, and open nearby listings
- listings can sort properties by distance from the detected user location
- nearby beds are shown after location selection
- Google Maps directions links are used for navigation to properties in the MVP
- each bed card should show both hourly price and overnight price before click
- the consumer compares prices before opening the detailed booking flow

### Why It Exists
There is a practical travel need in Indian metro and transit-heavy cities for short-stay, low-cost, bed-level accommodation. Traditional hotel flows are room-centric. Chikki is bed-centric. That matters for:
- affordability
- flexibility for short stays
- higher occupancy utilization for dormitory owners
- faster supply onboarding in dense travel corridors

### Psychology / User Behavior
The product must reduce anxiety fast. Users arriving near a station or bus stand are usually time-sensitive, cost-sensitive, and trust-sensitive.

Core psychological jobs:
- Remove uncertainty about location, availability, and price
- Make booking feel safe and legitimate
- Show enough structure that dormitory booking feels organized, not risky
- Help owners feel the platform increases utilization, not admin burden

### Gaps / Risks
- The product promise is strong, but premium trust signals are still light in the current implementation
- Live location value exists conceptually, but the emotional framing around “safe, verified, nearby, easy” is not yet fully systematized
- Owner-side motivation is functional today, not yet premium or loyalty-driven

### Future Direction
Chikki should become the most trusted and operationally simple bed-booking layer for transit-area stays in India, starting with practical utility and later differentiating through trust, speed, and premium experience.

## 2. Business Model And Core Product Rules

### Current State
Confirmed model from the repo and working docs:
- Booking model: instant booking against available beds
- Inventory unit: bed-level, not room-level
- Stay model: hourly or overnight choice on the home page
- Location model: stored city/property coordinates power nearest-city and nearest-property discovery; consumer live location is passed through the session URL only and is not stored by the MVP flow
- Distance display: values under 1 km are shown in meters, while longer distances are shown in km
- Booking route: listing cards open `/booking` so bed selection and start time are completed before review/identity confirmation
- First booking flow: start time is mandatory, end time is optional, and full stay duration is not required upfront
- Advance booking window: start time can be no more than 24 hours ahead
- Checkout flow: actual time spent is shown at checkout, and payment is collected at checkout
- Checkout billing rule: stays under 15 minutes cancel without payment; stays from 15 minutes up to less than 60 minutes are charged as a full hour
- Rating model: completed bookings can be rated once from history; bed records keep only aggregate rating average/count for search and booking display
- Advance amount: INR 100 at booking
- Fee model: 10% commission + 2% payment/gateway charge
- Price shown to user: hourly and overnight prices on the listing card, plus final amount due at checkout
- Cancellation window: configurable by superadmin (default 15 minutes)
- Aadhaar requirement: not required for first booking, required from second booking onward, with a popup prompt on the home screen after the first booking completes
- Aadhaar storage: full Aadhaar is stored only in the backend-only `aadhaar_identity_vault`; business records use `aadhaarRefId` and masked last-4 metadata only

Pricing model:
- show hourly and overnight rates to the consumer on the home page
- keep internal commission and gateway logic separate from consumer-facing pricing copy unless a future design explicitly changes that rule

### Why It Exists
These rules keep the MVP simple:
- fixed advance amount reduces friction
- visible hourly and overnight prices help users compare beds quickly
- bed-level inventory improves real availability
- start-time-first booking reduces friction for first-time users
- checkout-based payment keeps the payment moment aligned with actual stay duration

### Psychology / User Behavior
- visible hourly and overnight price options lower hesitation during decision making
- Small advance creates commitment without forcing full payment upfront
- Delaying Aadhaar until repeat usage lowers first-booking friction while still preserving traceability for returning users

### Gaps / Risks
- Fee transparency may later need a trust explanation even if the UI still shows only final price
- Aadhaar reveal is break-glass only through superadmin `Identity Access`: a detailed reason is required, every reveal is audited, and production MFA/second-approval remains the next hardening step
- Remaining amount and settlement flow are represented in logic, but payment gateway execution is still incomplete

### Future Direction
- Add clearer trust copy around identity, payment safety, and verified listings
- Evolve from “cheap and available” into “reliable, verified, and intelligently priced”

## 3. Role-Based User Journeys

### Consumer Journey

#### Current State
Implemented flow in the app:
- Select location first on the home page
- Use "Find Beds Near Me" to detect browser location and route to the nearest service city when inside its service radius
- Browse nearby listings with hourly and overnight prices visible before click
- See nearest properties first when location context is available
- Filter by city, duration, bed type, and max price
- View listing address, distance from railway and bus points, and distance from the detected user location when available
- Open Google Maps directions for a property from listing or booking pages
- Start booking from listing cards into `/booking`
- Choose exact bed and start time first
- Review booking details with conditional Aadhaar reference confirmation based on booking count
- Allow end time to stay optional for first-time flow
- Create booking with INR 100 advance placeholder
- See live/open bookings
- Check in when booking time arrives
- At checkout, show start time, end time, total time spent, and final amount due
- Collect payment at checkout
- Rate a completed stay from booking history; the rating stays attached to that booking
- See bed rating average/count during listing search and exact bed selection

Relevant route:
- `src/app/consumer/page.jsx`
- `src/app/booking/page.jsx`
- `src/app/history/page.jsx`

#### Why It Exists
This flow supports short, practical transit stays with low discovery overhead and bed-specific allocation.

#### Psychology / User Behavior
- City-first search matches how many Indian travelers think during transit decisions
- “Near railway / near bus stand” reduces location anxiety
- “Book this” and quick check-in framing create momentum
- Open bookings table creates a visible sense of control after purchase

#### Gaps / Risks
- Local and deployed success still depend on Firebase setup and authentication configuration
- Payment is represented functionally but still partly placeholder-based
- Trust signals such as verified property badges, hygiene confidence, women-safety framing, and review proof are not yet mature

#### Future Direction
- Add richer listing detail pages
- Add trust layers such as verification level, amenities, host quality score, and arrival confidence cues
- Add repeat-booking and saved preference mechanics
- Add train tracking as a future booking companion feature using train number or PNR input and notification alerts

### Owner Journey

#### Current State
Implemented owner capabilities include:
- owner login and role-based dashboard
- inventory creation and status management
- property creation and editing
- room and bed management
- AC / Non-AC classification
- distance data from railway and bus stand
- bed blocks and full-block logic
- active/inactive status controls
- live jobs, upcoming bookings, checkout alerts, and booking visibility
- owner application flow for new owner requests

Relevant routes:
- `src/app/owner/page.jsx`
- `src/app/owner/beds/page.jsx`
- `src/app/owner/properties/page.jsx`
- `src/app/owner/rooms/page.jsx`
- `src/app/owner/property-status/page.jsx`
- `src/app/apply-owner/page.jsx`

#### Why It Exists
Owners need a simple operational system that converts beds into sellable, manageable inventory without requiring hotel-grade complexity.

#### Psychology / User Behavior
- Owners respond to clarity, occupancy visibility, and low operational friction
- Live jobs and active booking counts reinforce platform usefulness
- Enable/disable controls create a feeling of direct control over inventory
- Owner application flow supports a gradual trust pipeline instead of open listing chaos

#### Gaps / Risks
- Owner experience is useful but not yet premium or brand-building
- Settlement, payout trust, quality reputation, and occupancy intelligence are not yet strongly surfaced
- The platform still needs stronger incentives that make owners feel Chikki helps them earn more with less confusion

#### Future Direction
- Add owner performance insights
- Add occupancy recommendations and dynamic pricing guidance
- Add owner quality tiers, payouts visibility, and reputation systems

### Operator Journey

#### Current State
- `operator` is the day-to-day internal operations role.
- Implemented operator capabilities include:
- operational monitoring
- user search by phone
- promote user to owner
- demote owner to consumer
- approve owner applications
- sign out and role-based protected access

Relevant route:
- `src/app/operator/page.jsx`

#### Why It Exists
The product needs a middle operational layer that can keep supply quality and support quality moving without granting full superadmin control.

#### Psychology / User Behavior
- Operator workflows should feel focused, clear, and low-risk
- Role changes need guardrails and traceability
- Daily operations should be fast without exposing platform-critical power

#### Gaps / Risks
- operator cannot yet see a polished audit history UI
- operator still needs stronger workflow confirmations and clearer escalation patterns

#### Future Direction
- add audit review, better confirmation UX, and richer monitoring panels for operator

### Superadmin Journey

#### Current State
Implemented superadmin capabilities include:
- city management
- platform timeout settings management
- city-level safe scarcity control
- user search by phone
- create operator
- create new superadmin
- assign user, owner, operator, and new superadmin roles
- review and reject owner applications
- sign out and role-based protected access

Relevant route:
- `src/app/internal-control/page.jsx`

#### Why It Exists
The MVP needs central control over rollout, owner access, and operational hygiene before the platform can scale safely.

#### Psychology / User Behavior
- Admin systems need confidence and visibility, not delight
- Fast approval and search tools reduce operational bottlenecks
- Clear status and action framing lowers the chance of bad access decisions

#### Gaps / Risks
- KPI depth is still lighter than the long-term vision
- Superadmin currently has more operational tooling than analytical intelligence
- Audit and anomaly signals exist in the backend, but the admin UX around them is still limited
- Existing superadmin accounts are intentionally locked from UI changes
- role-history review still needs a richer UX surface

#### Future Direction
- Add city, revenue, occupancy, fraud, and quality dashboards
- Add operational health views and anomaly review workflows
- Extend hidden internal workflows with clearer audit review and safer confirmation language

## 4. Technical Architecture

### Current State
The current stack is:
- Frontend: Next.js App Router with React
- Styling: Tailwind CSS
- Auth: Firebase Auth
- Database: Firestore
- Backend logic: Firebase Functions callable functions and Firestore triggers
- Deployment shape: web-first, with GitHub Pages base path currently configured in `next.config.mjs`

Core architectural pattern:
- UI routes in `src/app`
- shared state and auth in `src/context`
- client-side Firestore access in `src/lib/firestore`
- callable backend wrappers in `src/lib/cloud`
- server-side business rules and security-sensitive workflows in `functions/index.js`

### Why It Exists
This architecture optimizes for speed of iteration and a single codebase:
- fast web-first MVP delivery
- one frontend for consumer, owner, operator, and hidden superadmin
- minimal backend infrastructure overhead
- easy role-based control using Firebase + Firestore

### Psychology / User Behavior
Architecture still influences psychology:
- low latency matters for trust
- booking conflict prevention matters for fairness
- auth and identity checks matter for legitimacy
- audit trails matter for operational confidence

### Gaps / Risks
- local development can fail if Firebase env values are missing or invalid
- some user-facing flows depend on deployment and Firebase console configuration, not just code
- GitHub Pages base path means local and hosted routing behavior must be understood carefully

### Future Direction
- retain the web-first foundation
- continue separating sensitive workflows into Functions
- gradually strengthen operational analytics and trust layers without overcomplicating the core booking path

## 5. Data Model And Backend Logic

### Current State
Defined collection names in `src/lib/firestore/collections.js`:
- `cities`
- `users`
- `aadhaar_identity_vault`
- `properties`
- `rooms`
- `beds`
- `bed_blocks`
- `bed_locks`
- `booking_availability`
- `bookings`
- `payments`
- `owner_payouts`
- `audit_logs`
- `owner_applications`

Main callable backend functions in `functions/index.js`:
- `updateOwnProfile`
- `submitAadhaarIdentity`
- `setUserRole`
- `recordPrivilegedAction`
- `getPlatformSettings`
- `updatePlatformSettings`
- `setCityScarcityMode`
- `createBookingWithAdvance`
- `submitBookingRating`
- `authorizeOtpRequest`
- `completeCheckout`

Main scheduled backend jobs in `functions/index.js`:
- `cancelNoShowBookings` (every minute)
- `refreshCityScarcityValues` (every 15 minutes)

Main security and anomaly logic:
- OTP rate-limit authorization
- booking rate-limit enforcement
- booking-history-only rating submission with duplicate prevention
- city/property coordinate lookup for nearest-city and nearest-property discovery
- backend-only Aadhaar identity vault writes and reference-ID mapping
- temporary bed locking during booking
- no-show auto-cancel after check-in grace timeout
- bounded safe scarcity refresh for enabled cities
- payment status anomaly detection
- cross-entity anomaly detection through audit logs
- Aadhaar identity vault with encrypted Aadhaar, HMAC duplicate detection, reference ID mapping, and masked last-4 display metadata
- superadmin break-glass Aadhaar reveal callable with reason capture, audit log, and temporary UI display

### Why It Exists
The backend preserves business integrity where client-only logic would be too weak:
- prevent double booking
- control role changes
- normalize profile creation
- capture audit events
- protect against rate abuse

### Psychology / User Behavior
Users do not see most backend logic directly, but they feel its effect when:
- booking feels reliable
- duplicate allocation does not happen
- identity data is handled more safely
- admin actions are controlled and traceable

### Gaps / Risks
- payment flow is still partly staged rather than end-to-end production-grade
- anomaly signals are recorded, but product surfaces for responding to them are incomplete
- audit value is stronger than current UI visibility

### Future Direction
- make backend integrity a product advantage
- expose operational safety to admins and trust signals to users without overwhelming them

## 6. Codebase Map

### Current State
High-value paths:

Product surfaces:
- `src/app/page.jsx`: landing page
- `src/app/login/page.jsx`: phone OTP and Google login
- `src/app/register/page.jsx`: registration path
- `src/app/consumer/page.jsx`: search, listing cards, open bookings, check-in, checkout [✅ PROTECTED for consumer role]
- `src/app/booking/page.jsx`: dedicated booking step with bed/time selection, review, and final booking confirmation [✅ PROTECTED for consumer & owner roles]
- `src/app/owner/page.jsx`: owner dashboard [✅ PROTECTED for owner role]
- `src/app/operator/page.jsx`: operator monitoring and role-swap console [✅ PROTECTED for operator role]
- `src/app/internal-control/page.jsx`: hidden superadmin control console [✅ PROTECTED for superadmin role]
- `src/app/superadmin/page.jsx`: legacy blocked route that redirects away from the public path
- `src/app/history/page.jsx`: booking/history support surface [✅ PROTECTED for consumer & owner roles]
- `src/app/profile/page.jsx`: user profile editing [✅ PROTECTED for all authenticated roles]
- `src/app/apply-owner/page.jsx`: owner application flow [✅ PROTECTED for consumer role]
- `src/app/support/page.jsx`: support-facing route [⚠️  PUBLIC - by design]
- `src/app/cities/page.jsx`: city listing [⚠️  PUBLIC - by design]

Shared behavior:
- `src/context/auth-context.jsx`: auth, profile loading, OTP, Google login, email login, cached profile behavior
- `src/components/auth/protected-route.jsx`: role-based route guard
- `src/components/layout/site-chrome.jsx`: shell and navigation

Business logic:
- `src/lib/firestore/consumer.js`
- `src/lib/firestore/owner.js`
- `src/lib/firestore/profile.js`
- `src/lib/firestore/superadmin.js`
- `src/lib/geo.js`
- `src/lib/cloud/security.js`
- `src/lib/firebase.js`

Backend:
- `functions/index.js`

Reference documentation already in repo:
- `README.md`
- `../MVP_Blueprint_v1.md`
- `../Tech_Architecture_Discussion_v1.md`
- `../Project_Discussion_Notes.md`
- `QA_Test_Log.md`
- `Security_Audit_Action_List.md`
- `Security_Hardening_Upto_Now.md`

### Security Audit (2026-04-24)

#### Issues Found & Fixed
1. **Missing Route Protections (CRITICAL)** ❌ → ✅
   - `/consumer` was unprotected - NOW restricted to consumer role
   - `/profile` was unprotected - NOW restricted to all authenticated roles
   - `/history` was unprotected - NOW restricted to consumer & owner roles  
   - `/apply-owner` was unprotected - NOW restricted to consumer role
   - `/support` and `/cities` remain PUBLIC (intentional)

2. **Protection Implementation**
   - Added `ProtectedRoute` component wrapping to all role-specific pages
   - Routes now enforce role-based access with 4-second profile load timeout
   - Unauthorized access redirects to `/unauthorized` page
   - Missing auth redirects to `/login?next=<originalPath>`

3. **Current State: All Routes Protected**
   - Public routes: `/`, `/login`, `/register`, `/support`, `/cities`, `/unauthorized`
   - Protected consumer: `/consumer`, `/booking`, `/apply-owner`
   - Protected owner: `/owner`, `/owner/properties`, `/owner/beds`, `/owner/rooms`, `/owner/property-status`
   - Protected operator: `/operator`
   - Protected superadmin: `/internal-control`
   - Protected all-auth: `/profile`, `/history`

#### How Route Protection Works
- `ProtectedRoute` component checks `useAuth()` profile and role
- If user not logged in: redirects to `/login?next=<path>`
- If user logged in but role not in allowedRoles: redirects to `/unauthorized?from=<path>`
- If profile takes >4s to load: shows timeout and redirects to `/unauthorized`
- All role-specific dashboards protected against privilege escalation

#### End-to-End Auth Verification
End-to-end auth means validating the whole path from login to protected-page access, not just confirming that a user can sign in.

Best method for Chikki:
- test each role manually
- confirm the landing page for each role
- open protected URLs directly
- verify unauthorized redirects and recovery guidance
- confirm the 4-second profile timeout and back-button behavior

Why this matters:
- it catches wrong-role access before users do
- it exposes redirect loops and stale-session issues
- it confirms the visible app behavior matches the route rules in code

Reference checklist:
- `docs/AUTH_TEST_CHECKLIST.md`

### Why It Exists
The codebase is grouped by role and business area rather than by deep technical abstraction. That makes MVP development faster and onboarding easier for a small team.

### Psychology / User Behavior
A role-centered codebase often mirrors a role-centered product. That helps the team stay close to user journeys rather than drifting into purely technical decomposition.

### Gaps / Risks
- some responsibilities are broad inside single files, especially auth and backend functions
- onboarding is easier than in a highly abstract system, but long-term maintainability may require more modularization

### Future Direction
- keep role-oriented discoverability
- gradually split large files where doing so reduces risk without losing clarity

## 7. Feature Inventory

### Working Now
- role-aware login and protected routing
- phone OTP flow scaffolding
- Google login path
- profile initialization and caching
- city selection and search
- bed listing retrieval by city
- browser-location nearest-city entry and nearest-property listing sort
- Google Maps directions links for property navigation
- dedicated `/booking` route for duration-based booking flow
- conditional Aadhaar reference validation tied to booking count
- map links for listing locations
- booking creation with bed allocation
- check-in and checkout flow
- completed-booking rating submission and bed rating aggregate display
- owner dashboard with properties, rooms, beds, blocks, live jobs, checkout alerts
- owner application workflow
- operator operational monitoring
- operator consumer/owner role swaps
- hidden superadmin city management
- superadmin platform timeout control
- superadmin break-glass Aadhaar reveal with mandatory reason and audit trail
- superadmin and operator city-level safe scarcity controls
- hidden superadmin operator and superadmin creation
- audit and anomaly tracking foundation

### Partially Implemented Or Environment-Dependent
- local app success depends on valid `.env.local` Firebase config
- OTP depends on Firebase Auth configuration, authorized domains, and reCAPTCHA behavior
- production auth and function behavior depend on Firebase deployment setup
- payment logic exists, but real gateway integration is deferred
- analytics are present in Firebase config inputs but not a defining product capability yet

### Missing Or Planned Later
- mature payment gateway integration
- premium property detail storytelling and trust presentation
- full superadmin KPI analytics experience
- strong reviews, ratings, and reputation systems
- owner payouts workflow with deep visibility
- advanced premium segmentation and loyalty programs
- dedicated women-safety, verified-quality, and repeat-travel trust layers

## 8. Psychology Layer By Product Area

### Search And Discovery

#### Current State
Users search by city and filter by practical constraints.

#### Why It Exists
Transit travelers usually care first about location, immediate availability, and price fit.

#### Psychology / User Behavior
- location clarity reduces uncertainty
- city-first entry reduces decision overload
- practical filters create a feeling of control

#### Gaps / Risks
- search still feels functional more than confidence-building

#### Future Direction
- add reassurance cues like “near station”, “verified”, “popular now”, “easy check-in”

### Booking Conversion

#### Current State
Booking should feel location-first and price-visible before the user clicks through:
- nearby beds are shown after location selection
- hourly and overnight prices are visible on the home page
- `Book This` opens a dedicated booking route
- the first booking step collects exact bed and start time
- the review step includes the repeat-booking Aadhaar requirement when applicable
- start time is limited to the next 24 hours
- end time is optional until checkout
- checkout shows actual time spent and the final amount due
- payment is collected at checkout
- Aadhaar reference becomes mandatory from the second booking onward; if no saved reference exists, the backend creates one in the protected vault
- completed bookings can be rated once from `/history`
- bed rating average/count appears during search and bed selection
- detected-location searches sort listings by nearest property and preserve that location context into `/booking`
- property directions open in Google Maps; the MVP does not call paid Google distance or place APIs

#### Why It Exists
This ensures traceability while keeping commitment lightweight.

#### Psychology / User Behavior
- low advance reduces drop-off
- clear next steps reduce friction
- visible booking code and allocated bed improve confidence

#### Gaps / Risks
- identity requirement may feel risky if privacy messaging is weak
- fee and payment trust explanation can improve

#### Future Direction
- add stronger reassurance copy and proof of safety, legitimacy, and support availability
- add train tracking as a booking-adjacent utility for railway-area stays
- add third-party Aadhaar verification once the repeat-booking identity flow is ready

### Owner Motivation

#### Current State
Owners get inventory control and booking visibility.

#### Why It Exists
Owners need control before they will trust a platform with live supply.

#### Psychology / User Behavior
- control creates willingness to participate
- visible activity creates perceived value
- operational simplicity reduces resistance

#### Gaps / Risks
- owners are not yet being emotionally sold on growth, reputation, or premium value

#### Future Direction
- make Chikki feel like a revenue and occupancy engine, not just a listing tool

### Admin Control

#### Current State
Operator and superadmin can manage internal operations with different privilege levels.

#### Why It Exists
Platform trust depends on controlled rollout and access hygiene.

#### Psychology / User Behavior
- fast control loops build operational confidence
- traceability lowers fear of bad decisions

#### Gaps / Risks
- operator and superadmin audit review is still more backend-driven than UX-driven

#### Future Direction
- evolve from manual control panels to an operational intelligence layer with clear privilege separation

## 9. Premium Evolution Plan

### What Premium Means For Chikki
Premium should not mean expensive design alone. It should mean:
- trusted
- verified
- easy during stressful travel moments
- cleaner and more professional for both guest and owner
- better visibility, better predictability, better control

### Consumer Premium Features
- verified property badges
- women-friendly and family-safe trust layers where applicable
- better listing photos and hygiene standards
- clearer arrival guidance from station and bus stand
- saved traveler preferences
- repeat-booking shortcuts
- priority support or help during arrival problems
- digital receipt and stronger trip record management

### Owner Premium Features
- better quality onboarding
- trust score and property quality tiers
- occupancy recommendations
- dynamic pricing assistance
- performance dashboard
- payout transparency
- premium merchandising for better properties

### Operational Premium Signals
- verified listing quality
- better incident tracking
- fraud and anomaly handling surfaced to admins
- cleaner audit-to-action workflows
- stronger reliability messaging on payment and booking integrity

### Staged Roadmap
Stage 1:
- stabilize booking, auth, owner inventory, operator workflows, and hidden superadmin operations
- improve documentation and product clarity

Stage 2:
- strengthen trust, identity, and verified listing signals
- improve consumer booking confidence and owner visibility

Stage 3:
- add payment maturity, analytics, owner growth tooling, and premium merchandising

Stage 4:
- create a recognized premium brand position for trustworthy short-stay bed booking near transit hubs

## 10. Product Decisions Log

### Fixed Decisions
- launch mode is web-first
- main roles are consumer, owner, operator, and superadmin
- consumer and owner share login/register entry points
- new authenticated users default to `consumer`
- owners default to `/owner` when there is no explicit booking intent
- owners may intentionally switch into consumer mode and book other owners' beds
- operator can only swap roles between consumer and owner
- only superadmin can create operator or new superadmin roles from the UI
- existing superadmin accounts are not editable from the UI
- superadmin access is hidden behind an internal path
- booking unit is the bed
- home page shows hourly and overnight prices before booking
- `Book This` opens `/booking` for bed selection, start time selection, and review before confirmation
- booking starts with a start time; end time is optional in the first-time flow
- advance booking start time is limited to the next 24 hours
- payment is collected at checkout based on actual time spent
- if the stay is under 15 minutes, the booking cancels without payment
- if the stay is 15 minutes or more but less than 60 minutes, charge one full hour
- INR 100 advance is used at booking
- cancellation window is 15 minutes
- Aadhaar is optional for the first booking and mandatory from the second booking onward
- after the first booking, the home screen prompts the consumer to add Aadhaar before booking again
- full Aadhaar is not stored in user, booking, payment, or availability records
- Aadhaar reference IDs are UUID-style random values and are the only Aadhaar link used by business records
- full Aadhaar can be revealed only through the superadmin break-glass flow and must never be copied into tickets, chats, notes, or other normal records
- ratings are submitted only from completed booking history and are stored on the booking, while beds expose aggregate average/count
- location discovery uses stored city/property coordinates, browser geolocation, and nearest-property sorting
- Google Maps support is limited to directions links for the MVP; paid Maps APIs are deferred until route-level distance precision is needed
- Firebase Firestore is the current database foundation

### Open Questions
- exact premium brand positioning language
- final production-grade payment gateway path
- how trust and safety should be explicitly presented in the UI
- how strong the review and reputation system should become in phase 2
- which superadmin KPIs matter most on day 1 of scaled rollout
- which third-party Aadhaar verification provider should be used when that work starts
- how train tracking should balance train number, PNR input, and notification timing

### Assumptions To Revisit
- whether all target geographies behave similarly around trust and location expectations
- whether the current city-first flow should stay primary once search volume grows
- whether owner incentives should be mostly operational, financial, or reputation-led

## 11. Maintenance Rules

### Current State
Documentation is currently spread across multiple files.

### Why It Exists
The project evolved quickly and decisions were captured as they happened.

### Psychology / User Behavior
For the internal team, scattered truth creates hesitation, duplicated discussion, and lower execution confidence.

### Gaps / Risks
- product rules can drift from code
- architecture notes can age out
- strategy conversations can repeat without a canonical reference

### Future Direction
Use this document as the canonical entry point and update it when any of these change:
- role flows
- business rules
- pricing rules
- key architecture decisions
- Firebase/backend responsibilities
- premium roadmap priorities

Update discipline:
- If a new route materially changes a user journey, update this book
- If a function changes booking, auth, or trust behavior, update this book
- If a major product decision changes, record it here before or alongside implementation
- Keep older docs as reference history, but treat this file as the operational truth
- If operator or superadmin permissions, role-change permissions, or hidden internal paths change, update this book immediately

## 12. Practical Next Moves
- Make this book the first link for onboarding
- Keep validating implemented behavior against Firebase environment setup
- Run the end-to-end auth checklist after any auth or routing change
- Document actual deployment flow and environment checklist next
- Define premium trust signals as a product workstream, not just a design polish task
- Add a dedicated roadmap section later if planning becomes release-based and date-driven
