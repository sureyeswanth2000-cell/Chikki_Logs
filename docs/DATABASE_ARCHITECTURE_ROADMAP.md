# Chikki_Logs Database Architecture & Storage Roadmap

_Last updated: 2026-05-08_

## Goal
Design the final data architecture for **Chikki_Logs** with these goals:
- **Fast and cost-efficient** for growth toward large scale
- **Firebase Data Connect / SQL as the primary database**
- **Firestore only for patterns that are temporary, document-heavy, or not a good fit for relational SQL**
- **Read-only external BI/tool access**
- **Automation-first architecture** so future AI/automation jobs do not overload the transactional database

---

## Final recommendation at a glance

### Use Firebase Data Connect / SQL for
- Core business entities and transactions
- Booking, payment, pricing, issues, notices, commission, payouts
- Admin dashboards
- BI and reporting
- Snapshot tables
- Historical analytics
- Job metadata and automation run history
- Any data that needs joins, filtering, aggregations, or external read access

### Use Firestore only for
- Very short-lived temporary state
- Ephemeral locks
- Temporary rate-limit counters
- Lightweight heartbeat/state documents if needed
- Rare JSON-heavy or flexible transient payloads

### Use Cloud Logging / raw event storage for
- Raw logs
- Debug trails
- Replay/debugging data
- Large append-only event streams that should not live in SQL hot paths

---

## How Firebase storage choices affect speed and cost

### Firestore is cheap/fast when
Firestore works well for:
- Small document reads by known ID
- Sparse reads and writes
- Simple filtered lookups
- Realtime-ish state
- Flexible JSON-like documents
- Temporary app state
- Client-facing state controlled by Firebase rules

Firestore becomes expensive/slower when used for:
- Full collection scans
- Repeated analytics over large collections
- Cross-entity joins
- Dashboard aggregates computed from raw operational data
- Heavy scheduled jobs that re-scan the same documents again and again
- External BI/query-tool access

### SQL / Data Connect is cheap/fast when
Data Connect / SQL works well for:
- Stable structured entities
- Relationships and joins
- Aggregations and reports
- Historical analysis
- Read-only BI access
- Snapshot tables
- External reporting tools
- Cost-efficient dashboards
- Batch jobs with indexes and filters
- Privacy segmentation using views

### Final rule
- **Transactional app data with relationships -> Data Connect / SQL**
- **Ephemeral/temp state -> Firestore**
- **Raw logs/debug events -> Cloud Logging or raw append store**

---

## Project-specific final picture

Chikki_Logs has multiple data patterns, and each pattern should go to the right store.

### 1. Core app/business data -> Data Connect / SQL
This is the primary source of truth.

Store in SQL:
- users
- cities
- properties
- rooms
- beds
- bed blocks
- bookings
- payments
- issue reports
- owner commission dues
- owner payouts
- owner notices
- operator notices
- platform settings
- owner applications
- demand/scarcity summaries

Why:
- structured
- relational
- query-heavy
- needs filtering, reporting, joins
- should be externally readable through safe views

### 2. Temporary/ephemeral data -> Firestore
Use Firestore only for data that expires quickly or is operationally temporary.

Examples:
- booking locks during booking creation
- short-lived idempotency keys
- temporary rate-limit counters
- short-term automation heartbeat state
- transient queue markers if needed

Why:
- easy TTL-like cleanup pattern
- simple temporary documents
- avoids cluttering relational core with micro-state

### 3. Raw logs and flexible event payloads -> Cloud Logging / raw store
Examples:
- raw function logs
- raw integration/webhook payloads
- low-level debug logs
- replay/debug records

Why:
- append-only
- not needed for every dashboard query
- should not burden primary relational tables

---

## Very important design rule: data lifetime decides storage

Different data should be stored based on **how long it matters** and **how it will be queried**.

### A. Permanent business truth
Example:
- booking
- payment
- issue report
- owner payout

Store in SQL permanently.

