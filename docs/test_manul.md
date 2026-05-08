Manual test plan (exactly where and what)

Superadmin sets fee
Login as superadmin.
Go to src/app/internal-control/page.jsx.
Open Platform Settings tab.
Set Platform Fee to 9, save.
Change to 15, save again.
Expected: success notice each time, value remains after refresh.
Consumer listing shows bed price only
Login as consumer.
Go to /consumer.
Search listings.
Expected:
Hourly and Overnight values show bed rates.
Text indicates platform fee is added once at checkout.
No commission/gateway wording.
Booking review shows separate fee
From /consumer click Book This.
In /booking pick bed and time, click Review Booking.
Expected review block shows:
Bed price
Platform fee
Booking total = bed price + fee
Booking lock snapshot correctness
Confirm booking.
In Firestore payments doc for that booking verify fields:
lockedBookingPlatformFeeInr
platformFeePerBooking
platformFeeAmount
bedAmount
lockedHourlyRate
Expected:
platformFeePerBooking equals current admin-configured fee at booking time.
Checkout uses locked fee and returns breakdown
Check in the booking and then checkout.
Expected consumer notice includes:
Bed amount
Platform fee
Remaining payment
Change platform fee in admin after booking creation and checkout another already-created booking:
Expected old booking still uses its locked fee snapshot, not the new global fee.
No fee on cancelled/no-charge path
Trigger a cancellation path (no-show auto-cancel or explicit cancelled booking flow).
Expected:
No checkout charge is applied for cancelled booking.
Cancellation still appears for future cancellation-risk tracking rules.
