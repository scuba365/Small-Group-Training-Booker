import { Router } from "express";
import { db } from "@workspace/db";
import { exercisesTable, EXERCISE_TYPES, MUSCLE_GROUPS, EQUIPMENT_OPTIONS } from "@workspace/db";
import { eq, and, or, ilike, isNull, asc } from "drizzle-orm";
import { z } from "zod";
import { requireOwner, requireCoach } from "../middleware/require-role";
import { importFreeExerciseLibrary } from "@workspace/db/seed-exercises";
import { ImportExerciseLibraryResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

router.use(requireCoach);

const MuscleGroupsSchema = z.array(z.enum(MUSCLE_GROUPS)).optional();
const EquipmentSchema = z.array(z.enum(EQUIPMENT_OPTIONS)).optional();

const CreateExerciseBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  instructions: z.string().max(10000).optional(),
  exerciseType: z.enum(EXERCISE_TYPES).default("STRENGTH"),
  primaryMuscleGroups: MuscleGroupsSchema,
  equipment: EquipmentSchema,
  videoUrl: z.string().url().optional().or(z.literal("")),
});

const UpdateExerciseBody = CreateExerciseBody.partial();

const ExerciseQueryParams = z.object({
  search: z.string().optional(),
  exerciseType: z.enum(EXERCISE_TYPES).optional(),
  muscleGroup: z.string().optional(),
  includeGlobal: z
    .string()
    .transform((v) => v !== "false")
    .optional(),
});

// GET /exercises
router.get("/exercises", async (req: Request, res: Response): Promise<void> => {
  const parsed = ExerciseQueryParams.safeParse(req.query);
  const params = parsed.success ? parsed.data : {};
  const orgId = req.organisationId!;

  try {
    const includeGlobal = params.includeGlobal !== false;

    const rows = await db
      .select()
      .from(exercisesTable)
      .where(
        and(
          includeGlobal
            ? or(eq(exercisesTable.organisationId, orgId), isNull(exercisesTable.organisationId))
            : eq(exercisesTable.organisationId, orgId),
          eq(exercisesTable.isArchived, false),
          params.search ? ilike(exercisesTable.name, `%${params.search}%`) : undefined,
          params.exerciseType ? eq(exercisesTable.exerciseType, params.exerciseType) : undefined,
        ),
      )
      .orderBy(asc(exercisesTable.name));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "List exercises error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /exercises/import-library — explicitly requested by an owner; never on startup.
router.post("/exercises/import-library", requireOwner, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await importFreeExerciseLibrary();
    req.log.info({ imported: result.imported, alreadyPresent: result.alreadyPresent }, "Exercise library import completed");
    res.json(ImportExerciseLibraryResponse.parse(result));
  } catch (err) {
    req.log.error({ err }, "Exercise library import failed");
    res.status(500).json({ error: "Could not import the exercise library. Please try again." });
  }
});

// GET /exercises/:id
router.get("/exercises/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  try {
    const [exercise] = await db
      .select()
      .from(exercisesTable)
      .where(
        and(
          eq(exercisesTable.id, req.params.id as string),
          eq(exercisesTable.isArchived, false),
          or(eq(exercisesTable.organisationId, orgId), isNull(exercisesTable.organisationId)),
        ),
      )
      .limit(1);

    if (!exercise) {
      res.status(404).json({ error: "Exercise not found" });
      return;
    }
    res.json(exercise);
  } catch (err) {
    logger.error({ err }, "Get exercise error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /exercises
router.post("/exercises", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateExerciseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  try {
    const [exercise] = await db
      .insert(exercisesTable)
      .values({
        ...parsed.data,
        organisationId: req.organisationId!,
        createdBy: req.user!.id,
      })
      .returning();

    res.status(201).json(exercise);
  } catch (err) {
    logger.error({ err }, "Create exercise error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// PUT /exercises/:id
router.put("/exercises/:id", async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateExerciseBody.safeParse(req.body);
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
      .update(exercisesTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(exercisesTable.id, req.params.id as string),
          eq(exercisesTable.organisationId, req.organisationId!),
          eq(exercisesTable.isArchived, false),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Exercise not found or not editable" });
      return;
    }
    res.json(updated);
  } catch (err) {
    logger.error({ err }, "Update exercise error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /exercises/:id — soft delete
router.delete("/exercises/:id", async (req: Request, res: Response): Promise<void> => {
  try {
    const [archived] = await db
      .update(exercisesTable)
      .set({ isArchived: true, updatedAt: new Date() })
      .where(
        and(
          eq(exercisesTable.id, req.params.id as string),
          eq(exercisesTable.organisationId, req.organisationId!),
        ),
      )
      .returning({ id: exercisesTable.id });

    if (!archived) {
      res.status(404).json({ error: "Exercise not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Archive exercise error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
