import { pgTable, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const MUSCLE_GROUPS = [
  "Chest",
  "Back",
  "Shoulders",
  "Biceps",
  "Triceps",
  "Quads",
  "Hamstrings",
  "Glutes",
  "Calves",
  "Core",
  "Full Body",
  "Other",
] as const;
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number];

export const EQUIPMENT_OPTIONS = [
  "Barbell",
  "Dumbbell",
  "Kettlebell",
  "Cable",
  "Machine",
  "Bench",
  "Rack",
  "SkiErg",
  "Bike",
  "Sled",
  "Wall Ball",
  "Sandbag",
  "Bodyweight",
  "Other",
] as const;
export type EquipmentOption = (typeof EQUIPMENT_OPTIONS)[number];

/**
 * Exercise types supported by the platform.
 * STRENGTH: sets/reps/load-based movements
 * CARDIO: time/distance/pace-based aerobic work
 * CONDITIONING: mixed-modal metcons (burpees, box jumps, thrusters)
 * HYROX: race-format functional fitness events
 */
export const EXERCISE_TYPES = ["STRENGTH", "CARDIO", "CONDITIONING", "HYROX"] as const;
export type ExerciseType = (typeof EXERCISE_TYPES)[number];

export const exercisesTable = pgTable(
  "exercises",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    // null = global built-in exercise; non-null = created by this org
    organisationId: text("organisation_id"),
    name: text("name").notNull(),
    description: text("description"),
    exerciseType: text("exercise_type").notNull().default("STRENGTH"),
    primaryMuscleGroups: text("primary_muscle_groups").array(),
    equipment: text("equipment").array(),
    videoUrl: text("video_url"),
    instructions: text("instructions"),
    isArchived: boolean("is_archived").notNull().default(false),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    // Covers the primary list query: WHERE org_id = ? AND is_archived = false
    index("exercises_org_archived_idx").on(table.organisationId, table.isArchived),
  ],
);

export type Exercise = typeof exercisesTable.$inferSelect;
export type InsertExercise = typeof exercisesTable.$inferInsert;
