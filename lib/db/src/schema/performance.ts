import { pgTable, text, integer, doublePrecision, boolean, timestamp } from "drizzle-orm/pg-core";
import { programmesTable, workoutsTable, workoutExercisesTable } from "./programmes";
import { exercisesTable } from "./exercises";
import { usersTable } from "./users";

export const ASSIGNMENT_STATUSES = ["ACTIVE", "INACTIVE", "COMPLETED"] as const;
export type AssignmentStatus = (typeof ASSIGNMENT_STATUSES)[number];

export const WORKOUT_INSTANCE_STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED"] as const;
export type WorkoutInstanceStatus = (typeof WORKOUT_INSTANCE_STATUSES)[number];

// Assignment links a member to a canonical programme template. No cloning.
export const programmeAssignmentsTable = pgTable("programme_assignments", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text("organisation_id").notNull(),
  programmeId: text("programme_id").notNull().references(() => programmesTable.id),
  memberId: text("member_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("ACTIVE"),
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"),
  assignedBy: text("assigned_by").references(() => usersTable.id),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// One attempt by a member at a specific workout template.
export const workoutInstancesTable = pgTable("workout_instances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  organisationId: text("organisation_id").notNull(),
  assignmentId: text("assignment_id").notNull().references(() => programmeAssignmentsTable.id),
  workoutId: text("workout_id").notNull().references(() => workoutsTable.id),
  memberId: text("member_id").notNull().references(() => usersTable.id),
  status: text("status").notNull().default("NOT_STARTED"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  durationSeconds: integer("duration_seconds"),
  sessionRpe: integer("session_rpe"), // 1–10
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// One exercise performed within a workout instance (mirrors a workout_exercise template).
export const exerciseInstancesTable = pgTable("exercise_instances", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  workoutInstanceId: text("workout_instance_id")
    .notNull()
    .references(() => workoutInstancesTable.id, { onDelete: "cascade" }),
  workoutExerciseId: text("workout_exercise_id")
    .notNull()
    .references(() => workoutExercisesTable.id),
  exerciseId: text("exercise_id").notNull().references(() => exercisesTable.id),
  orderIndex: integer("order_index").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Individual set performance. Only fields relevant to the exercise type are populated.
export const setLogsTable = pgTable("set_logs", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  exerciseInstanceId: text("exercise_instance_id")
    .notNull()
    .references(() => exerciseInstancesTable.id, { onDelete: "cascade" }),
  setNumber: integer("set_number").notNull(),
  // Strength
  reps: integer("reps"),
  loadKg: doublePrecision("load_kg"),
  rpe: doublePrecision("rpe"),
  rir: integer("rir"),
  // Running / distance
  distanceMeters: doublePrecision("distance_meters"),
  timeSeconds: integer("time_seconds"),
  pacePerKm: text("pace_per_km"),
  // Conditioning / Hyrox
  calories: integer("calories"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type ProgrammeAssignment = typeof programmeAssignmentsTable.$inferSelect;
export type InsertProgrammeAssignment = typeof programmeAssignmentsTable.$inferInsert;
export type WorkoutInstance = typeof workoutInstancesTable.$inferSelect;
export type InsertWorkoutInstance = typeof workoutInstancesTable.$inferInsert;
export type ExerciseInstance = typeof exerciseInstancesTable.$inferSelect;
export type InsertExerciseInstance = typeof exerciseInstancesTable.$inferInsert;
export type SetLog = typeof setLogsTable.$inferSelect;
export type InsertSetLog = typeof setLogsTable.$inferInsert;
