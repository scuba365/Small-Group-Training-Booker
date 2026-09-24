---
name: Delimited list schema compatibility
description: Keep list-shaped app fields compatible with existing scalar text columns during publish.
---

When production stores a comma-delimited scalar text value but application code wants string arrays, map the logical array to physical `text` with a Drizzle custom type instead of changing the production column to `text[]`.

**Why:** The publish schema diff does not include an explicit `USING` conversion, so PostgreSQL rejects an in-place `text` to `text[]` change; legacy production values may also already contain multiple comma-separated items.

**How to apply:** Keep serialization and parsing consistent with the allowed values, and normalize any pre-existing development `text[]` columns only in the development post-merge schema flow.