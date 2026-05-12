# AI Priority Guide

This file is for any AI or engineer working on Chikki Logs. Follow it before changing code.

## 1. Priority Order
1. Fix critical bugs first: booking, payment, auth, security, Aadhaar/privacy, data loss, production outage.
2. Then fix broken user flows: login, listing, booking, check-in, checkout, history, owner visibility, support.
3. Then fix tests/build/lint/deployment blockers.
4. Then improve performance and database load.
5. Then build new features.
6. Then polish UI/copy.

Do not start shiny future features while booking, payment, auth, or production stability is broken.

## 2. Before Any Change
- Check `git status --short --branch`.
- Read the relevant section of `docs/TODO.md`.
- Read `docs/CHIKKI_MASTERBOOK.md` when product behavior is unclear.
- Preserve user changes and generated work you did not create.
- Keep edits scoped to the requested problem.
- Do not store secrets in code, docs, logs, screenshots, or examples.

## 3. Safety Rules
- Booking and payment amounts must be calculated or verified by trusted backend code.
- Consumers must never be able to edit payment status, booking price, commission, payout, or audit fields directly.
- Aadhaar or other sensitive identity data must never appear in normal logs, UI state, public documents, or client-readable tables.
- Owners can see their own operational data, not other owners' private data.
- AI can summarize and recommend, but must not auto-deploy, refund, block users, reveal identity, or change production settings without human approval.

## 4. Database Rules
- Permanent business data belongs in Data Connect / Cloud SQL PostgreSQL.
- Firestore is only for temporary state such as locks, rate windows, short heartbeats, and mail trigger documents.
- Raw logs belong in Cloud Logging or raw append-only storage, not in hot transactional tables.
- Dashboards should read facts, snapshots, summaries, or safe views, not full raw bookings/payments.
- Scheduled jobs must be incremental with watermarks whenever possible.

## 5. Bug Triage
Use these priorities:

- P0: production down, payment wrong, overbooking, private data leak, auth bypass, Aadhaar exposure, destructive migration risk.
- P1: booking/check-in/checkout broken, owner cannot see active booking, operator cannot resolve issue, payment webhook failing.
- P2: dashboard wrong/slow, support workflow incomplete, notification failure, demand pricing mismatch.
- P3: UI polish, copy, layout, non-critical feature improvement.

Always write down the affected role, route, record ID/type, expected behavior, actual behavior, and likely risk.

## 6. Smoke Tests First
After meaningful changes, run the smallest useful checks:

- `npm.cmd run lint`
- `npm.cmd run build`
- `npm.cmd run test:security:rules` when rules or data access changed
- Browser smoke for touched route when UI changed
- Payment sandbox/webhook smoke when payment code changed
- Role smoke for guest, consumer, owner, operator, and superadmin when auth/routing/data rules changed

On this Windows machine, prefer `npm.cmd` if plain `npm` is blocked by PowerShell execution policy.

## 7. Required Manual Smoke Paths
- Guest can browse public-safe pages.
- Consumer can browse listings, start booking, confirm booking, check in, checkout, view history, and rate.
- Owner can add/manage property inventory, see active/future bookings, handle checkout, see dues/payouts.
- Operator can approve owners/properties, monitor issues, manage city controls, and review payment/booking problems.
- Superadmin can access internal controls, settings, role management, audit views, and operational dashboards.

## 8. Commit Hygiene
- Stage only intended files.
- Do not commit `.next`, `_next`, local logs, debug logs, env files, or generated artifacts unless explicitly requested.
- Use concise commit messages such as `docs: ...`, `fix: ...`, or `feat: ...`.
- Before push, confirm `git diff --cached --name-only`.

## 9. Documentation Rules
- `docs/TODO.md` is the planning backlog.
- `docs/AI_PRIORITY_GUIDE.md` is the AI/engineering work guide.
- Keep runbooks separate when they are operational instructions, not planning brainstorms.
- Remove duplicate planning notes after merging their useful content into TODO.

## 10. Escalation Rule
Ask the user before:
- deleting non-planning source-of-truth docs,
- changing production deployment behavior,
- changing payment/finance rules,
- changing identity/Aadhaar handling,
- removing user data,
- running destructive commands,
- making broad refactors unrelated to the current task.