### B. Temporary work-state
Example:
- booking lock valid for 30 seconds
- retry marker valid for 10 minutes
- per-user temporary throttle counter

Store in Firestore and clean up automatically/by scheduled cleanup.

### C. Derived temporary intermediate data
Example:
- ratings submitted during the day, then aggregated at midnight into a main rating table

Best approach:
- Keep the **user-submitted rating event** in SQL if users need history
- Keep the **aggregate rating summary** in a separate SQL summary table
- Delete only unnecessary intermediate processing tables after aggregation if they are truly not needed

---

## Example: rating workflow (important pattern)

You said:
- ratings come from users
- nightly job updates rating into main table
- after that job, some temporary data is not required
- consumers should see their rating history
- owners should not see who gave which rating or how much individually

### Best design

#### SQL tables
1. `rating_events`
- one row per submitted rating
- stores the actual rating event
- linked to booking, consumer, property/bed/owner
- visible only to authorized internal roles and the rating consumer's own history

2. `rating_daily_aggregation_queue` (optional temporary table)
- temporary rows waiting to be aggregated
- can be cleared after successful aggregation

3. `rating_summaries`
- one row per entity being rated (bed/property/owner/etc.)
- contains average rating, count, total, updated_at
- used by app and owner-facing screens

4. `consumer_rating_history_view`
- shows a consumer their own submitted ratings

5. `owner_rating_summary_view`
- shows owners only aggregate metrics
- never exposes who rated or exact per-user rating rows

### What to keep vs delete
- Keep `rating_events` if consumer history is required
- Keep `rating_summaries` for fast reads
- Clear `rating_daily_aggregation_queue` after midnight job succeeds

### Privacy rule
- **Owner sees aggregate rating only**
- **Consumer sees only their own rating history**
- **No owner access to individual rating authors**

This same pattern should be reused for many features.

---

## General storage decision framework

For every new data type, ask these questions:

1. Is this core business truth?
   - If yes -> SQL
2. Is this short-lived temporary state?
   - If yes -> Firestore
3. Is this raw log/debug/event data?
   - If yes -> Cloud Logging / raw append storage
4. Does this need joins/reporting/BI?
   - If yes -> SQL
5. Does this need external read-only access?
   - If yes -> SQL views
6. Does this need privacy-controlled partial visibility?
   - If yes -> SQL + views/role-based access

---

## Recommended target architecture

### Schema: `core`
Primary transactional data.

Tables:
- `users`
- `user_roles`
- `cities`
- `properties`
- `rooms`
- `beds`
- `bed_blocks`
- `bookings`
- `payments`
- `owner_applications`
- `platform_settings`
- `owner_commission_dues`
- `owner_payouts`
- `owner_notices`
- `operator_notices`

### Schema: `engagement`
Ratings, feedback, and customer experience.

Tables:
- `rating_events`
- `rating_summaries`
- `feedback_events`
- `feedback_tags`
- `issue_reports`
- `issue_resolutions`

### Schema: `ops`
Operations, automation, and internal workflows.

Tables:
- `audit_events`
- `anomaly_events`
- `job_definitions`
- `job_runs`
- `job_failures`
- `job_watermarks`
- `automation_runs`
- `automation_actions`
- `automation_findings`
- `node_heartbeats`
- `external_sync_runs`

### Schema: `analytics`
Facts, dimensions, snapshots, and BI.

Fact tables:
- `booking_facts`
- `payment_facts`
- `rating_facts`
- `issue_facts`
- `occupancy_facts`
- `commission_facts`

Dimension tables:
- `date_dim`
- `city_dim`
- `property_dim`
- `room_dim`
- `bed_dim`
- `owner_dim`
- `user_dim`

Snapshot tables:
- `daily_kpi_snapshots`
- `city_daily_snapshots`
- `property_daily_snapshots`
- `owner_daily_snapshots`
- `job_daily_snapshots`
- `automation_daily_snapshots`

