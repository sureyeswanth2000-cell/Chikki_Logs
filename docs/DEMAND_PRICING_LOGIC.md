# On-Demand Pricing Logic

This document is the single place to understand Chikki Logs on-demand pricing.

## Status Checklist
- [x] Document one clear on-demand pricing logic page.
- [x] Keep owners limited to fixed base-price editing only.
- [x] Give operator/superadmin control over demand enable/disable, thresholds, increase percentages, max cap, and emergency disable.
- [x] Exclude blocked beds from demand occupancy so owners cannot fake high occupancy by blocking beds.
- [x] Use 60% occupancy as the consumer demand-warning threshold.
- [x] Use property-level thresholds for demand pricing.
- [x] Use city-level thresholds for demand pricing.
- [x] Use the higher applicable increase when both city and property demand apply.
- [x] Apply a configurable global max cap.
- [x] Run Demand Watchlist job every 15 minutes.
- [x] Run Demand Pricing job every 15 minutes.
- [x] Store watchlist data in `demand_watchlist`.
- [x] Store final city/property demand summaries in `demand_pricing`.
- [x] Store owner/operator/superadmin overrides in `demand_overrides`.
- [x] Add owner Stop Demand Pricing and Allow Demand Pricing Again controls.
- [x] Show Demand Rising / High Demand on consumer listing and booking pages.
- [x] Hide internal multiplier, commission, and gateway breakdown from consumers.
- [x] Lock booking price snapshot at booking confirmation.
- [ ] Deploy latest demand-pricing functions and UI from GitHub `main` to Firebase production.
- [ ] Verify scheduled functions are running in production.
- [ ] Verify production demand summaries update correctly.
- [ ] Verify production consumer booking uses locked demand-adjusted rates through checkout.
- [ ] Install Java / add Java to PATH and run `npm run test:security:rules`.
- [ ] Add payment collection at checkout.
- [ ] Show paid amount and active rating action clearly in booking history.

## Goal
- Increase consumer-facing bed prices only when real demand is high.
- Keep the owner in control of their fixed base bed price.
- Let operator/superadmin control the demand rules.
- Lock the price when the consumer confirms booking, so checkout does not surprise them.

## Who Can Do What
- Owner:
  - can set fixed base prices for their own beds
  - can see demand status for their own property
  - can stop demand pricing for their own property
  - can allow demand pricing again for their own property
  - cannot start demand pricing manually
  - cannot edit demand thresholds or increase percentages
- Operator:
  - can enable/disable demand pricing
  - can edit property/city thresholds and increase percentages
  - can set max cap percentage
  - can emergency-disable demand pricing
  - can manually enable/disable city/property demand controls
- Superadmin:
  - same as operator
  - also owns the highest-level operational/security control

## Capacity Rules
- Only active beds count.
- Currently blocked beds do not count as available capacity.
- Confirmed and checked-in active bookings count as occupied.
- Owner-blocked beds are excluded, so an owner cannot block beds to fake high occupancy.

## Occupancy Formula
```text
occupancy % = occupied active beds / active bookable beds * 100
```

If active bookable beds are zero, occupancy is treated as 0%.

## Warning Rule
- At 60% occupancy or above, show a consumer warning:
  - Demand is rising
  - Consumer should book before price increases
- Warning does not increase price by itself.

## Property-Level Price Increase
- 0-69% occupied: no increase
- 70-89% occupied: increase price
- 90-100% occupied: bigger increase
- Default configured values:
  - 70% -> +20%
  - 90% -> +50%

## City-Level Price Increase
- 0-79% occupied: no increase
- 80-89% occupied: increase price
- 90-100% occupied: bigger increase
- Default configured values:
  - 80% -> +30%
  - 90% -> +100% max by default cap

## If City And Property Both Have Demand
Use the higher applicable increase.

Example:
- Property is 90% occupied -> +50%
- City is 90% occupied -> +100%
- Final demand increase is +100%

The global max cap still applies.

## Max Cap
- Superadmin/operator can configure the global max cap.
- Default max cap is 100%.
- Final demand increase can never go above this cap.

## Recalculation Jobs
- Job 1: Demand Watchlist
  - runs every 15 minutes
  - scans properties and cities
  - stores only scopes at or above 60% occupancy
  - writes to `demand_watchlist`
- Job 2: Demand Pricing
  - runs every 15 minutes
  - reads `demand_watchlist`
  - applies threshold rules, overrides, and caps
  - writes final summaries to `demand_pricing`

This keeps future pricing calculation cheaper because the second job works from the watchlist instead of scanning everything again.

## Owner Stop Demand
- Owner can stop demand pricing only for their own property.
- Owner stop lasts until next business day 06:00 local time by default.
- It does not restart automatically in the next 15-minute run.
- Owner can allow demand pricing again before expiry.
- Operator/superadmin can also disable or enable demand controls.

## Consumer Display Rules
- If occupancy is above warning threshold but price is not increased:
  - show Demand Rising
- If demand pricing is active:
  - show High Demand
  - show only one all-inclusive consumer price
  - do not show commission, gateway fee, or internal multiplier breakdown

## Booking Price Lock
- Booking confirmation stores the locked price snapshot.
- Snapshot includes demand-adjusted final rate and hourly rate.
- Checkout uses the locked rate snapshot.
- If demand price changes after confirmation, the existing booking does not change.

## Firestore Collections
- `demand_watchlist`
  - backend-written watchlist of city/property scopes above warning threshold
  - readable only by operator/superadmin
- `demand_pricing`
  - backend-written city/property price summaries
  - readable by signed-in users so consumer UI can show warning/high-demand states
- `demand_overrides`
  - backend-written manual override records
  - readable by operator/superadmin and matching property owner

## Backend Functions
- `refreshDemandWatchlist`
- `refreshDemandPricing`
- `updateDemandPricingSettings`
- `setDemandScopeOverride`
- `stopOwnerDemandPricing`
- `allowOwnerDemandPricing`

## UI Locations
- Consumer listings:
  - `/consumer`
  - shows Demand Rising / High Demand and demand-adjusted displayed prices
- Consumer booking:
  - `/booking`
  - shows exact bed price and High Demand label when active
- Owner demand status:
  - `/owner/property-status`
  - shows demand status for owner properties and stop/allow actions
- Operator controls:
  - `/operator`
  - demand pricing settings panel
- Superadmin controls:
  - `/internal-control`
  - demand pricing settings panel

## Still Pending
- Production deploy and live verification from GitHub `main`.
- Verify production scheduled functions are deployed and running.
- Verify production demand summaries update correctly.
- Verify consumer booking confirms and checks out using locked rates.
- Verify Java is installed locally so Firestore rules tests can run.
