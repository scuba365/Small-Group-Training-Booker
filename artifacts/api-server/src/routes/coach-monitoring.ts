import { Router } from "express";
import { db } from "@workspace/db";
import {
  workoutInstancesTable,
  programmeAssignmentsTable,
  programmesTable,
  workoutsTable,
  exerciseInstancesTable,
  setLogsTable,
  usersTable,
  organisationMembersTable,
} from "@workspace/db";
import { eq, and, desc, inArray, asc } from "drizzle-orm";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

// All coach monitoring routes require COACH+
router.use(requireCoach);

// GET /coach/workout-instances — all org member workout instances with summary
router.get("/coach/workout-instances", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;

  try {
    const instances = await db
      .select({
        instance: workoutInstancesTable,
        member: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
        workout: { id: workoutsTable.id, name: workoutsTable.name },
        programme: { id: programmesTable.id, name: programmesTable.name },
      })
      .from(workoutInstancesTable)
      .innerJoin(usersTable, eq(workoutInstancesTable.memberId, usersTable.id))
      .innerJoin(workoutsTable, eq(workoutInstancesTable.workoutId, workoutsTable.id))
      .innerJoin(
        programmeAssignmentsTable,
        eq(workoutInstancesTable.assignmentId, programmeAssignmentsTable.id),
      )
      .innerJoin(programmesTable, eq(programmeAssignmentsTable.programmeId, programmesTable.id))
      .where(eq(workoutInstancesTable.organisationId, orgId))
      .orderBy(desc(workoutInstancesTable.createdAt));

    res.json(instances);
  } catch (err) {
    logger.error({ err }, "Coach workout instances list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /coach/workout-instances/:id — detailed view of a member's workout with all set data
router.get(
  "/coach/workout-instances/:id",
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.organisationId!;
    const instanceId = req.params.id as string;

    try {
      const [instance] = await db
        .select({
          instance: workoutInstancesTable,
          member: { id: usersTable.id, name: usersTable.name },
          workout: { id: workoutsTable.id, name: workoutsTable.name },
        })
        .from(workoutInstancesTable)
        .innerJoin(usersTable, eq(workoutInstancesTable.memberId, usersTable.id))
        .innerJoin(workoutsTable, eq(workoutInstancesTable.workoutId, workoutsTable.id))
        .where(
          and(
            eq(workoutInstancesTable.id, instanceId),
            eq(workoutInstancesTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!instance) {
        res.status(404).json({ error: "Workout instance not found" });
        return;
      }

      // Load exercise instances with exercise names
      const exerciseInstances = await db
        .select({ ei: exerciseInstancesTable, exercise: usersTable })
        .from(exerciseInstancesTable)
        .where(eq(exerciseInstancesTable.workoutInstanceId, instanceId))
        .orderBy(asc(exerciseInstancesTable.orderIndex));

      // Load set logs
      const setLogs =
        exerciseInstances.length > 0
          ? await db
              .select()
              .from(setLogsTable)
              .where(
                inArray(
                  setLogsTable.exerciseInstanceId,
                  exerciseInstances.map((e) => e.ei.id),
                ),
              )
              .orderBy(asc(setLogsTable.setNumber))
          : [];

      const exercisesWithSets = exerciseInstances.map((row) => ({
        exerciseInstance: row.ei,
        sets: setLogs.filter((s) => s.exerciseInstanceId === row.ei.id),
      }));

      res.json({ ...instance, exercises: exercisesWithSets });
    } catch (err) {
      logger.error({ err }, "Coach workout instance detail error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// GET /coach/assignments — all org programme assignments with member and programme details
router.get("/coach/assignments", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;

  try {
    const rows = await db
      .select({
        assignment: programmeAssignmentsTable,
        member: { id: usersTable.id, name: usersTable.name, email: usersTable.email },
        programme: { id: programmesTable.id, name: programmesTable.name },
      })
      .from(programmeAssignmentsTable)
      .innerJoin(usersTable, eq(programmeAssignmentsTable.memberId, usersTable.id))
      .innerJoin(programmesTable, eq(programmeAssignmentsTable.programmeId, programmesTable.id))
      .where(eq(programmeAssignmentsTable.organisationId, orgId))
      .orderBy(desc(programmeAssignmentsTable.createdAt));

    res.json(rows);
  } catch (err) {
    logger.error({ err }, "Coach assignments list error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /coach/members — list all active org members (for assignment + preview picker)
router.get("/coach/members", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  try {
    const rows = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        role: organisationMembersTable.role,
      })
      .from(organisationMembersTable)
      .innerJoin(usersTable, eq(organisationMembersTable.userId, usersTable.id))
      .where(
        and(
          eq(organisationMembersTable.organisationId, orgId),
          eq(organisationMembersTable.status, "ACTIVE"),
        ),
      )
      .orderBy(asc(usersTable.name));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "List members error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
