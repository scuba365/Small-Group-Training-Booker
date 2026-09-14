import { Router } from "express";
import { db } from "@workspace/db";
import {
  programmeAssignmentsTable,
  workoutInstancesTable,
  exerciseInstancesTable,
  setLogsTable,
  workoutsTable,
  workoutBlocksTable,
  workoutExercisesTable,
  exercisesTable,
  phasesTable,
  weeksTable,
  daysTable,
} from "@workspace/db";
import { eq, and, asc, desc, ne, inArray } from "drizzle-orm";
import { z } from "zod";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

const StartWorkoutBody = z.object({
  assignmentId: z.string().min(1),
  workoutId: z.string().min(1),
});

const CompleteWorkoutBody = z.object({
  status: z.enum(["COMPLETED"]).optional(),
  sessionRpe: z.number().int().min(1).max(10).optional(),
  notes: z.string().max(2000).optional(),
});

const LogSetBody = z.object({
  setNumber: z.number().int().min(1),
  reps: z.number().int().min(0).optional(),
  loadKg: z.number().min(0).optional(),
  rpe: z.number().min(0).max(10).optional(),
  rir: z.number().int().min(0).optional(),
  distanceMeters: z.number().min(0).optional(),
  timeSeconds: z.number().int().min(0).optional(),
  pacePerKm: z.string().max(10).optional(),
  calories: z.number().int().min(0).optional(),
  completed: z.boolean().optional(),
});

