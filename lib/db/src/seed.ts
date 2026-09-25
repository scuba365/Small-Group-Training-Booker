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
  sessionsTable,
  bookingsTable,
  programmesTable,
  phasesTable,
  weeksTable,
  daysTable,
  workoutsTable,
  programmeAssignmentsTable,
  workoutInstancesTable,
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

  // ─── Test member account ─────────────────────────────────────────────────
  // A real MEMBER account for manual testing of the member-facing UI.
  // Password source: TEST_MEMBER_PASSWORD env var (defaults to a printed value).
  // ─────────────────────────────────────────────────────────────────────────

  const TEST_MEMBER_EMAIL = "cahillstephen@hotmail.com";
  const TEST_MEMBER_PASSWORD = process.env.TEST_MEMBER_PASSWORD || "TestMember2026!";
  const TEST_MEMBER_USER_ID   = "user_cahill_test_member_01";
  const TEST_MEMBER_SHIP_ID   = "orgm_cahill_test_member_01";
  const TEST_PROGRAMME_ID     = "prog_barracks_sgpt_test_01";
  const TEST_PHASE_ID         = "phase_barracks_test_01";
  const TEST_WEEK_ID          = "week_barracks_test_01";
  const TEST_DAY_ID           = "day_barracks_test_01";
  const TEST_WORKOUT_ID       = "workout_barracks_test_01";
  const TEST_SESSION_PAST_ID  = "session_barracks_test_past_01";
  const TEST_SESSION_FUTURE_ID = "session_barracks_test_future_01";
  const TEST_ASSIGNMENT_ID    = "assign_barracks_test_01";
  const TEST_BOOKING_PAST_ID  = "booking_barracks_test_past_01";
  const TEST_BOOKING_FUTURE_ID = "booking_barracks_test_future_01";
  const TEST_WORKOUT_INST_ID  = "wi_barracks_test_01";

  console.log("\n─── Test member account ───────────────────────────────");

  // 6. Test user
  const existingTestUser = await db.select().from(usersTable)
    .where(eq(usersTable.id, TEST_MEMBER_USER_ID)).limit(1);

  if (existingTestUser.length === 0) {
    const byEmail = await db.select().from(usersTable)
      .where(eq(usersTable.email, TEST_MEMBER_EMAIL)).limit(1);
    if (byEmail.length === 0) {
      const hash = await bcrypt.hash(TEST_MEMBER_PASSWORD, 12);
      await db.insert(usersTable).values({
        id: TEST_MEMBER_USER_ID,
        email: TEST_MEMBER_EMAIL,
        passwordHash: hash,
        name: "Stephen Cahill",
        phone: "+353861234567",
      });
      console.log(`✓ Created test member user: ${TEST_MEMBER_EMAIL}`);
    } else {
      console.log(`· Test user already exists (different ID), skipping`);
    }
  } else {
    console.log("· Test member user already exists, skipping");
  }

  // 7. Test org membership (MEMBER role)
  const existingTestMembership = await db.select().from(organisationMembersTable)
    .where(eq(organisationMembersTable.id, TEST_MEMBER_SHIP_ID)).limit(1);

  if (existingTestMembership.length === 0) {
    const testUser = await db.select().from(usersTable)
      .where(eq(usersTable.email, TEST_MEMBER_EMAIL)).limit(1);
    if (testUser[0]) {
      const alreadyMember = await db.select().from(organisationMembersTable)
        .where(eq(organisationMembersTable.userId, testUser[0].id)).limit(1);
      if (alreadyMember.length === 0) {
        await db.insert(organisationMembersTable).values({
          id: TEST_MEMBER_SHIP_ID,
          organisationId: resolvedOrgId,
          userId: testUser[0].id,
          role: "MEMBER",
          status: "ACTIVE",
          membershipPlan: "Monthly SGPT",
          membershipStartDate: new Date("2026-01-01"),
        });
        console.log("✓ Created MEMBER membership for test account");
      } else {
        console.log("· Test member org membership already exists, skipping");
      }
    }
  } else {
    console.log("· Test member membership already exists, skipping");
  }

  // 8. Test programme hierarchy: programme → phase → week → day → workout
  const existingProg = await db.select().from(programmesTable)
    .where(eq(programmesTable.id, TEST_PROGRAMME_ID)).limit(1);

  if (existingProg.length === 0) {
    await db.insert(programmesTable).values({
      id: TEST_PROGRAMME_ID,
      organisationId: resolvedOrgId,
      name: "SGPT Test Block",
      description: "Test programme for the dev member account",
      status: "ACTIVE",
    });

    await db.insert(phasesTable).values({
      id: TEST_PHASE_ID,
      programmeId: TEST_PROGRAMME_ID,
      name: "Phase 1 — Foundation",
      orderIndex: 0,
    });

    await db.insert(weeksTable).values({
      id: TEST_WEEK_ID,
      phaseId: TEST_PHASE_ID,
      weekNumber: 1,
      label: "Week 1",
      orderIndex: 0,
    });

    await db.insert(daysTable).values({
      id: TEST_DAY_ID,
      weekId: TEST_WEEK_ID,
      dayNumber: 1,
      label: "Session A",
      orderIndex: 0,
    });

    await db.insert(workoutsTable).values({
      id: TEST_WORKOUT_ID,
      dayId: TEST_DAY_ID,
      organisationId: resolvedOrgId,
      name: "SGPT Session A — Test",
      orderIndex: 0,
    });

    console.log("✓ Created test programme hierarchy");
  } else {
    console.log("· Test programme already exists, skipping");
  }

  // 9. Programme assignment for test member
  const existingAssignment = await db.select().from(programmeAssignmentsTable)
    .where(eq(programmeAssignmentsTable.id, TEST_ASSIGNMENT_ID)).limit(1);

  if (existingAssignment.length === 0) {
    const testUser2 = await db.select().from(usersTable)
      .where(eq(usersTable.email, TEST_MEMBER_EMAIL)).limit(1);
    if (testUser2[0]) {
      await db.insert(programmeAssignmentsTable).values({
        id: TEST_ASSIGNMENT_ID,
        organisationId: resolvedOrgId,
        programmeId: TEST_PROGRAMME_ID,
        memberId: testUser2[0].id,
        status: "ACTIVE",
        startDate: "2026-09-01",
      });
      console.log("✓ Created test programme assignment");
    }
  } else {
    console.log("· Test assignment already exists, skipping");
  }

  // 10. Test sessions (past attended + upcoming booked)
  const existingSessionPast = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.id, TEST_SESSION_PAST_ID)).limit(1);

  if (existingSessionPast.length === 0) {
    await db.insert(sessionsTable).values({
      id: TEST_SESSION_PAST_ID,
      organisationId: resolvedOrgId,
      name: "SGPT — Test Session (Past)",
      date: "2026-09-10",
      startTime: "06:00",
      durationMinutes: 45,
      capacity: 6,
      status: "SCHEDULED",
    });
    console.log("✓ Created past test session (2026-09-10)");
  } else {
    console.log("· Past test session already exists, skipping");
  }

  const existingSessionFuture = await db.select().from(sessionsTable)
    .where(eq(sessionsTable.id, TEST_SESSION_FUTURE_ID)).limit(1);

  if (existingSessionFuture.length === 0) {
    await db.insert(sessionsTable).values({
      id: TEST_SESSION_FUTURE_ID,
      organisationId: resolvedOrgId,
      name: "SGPT — Test Session (Upcoming)",
      date: "2026-10-10",
      startTime: "06:00",
      durationMinutes: 45,
      capacity: 6,
      status: "SCHEDULED",
    });
    console.log("✓ Created upcoming test session (2026-10-10)");
  } else {
    console.log("· Upcoming test session already exists, skipping");
  }

  // 11. Bookings (past ATTENDED + future BOOKED)
  const testUser3 = await db.select().from(usersTable)
    .where(eq(usersTable.email, TEST_MEMBER_EMAIL)).limit(1);

  if (testUser3[0]) {
    const existingBookingPast = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.id, TEST_BOOKING_PAST_ID)).limit(1);
    if (existingBookingPast.length === 0) {
      await db.insert(bookingsTable).values({
        id: TEST_BOOKING_PAST_ID,
        organisationId: resolvedOrgId,
        sessionId: TEST_SESSION_PAST_ID,
        memberId: testUser3[0].id,
        status: "ATTENDED",
      });
      console.log("✓ Created past ATTENDED booking");
    } else {
      console.log("· Past booking already exists, skipping");
    }

    const existingBookingFuture = await db.select().from(bookingsTable)
      .where(eq(bookingsTable.id, TEST_BOOKING_FUTURE_ID)).limit(1);
    if (existingBookingFuture.length === 0) {
      await db.insert(bookingsTable).values({
        id: TEST_BOOKING_FUTURE_ID,
        organisationId: resolvedOrgId,
        sessionId: TEST_SESSION_FUTURE_ID,
        memberId: testUser3[0].id,
        status: "BOOKED",
      });
      console.log("✓ Created upcoming BOOKED booking");
    } else {
      console.log("· Future booking already exists, skipping");
    }
  }

  // 12. Completed workout instance
  const existingWI = await db.select().from(workoutInstancesTable)
    .where(eq(workoutInstancesTable.id, TEST_WORKOUT_INST_ID)).limit(1);

  if (existingWI.length === 0) {
    const testUser4 = await db.select().from(usersTable)
      .where(eq(usersTable.email, TEST_MEMBER_EMAIL)).limit(1);
    if (testUser4[0]) {
      await db.insert(workoutInstancesTable).values({
        id: TEST_WORKOUT_INST_ID,
        organisationId: resolvedOrgId,
        assignmentId: TEST_ASSIGNMENT_ID,
        workoutId: TEST_WORKOUT_ID,
        memberId: testUser4[0].id,
        status: "COMPLETED",
        startedAt: new Date("2026-09-10T06:00:00Z"),
        completedAt: new Date("2026-09-10T06:45:00Z"),
        durationSeconds: 2700,
        sessionRpe: 7,
      });
      console.log("✓ Created completed workout instance");
    }
  } else {
    console.log("· Test workout instance already exists, skipping");
  }

  console.log("\n=== Seed complete ===");
  console.log(`\nOrganisation ID : ${resolvedOrgId}`);
  console.log(`Owner email     : ${ownerEmail}`);
  console.log(`\nTest member email    : ${TEST_MEMBER_EMAIL}`);
  console.log(`Test member password : ${TEST_MEMBER_PASSWORD}`);
  console.log("  (override with TEST_MEMBER_PASSWORD env var)");
  console.log("\nYou can now log in at /login with either account.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
