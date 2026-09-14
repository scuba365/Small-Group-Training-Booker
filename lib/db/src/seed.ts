/**
 * Seed script: creates The Barracks Fitness organisation, owner user, and
 * backfills organisation_id on all existing records.
 *
 * Run once: pnpm --filter @workspace/db run seed
 *
 * Safe to re-run: all inserts are idempotent (checks for existing records first).
 */

import { db } from "./index";
import {
  organisationsTable,
  usersTable,
  organisationMembersTable,
  clientsTable,
  leadsTable,
  checkinDraftsTable,
} from "./schema";
import { eq, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";

// Inline bcryptjs-compatible hash using Node's built-in crypto.
// We use bcryptjs in the API server, but we avoid importing it here
// to keep the seed dependency-free.  For the seed we use a deterministic
// approach: the API server's bcrypt.compare will still work because we
// import bcryptjs in the seed as well.

async function hashPassword(password: string): Promise<string> {
  // Dynamic import so the seed works without bcryptjs if the module
  // hasn't been installed yet — fall back to a sha256 placeholder.
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.hash(password, 12);
  } catch {
    // Fallback: sha256 prefixed so the API server knows it's not bcrypt.
    // Replace with real bcrypt if bcryptjs isn't available at seed time.
    console.warn(
      "bcryptjs not available — password stored as sha256 placeholder. Run pnpm install first.",
    );
    return "sha256:" + createHash("sha256").update(password).digest("hex");
  }
}

const BARRACKS_ORG_ID = "org_barracks_fitness_01";
const BARRACKS_OWNER_ID = "user_stephen_cahill_01";
const BARRACKS_MEMBER_ID = "orgm_stephen_cahill_01";

async function main() {
  console.log("=== Barracks OS Seed ===\n");

  // 1. Create organisation
  const existingOrg = await db
    .select()
    .from(organisationsTable)
    .where(eq(organisationsTable.id, BARRACKS_ORG_ID))
    .limit(1);

  if (existingOrg.length === 0) {
    await db.insert(organisationsTable).values({
      id: BARRACKS_ORG_ID,
      name: "The Barracks Fitness",
      slug: "the-barracks-fitness",
      timezone: "Europe/Dublin",
      currency: "EUR",
      bookingOpenHours: 168, // 7 days
      bookingCloseHours: 12,
      noShowFeeCents: 500, // €5
    });
    console.log("✓ Created organisation: The Barracks Fitness");
  } else {
    console.log("· Organisation already exists, skipping");
  }

  // 2. Create owner user
  const ownerEmail = process.env.BARRACKS_OWNER_EMAIL || "stephen@thebarracksfitness.com";
  const ownerPassword = process.env.BARRACKS_OWNER_PASSWORD;

  if (!ownerPassword) {
    console.error(
      "\n✗ BARRACKS_OWNER_PASSWORD environment variable is required.\n" +
        "  Set it before running the seed:\n" +
        "  BARRACKS_OWNER_PASSWORD=yourpassword pnpm --filter @workspace/db run seed\n",
    );
    process.exit(1);
  }

  const existingUser = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, BARRACKS_OWNER_ID))
    .limit(1);

  if (existingUser.length === 0) {
    // Also check by email in case the seed ran partially before
    const byEmail = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, ownerEmail))
      .limit(1);

    if (byEmail.length === 0) {
      const passwordHash = await hashPassword(ownerPassword);
      await db.insert(usersTable).values({
        id: BARRACKS_OWNER_ID,
        email: ownerEmail,
        passwordHash,
        name: "Stephen Cahill",
      });
      console.log(`✓ Created owner user: ${ownerEmail}`);
    } else {
      console.log(`· User ${ownerEmail} already exists (different ID), skipping user creation`);
    }
  } else {
    console.log("· Owner user already exists, skipping");
  }

  // 3. Create organisation membership (OWNER role)
  const existingMembership = await db
    .select()
    .from(organisationMembersTable)
    .where(eq(organisationMembersTable.id, BARRACKS_MEMBER_ID))
    .limit(1);

  if (existingMembership.length === 0) {
    // Resolve the actual user ID (might differ if user was created by email match above)
    const user = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, ownerEmail))
      .limit(1);

    if (user[0]) {
      // Check if membership already exists for this user+org combo
      const existingByUserOrg = await db
        .select()
        .from(organisationMembersTable)
        .where(eq(organisationMembersTable.userId, user[0].id))
        .limit(1);

      if (existingByUserOrg.length === 0) {
        await db.insert(organisationMembersTable).values({
          id: BARRACKS_MEMBER_ID,
          organisationId: BARRACKS_ORG_ID,
          userId: user[0].id,
          role: "OWNER",
          status: "ACTIVE",
        });
        console.log("✓ Created OWNER membership for Stephen Cahill");
      } else {
        console.log("· Organisation membership already exists, skipping");
      }
    }
  } else {
    console.log("· Organisation membership already exists, skipping");
  }

  // 4. Backfill organisation_id on existing clients
  const clientsWithoutOrg = await db
    .select({ id: clientsTable.id })
    .from(clientsTable)
    .where(isNull(clientsTable.organisationId));

  if (clientsWithoutOrg.length > 0) {
    await db
      .update(clientsTable)
      .set({ organisationId: BARRACKS_ORG_ID })
      .where(isNull(clientsTable.organisationId));
    console.log(`✓ Backfilled organisation_id on ${clientsWithoutOrg.length} client records`);
  } else {
    console.log("· All clients already have organisation_id, skipping");
  }

  // 5. Backfill organisation_id on existing leads
  const leadsWithoutOrg = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(isNull(leadsTable.organisationId));

  if (leadsWithoutOrg.length > 0) {
    await db
      .update(leadsTable)
      .set({ organisationId: BARRACKS_ORG_ID })
      .where(isNull(leadsTable.organisationId));
    console.log(`✓ Backfilled organisation_id on ${leadsWithoutOrg.length} lead records`);
  } else {
    console.log("· All leads already have organisation_id, skipping");
  }

  // 6. Backfill organisation_id on existing checkin_drafts
  const draftsWithoutOrg = await db
    .select({ id: checkinDraftsTable.id })
    .from(checkinDraftsTable)
    .where(isNull(checkinDraftsTable.organisationId));

  if (draftsWithoutOrg.length > 0) {
    await db
      .update(checkinDraftsTable)
      .set({ organisationId: BARRACKS_ORG_ID })
      .where(isNull(checkinDraftsTable.organisationId));
    console.log(`✓ Backfilled organisation_id on ${draftsWithoutOrg.length} checkin draft records`);
  } else {
    console.log("· All checkin drafts already have organisation_id, skipping");
  }

  console.log("\n=== Seed complete ===");
  console.log(`\nOrganisation ID : ${BARRACKS_ORG_ID}`);
  console.log(`Owner email     : ${ownerEmail}`);
  console.log("\nYou can now log in at /login with these credentials.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
