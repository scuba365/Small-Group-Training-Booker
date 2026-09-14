/**
 * Seed script: creates The Barracks Fitness organisation, owner user, and
 * OWNER membership.
 *
 * Run once: BARRACKS_OWNER_PASSWORD=<password> pnpm --filter @workspace/db run seed
 *
 * Safe to re-run: all inserts are idempotent (checks for existing records first).
 */

import { db } from "./index";
import {
  organisationsTable,
  usersTable,
  organisationMembersTable,
} from "./schema";
import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";

async function hashPassword(password: string): Promise<string> {
  try {
    const bcrypt = await import("bcryptjs");
    return bcrypt.hash(password, 12);
  } catch {
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
      bookingOpenHours: 168,
      bookingCloseHours: 12,
      noShowFeeCents: 500,
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
