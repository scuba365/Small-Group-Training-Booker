import { Router } from "express";
import { db } from "@workspace/db";
import {
  programmesTable,
  phasesTable,
  weeksTable,
  daysTable,
  workoutsTable,
  workoutBlocksTable,
  workoutExercisesTable,
  exercisesTable,
  PROGRAMME_STATUSES,
  BLOCK_TYPES,
} from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
import { z } from "zod";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

// All programme routes require COACH or above.
router.use(requireCoach);

// ─── Validation schemas ───────────────────────────────────────────────────────

const PrescriptionFields = z.object({
  sets: z.number().int().positive().optional(),
  repsMin: z.number().int().min(0).optional(),
  repsMax: z.number().int().min(0).optional(),
  loadKg: z.number().min(0).optional(),
  loadPercent1rm: z.number().min(0).max(100).optional(),
  rpe: z.number().min(0).max(10).optional(),
  rir: z.number().int().min(0).optional(),
  tempo: z.string().max(20).optional(),
  restSeconds: z.number().int().min(0).optional(),
  durationSeconds: z.number().int().min(0).optional(),
  distanceMeters: z.number().min(0).optional(),
  pacePerKm: z.string().max(10).optional(),
  calories: z.number().int().min(0).optional(),
  targetTime: z.string().max(50).optional(),
  targetPace: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

const CreateProgrammeBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  status: z.enum(PROGRAMME_STATUSES).optional(),
});

const UpdateProgrammeBody = CreateProgrammeBody.partial();

const CreatePhaseBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const UpdatePhaseBody = CreatePhaseBody.partial();

const CreateWeekBody = z.object({
  weekNumber: z.number().int().positive(),
  label: z.string().max(100).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const UpdateWeekBody = CreateWeekBody.partial();

const CreateDayBody = z.object({
  dayNumber: z.number().int().min(1).max(7),
  label: z.string().max(100).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const UpdateDayBody = CreateDayBody.partial();

const CreateWorkoutBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  orderIndex: z.number().int().min(0).optional(),
});

const UpdateWorkoutBody = CreateWorkoutBody.partial();

const CreateBlockBody = z.object({
  name: z.string().max(100).optional(),
  blockType: z.enum(BLOCK_TYPES).default("STRAIGHT_SET"),
  orderIndex: z.number().int().min(0).optional(),
  rounds: z.number().int().positive().optional(),
  timeCapSeconds: z.number().int().min(0).optional(),
  restBetweenRoundsSeconds: z.number().int().min(0).optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateBlockBody = CreateBlockBody.partial();

const CreateWorkoutExerciseBody = z.object({
  exerciseId: z.string().uuid(),
  orderIndex: z.number().int().min(0).optional(),
}).merge(PrescriptionFields);

const UpdateWorkoutExerciseBody = PrescriptionFields.extend({
  exerciseId: z.string().uuid().optional(),
  orderIndex: z.number().int().min(0).optional(),
});

// ─── Helper: verify programme belongs to org ──────────────────────────────────

async function getProgrammeForOrg(programmeId: string, orgId: string) {
  const [programme] = await db
    .select()
    .from(programmesTable)
    .where(and(eq(programmesTable.id, programmeId), eq(programmesTable.organisationId, orgId)))
    .limit(1);
  return programme ?? null;
}

// Helper to walk up the hierarchy to verify org ownership for nested resources.
async function getPhaseForOrg(phaseId: string, orgId: string) {
  const [row] = await db
    .select({ phase: phasesTable, orgId: programmesTable.organisationId })
    .from(phasesTable)
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(phasesTable.id, phaseId), eq(programmesTable.organisationId, orgId)))
    .limit(1);
  return row?.phase ?? null;
}

async function getWeekForOrg(weekId: string, orgId: string) {
  const [row] = await db
    .select({ week: weeksTable })
    .from(weeksTable)
    .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(weeksTable.id, weekId), eq(programmesTable.organisationId, orgId)))
    .limit(1);
  return row?.week ?? null;
}

async function getDayForOrg(dayId: string, orgId: string) {
  const [row] = await db
    .select({ day: daysTable })
    .from(daysTable)
    .innerJoin(weeksTable, eq(daysTable.weekId, weeksTable.id))
    .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(daysTable.id, dayId), eq(programmesTable.organisationId, orgId)))
    .limit(1);
  return row?.day ?? null;
}

