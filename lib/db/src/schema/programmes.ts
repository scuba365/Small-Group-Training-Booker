import { pgTable, text, integer, boolean, doublePrecision, timestamp } from "drizzle-orm/pg-core";
import { exercisesTable } from "./exercises";

// ─── Enums ────────────────────────────────────────────────────────────────────

export const PROGRAMME_STATUSES = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
export type ProgrammeStatus = (typeof PROGRAMME_STATUSES)[number];

export const BLOCK_TYPES = [
  "STRAIGHT_SET",
  "SUPERSET",
  "CIRCUIT",
  "AMRAP",
  "EMOM",
  "FOR_TIME",
  "TABATA",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// ─── Programme hierarchy ──────────────────────────────────────────────────────

export const programmesTable = pgTable("programmes", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organisationId: text("organisation_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("DRAFT"),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const phasesTable = pgTable("phases", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  programmeId: text("programme_id")
    .notNull()
    .references(() => programmesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const weeksTable = pgTable("weeks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  phaseId: text("phase_id")
    .notNull()
    .references(() => phasesTable.id, { onDelete: "cascade" }),
  weekNumber: integer("week_number").notNull(),
  label: text("label"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const daysTable = pgTable("days", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  weekId: text("week_id")
    .notNull()
    .references(() => weeksTable.id, { onDelete: "cascade" }),
  dayNumber: integer("day_number").notNull(),
  label: text("label"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workoutsTable = pgTable("workouts", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  dayId: text("day_id")
    .notNull()
    .references(() => daysTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  orderIndex: integer("order_index").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const workoutBlocksTable = pgTable("workout_blocks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workoutId: text("workout_id")
    .notNull()
    .references(() => workoutsTable.id, { onDelete: "cascade" }),
  name: text("name"),
  blockType: text("block_type").notNull().default("STRAIGHT_SET"),
  orderIndex: integer("order_index").notNull().default(0),
  rounds: integer("rounds"),
  timeCapSeconds: integer("time_cap_seconds"),
  restBetweenRoundsSeconds: integer("rest_between_rounds_seconds"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

/**
 * Stores one exercise within a block, including its full structured prescription.
 *
 * All prescription fields are nullable — only fields relevant to the exercise type
 * are populated. This avoids artificial "N/A" values and supports mixed-modal
 * blocks cleanly.
 *
 * Prescription field semantics:
 *  sets           — number of working sets
 *  repsMin/Max    — rep range; set equal for exact reps (e.g. repsMin=8, repsMax=8)
 *  loadKg         — absolute load in kilograms
 *  loadPercent1rm — percentage of 1-rep max (0–100)
 *  rpe            — Rate of Perceived Exertion (1–10, supports decimals)
 *  rir            — Reps In Reserve (0 = technical failure)
 *  tempo          — four-digit notation e.g. "3-1-1-0"
 *  restSeconds    — inter-set rest period in seconds
 *  durationSeconds— time-based effort (e.g. 60s plank)
 *  distanceMeters — distance-based effort
 *  pacePerKm      — target pace as "M:SS" string (e.g. "5:30")
 *  calories       — calorie-based target (rowing, ski erg)
 *  targetTime     — open text for goal times (e.g. "sub 20:00")
 *  targetPace     — open text for pace targets
 */
export const workoutExercisesTable = pgTable("workout_exercises", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  blockId: text("block_id")
    .notNull()
    .references(() => workoutBlocksTable.id, { onDelete: "cascade" }),
  exerciseId: text("exercise_id")
    .notNull()
    .references(() => exercisesTable.id),
  orderIndex: integer("order_index").notNull().default(0),
  notes: text("notes"),
  // Prescription — strength / volume
  sets: integer("sets"),
  repsMin: integer("reps_min"),
  repsMax: integer("reps_max"),
  loadKg: doublePrecision("load_kg"),
  loadPercent1rm: doublePrecision("load_percent_1rm"),
  rpe: doublePrecision("rpe"),
  rir: integer("rir"),
  tempo: text("tempo"),
  restSeconds: integer("rest_seconds"),
  // Prescription — time / distance / pace / calories
  durationSeconds: integer("duration_seconds"),
  distanceMeters: doublePrecision("distance_meters"),
  pacePerKm: text("pace_per_km"),
  calories: integer("calories"),
  targetTime: text("target_time"),
  targetPace: text("target_pace"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Programme = typeof programmesTable.$inferSelect;
export type Phase = typeof phasesTable.$inferSelect;
export type Week = typeof weeksTable.$inferSelect;
export type Day = typeof daysTable.$inferSelect;
export type Workout = typeof workoutsTable.$inferSelect;
export type WorkoutBlock = typeof workoutBlocksTable.$inferSelect;
export type WorkoutExercise = typeof workoutExercisesTable.$inferSelect;

export type InsertProgramme = typeof programmesTable.$inferInsert;
export type InsertPhase = typeof phasesTable.$inferInsert;
export type InsertWeek = typeof weeksTable.$inferInsert;
export type InsertDay = typeof daysTable.$inferInsert;
export type InsertWorkout = typeof workoutsTable.$inferInsert;
export type InsertWorkoutBlock = typeof workoutBlocksTable.$inferInsert;
export type InsertWorkoutExercise = typeof workoutExercisesTable.$inferInsert;
