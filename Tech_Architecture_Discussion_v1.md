# Bed Booking Platform - Tech Architecture Discussion v1

Date: 2026-03-17

## 1) Architecture Goal
Build a scalable MVP quickly for:
- Consumer app
- Owner app/dashboard
- Superadmin monitoring dashboard
- Central API + database + payment + maps

## 2) Recommended MVP Tech Stack
### Frontend
Option A (fast and unified):
- React + Next.js web app
- Responsive UI for mobile and desktop

Option B (app-first):
- Flutter mobile app (Android first)
- Minimal web panel for superadmin

Recommendation for speed now:
- Next.js responsive web (single codebase) for first launch

### Backend
- Node.js + NestJS (or Express) REST APIs
- JWT authentication
- Role-based access control (consumer/owner/superadmin)

### Database
- Firebase Firestore (primary cloud NoSQL database)
- Redis (optional) for caching hot listing searches

### Storage
- Cloud object storage for property images and optional documents

### Integrations
- Google Maps API: geocoding, map display, directions
- Payment gateway integration planned for later phase
- QR-based payment flow planned for later phase

## 3) Core Modules
- Auth module
  - phone login/OTP
  - role management
  - Aadhaar capture at booking stage (consumer)
- Listing module
  - city-based search
  - filters + distance sorting
  - availability search
- Inventory module (owner)
  - rooms/beds management
  - AC/Non-AC types
  - block/unblock with reason and schedule
- Booking module
  - instant booking lock
  - cancellation within 15-minute window
- Payment module
  - advance payment (INR 100)
  - checkout payment (remaining)
  - fee engine (10% commission + 2% payment charge)
- Settlement module
  - owner payout calculations
- Superadmin module
  - metrics dashboard
  - monitoring and audit logs

## 4) Pricing Engine Logic
Let base price = B
- commission = 0.10 * B
- payment_charge = 0.02 * B
- total = B + commission + payment_charge

UI for user:
- show final total amount only

Settlement:
- owner_receivable = collected_amount - commission - payment_charge

## 5) Booking Concurrency (Critical)
To avoid double-booking same bed:
1. Create temporary hold lock on selected bed for 5 minutes during payment.
2. Confirm booking only after successful payment event.
3. Auto-release lock if payment fails/timeouts.
4. Use DB transaction + unique conflict checks on bed and time range.

## 6) Suggested API Groups
- /auth
- /users
- /cities
- /properties
- /rooms
- /beds
- /bed-blocks
- /availability
- /bookings
- /payments
- /payouts
- /superadmin/metrics
- /audit-logs

## 7) Superadmin Dashboard KPIs (Phase 1)
- Total bookings (today/week/month)
- Gross collection
- Net revenue (commission)
- Active properties and active owners
- Occupancy percentage by city
- Payment success/failure rate
- Top cities by bookings

## 8) Security Baseline
- Hash all sensitive IDs where required for display
- Encrypt Aadhaar number at rest
- Mask Aadhaar in UI logs
- Full audit logs for booking/payment status changes
- Signed webhook verification for payment gateway callbacks

## 9) MVP Deployment Suggestion
- Frontend: Vercel or Netlify
- Backend: Render/Fly.io/AWS ECS
- Database: Managed PostgreSQL (Neon/Supabase/RDS)
- Monitoring: basic logs + uptime alerts

## 10) What to Finalize Before Coding
1. Exact superadmin metrics required on day 1.
2. Payment gateway provider for later integration phase.

## 11) Finalized Today
- Database choice: Firebase Firestore instead of PostgreSQL.
- Cancellation window: 15 minutes.
- Launch mode: website first.
- Payment gateway: deferred to later phase.