// POST /workout-instances — member starts a workout
router.post("/workout-instances", async (req: Request, res: Response): Promise<void> => {
  const parsed = StartWorkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const { assignmentId, workoutId } = parsed.data;
  const memberId = req.user!.id;
  const orgId = req.organisationId!;

  try {
    // Verify assignment belongs to this member
    const [assignment] = await db
      .select()
      .from(programmeAssignmentsTable)
      .where(
        and(
          eq(programmeAssignmentsTable.id, assignmentId),
          eq(programmeAssignmentsTable.memberId, memberId),
          eq(programmeAssignmentsTable.organisationId, orgId),
          eq(programmeAssignmentsTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!assignment) {
      res.status(404).json({ error: "Assignment not found" });
      return;
    }

    // Verify the workout belongs to the assigned programme
    const [workoutCheck] = await db
      .select({ id: workoutsTable.id })
      .from(workoutsTable)
      .innerJoin(daysTable, eq(workoutsTable.dayId, daysTable.id))
      .innerJoin(weeksTable, eq(daysTable.weekId, weeksTable.id))
      .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
      .where(
        and(
          eq(workoutsTable.id, workoutId),
          eq(phasesTable.programmeId, assignment.programmeId),
        ),
      )
      .limit(1);

    if (!workoutCheck) {
      res.status(403).json({ error: "Workout not in assigned programme" });
      return;
    }

    // Create the workout instance
    const [instance] = await db
      .insert(workoutInstancesTable)
      .values({
        organisationId: orgId,
        assignmentId,
        workoutId,
        memberId,
        status: "IN_PROGRESS",
        startedAt: new Date(),
      })
      .returning();

    // Auto-create exercise instances for all exercises in this workout
    const workoutExercises = await db
      .select({
        we: workoutExercisesTable,
        block: workoutBlocksTable,
      })
      .from(workoutExercisesTable)
      .innerJoin(workoutBlocksTable, eq(workoutExercisesTable.blockId, workoutBlocksTable.id))
      .where(eq(workoutBlocksTable.workoutId, workoutId))
      .orderBy(asc(workoutBlocksTable.orderIndex), asc(workoutExercisesTable.orderIndex));

    if (workoutExercises.length > 0) {
      await db.insert(exerciseInstancesTable).values(
        workoutExercises.map((row, idx) => ({
          workoutInstanceId: instance.id,
          workoutExerciseId: row.we.id,
          exerciseId: row.we.exerciseId,
          orderIndex: idx,
        })),
      );
    }

    res.status(201).json({ id: instance.id });
  } catch (err) {
    logger.error({ err }, "Start workout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /workout-instances/:id — full instance with exercises, sets, prescriptions, previous performance
router.get("/workout-instances/:id", async (req: Request, res: Response): Promise<void> => {
  const instanceId = req.params.id as string;
  const orgId = req.organisationId!;
  const isCoach = req.user!.role !== "MEMBER";

  try {
    const [instance] = await db
      .select()
      .from(workoutInstancesTable)
      .where(
        and(
          eq(workoutInstancesTable.id, instanceId),
          eq(workoutInstancesTable.organisationId, orgId),
          isCoach ? undefined : eq(workoutInstancesTable.memberId, req.user!.id),
        ),
      )
      .limit(1);

    if (!instance) {
      res.status(404).json({ error: "Workout instance not found" });
      return;
    }

    // Load workout template: blocks + exercises with prescription
    const blocks = await db
      .select()
      .from(workoutBlocksTable)
      .where(eq(workoutBlocksTable.workoutId, instance.workoutId))
      .orderBy(asc(workoutBlocksTable.orderIndex));

    const templateExercises =
      blocks.length > 0
        ? await db
            .select({ we: workoutExercisesTable, exercise: exercisesTable })
            .from(workoutExercisesTable)
            .innerJoin(exercisesTable, eq(workoutExercisesTable.exerciseId, exercisesTable.id))
            .where(inArray(workoutExercisesTable.blockId, blocks.map((b) => b.id)))
            .orderBy(asc(workoutExercisesTable.orderIndex))
        : [];

    // Load exercise instances
    const exerciseInstances = await db
      .select()
      .from(exerciseInstancesTable)
      .where(eq(exerciseInstancesTable.workoutInstanceId, instanceId))
      .orderBy(asc(exerciseInstancesTable.orderIndex));

    // Load set logs
    const setLogs =
      exerciseInstances.length > 0
        ? await db
            .select()
            .from(setLogsTable)
            .where(inArray(setLogsTable.exerciseInstanceId, exerciseInstances.map((ei) => ei.id)))
            .orderBy(asc(setLogsTable.setNumber))
        : [];

    // Load previous performance for each exercise
    const previousPerformance: Record<string, { completedAt: Date | null; sets: typeof setLogs }> =
      {};

    for (const ei of exerciseInstances) {
      const [prevEI] = await db
        .select({ id: exerciseInstancesTable.id, completedAt: workoutInstancesTable.completedAt })
        .from(exerciseInstancesTable)
        .innerJoin(
          workoutInstancesTable,
          eq(exerciseInstancesTable.workoutInstanceId, workoutInstancesTable.id),
        )
        .where(
          and(
            eq(exerciseInstancesTable.exerciseId, ei.exerciseId),
            eq(workoutInstancesTable.memberId, instance.memberId),
            eq(workoutInstancesTable.status, "COMPLETED"),
            ne(workoutInstancesTable.id, instanceId),
          ),
        )
        .orderBy(desc(workoutInstancesTable.completedAt))
        .limit(1);

      if (prevEI) {
        const prevSets = await db
          .select()
          .from(setLogsTable)
          .where(eq(setLogsTable.exerciseInstanceId, prevEI.id))
          .orderBy(asc(setLogsTable.setNumber));

        previousPerformance[ei.id] = { completedAt: prevEI.completedAt, sets: prevSets };
      }
    }

    // Assemble response
    const blocksWithExercises = blocks.map((block) => {
      const blockTemplateExercises = templateExercises.filter((te) => te.we.blockId === block.id);

      const exercises = blockTemplateExercises.map((te) => {
        const ei = exerciseInstances.find((e) => e.workoutExerciseId === te.we.id);
        return {
          exerciseInstanceId: ei?.id ?? null,
          workoutExerciseId: te.we.id,
          exercise: te.exercise,
          prescription: {
            sets: te.we.sets,
            repsMin: te.we.repsMin,
            repsMax: te.we.repsMax,
            loadKg: te.we.loadKg,
            loadPercent1rm: te.we.loadPercent1rm,
            rpe: te.we.rpe,
            rir: te.we.rir,
            tempo: te.we.tempo,
            restSeconds: te.we.restSeconds,
            durationSeconds: te.we.durationSeconds,
            distanceMeters: te.we.distanceMeters,
            pacePerKm: te.we.pacePerKm,
            calories: te.we.calories,
            targetTime: te.we.targetTime,
            targetPace: te.we.targetPace,
            notes: te.we.notes,
          },
          sets: ei ? setLogs.filter((s) => s.exerciseInstanceId === ei.id) : [],
          previousPerformance: ei ? (previousPerformance[ei.id] ?? null) : null,
        };
      });

      return { ...block, exercises };
    });

    res.json({ ...instance, blocks: blocksWithExercises });
  } catch (err) {
    logger.error({ err }, "Get workout instance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PATCH /workout-instances/:id — complete the workout or update notes/session RPE
router.patch("/workout-instances/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = CompleteWorkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  const instanceId = req.params.id as string;
  const orgId = req.organisationId!;

  try {
    const [instance] = await db
      .select()
      .from(workoutInstancesTable)
      .where(
        and(
          eq(workoutInstancesTable.id, instanceId),
          eq(workoutInstancesTable.organisationId, orgId),
          eq(workoutInstancesTable.memberId, req.user!.id),
        ),
      )
      .limit(1);

    if (!instance) {
      res.status(404).json({ error: "Workout instance not found" });
      return;
    }

    const completedAt = parsed.data.status === "COMPLETED" ? new Date() : undefined;
    const durationSeconds =
      parsed.data.status === "COMPLETED" && instance.startedAt
        ? Math.floor((Date.now() - instance.startedAt.getTime()) / 1000)
        : undefined;

    const [updated] = await db
      .update(workoutInstancesTable)
      .set({
        ...(parsed.data.status && { status: parsed.data.status }),
        ...(parsed.data.sessionRpe !== undefined && { sessionRpe: parsed.data.sessionRpe }),
        ...(parsed.data.notes !== undefined && { notes: parsed.data.notes }),
        ...(completedAt && { completedAt }),
        ...(durationSeconds !== undefined && { durationSeconds }),
        updatedAt: new Date(),
      })
      .where(eq(workoutInstancesTable.id, instanceId))
      .returning();

    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update workout instance error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workout-instances/:id/exercises/:exerciseInstanceId/sets — log a set
router.post(
  "/workout-instances/:id/exercises/:exerciseInstanceId/sets",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = LogSetBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    const instanceId = req.params.id as string;
    const exerciseInstanceId = req.params.exerciseInstanceId as string;
    const orgId = req.organisationId!;

    try {
      // Verify ownership
      const [instance] = await db
        .select()
        .from(workoutInstancesTable)
        .where(
          and(
            eq(workoutInstancesTable.id, instanceId),
            eq(workoutInstancesTable.memberId, req.user!.id),
            eq(workoutInstancesTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!instance) {
        res.status(404).json({ error: "Workout instance not found" });
        return;
      }

      // Verify exercise instance belongs to this workout
      const [ei] = await db
        .select()
        .from(exerciseInstancesTable)
        .where(
          and(
            eq(exerciseInstancesTable.id, exerciseInstanceId),
            eq(exerciseInstancesTable.workoutInstanceId, instanceId),
          ),
        )
        .limit(1);

      if (!ei) {
        res.status(404).json({ error: "Exercise instance not found" });
        return;
      }

      const [setLog] = await db
        .insert(setLogsTable)
        .values({ exerciseInstanceId, ...parsed.data })
        .returning();

      res.status(201).json(setLog);
    } catch (err) {
      logger.error({ err }, "Log set error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// PUT /workout-instances/:id/exercises/:exerciseInstanceId/sets/:setId — update a set
router.put(
  "/workout-instances/:id/exercises/:exerciseInstanceId/sets/:setId",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = LogSetBody.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    const instanceId = req.params.id as string;
    const setId = req.params.setId as string;
    const orgId = req.organisationId!;

    try {
      // Verify ownership via workout instance
      const [instance] = await db
        .select()
        .from(workoutInstancesTable)
        .where(
          and(
            eq(workoutInstancesTable.id, instanceId),
            eq(workoutInstancesTable.memberId, req.user!.id),
            eq(workoutInstancesTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!instance) {
        res.status(404).json({ error: "Workout instance not found" });
        return;
      }

      const [updated] = await db
        .update(setLogsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(setLogsTable.id, setId))
        .returning();

      if (!updated) {
        res.status(404).json({ error: "Set not found" });
        return;
      }

      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Update set error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// DELETE /workout-instances/:id/exercises/:exerciseInstanceId/sets/:setId
router.delete(
  "/workout-instances/:id/exercises/:exerciseInstanceId/sets/:setId",
  async (req: Request, res: Response): Promise<void> => {
    const instanceId = req.params.id as string;
    const setId = req.params.setId as string;
    const orgId = req.organisationId!;

    try {
      const [instance] = await db
        .select()
        .from(workoutInstancesTable)
        .where(
          and(
            eq(workoutInstancesTable.id, instanceId),
            eq(workoutInstancesTable.memberId, req.user!.id),
            eq(workoutInstancesTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!instance) {
        res.status(404).json({ error: "Workout instance not found" });
        return;
      }

      const [deleted] = await db
        .delete(setLogsTable)
        .where(eq(setLogsTable.id, setId))
        .returning({ id: setLogsTable.id });

      if (!deleted) {
        res.status(404).json({ error: "Set not found" });
        return;
      }

      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Delete set error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
