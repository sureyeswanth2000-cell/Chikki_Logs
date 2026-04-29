# End-to-End Auth Test Checklist

Last updated: 2026-04-26

## What End-to-End Auth Means
End-to-end auth means we test the full journey, not just sign-in:
- login or session restore
- role detection
- landing page selection
- protected route access
- unauthorized redirects
- timeout and back-button behavior

If any one of those steps fails, the user can end up on the wrong page, get stuck in a redirect loop, or see a screen they should not access.

## Best Method
Use a manual role-by-role pass first, then automate later.

Why this is best for Chikki:
- the app is role-heavy
- route behavior depends on Firebase profile loading
- redirect behavior is easier to confirm visually first
- it catches real user-facing issues faster than unit tests alone

## Test Setup
Before testing:
- run the app locally
- confirm Firebase config is loaded
- have test accounts ready for consumer, owner, operator, and superadmin
- open the browser console so redirect or timeout errors are easy to spot

## Role Checks

### 1. Guest
- open the public landing page
- try a protected URL directly
- confirm the app sends you to `/login?next=<path>` or the correct public fallback
- try `/booking?cityId=test&propertyId=test&duration=hourly&bedFilter=all` while logged out and confirm the full query string survives in `next`

### 2. Consumer
- log in as consumer
- confirm the consumer lands on the consumer flow
- verify access to `/consumer`, `/booking`, `/profile`, `/history`, and `/apply-owner`
- verify direct access to `/owner`, `/operator`, and `/internal-control` redirects to `/unauthorized`

### 3. Owner
- log in as owner
- confirm the owner lands on `/owner`
- verify access to `/profile` and `/history`
- verify direct access to `/consumer`, `/operator`, and `/internal-control` redirects to `/unauthorized`

### 4. Operator
- log in as operator
- confirm the operator lands on `/operator`
- verify access to `/profile`
- verify direct access to consumer, owner, and superadmin-only pages redirects to `/unauthorized`

### 5. Superadmin
- log in through the hidden internal path
- confirm access to `/internal-control`
- verify access to `/profile`
- confirm public UI does not expose the hidden path

## Edge Cases
- send phone OTP, choose "Edit phone number", change to a different number, and confirm the UI returns to a fresh Send OTP state
- confirm an OTP cooldown for the old phone number does not block sending OTP to the new phone number
- submit a rating for one completed booking from `/history` and confirm it cannot be submitted twice
- after production deploy, confirm `submitBookingRating` is listed by `firebase functions:list --project chikki-logs-72607`
- after production deploy, confirm booking-history rating has no browser CORS/preflight error
- watch browser network logs while navigating shared menu/footer links and confirm repeated `__next.*.__PAGE__.txt?_rsc=...` 404 noise is reduced
- wait 4 seconds on profile load and confirm timeout handling works
- test the `/unauthorized` page for clear recovery guidance
- use the back button after an unauthorized redirect and confirm the user does not get trapped
- repeat one direct-URL test after logout to make sure stale sessions do not leak access

## Record Results
After testing, update:
- `docs/TODO.md` with any remaining failures
- `docs/WORK_LOG.md` with what was verified
- `docs/CHIKKI_MASTERBOOK.md` if the auth behavior or redirect rules changed
