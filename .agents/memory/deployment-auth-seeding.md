---
name: Deployment auth seeding
description: Production publishing preserves the database schema but does not copy development seed records.
---

Production can have all auth tables present while containing zero users because development seed data is not copied during publish.

**Why:** A deployed app that only exposes sign-in returns 401 forever when its production database has no initial account.

**How to apply:** Keep a guarded first-run setup path that creates the first owner, organisation, membership, and session; after the first user exists, require normal sign-in.