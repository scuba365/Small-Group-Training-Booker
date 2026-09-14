import { Router } from "express";
import { db } from "@workspace/db";
import { exercisesTable, EXERCISE_TYPES } from "@workspace/db";
import { eq, and, or, ilike, isNull, asc } from "drizzle-orm";
import { z } from "zod";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

// All exercise routes require COACH or above.
router.use(requireCoach);

const CreateExerciseBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  exerciseType: z.enum(EXERCISE_TYPES).default("STRENGTH"),
  primaryMuscleGroups: z.string().max(500).optional(),
  equipment: z.string().max(500).optional(),
  videoUrl: z.string().url().optional().or(z.literal("")),
});

const UpdateExerciseBody = CreateExerciseBody.partial();

const ExerciseQueryParams = z.object({
  search: z.string().optional(),
  exerciseType: z.enum(EXERCISE_TYPES).optional(),
  includeGlobal: z
    .string()
    .transform((v) => v !== "false")
    .optional(),
});

// GET /exercises — list org exercises + global built-ins
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
          // Org's own exercises OR global built-ins if requested
          includeGlobal
            ? or(eq(exercisesTable.organisationId, orgId), isNull(exercisesTable.organisationId))
            : eq(exercisesTable.organisationId, orgId),
          eq(exercisesTable.isArchived, false),
          params.search
            ? ilike(exercisesTable.name, `%${params.search}%`)
            : undefined,
          params.exerciseType
            ? eq(exercisesTable.exerciseType, params.exerciseType)
            : undefined,
        ),
      )
      .orderBy(asc(exercisesTable.name));
    res.json(rows);
  } catch (err) {
    logger.error({ err }, "List exercises error");
    res.status(500).json({ error: "Internal server error" });
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
          // Org's own or global
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

// PUT /exercises/:id — update org-owned exercise only
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

// DELETE /exercises/:id — soft delete (archive)
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
