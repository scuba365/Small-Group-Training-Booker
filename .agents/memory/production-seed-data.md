---
name: Production seed data
description: How to safely make development seed content available after publishing without overwriting live data.
---

Publishing preserves the production database's own records while applying schema changes; it does not copy development seed records.

**Why:** A published app can have all required tables but lack the initial owner or shared catalog. Replacing production data wholesale to copy development seeds risks losing live accounts, workouts, and organisation-specific records.

**How to apply:** Keep a guarded first-run owner setup for an empty production database. For reusable shared catalogs, prefer an explicit owner-initiated, idempotent, additive import that leaves existing production records untouched. Do not recommend a whole-database overwrite for a missing seed catalog.