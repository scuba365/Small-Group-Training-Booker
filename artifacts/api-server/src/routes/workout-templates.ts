import { Router } from "express";
import { db } from "@workspace/db";
import {
  workoutsTable,
  workoutBlocksTable,
  workoutExercisesTable,
  exercisesTable,
  daysTable,
} from "@workspace/db";
import { eq, and, asc, isNull } from "drizzle-orm";
import { z } from "zod";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

router.use(requireCoach);

const CreateTemplateBody = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
});

// GET /workout-templates — list org's standalone workout templates
router.get("/workout-templates", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  try {
    const templates = await db
      .select()
      .from(workoutsTable)
      .where(
        and(
          eq(workoutsTable.isTemplate, true),
          eq(workoutsTable.organisationId, orgId),
          isNull(workoutsTable.dayId),
        ),
      )
      .orderBy(asc(workoutsTable.name));
    res.json(templates);
  } catch (err) {
    logger.error({ err }, "List workout templates error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /workout-templates/:id — single template with blocks+exercises
router.get("/workout-templates/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  try {
    const [template] = await db
      .select()
      .from(workoutsTable)
      .where(
        and(
          eq(workoutsTable.id, req.params.id as string),
          eq(workoutsTable.isTemplate, true),
          eq(workoutsTable.organisationId, orgId),
        ),
      )
      .limit(1);
    if (!template) {
      res.status(404).json({ error: "Template not found" });
      return;
    }

    const blocks = await db
      .select()
      .from(workoutBlocksTable)
      .where(eq(workoutBlocksTable.workoutId, template.id))
      .orderBy(asc(workoutBlocksTable.orderIndex));

    const blockIds = blocks.map((b) => b.id);
    const allExercises =
      blockIds.length > 0
        ? await db
            .select({ we: workoutExercisesTable, exercise: exercisesTable })
            .from(workoutExercisesTable)
            .leftJoin(exercisesTable, eq(workoutExercisesTable.exerciseId, exercisesTable.id))
            .where(eq(workoutExercisesTable.blockId, blocks[0].id))
            .orderBy(asc(workoutExercisesTable.orderIndex))
        : [];

    const exercisesByBlock: Record<string, typeof allExercises> = {};
    for (const block of blocks) {
      const blockExercises = await db
        .select({ we: workoutExercisesTable, exercise: exercisesTable })
        .from(workoutExercisesTable)
        .leftJoin(exercisesTable, eq(workoutExercisesTable.exerciseId, exercisesTable.id))
        .where(eq(workoutExercisesTable.blockId, block.id))
        .orderBy(asc(workoutExercisesTable.orderIndex));
      exercisesByBlock[block.id] = blockExercises;
    }

    res.json({
      ...template,
      blocks: blocks.map((b) => ({
        ...b,
        exercises: (exercisesByBlock[b.id] ?? []).map((r) => ({
          ...r.we,
          exercise: r.exercise,
        })),
      })),
    });
  } catch (err) {
    logger.error({ err }, "Get workout template error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /workout-templates — create a blank template
router.post("/workout-templates", async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateTemplateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
    return;
  }

  try {
    const [template] = await db
      .insert(workoutsTable)
      .values({
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        organisationId: req.organisationId!,
        isTemplate: true,
        dayId: null,
        orderIndex: 0,
      })
      .returning();

    res.status(201).json(template);
  } catch (err) {
    logger.error({ err }, "Create workout template error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// DELETE /workout-templates/:id
router.delete("/workout-templates/:id", async (req: Request, res: Response): Promise<void> => {
  const orgId = req.organisationId!;
  try {
    const [deleted] = await db
      .delete(workoutsTable)
      .where(
        and(
          eq(workoutsTable.id, req.params.id as string),
          eq(workoutsTable.isTemplate, true),
          eq(workoutsTable.organisationId, orgId),
        ),
      )
      .returning({ id: workoutsTable.id });

    if (!deleted) {
      res.status(404).json({ error: "Template not found" });
      return;
    }
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Delete workout template error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /days/:id/workouts/from-template/:templateId
// Inserts an INDEPENDENT copy of a template workout into a programme day.
router.post(
  "/days/:id/workouts/from-template/:templateId",
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.organisationId!;
    try {
      const [template] = await db
        .select()
        .from(workoutsTable)
        .where(
          and(
            eq(workoutsTable.id, req.params.templateId as string),
            eq(workoutsTable.isTemplate, true),
            eq(workoutsTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!template) {
        res.status(404).json({ error: "Template not found" });
        return;
      }

      const [day] = await db
        .select()
        .from(daysTable)
        .where(eq(daysTable.id, req.params.id as string))
        .limit(1);

      if (!day) {
        res.status(404).json({ error: "Day not found" });
        return;
      }

      const siblings = await db
        .select()
        .from(workoutsTable)
        .where(eq(workoutsTable.dayId, day.id));

      const [newWorkout] = await db
        .insert(workoutsTable)
        .values({
          dayId: day.id,
          name: template.name,
          description: template.description,
          orderIndex: siblings.length,
          isTemplate: false,
        })
        .returning();

      // Deep copy all blocks and exercises from the template
      const srcBlocks = await db
        .select()
        .from(workoutBlocksTable)
        .where(eq(workoutBlocksTable.workoutId, template.id))
        .orderBy(asc(workoutBlocksTable.orderIndex));

      for (const block of srcBlocks) {
        const [newBlock] = await db
          .insert(workoutBlocksTable)
          .values({
            workoutId: newWorkout.id,
            name: block.name,
            blockType: block.blockType,
            orderIndex: block.orderIndex,
            rounds: block.rounds,
            timeCapSeconds: block.timeCapSeconds,
            restBetweenRoundsSeconds: block.restBetweenRoundsSeconds,
            notes: block.notes,
          })
          .returning();

        const srcExercises = await db
          .select()
          .from(workoutExercisesTable)
          .where(eq(workoutExercisesTable.blockId, block.id))
          .orderBy(asc(workoutExercisesTable.orderIndex));

        if (srcExercises.length > 0) {
          await db.insert(workoutExercisesTable).values(
            srcExercises.map((we) => ({
              blockId: newBlock.id,
              exerciseId: we.exerciseId,
              orderIndex: we.orderIndex,
              notes: we.notes,
              sets: we.sets,
              repsMin: we.repsMin,
              repsMax: we.repsMax,
              loadKg: we.loadKg,
              loadPercent1rm: we.loadPercent1rm,
              rpe: we.rpe,
              rir: we.rir,
              tempo: we.tempo,
              restSeconds: we.restSeconds,
              durationSeconds: we.durationSeconds,
              distanceMeters: we.distanceMeters,
              pacePerKm: we.pacePerKm,
              calories: we.calories,
              targetTime: we.targetTime,
              targetPace: we.targetPace,
            })),
          );
        }
      }

      res.status(201).json(newWorkout);
    } catch (err) {
      logger.error({ err }, "Insert template into day error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