### Firestore-only temporary collections
- `bed_locks`
- `rate_limit_windows`
- `temporary_job_tokens`
- `short_lived_heartbeats`

### Raw/log storage
- `raw_app_logs`
- `raw_webhook_events`
- `raw_debug_events`

---

## Snapshots: what they are and why required

A snapshot is a precomputed summary row at a time boundary (hourly/daily).

Example:
Instead of scanning all bookings to answer "what was total revenue yesterday?", store it once in a daily snapshot table.

### Required snapshots

#### `daily_kpi_snapshots`
Fields:
- snapshot_date
- total_users
- active_users
- bookings_created
- bookings_completed
- bookings_cancelled
- revenue_total
- cash_revenue
- online_revenue
- issue_count
- rating_count
- avg_rating
- active_properties
- active_beds

#### `city_daily_snapshots`
Fields:
- snapshot_date
- city_id
- bookings_count
- completed_bookings
- cancelled_bookings
- revenue_total
- occupancy_percent
- issue_count
- avg_rating
- active_properties
- active_beds

#### `property_daily_snapshots`
Fields:
- snapshot_date
- property_id
- city_id
- owner_id
- bookings_count
- occupancy_percent
- revenue_total
- issue_count
- avg_rating
- repeat_issue_count

#### `owner_daily_snapshots`
Fields:
- snapshot_date
- owner_id
- bookings_count
- revenue_total
- commission_due
- payout_pending
- avg_rating
- issue_count

#### `job_daily_snapshots`
Fields:
- snapshot_date
- job_name
- runs_count
- success_count
- failure_count
- avg_duration_ms
- processed_records
- lag_ms

#### `automation_daily_snapshots`
Fields:
- snapshot_date
- automation_name
- total_runs
- success_count
- failure_count
- avg_duration_ms
- actions_taken
- escalations_created

Why needed:
- fast dashboards
- lower query cost
- historical BI
- automation input summaries
- easier trend reporting

---

## Views required

### Privacy-safe app/admin views
- `vw_owner_rating_summary`
- `vw_consumer_rating_history`
- `vw_active_bookings`
- `vw_booking_payment_status`
- `vw_open_issue_reports`
- `vw_owner_commission_pending`
- `vw_property_current_occupancy`
- `vw_recent_job_failures`

### BI views
- `vw_bi_daily_revenue`
- `vw_bi_city_performance`
- `vw_bi_property_performance`
- `vw_bi_owner_performance`
- `vw_bi_issue_trends`
- `vw_bi_rating_trends`
- `vw_bi_booking_funnel`

### External read-only views
These must exclude sensitive/private fields.
- `vw_external_bookings`
- `vw_external_payments`
- `vw_external_properties`
- `vw_external_city_kpis`
- `vw_external_rating_summary`

Never expose through external views:
- raw identity data
- encrypted vault tables
- rate-limit details
- internal anomaly rules
- webhook signatures
- secret operational metadata

---

## Index strategy

### Core indexes

#### `users`
- unique(phone_number)
- unique(email) if used
- index(role)
- index(created_at)

#### `properties`
- index(owner_id)
- index(city_id)
- index(status)
- composite(city_id, status)

#### `beds`
- index(property_id)
- index(room_id)
- index(active)
- composite(property_id, active)

#### `bookings`
- unique(booking_code)
- index(user_id)
- index(owner_id)
- index(property_id)
- index(bed_id)
- index(booking_status)
- index(check_in_at)
- index(check_out_at)
- index(created_at)
- composite(property_id, booking_status, check_in_at)
- composite(bed_id, check_in_at, check_out_at)
- composite(user_id, created_at)

#### `payments`
- unique(booking_id) if one-to-one
- index(payment_status)
- index(created_at)
- index(owner_id)
- index(razorpay_payment_id)

#### `issue_reports`
- index(booking_id)
- index(property_id)
- index(owner_id)
- index(status)
- index(created_at)
- composite(property_id, status, created_at)

