# Bed Booking Platform - MVP Blueprint v1

Date: 2026-03-17

## 1) Confirmed Product Decisions
- Booking model: instant booking based on live available beds.
- Owner control: owner can manually block beds.
- Duration model: hourly, overnight, overday.
- ID policy: Aadhaar mandatory only at booking stage (browsing allowed without Aadhaar).
- Pilot launch cities: Kavali, Nellore, Ongole, Chennai, Bangalore, Vijayawada, Guntur, Vizag, Hyderabad, Tirupati.
- Advance amount: INR 100 at booking.
- Remaining payment: app payment only (including at property via QR inside app).
- Commission: 10%.
- Payment bridge/gateway charge: 2%.
- Pricing shown to user: total cost after adding commission and payment charges.
- Price display: show only final total amount.
- Address/navigation: owner exact address required + Google Maps support.
- Superadmin panel included for progress monitoring.
- Cancellation policy: allowed only within X-minute window (value to be finalized).

## 2) Pricing Formula (MVP)
Let base bed price for selected duration = B

- Commission = 10% of B
- Payment charge = 2% of B
- Total payable by user = B + 0.10B + 0.02B = 1.12B

Notes:
- Advance at booking = INR 100.
- Remaining amount collected at checkout through app only.
- Owner payout = amount collected minus commission and payment charges.

## 3) User App Flow
1. Open app and browse by city.
2. View listings in city or near transport points.
3. Apply filters: AC/Non-AC, price, duration, proximity.
4. Open listing details (address, map, availability).
5. Select duration and bed.
6. Enter Aadhaar number (mandatory at booking stage).
7. View total payable.
8. Pay INR 100 advance and confirm booking.
9. At checkout, pay remaining amount through app/QR.

## 4) Owner App Flow
1. Owner signs up.
2. Owner enters Aadhaar details.
3. Owner creates property with exact address and map location.
4. Owner adds rooms and bed inventory.
5. Owner sets bed pricing for hourly/overnight/overday.
6. Owner marks bed type (AC/Non-AC).
7. Owner updates availability.
8. Owner blocks beds manually with:
   - start time
   - end time (optional)
   - reason
   - full block option (no end time)
9. Owner receives booking details instantly.

## 5) Core Database Entities (Draft)
- users
  - id, name, phone, role (consumer/owner/superadmin), aadhaar_number, created_at
- cities
  - id, name, state, active
- properties
  - id, owner_id, city_id, name, exact_address, lat, lng, near_railway_km, near_bus_km, status
- rooms
  - id, property_id, room_name, total_beds
- beds
  - id, room_id, bed_code, bed_type (AC/NON_AC), active
- bed_availability
  - id, bed_id, available_from, available_to, status
- bed_blocks
  - id, bed_id, block_start, block_end_nullable, reason, is_full_block, blocked_by_owner_id
- pricing
  - id, property_id, mode (hourly/overnight/overday), base_price
- bookings
  - id, user_id, property_id, room_id, bed_id, mode, start_time, end_time, booking_status
- payments
  - id, booking_id, base_price, commission_amount, gateway_amount, total_amount, advance_paid, remaining_paid, payment_status
- owner_payouts
  - id, owner_id, booking_id, payout_amount, payout_status
- audit_logs
  - id, actor_user_id, actor_role, action, entity_type, entity_id, metadata_json, created_at

## 6) Screens List (MVP)
Consumer:
- City selection
- Listing search/results
- Listing detail with map
- Booking detail + Aadhaar input
- Payment (advance)
- Booking confirmation
- Checkout payment (remaining)
- My bookings

Owner:
- Owner signup/login
- Aadhaar capture
- Dashboard
- Add property (address + map pin)
- Manage rooms and beds
- Pricing setup (hourly/overnight/overday)
- Availability and bed block manager
- Booking alerts/details
- Settlement/payout summary

Superadmin:
- Superadmin login
- Operations dashboard (bookings, revenue, active listings, payment health)
- Owner/property progress monitoring
- Basic audit logs view

## 7) Terms Policy Draft Pointers
- Aadhaar required before booking confirmation.
- Cancellation allowed only within configured X-minute booking window.
- Platform deducts commission and payment charges.
- Remaining amount payable only through app.

## 8) Open Items Before Build
1. Finalize X-minute value for cancellation window.
2. Confirm superadmin dashboard KPIs for phase 1.