async function getWorkoutForOrg(workoutId: string, orgId: string) {
  const [row] = await db
    .select({ workout: workoutsTable })
    .from(workoutsTable)
    .innerJoin(daysTable, eq(workoutsTable.dayId, daysTable.id))
    .innerJoin(weeksTable, eq(daysTable.weekId, weeksTable.id))
    .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(workoutsTable.id, workoutId), eq(programmesTable.organisationId, orgId)))
    .limit(1);
  return row?.workout ?? null;
}

async function getBlockForOrg(blockId: string, orgId: string) {
  const [row] = await db
    .select({ block: workoutBlocksTable })
    .from(workoutBlocksTable)
    .innerJoin(workoutsTable, eq(workoutBlocksTable.workoutId, workoutsTable.id))
    .innerJoin(daysTable, eq(workoutsTable.dayId, daysTable.id))
    .innerJoin(weeksTable, eq(daysTable.weekId, weeksTable.id))
    .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(workoutBlocksTable.id, blockId), eq(programmesTable.organisationId, orgId)))
    .limit(1);
  return row?.block ?? null;
}

// ─── Programmes ───────────────────────────────────────────────────────────────

// GET /programmes
router.get("/programmes", async (req: Request, res: Response): Promise<void> => {
  try {
    const programmes = await db
      .select()
      .from(programmesTable)
      .where(eq(programmesTable.organisationId, req.organisationId!))
      .orderBy(asc(programmesTable.createdAt));
    res.json(programmes);
  } catch (err) {
    logger.error({ err }, "List programmes error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /programmes
router.post("/programmes", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateProgrammeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [programme] = await db
      .insert(programmesTable)
      .values({
        ...parsed.data,
        organisationId: req.organisationId!,
        createdBy: req.user!.id,
      })
      .returning();
    res.status(201).json(programme);
  } catch (err) {
    logger.error({ err }, "Create programme error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /programmes/:id — full hierarchy
router.get("/programmes/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  try {
    const programme = await getProgrammeForOrg(req.params.id as string, orgId);
    if (!programme) {
      res.status(404).json({ error: "Programme not found" });
      return;
    }

    // Fetch full hierarchy in parallel
    const phases = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.programmeId, programme.id))
      .orderBy(asc(phasesTable.orderIndex));

    const phaseIds = phases.map((p) => p.id);
    if (phaseIds.length === 0) {
      res.json({ ...programme, phases: [] });
      return;
    }

    const weeks = await db
      .select()
      .from(weeksTable)
      .where(eq(weeksTable.phaseId, phaseIds[0]))
      .orderBy(asc(weeksTable.orderIndex));

    // For a full fetch we need all weeks across all phases — build with multiple queries
    // In production this would be a single JOIN; for Sprint 003 clarity, loop is fine.
    const allWeeks: (typeof weeks[number])[] = [];
    for (const phase of phases) {
      const w = await db
        .select()
        .from(weeksTable)
        .where(eq(weeksTable.phaseId, phase.id))
        .orderBy(asc(weeksTable.orderIndex));
      allWeeks.push(...w);
    }

    const allDays: (typeof daysTable.$inferSelect)[] = [];
    for (const week of allWeeks) {
      const d = await db
        .select()
        .from(daysTable)
        .where(eq(daysTable.weekId, week.id))
        .orderBy(asc(daysTable.orderIndex));
      allDays.push(...d);
    }

    const allWorkouts: (typeof workoutsTable.$inferSelect)[] = [];
    for (const day of allDays) {
      const wo = await db
        .select()
        .from(workoutsTable)
        .where(eq(workoutsTable.dayId, day.id))
        .orderBy(asc(workoutsTable.orderIndex));
      allWorkouts.push(...wo);
    }

    const allBlocks: (typeof workoutBlocksTable.$inferSelect)[] = [];
    for (const workout of allWorkouts) {
      const b = await db
        .select()
        .from(workoutBlocksTable)
        .where(eq(workoutBlocksTable.workoutId, workout.id))
        .orderBy(asc(workoutBlocksTable.orderIndex));
      allBlocks.push(...b);
    }

    const allWorkoutExercises: (typeof workoutExercisesTable.$inferSelect & {
      exercise: typeof exercisesTable.$inferSelect | null;
    })[] = [];
    for (const block of allBlocks) {
      const wes = await db
        .select({
          workoutExercise: workoutExercisesTable,
          exercise: exercisesTable,
        })
        .from(workoutExercisesTable)
        .leftJoin(exercisesTable, eq(workoutExercisesTable.exerciseId, exercisesTable.id))
        .where(eq(workoutExercisesTable.blockId, block.id))
        .orderBy(asc(workoutExercisesTable.orderIndex));
      for (const row of wes) {
        allWorkoutExercises.push({ ...row.workoutExercise, exercise: row.exercise });
      }
    }

    // Assemble hierarchy
    const weExByBlock = new Map<string, typeof allWorkoutExercises>();
    for (const we of allWorkoutExercises) {
      const list = weExByBlock.get(we.blockId) ?? [];
      list.push(we);
      weExByBlock.set(we.blockId, list);
    }

    const blocksByWorkout = new Map<string, (typeof allBlocks[number] & { exercises: typeof allWorkoutExercises })[]>();
    for (const block of allBlocks) {
      const list = blocksByWorkout.get(block.workoutId) ?? [];
      list.push({ ...block, exercises: weExByBlock.get(block.id) ?? [] });
      blocksByWorkout.set(block.workoutId, list);
    }

    const workoutsByDay = new Map<string, (typeof allWorkouts[number] & { blocks: typeof allBlocks })[]>();
    for (const wo of allWorkouts) {
      const list = workoutsByDay.get(wo.dayId) ?? [];
      list.push({ ...wo, blocks: blocksByWorkout.get(wo.id) ?? [] } as any);
      workoutsByDay.set(wo.dayId, list);
    }

    const daysByWeek = new Map<string, (typeof allDays[number] & { workouts: typeof allWorkouts })[]>();
    for (const day of allDays) {
      const list = daysByWeek.get(day.weekId) ?? [];
      list.push({ ...day, workouts: workoutsByDay.get(day.id) ?? [] } as any);
      daysByWeek.set(day.weekId, list);
    }

    const weeksByPhase = new Map<string, (typeof allWeeks[number] & { days: typeof allDays })[]>();
    for (const week of allWeeks) {
      const list = weeksByPhase.get(week.phaseId) ?? [];
      list.push({ ...week, days: daysByWeek.get(week.id) ?? [] } as any);
      weeksByPhase.set(week.phaseId, list);
    }

    res.json({
      ...programme,
      phases: phases.map((phase) => ({
        ...phase,
        weeks: weeksByPhase.get(phase.id) ?? [],
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get programme error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /programmes/:id
router.put("/programmes/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateProgrammeBody.safeParse(req.body);
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
      .update(programmesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(programmesTable.id, req.params.id as string), eq(programmesTable.organisationId, req.organisationId!)))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Programme not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update programme error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /programmes/:id — archive (soft)
router.delete("/programmes/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const [archived] = await db
      .update(programmesTable)
      .set({ status: "ARCHIVED", updatedAt: new Date() })
      .where(and(eq(programmesTable.id, req.params.id as string), eq(programmesTable.organisationId, req.organisationId!)))
      .returning({ id: programmesTable.id });
    if (!archived) {
      res.status(404).json({ error: "Programme not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Archive programme error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Phases ───────────────────────────────────────────────────────────────────

// POST /programmes/:id/phases
router.post("/programmes/:id/phases", async (req: Request, res: Response): Promise<void> => {
  const programme = await getProgrammeForOrg(req.params.id as string, req.organisationId!);
  if (!programme) {
    res.status(404).json({ error: "Programme not found" });
    return;
  }
  const parsed = CreatePhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [phase] = await db
      .insert(phasesTable)
      .values({ ...parsed.data, programmeId: programme.id })
      .returning();
    res.status(201).json(phase);
  } catch (err) {
    logger.error({ err }, "Create phase error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /phases/:id
router.put("/phases/:id", async (req: Request, res: Response): Promise<void> => {
  const phase = await getPhaseForOrg(req.params.id as string, req.organisationId!);
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  const parsed = UpdatePhaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db
      .update(phasesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(phasesTable.id, phase.id))
      .returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update phase error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /phases/:id
router.delete("/phases/:id", async (req: Request, res: Response): Promise<void> => {
  const phase = await getPhaseForOrg(req.params.id as string, req.organisationId!);
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  try {
    await db.delete(phasesTable).where(eq(phasesTable.id, phase.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete phase error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Weeks ────────────────────────────────────────────────────────────────────

// POST /phases/:id/weeks
router.post("/phases/:id/weeks", async (req: Request, res: Response): Promise<void> => {
  const phase = await getPhaseForOrg(req.params.id as string, req.organisationId!);
  if (!phase) {
    res.status(404).json({ error: "Phase not found" });
    return;
  }
  const parsed = CreateWeekBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [week] = await db
      .insert(weeksTable)
      .values({ ...parsed.data, phaseId: phase.id })
      .returning();
    res.status(201).json(week);
  } catch (err) {
    logger.error({ err }, "Create week error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /weeks/:id
router.put("/weeks/:id", async (req: Request, res: Response): Promise<void> => {
  const week = await getWeekForOrg(req.params.id as string, req.organisationId!);
  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }
  const parsed = UpdateWeekBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db
      .update(weeksTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(weeksTable.id, week.id))
      .returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update week error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /weeks/:id
router.delete("/weeks/:id", async (req: Request, res: Response): Promise<void> => {
  const week = await getWeekForOrg(req.params.id as string, req.organisationId!);
  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }
  try {
    await db.delete(weeksTable).where(eq(weeksTable.id, week.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete week error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Days ─────────────────────────────────────────────────────────────────────

// POST /weeks/:id/days
router.post("/weeks/:id/days", async (req: Request, res: Response): Promise<void> => {
  const week = await getWeekForOrg(req.params.id as string, req.organisationId!);
  if (!week) {
    res.status(404).json({ error: "Week not found" });
    return;
  }
  const parsed = CreateDayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [day] = await db
      .insert(daysTable)
      .values({ ...parsed.data, weekId: week.id })
      .returning();
    res.status(201).json(day);
  } catch (err) {
    logger.error({ err }, "Create day error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /days/:id
router.put("/days/:id", async (req: Request, res: Response): Promise<void> => {
  const day = await getDayForOrg(req.params.id as string, req.organisationId!);
  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }
  const parsed = UpdateDayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db
      .update(daysTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(daysTable.id, day.id))
      .returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update day error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /days/:id
router.delete("/days/:id", async (req: Request, res: Response): Promise<void> => {
  const day = await getDayForOrg(req.params.id as string, req.organisationId!);
  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }
  try {
    await db.delete(daysTable).where(eq(daysTable.id, day.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete day error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Workouts ─────────────────────────────────────────────────────────────────

// POST /days/:id/workouts
router.post("/days/:id/workouts", async (req: Request, res: Response): Promise<void> => {
  const day = await getDayForOrg(req.params.id as string, req.organisationId!);
  if (!day) {
    res.status(404).json({ error: "Day not found" });
    return;
  }
  const parsed = CreateWorkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [workout] = await db
      .insert(workoutsTable)
      .values({ ...parsed.data, dayId: day.id })
      .returning();
    res.status(201).json(workout);
  } catch (err) {
    logger.error({ err }, "Create workout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /workouts/:id
router.put("/workouts/:id", async (req: Request, res: Response): Promise<void> => {
  const workout = await getWorkoutForOrg(req.params.id as string, req.organisationId!);
  if (!workout) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  const parsed = UpdateWorkoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db
      .update(workoutsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(workoutsTable.id, workout.id))
      .returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update workout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /workouts/:id
router.delete("/workouts/:id", async (req: Request, res: Response): Promise<void> => {
  const workout = await getWorkoutForOrg(req.params.id as string, req.organisationId!);
  if (!workout) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  try {
    await db.delete(workoutsTable).where(eq(workoutsTable.id, workout.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete workout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Blocks ───────────────────────────────────────────────────────────────────

// GET /workouts/:id/blocks
router.get("/workouts/:id/blocks", async (req: Request, res: Response): Promise<void> => {
  const workout = await getWorkoutForOrg(req.params.id as string, req.organisationId!);
  if (!workout) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  try {
    const blocks = await db
      .select()
      .from(workoutBlocksTable)
      .where(eq(workoutBlocksTable.workoutId, workout.id))
      .orderBy(asc(workoutBlocksTable.orderIndex));

    const result = [];
    for (const block of blocks) {
      const exercises = await db
        .select({ workoutExercise: workoutExercisesTable, exercise: exercisesTable })
        .from(workoutExercisesTable)
        .leftJoin(exercisesTable, eq(workoutExercisesTable.exerciseId, exercisesTable.id))
        .where(eq(workoutExercisesTable.blockId, block.id))
        .orderBy(asc(workoutExercisesTable.orderIndex));
      result.push({
        ...block,
        exercises: exercises.map((r) => ({ ...r.workoutExercise, exercise: r.exercise })),
      });
    }
    res.json(result);
  } catch (err) {
    logger.error({ err }, "List blocks error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workouts/:id/blocks
router.post("/workouts/:id/blocks", async (req: Request, res: Response): Promise<void> => {
  const workout = await getWorkoutForOrg(req.params.id as string, req.organisationId!);
  if (!workout) {
    res.status(404).json({ error: "Workout not found" });
    return;
  }
  const parsed = CreateBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [block] = await db
      .insert(workoutBlocksTable)
      .values({ ...parsed.data, workoutId: workout.id })
      .returning();
    res.status(201).json({ ...block, exercises: [] });
  } catch (err) {
    logger.error({ err }, "Create block error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /blocks/:id
router.put("/blocks/:id", async (req: Request, res: Response): Promise<void> => {
  const block = await getBlockForOrg(req.params.id as string, req.organisationId!);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const parsed = UpdateBlockBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [updated] = await db
      .update(workoutBlocksTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(workoutBlocksTable.id, block.id))
      .returning();
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update block error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /blocks/:id
router.delete("/blocks/:id", async (req: Request, res: Response): Promise<void> => {
  const block = await getBlockForOrg(req.params.id as string, req.organisationId!);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  try {
    await db.delete(workoutBlocksTable).where(eq(workoutBlocksTable.id, block.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete block error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ─── Workout Exercises ────────────────────────────────────────────────────────

// POST /blocks/:id/exercises
router.post("/blocks/:id/exercises", async (req: Request, res: Response): Promise<void> => {
  const block = await getBlockForOrg(req.params.id as string, req.organisationId!);
  if (!block) {
    res.status(404).json({ error: "Block not found" });
    return;
  }
  const parsed = CreateWorkoutExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }
  try {
    const [we] = await db
      .insert(workoutExercisesTable)
      .values({ ...parsed.data, blockId: block.id })
      .returning();

    const [exercise] = await db
      .select()
      .from(exercisesTable)
      .where(eq(exercisesTable.id, we.exerciseId))
      .limit(1);

    res.status(201).json({ ...we, exercise: exercise ?? null });
  } catch (err) {
    logger.error({ err }, "Add exercise to block error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /workout-exercises/:id
router.put("/workout-exercises/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  // Verify org ownership via block → workout → day → week → phase → programme
  const [row] = await db
    .select({ we: workoutExercisesTable })
    .from(workoutExercisesTable)
    .innerJoin(workoutBlocksTable, eq(workoutExercisesTable.blockId, workoutBlocksTable.id))
    .innerJoin(workoutsTable, eq(workoutBlocksTable.workoutId, workoutsTable.id))
    .innerJoin(daysTable, eq(workoutsTable.dayId, daysTable.id))
    .innerJoin(weeksTable, eq(daysTable.weekId, weeksTable.id))
    .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(workoutExercisesTable.id, req.params.id as string), eq(programmesTable.organisationId, orgId)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Workout exercise not found" });
    return;
  }

  const parsed = UpdateWorkoutExerciseBody.safeParse(req.body);
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
      .update(workoutExercisesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(workoutExercisesTable.id, row.we.id))
      .returning();

    const [exercise] = await db
      .select()
      .from(exercisesTable)
      .where(eq(exercisesTable.id, updated.exerciseId))
      .limit(1);

    res.json({ ...updated, exercise: exercise ?? null });
  } catch (err) {
    logger.error({ err }, "Update workout exercise error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /workout-exercises/:id
router.delete("/workout-exercises/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  const [row] = await db
    .select({ we: workoutExercisesTable })
    .from(workoutExercisesTable)
    .innerJoin(workoutBlocksTable, eq(workoutExercisesTable.blockId, workoutBlocksTable.id))
    .innerJoin(workoutsTable, eq(workoutBlocksTable.workoutId, workoutsTable.id))
    .innerJoin(daysTable, eq(workoutsTable.dayId, daysTable.id))
    .innerJoin(weeksTable, eq(daysTable.weekId, weeksTable.id))
    .innerJoin(phasesTable, eq(weeksTable.phaseId, phasesTable.id))
    .innerJoin(programmesTable, eq(phasesTable.programmeId, programmesTable.id))
    .where(and(eq(workoutExercisesTable.id, req.params.id as string), eq(programmesTable.organisationId, orgId)))
    .limit(1);

  if (!row) {
    res.status(404).json({ error: "Workout exercise not found" });
    return;
  }

  try {
    await db.delete(workoutExercisesTable).where(eq(workoutExercisesTable.id, row.we.id));
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete workout exercise error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