#### `rating_events`
- index(consumer_user_id)
- index(booking_id)
- index(property_id)
- index(owner_id)
- index(created_at)
- composite(consumer_user_id, created_at)
- composite(property_id, created_at)

#### Snapshot tables
- unique(snapshot_date, entity_id)
- index(snapshot_date)

### Index rule
Only create indexes for real query patterns. Avoid over-indexing write-heavy tables.

---

## Jobs required

### Operational jobs
- booking no-show / expiry handling
- payment reconciliation
- commission due creation
- payout preparation
- stale lock cleanup
- issue escalation
- demand/scarcity recalculation
- notice dispatch

### Analytics jobs
- booking fact sync
- payment fact sync
- issue fact sync
- rating summary refresh
- daily snapshot generation
- hourly KPI rollups
- property occupancy aggregation
- city performance aggregation

### Automation jobs
- data quality validation
- repeated issue detection
- failed workflow detector
- integration sync health check
- automation digest generation

### Monitoring jobs
- node heartbeat collector
- job runtime summarizer
- slow query / expensive job detector
- database usage metrics collector

### Important rule for all jobs
All jobs must be **incremental**, not full-table scans.
Use:
- `updated_at > last_watermark`
- `id > last_processed_id`
- affected entity queues
- partition-by-date processing

---

## Deletion, retention, and cleanup policy

### External BI tools
- **Read-only only**
- No delete
- No drop
- No schema changes

### Deletion/drop authority
Only internal admin/DBA/maintenance workflows should be able to:
- archive old raw data
- delete expired temporary data
- rebuild/drop temporary aggregation tables
- apply migrations

### Retention suggestions
- temp locks/rate limits: keep short, auto-clean
- raw webhook/debug payloads: short-medium retention
- job runs: medium retention, aggregate older history
- audit events: long retention or archive
- rating aggregation queue: clear after successful processing
- snapshots: long retention

---

## Migration plan from current dev Firestore state

### Phase 1: design
- define relational schema
- define privacy rules at view/service level
- define temporary Firestore-only collections

### Phase 2: build
- create Data Connect schema
- create core tables
- create ops tables
- create analytics/snapshot tables
- create views and indexes

### Phase 3: migrate dev/test data
- export Firestore dev data
- transform collections into relational format
- load into SQL tables
- validate row counts and sample records

### Phase 4: dual-run verification
- keep dev app writing to new SQL-backed paths
- verify dashboards, jobs, and views

### Phase 5: remove old Firestore dependency
- keep only temporary/ephemeral collections in Firestore
- move all permanent product data to Data Connect

---

## Final architectural principles

1. **Use SQL as the main system of record** for permanent business data.
2. **Use Firestore only for temporary or document-style short-lived state.**
3. **Use snapshots and summary tables** so dashboards and automation never scan raw operational tables repeatedly.
4. **Use views to enforce privacy**, such as consumer-only rating history and owner-only aggregate ratings.
5. **Use read-only external BI access** on safe views only.
6. **Use incremental jobs only**; avoid full-table scans.
7. **Separate transactional, operational, and analytical workloads**.
8. **Store raw logs outside the primary hot transactional path**.

---

## Final conclusion

Because Chikki_Logs is still early and does not yet have production-scale data, **now is the right moment to make Data Connect / SQL the main database**.

The best final picture is:
- **Data Connect / SQL** for permanent product, reporting, and BI data
- **Firestore** for short-lived temporary state only
- **Cloud Logging / raw event storage** for logs/debug trails
- **Snapshots + views + incremental jobs** for speed, privacy, and cost control

This gives the project:
- better speed
- lower long-term database burden
- easier BI integration
- stronger privacy control
- cleaner future automation architecture

---

## Next execution roadmap

1. Finalize target schema list
2. Define exact table columns and relationships
3. Define Data Connect models and mutations/queries
4. Define Firestore temporary collections
5. Define snapshot jobs and schedules
6. Define BI views and read-only roles
7. Migrate dev/test data
8. Refactor app read/write flows to the new architecture
