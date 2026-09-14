import { Router } from "express";
import { db } from "@workspace/db";
import {
  programmeAssignmentsTable,
  programmesTable,
  ASSIGNMENT_STATUSES,
  usersTable,
  organisationMembersTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

const CreateAssignmentBody = z.object({
  memberId: z.string().min(1),
  programmeId: z.string().min(1),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "startDate must be YYYY-MM-DD"),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "endDate must be YYYY-MM-DD")
    .optional(),
  notes: z.string().max(1000).optional(),
});

const UpdateAssignmentBody = z.object({
  status: z.enum(ASSIGNMENT_STATUSES).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(1000).optional(),
});

// POST /assignments — COACH+ creates a programme assignment for a member
router.post("/assignments", requireCoach, async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { memberId, programmeId, startDate, endDate, notes } = parsed.data;
  const orgId = req.organisationId!;

  try {
    // Verify member belongs to same org
    const [membership] = await db
      .select()
      .from(organisationMembersTable)
      .where(
        and(
          eq(organisationMembersTable.userId, memberId),
          eq(organisationMembersTable.organisationId, orgId),
          eq(organisationMembersTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!membership) {
      res.status(404).json({ error: "Member not found in this organisation" });
      return;
    }

    // Verify programme belongs to same org
    const [programme] = await db
      .select()
      .from(programmesTable)
      .where(
        and(eq(programmesTable.id, programmeId), eq(programmesTable.organisationId, orgId)),
      )
      .limit(1);

    if (!programme) {
      res.status(404).json({ error: "Programme not found" });
      return;
    }

    const [assignment] = await db
      .insert(programmeAssignmentsTable)
      .values({
        organisationId: orgId,
        programmeId,
        memberId,
        startDate,
        endDate: endDate ?? null,
        assignedBy: req.user!.id,
        notes: notes ?? null,
        status: "ACTIVE",
      })
      .returning();

    res.status(201).json(assignment);
  } catch (err) {
    logger.error({ err }, "Create assignment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /assignments — COACH sees all org assignments; MEMBER sees own
router.get("/assignments", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const isCoach = req.user!.role !== "MEMBER";

  try {
    const rows = await db
      .select({
        assignment: programmeAssignmentsTable,
        programme: { id: programmesTable.id, name: programmesTable.name },
        member: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
      })
      .from(programmeAssignmentsTable)
      .innerJoin(programmesTable, eq(programmeAssignmentsTable.programmeId, programmesTable.id))
      .innerJoin(usersTable, eq(programmeAssignmentsTable.memberId, usersTable.id))
      .where(
        and(
          eq(programmeAssignmentsTable.organisationId, orgId),
          isCoach ? undefined : eq(programmeAssignmentsTable.memberId, req.user!.id),
        ),
      )
      .orderBy(desc(programmeAssignmentsTable.createdAt));

    res.json(rows);
  } catch (err) {
    logger.error({ err }, "List assignments error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /assignments/:id — COACH or owner
router.get("/assignments/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const isCoach = req.user!.role !== "MEMBER";

  try {
    const [row] = await db
      .select({
        assignment: programmeAssignmentsTable,
        programme: programmesTable,
        member: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
      })
      .from(programmeAssignmentsTable)
      .innerJoin(programmesTable, eq(programmeAssignmentsTable.programmeId, programmesTable.id))
      .innerJoin(usersTable, eq(programmeAssignmentsTable.memberId, usersTable.id))
      .where(
        and(
          eq(programmeAssignmentsTable.id, req.params.id as string),
          eq(programmeAssignmentsTable.organisationId, orgId),
          isCoach ? undefined : eq(programmeAssignmentsTable.memberId, req.user!.id),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json(row);
  } catch (err) {
    logger.error({ err }, "Get assignment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /assignments/:id — COACH+ updates status / dates / notes
router.patch("/assignments/:id", requireCoach, async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateAssignmentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  try {
    const [updated] = await db
      .update(programmeAssignmentsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(programmeAssignmentsTable.id, req.params.id as string),
          eq(programmeAssignmentsTable.organisationId, req.organisationId!),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update assignment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /assignments/:id — COACH+ removes assignment
router.delete("/assignments/:id", requireCoach, async (req: Request, res: Response): Promise<void> => {
  try {
    const [deleted] = await db
      .delete(programmeAssignmentsTable)
      .where(
        and(
          eq(programmeAssignmentsTable.id, req.params.id as string),
          eq(programmeAssignmentsTable.organisationId, req.organisationId!),
        ),
      )
      .returning({ id: programmeAssignmentsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete assignment error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
