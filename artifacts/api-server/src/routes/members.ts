import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  organisationMembersTable,
  bookingsTable,
  sessionsTable,
  programmeAssignmentsTable,
  programmesTable,
  workoutInstancesTable,
  workoutsTable,
  coachNotesTable,
} from "@workspace/db";
import { eq, and, asc, desc, inArray } from "drizzle-orm";
import { z } from "zod";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();
router.use(requireCoach);

const PatchMemberBody = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(20).nullable().optional(),
  status: z.enum(["ACTIVE", "INACTIVE"]).optional(),
  membershipPlan: z.string().max(100).nullable().optional(),
  membershipStartDate: z.string().datetime().nullable().optional(),
});

const CreateNoteBody = z.object({
  body: z.string().min(1).max(2000),
});

// GET /members — full list with attendance stats, programme name, last/next session
router.get("/members", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const today = new Date().toISOString().slice(0, 10);

  try {
    const memberRows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
        phone: usersTable.phone,
        role: organisationMembersTable.role,
        status: organisationMembersTable.status,
        membershipPlan: organisationMembersTable.membershipPlan,
        joinedAt: organisationMembersTable.createdAt,
      })
      .from(organisationMembersTable)
      .innerJoin(usersTable, eq(organisationMembersTable.userId, usersTable.id))
      .where(eq(organisationMembersTable.organisationId, orgId))
      .orderBy(asc(usersTable.name));

    if (memberRows.length === 0) {
      res.json([]);
      return;
    }

    const memberIds = memberRows.map((m) => m.id);

    const bookings = await db
      .select({
        memberId: bookingsTable.memberId,
        status: bookingsTable.status,
        sessionDate: sessionsTable.date,
      })
      .from(bookingsTable)
      .innerJoin(sessionsTable, eq(bookingsTable.sessionId, sessionsTable.id))
      .where(
        and(
          eq(bookingsTable.organisationId, orgId),
          inArray(bookingsTable.memberId, memberIds),
        ),
      )
      .orderBy(asc(bookingsTable.memberId));

    const assignments = await db
      .select({
        memberId: programmeAssignmentsTable.memberId,
        programmeName: programmesTable.name,
      })
      .from(programmeAssignmentsTable)
      .innerJoin(programmesTable, eq(programmeAssignmentsTable.programmeId, programmesTable.id))
      .where(
        and(
          eq(programmeAssignmentsTable.organisationId, orgId),
          eq(programmeAssignmentsTable.status, "ACTIVE"),
          inArray(programmeAssignmentsTable.memberId, memberIds),
        ),
      )
      .orderBy(asc(programmeAssignmentsTable.memberId));

    const bookingsByMember = new Map<string, Array<{ status: string; sessionDate: string }>>();
    for (const b of bookings) {
      if (!bookingsByMember.has(b.memberId)) bookingsByMember.set(b.memberId, []);
      bookingsByMember.get(b.memberId)!.push(b);
    }

    const programmeByMember = new Map<string, string>();
    for (const a of assignments) {
      if (!programmeByMember.has(a.memberId)) {
        programmeByMember.set(a.memberId, a.programmeName);
      }
    }

    const result = memberRows.map((m) => {
      const mb = bookingsByMember.get(m.id) ?? [];

      // Attendance: ATTENDED / (ATTENDED + NO_SHOW + LATE_CANCEL)
      // Normal CANCELLED bookings do not count against attendance.
      const attended = mb.filter((b) => b.status === "ATTENDED").length;
      const noShow = mb.filter((b) => b.status === "NO_SHOW").length;
      const lateCancel = mb.filter((b) => b.status === "LATE_CANCEL").length;
      const denominator = attended + noShow + lateCancel;
      const attendanceRate = denominator > 0 ? Math.round((attended / denominator) * 100) : null;

      const lastSessionDate =
        mb
          .filter((b) => b.status === "ATTENDED")
          .map((b) => b.sessionDate)
          .sort()
          .at(-1) ?? null;

      const nextBookingDate =
        mb
          .filter((b) => b.status === "BOOKED" && b.sessionDate >= today)
          .map((b) => b.sessionDate)
          .sort()
          .at(0) ?? null;

      return {
        id: m.id,
        name: m.name,
        email: m.email,
        avatarUrl: m.avatarUrl,
        phone: m.phone,
        role: m.role,
        status: m.status,
        membershipPlan: m.membershipPlan,
        joinedAt: m.joinedAt,
        programmeName: programmeByMember.get(m.id) ?? null,
        attendanceRate,
        attendanceAttended: attended,
        attendanceDenominator: denominator,
        lastSessionDate,
        nextBookingDate,
      };
    });

    res.json(result);
  } catch (err) {
    logger.error({ err }, "Members list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /members/:id — full profile; org membership enforced at DB query level
router.get("/members/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const memberId = req.params.id as string;

  try {
    const [memberRow] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        avatarUrl: usersTable.avatarUrl,
        phone: usersTable.phone,
        role: organisationMembersTable.role,
        status: organisationMembersTable.status,
        membershipPlan: organisationMembersTable.membershipPlan,
        membershipStartDate: organisationMembersTable.membershipStartDate,
        joinedAt: organisationMembersTable.createdAt,
      })
      .from(organisationMembersTable)
      .innerJoin(usersTable, eq(organisationMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(organisationMembersTable.organisationId, orgId),
          eq(usersTable.id, memberId),
        ),
      )
      .limit(1);

    if (!memberRow) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const bookings = await db
      .select({
        id: bookingsTable.id,
        status: bookingsTable.status,
        bookedAt: bookingsTable.bookedAt,
        cancelledAt: bookingsTable.cancelledAt,
        feeAmountCents: bookingsTable.feeAmountCents,
        feeReason: bookingsTable.feeReason,
        sessionId: sessionsTable.id,
        sessionName: sessionsTable.name,
        sessionDate: sessionsTable.date,
        sessionStartTime: sessionsTable.startTime,
      })
      .from(bookingsTable)
      .innerJoin(sessionsTable, eq(bookingsTable.sessionId, sessionsTable.id))
      .where(
        and(
          eq(bookingsTable.memberId, memberId),
          eq(bookingsTable.organisationId, orgId),
        ),
      )
      .orderBy(desc(sessionsTable.date));

    const attended = bookings.filter((b) => b.status === "ATTENDED").length;
    const noShow = bookings.filter((b) => b.status === "NO_SHOW").length;
    const lateCancel = bookings.filter((b) => b.status === "LATE_CANCEL").length;
    const denominator = attended + noShow + lateCancel;
    const attendanceRate = denominator > 0 ? Math.round((attended / denominator) * 100) : null;

    const [activeAssignment] = await db
      .select({
        id: programmeAssignmentsTable.id,
        status: programmeAssignmentsTable.status,
        startDate: programmeAssignmentsTable.startDate,
        programmeName: programmesTable.name,
        programmeId: programmesTable.id,
      })
      .from(programmeAssignmentsTable)
      .innerJoin(programmesTable, eq(programmeAssignmentsTable.programmeId, programmesTable.id))
      .where(
        and(
          eq(programmeAssignmentsTable.memberId, memberId),
          eq(programmeAssignmentsTable.organisationId, orgId),
          eq(programmeAssignmentsTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    const recentWorkouts = (
      await db
        .select({
          id: workoutInstancesTable.id,
          status: workoutInstancesTable.status,
          completedAt: workoutInstancesTable.completedAt,
          durationSeconds: workoutInstancesTable.durationSeconds,
          sessionRpe: workoutInstancesTable.sessionRpe,
          workoutName: workoutsTable.name,
        })
        .from(workoutInstancesTable)
        .innerJoin(workoutsTable, eq(workoutInstancesTable.workoutId, workoutsTable.id))
        .where(
          and(
            eq(workoutInstancesTable.memberId, memberId),
            eq(workoutInstancesTable.organisationId, orgId),
          ),
        )
        .orderBy(desc(workoutInstancesTable.createdAt))
    ).slice(0, 10);

    const coachNotes = await db
      .select({
        id: coachNotesTable.id,
        body: coachNotesTable.body,
        createdAt: coachNotesTable.createdAt,
        coachId: coachNotesTable.coachId,
        coachName: usersTable.name,
      })
      .from(coachNotesTable)
      .leftJoin(usersTable, eq(coachNotesTable.coachId, usersTable.id))
      .where(
        and(
          eq(coachNotesTable.memberId, memberId),
          eq(coachNotesTable.organisationId, orgId),
        ),
      )
      .orderBy(desc(coachNotesTable.createdAt));

    res.json({
      ...memberRow,
      attendanceRate,
      attendanceAttended: attended,
      attendanceDenominator: denominator,
      bookings,
      activeAssignment: activeAssignment ?? null,
      recentWorkouts,
      coachNotes,
    });
  } catch (err) {
    logger.error({ err }, "Member profile error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /members/:id — edit name, email, phone, status, membership fields
router.patch("/members/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const memberId = req.params.id as string;

  const parsed = PatchMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [existing] = await db
      .select({ userId: organisationMembersTable.userId })
      .from(organisationMembersTable)
      .where(
        and(
          eq(organisationMembersTable.organisationId, orgId),
          eq(organisationMembersTable.userId, memberId),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const { name, email, phone, status, membershipPlan, membershipStartDate } = parsed.data;

    if (name !== undefined || email !== undefined || phone !== undefined) {
      await db
        .update(usersTable)
        .set({
          ...(name !== undefined && { name }),
          ...(email !== undefined && { email }),
          ...(phone !== undefined && { phone }),
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, memberId));
    }

    if (status !== undefined || membershipPlan !== undefined || membershipStartDate !== undefined) {
      await db
        .update(organisationMembersTable)
        .set({
          ...(status !== undefined && { status }),
          ...(membershipPlan !== undefined && { membershipPlan }),
          ...(membershipStartDate !== undefined && {
            membershipStartDate: membershipStartDate ? new Date(membershipStartDate) : null,
          }),
        })
        .where(
          and(
            eq(organisationMembersTable.organisationId, orgId),
            eq(organisationMembersTable.userId, memberId),
          ),
        );
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Patch member error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /members/:id/notes — add a coach note
router.post("/members/:id/notes", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const memberId = req.params.id as string;

  const parsed = CreateNoteBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  try {
    const [existing] = await db
      .select({ userId: organisationMembersTable.userId })
      .from(organisationMembersTable)
      .where(
        and(
          eq(organisationMembersTable.organisationId, orgId),
          eq(organisationMembersTable.userId, memberId),
        ),
      )
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    const [note] = await db
      .insert(coachNotesTable)
      .values({
        organisationId: orgId,
        memberId,
        coachId: req.user!.id,
        body: parsed.data.body,
      })
      .returning();

    res.status(201).json(note);
  } catch (err) {
    logger.error({ err }, "Create coach note error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
