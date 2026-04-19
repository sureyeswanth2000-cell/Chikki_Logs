# Bed Booking Platform - Discussion Notes

Date: 2026-03-17

## 1) Core Idea
Create an online platform where users can book beds for short stays (hourly or longer), similar to hotel booking but at bed level.

## 2) Business Model
- Bed owners list properties in cities.
- Each property can have multiple rooms.
- Each room can have multiple beds.
- Beds can be AC or Non-AC.
- Users can search and book available beds.

## 3) User Roles
- Consumer (guest): search, select, pay, and book bed.
- Owner (provider): add property, room, bed count, pricing, and availability.
- Superadmin (platform): login to monitor overall platform work progress, bookings, and operations.

## 4) Must-Have Features (Captured from discussion)
- City-based browsing.
- Show listings near transport points (railway station, bus station).
- Show all listings in selected city.
- Owner exact address for navigation.
- Google Maps support for directions.
- Bed-level availability (not only room-level).
- Direct booking on available beds (instant confirmation after payment step).
- Owner can manually block beds when required.
- AC / Non-AC bed type.
- Time model: hourly, overnight, and overday.
- Booking for short rest duration.
- Payment support.
- Security and trust measures.
- Cancellation allowed only within a fixed X-minute window.
- Aadhaar mandatory for both user and owner.
- Show Aadhaar requirement before login.

## 5) Listing Data Structure (Simple)
For each listing:
- City
- Area / Landmark
- Exact address
- Latitude/Longitude (for maps)
- Distance from railway station
- Distance from bus station
- Property name
- Rooms available
- Total beds
- Available beds now
- AC beds count
- Non-AC beds count
- Hourly rate
- Daily rate (optional)
- Check-in/check-out rules
- Owner details and KYC status

## 6) Consumer Flow (MVP)
1. User selects city.
2. Platform shows available bed listings in that city.
3. User filters by: near railway, near bus stand, AC/Non-AC, price, duration.
4. User selects bed and duration type (hourly/overnight/overday).
5. User enters Aadhaar details during booking (mandatory before confirmation).
6. User pays booking amount.
7. Booking confirmed with receipt and check-in details.

## 7) Owner Flow (MVP)
1. Owner signs up and completes KYC.
2. Owner adds property details.
3. Owner adds rooms and bed counts.
4. Owner marks AC/Non-AC bed inventory.
5. Owner sets pricing for hourly, overnight, and overday.
6. Owner updates real-time availability.
7. Owner can manually block specific beds with start time, end time, and reason.
8. Owner can optionally block a bed fully (no end time).
9. Owner receives booking details after user booking.

## 8) Security and Trust
- Owner KYC verification with Aadhaar.
- Property verification workflow.
- Guest identity check with Aadhaar (mandatory at booking).
- Safe payment gateway (no direct cash dependency).
- Booking logs and audit trail.
- Dispute center with evidence upload.

## 9) Payment and Settlement
- Booking advance: user pays INR 100 at booking time.
- Remaining amount: user pays after checkout using app payment only.
- If user pays at property, payment is still app-based (QR code in app).
- Platform commission: 10%.
- Payment gateway charge: 2%.
- User total shown by pricing engine: bed cost + 10% commission + 2% payment charge.
- UI should show final total amount to user.
- Owner payout: total collected minus platform commission and payment gateway charge.
- Refund policy: cancellation allowed only within 15 minutes from booking time.

## 10) Suggested MVP Scope (First Release)
- 10 pilot cities: Kavali, Nellore, Ongole, Chennai, Bangalore, Vijayawada, Guntur, Vizag, Hyderabad, Tirupati.
- Basic search and filters.
- Bed availability + booking + payment.
- Owner panel for inventory update.
- Superadmin panel for progress monitoring.

## 11) Next Discussion Decisions
- Payment gateway integration timeline (added later phase).
- Define superadmin dashboard metrics (daily bookings, revenue, active properties, failed payments, occupancy).
