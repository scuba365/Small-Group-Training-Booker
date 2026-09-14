import { Router } from "express";
import { db } from "@workspace/db";
import {
  programmeAssignmentsTable,
  programmesTable,
  phasesTable,
  weeksTable,
  daysTable,
  workoutsTable,
} from "@workspace/db";
import { eq, and, asc, inArray } from "drizzle-orm";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

// GET /me/programme — authenticated member's active programme assignment
// Returns the programme context for the current week based on start_date.
router.get("/me/programme", async (req: Request, res: Response): Promise<void> => {
  const memberId = req.user!.id;
  const orgId = req.organisationId!;

  try {
    const [row] = await db
      .select({
        assignment: programmeAssignmentsTable,
        programme: programmesTable,
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

    if (!row) {
      res.status(404).json({ error: "No active programme assignment" });
      return;
    }

    const { assignment, programme } = row;

    // Determine current week based on start_date
    const startDate = new Date(`${assignment.startDate}T00:00:00`);
    const today = new Date();
    const daysSinceStart = Math.max(
      0,
      Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
    );
    const overallWeekIndex = Math.floor(daysSinceStart / 7); // 0-indexed

    // Load phases + weeks
    const phases = await db
      .select()
      .from(phasesTable)
      .where(eq(phasesTable.programmeId, programme.id))
      .orderBy(asc(phasesTable.orderIndex));

    if (phases.length === 0) {
      res.json({
        assignment,
        programme,
        overallWeek: overallWeekIndex + 1,
        currentPhase: null,
        currentWeek: null,
        days: [],
      });
      return;
    }

    const phaseWeeks = await Promise.all(
      phases.map((phase) =>
        db
          .select()
          .from(weeksTable)
          .where(eq(weeksTable.phaseId, phase.id))
          .orderBy(asc(weeksTable.orderIndex)),
      ),
    );

    // Walk phase weeks to find current position
    let cumulativeWeeks = 0;
    let currentPhaseIdx = phases.length - 1;
    let currentWeekIdx = (phaseWeeks[phases.length - 1]?.length ?? 1) - 1;

    for (let i = 0; i < phases.length; i++) {
      const weekCount = phaseWeeks[i].length;
      if (overallWeekIndex < cumulativeWeeks + weekCount) {
        currentPhaseIdx = i;
        currentWeekIdx = overallWeekIndex - cumulativeWeeks;
        break;
      }
      cumulativeWeeks += weekCount;
    }

    const currentPhase = phases[currentPhaseIdx];
    const currentWeek = phaseWeeks[currentPhaseIdx][currentWeekIdx];

    if (!currentWeek) {
      res.json({
        assignment,
        programme,
        overallWeek: overallWeekIndex + 1,
        currentPhase,
        currentWeek: null,
        days: [],
      });
      return;
    }

    // Load days + workouts for the current week
    const days = await db
      .select()
      .from(daysTable)
      .where(eq(daysTable.weekId, currentWeek.id))
      .orderBy(asc(daysTable.orderIndex));

    const workouts =
      days.length > 0
        ? await db
            .select()
            .from(workoutsTable)
            .where(inArray(workoutsTable.dayId, days.map((d) => d.id)))
            .orderBy(asc(workoutsTable.orderIndex))
        : [];

    const daysWithWorkouts = days.map((day) => ({
      ...day,
      workouts: workouts.filter((w) => w.dayId === day.id),
    }));

    res.json({
      assignment,
      programme,
      overallWeek: overallWeekIndex + 1,
      currentPhase,
      currentWeek,
      days: daysWithWorkouts,
    });
  } catch (err) {
    logger.error({ err }, "Get member programme error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /me/workout-template/:workoutId
// Member fetches a workout template (with full prescription) from their assigned programme.
// Security: verifies the workout belongs to the member's active programme.
router.get("/me/workout-template/:workoutId", async (req: Request, res: Response): Promise<void> => {
  const memberId = req.user!.id;
  const orgId = req.organisationId!;
  const workoutId = req.params.workoutId as string;

  try {
    // Verify there's an active assignment
    const [assignment] = await db
      .select()
      .from(programmeAssignmentsTable)
      .where(
        and(
          eq(programmeAssignmentsTable.memberId, memberId),
          eq(programmeAssignmentsTable.organisationId, orgId),
          eq(programmeAssignmentsTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (!assignment) {
      res.status(404).json({ error: "No active programme assignment" });
      return;
    }

    // Verify the workout is in the assigned programme
    const [workout] = await db
      .select({ workout: workoutsTable })
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

    if (!workout) {
      res.status(404).json({ error: "Workout not found in your programme" });
      return;
    }

    res.json(workout.workout);
  } catch (err) {
    logger.error({ err }, "Get member workout template error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
