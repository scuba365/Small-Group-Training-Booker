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
  sessionTypesTable,
} from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

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
      const passwordHash = await bcrypt.hash(ownerPassword, 12);
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

  // 4. Resolve the actual org ID from the owner's email.
  // The org may have been created by the seed (using BARRACKS_ORG_ID) or by
  // a different path (e.g. Replit agent), so we always look it up via the
  // owner's membership rather than assuming the hardcoded ID is correct.
  const ownerUser = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, ownerEmail))
    .limit(1);

  if (!ownerUser[0]) {
    console.error(`\n✗ Could not find user with email ${ownerEmail} — cannot seed session types.\n`);
    process.exit(1);
  }

  const ownerMembership = await db
    .select({ organisationId: organisationMembersTable.organisationId })
    .from(organisationMembersTable)
    .where(eq(organisationMembersTable.userId, ownerUser[0].id))
    .limit(1);

  if (!ownerMembership[0]) {
    console.error(`\n✗ Could not find org membership for ${ownerEmail} — cannot seed session types.\n`);
    process.exit(1);
  }

  const resolvedOrgId = ownerMembership[0].organisationId;

  // 5. Seed session types into the resolved org
  const BARRACKS_SESSION_TYPES = [
    { id: "st_barracks_sgpt_01",            name: "SGPT",               color: "#ef4444", defaultDurationMinutes: 45,  defaultCapacity: 6  },
    { id: "st_barracks_atc_01",             name: "ATC",                color: "#3b82f6", defaultDurationMinutes: 60,  defaultCapacity: 12 },
    { id: "st_barracks_hyrox_01",           name: "Hyrox",              color: "#a855f7", defaultDurationMinutes: 60,  defaultCapacity: 12 },
    { id: "st_barracks_prime_strength_01",  name: "Prime Strength",     color: "#f59e0b", defaultDurationMinutes: 60,  defaultCapacity: 8  },
    { id: "st_barracks_next_gen_01",        name: "Next Gen Strength",  color: "#10b981", defaultDurationMinutes: 60,  defaultCapacity: 8  },
    { id: "st_barracks_run_club_01",        name: "Run Club",           color: "#06b6d4", defaultDurationMinutes: 60,  defaultCapacity: 20 },
    { id: "st_barracks_other_01",           name: "Other",              color: "#6b7280", defaultDurationMinutes: 60,  defaultCapacity: 12 },
  ];

  let sessionTypesCreated = 0;
  for (const st of BARRACKS_SESSION_TYPES) {
    const existing = await db
      .select()
      .from(sessionTypesTable)
      .where(eq(sessionTypesTable.id, st.id))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(sessionTypesTable).values({
        ...st,
        organisationId: resolvedOrgId,
      });
      sessionTypesCreated++;
    }
  }
  if (sessionTypesCreated > 0) {
    console.log(`✓ Created ${sessionTypesCreated} session types`);
  } else {
    console.log("· Session types already exist, skipping");
  }

  console.log("\n=== Seed complete ===");
  console.log(`\nOrganisation ID : ${resolvedOrgId}`);
  console.log(`Owner email     : ${ownerEmail}`);
  console.log("\nYou can now log in at /login with these credentials.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
