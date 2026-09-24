import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock DB before importing the module under test.
// vi.hoisted ensures these are available when vi.mock factories run.
// ---------------------------------------------------------------------------

const { mockInsertChain, mockSelectChain, mockDb } = vi.hoisted(() => {
  const mockInsertChain = {
    values: vi.fn().mockResolvedValue(undefined),
  };
  const mockSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  };
  const mockDb = {
    insert: vi.fn().mockReturnValue(mockInsertChain),
    select: vi.fn().mockReturnValue(mockSelectChain),
  };
  return { mockInsertChain, mockSelectChain, mockDb };
});

vi.mock("../index.js", () => ({ db: mockDb }));
vi.mock("../schema/index.js", () => ({
  exercisesTable: {
    id: "id",
    source: "source",
    sourceId: "source_id",
    organisationId: "organisation_id",
  },
}));

// Mock drizzle-orm operators — they just need to return something truthy
vi.mock("drizzle-orm", () => ({
  and: (...args: unknown[]) => ({ and: args }),
  eq: (col: unknown, val: unknown) => ({ eq: [col, val] }),
  isNull: (col: unknown) => ({ isNull: col }),
}));

import {
  mapEquipment,
  mapMuscles,
  mapExerciseType,
  formatInstructions,
  buildDescription,
  isValidRecord,
  importExercises,
  FREE_EXERCISE_DB_SOURCE,
  type FreeExerciseRecord,
} from "../seed-exercises.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  vi.clearAllMocks();
  mockDb.insert.mockReturnValue(mockInsertChain);
  mockInsertChain.values.mockResolvedValue(undefined);
  mockDb.select.mockReturnValue(mockSelectChain);
  mockSelectChain.from.mockReturnThis();
  mockSelectChain.where.mockReturnThis();
  mockSelectChain.limit.mockResolvedValue([]); // default: no existing record
}

const MINIMAL_RECORD: FreeExerciseRecord = {
  id: "Back_Squat",
  name: "Back Squat",
  category: "strength",
  equipment: "barbell",
  primaryMuscles: ["quadriceps", "glutes"],
  secondaryMuscles: ["hamstrings"],
  instructions: ["Set up the barbell.", "Squat down.", "Drive back up."],
};

// ---------------------------------------------------------------------------
// mapEquipment
// ---------------------------------------------------------------------------

describe("mapEquipment", () => {
  it("maps all 12 source vocabulary values", () => {
    expect(mapEquipment("barbell")).toEqual(["Barbell"]);
    expect(mapEquipment("dumbbell")).toEqual(["Dumbbell"]);
    expect(mapEquipment("cable")).toEqual(["Cable"]);
    expect(mapEquipment("machine")).toEqual(["Machine"]);
    expect(mapEquipment("kettlebells")).toEqual(["Kettlebell"]);
    expect(mapEquipment("body only")).toEqual(["Bodyweight"]);
    expect(mapEquipment("bands")).toEqual(["Other"]);
    expect(mapEquipment("foam roll")).toEqual(["Other"]);
    expect(mapEquipment("e-z curl bar")).toEqual(["Barbell"]);
    expect(mapEquipment("exercise ball")).toEqual(["Other"]);
    expect(mapEquipment("medicine ball")).toEqual(["Other"]);
    expect(mapEquipment("other")).toEqual(["Other"]);
  });

  it("returns empty array for null / undefined", () => {
    expect(mapEquipment(null)).toEqual([]);
    expect(mapEquipment(undefined)).toEqual([]);
    expect(mapEquipment("")).toEqual([]);
  });

  it("is case-insensitive", () => {
    expect(mapEquipment("Barbell")).toEqual(["Barbell"]);
    expect(mapEquipment("BODY ONLY")).toEqual(["Bodyweight"]);
  });

  it("falls back to Other for unknown values", () => {
    expect(mapEquipment("resistance band")).toEqual(["Other"]);
  });
});

// ---------------------------------------------------------------------------
// mapMuscles
// ---------------------------------------------------------------------------

describe("mapMuscles", () => {
  it("maps all 17 source vocabulary values", () => {
    expect(mapMuscles(["abdominals"])).toEqual(["Core"]);
    expect(mapMuscles(["abductors"])).toEqual(["Other"]);
    expect(mapMuscles(["adductors"])).toEqual(["Other"]);
    expect(mapMuscles(["biceps"])).toEqual(["Biceps"]);
    expect(mapMuscles(["calves"])).toEqual(["Calves"]);
    expect(mapMuscles(["chest"])).toEqual(["Chest"]);
    expect(mapMuscles(["forearms"])).toEqual(["Other"]);
    expect(mapMuscles(["glutes"])).toEqual(["Glutes"]);
    expect(mapMuscles(["hamstrings"])).toEqual(["Hamstrings"]);
    expect(mapMuscles(["lats"])).toEqual(["Back"]);
    expect(mapMuscles(["lower back"])).toEqual(["Back"]);
    expect(mapMuscles(["middle back"])).toEqual(["Back"]);
    expect(mapMuscles(["neck"])).toEqual(["Other"]);
    expect(mapMuscles(["quadriceps"])).toEqual(["Quads"]);
    expect(mapMuscles(["shoulders"])).toEqual(["Shoulders"]);
    expect(mapMuscles(["traps"])).toEqual(["Back"]);
    expect(mapMuscles(["triceps"])).toEqual(["Triceps"]);
  });

  it("deduplicates when multiple source muscles map to the same target", () => {
    // lats + lower back + traps all map to "Back"
    expect(mapMuscles(["lats", "lower back", "traps"])).toEqual(["Back"]);
  });

  it("handles multiple distinct muscles", () => {
    expect(mapMuscles(["quadriceps", "glutes"])).toEqual(["Quads", "Glutes"]);
  });

  it("returns empty array for empty / undefined input", () => {
    expect(mapMuscles([])).toEqual([]);
    expect(mapMuscles(undefined)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// mapExerciseType
// ---------------------------------------------------------------------------

describe("mapExerciseType", () => {
  it("maps all 7 source category values", () => {
    expect(mapExerciseType("strength")).toBe("STRENGTH");
    expect(mapExerciseType("cardio")).toBe("CARDIO");
    expect(mapExerciseType("stretching")).toBe("CONDITIONING");
    expect(mapExerciseType("plyometrics")).toBe("CONDITIONING");
    expect(mapExerciseType("olympic weightlifting")).toBe("STRENGTH");
    expect(mapExerciseType("powerlifting")).toBe("STRENGTH");
    expect(mapExerciseType("strongman")).toBe("STRENGTH");
  });

  it("defaults to STRENGTH for null / unknown / undefined", () => {
    expect(mapExerciseType(null)).toBe("STRENGTH");
    expect(mapExerciseType(undefined)).toBe("STRENGTH");
    expect(mapExerciseType("unknown-category")).toBe("STRENGTH");
  });
});

// ---------------------------------------------------------------------------
// formatInstructions
// ---------------------------------------------------------------------------

describe("formatInstructions", () => {
  it("wraps steps in an ordered list", () => {
    const html = formatInstructions(["Step one.", "Step two."]);
    expect(html).toBe("<ol><li>Step one.</li><li>Step two.</li></ol>");
  });

  it("escapes HTML special characters in step text", () => {
    const html = formatInstructions(['Use a <bar> & "squeeze"']);
    expect(html).toBe(
      '<ol><li>Use a &lt;bar&gt; &amp; &quot;squeeze&quot;</li></ol>'
    );
  });

  it("returns null for empty / undefined input", () => {
    expect(formatInstructions([])).toBeNull();
    expect(formatInstructions(undefined)).toBeNull();
  });

  it("trims whitespace from each step", () => {
    const html = formatInstructions(["  Step one.  "]);
    expect(html).toBe("<ol><li>Step one.</li></ol>");
  });
});

// ---------------------------------------------------------------------------
// buildDescription
// ---------------------------------------------------------------------------

describe("buildDescription", () => {
  it("includes all three metadata fields when present", () => {
    const desc = buildDescription({
      id: "x",
      name: "x",
      level: "beginner",
      mechanic: "compound",
      force: "pull",
    });
    expect(desc).toBe("Level: Beginner | Mechanic: Compound | Force: Pull");
  });

  it("omits absent fields", () => {
    const desc = buildDescription({ id: "x", name: "x", level: "intermediate" });
    expect(desc).toBe("Level: Intermediate");
  });

  it("returns null when all metadata fields are absent", () => {
    expect(buildDescription({ id: "x", name: "x" })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isValidRecord
// ---------------------------------------------------------------------------

describe("isValidRecord", () => {
  it("accepts a minimal valid record", () => {
    expect(isValidRecord({ id: "Squat", name: "Squat" })).toBe(true);
  });

  it("rejects records missing id or name", () => {
    expect(isValidRecord({ name: "Squat" })).toBe(false);
    expect(isValidRecord({ id: "Squat" })).toBe(false);
    expect(isValidRecord({ id: "", name: "Squat" })).toBe(false);
    expect(isValidRecord({ id: "Squat", name: "   " })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isValidRecord(null)).toBe(false);
    expect(isValidRecord("string")).toBe(false);
    expect(isValidRecord(42)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// importExercises — duplicate prevention and idempotency
// ---------------------------------------------------------------------------

describe("importExercises — duplicate prevention", () => {
  beforeEach(resetMocks);

  it("inserts a new exercise that does not yet exist", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]); // not found

    const counts = await importExercises([MINIMAL_RECORD]);

    expect(counts.imported).toBe(1);
    expect(counts.skippedAlreadyImported).toBe(0);
    expect(mockDb.insert).toHaveBeenCalledTimes(1);
    const insertedValues = mockInsertChain.values.mock.calls[0][0];
    expect(insertedValues.source).toBe(FREE_EXERCISE_DB_SOURCE);
    expect(insertedValues.sourceId).toBe(MINIMAL_RECORD.id);
    expect(insertedValues.organisationId).toBeNull();
    expect(insertedValues.isArchived).toBe(false);
  });

  it("skips an exercise that was already imported (duplicate by source+sourceId)", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([{ id: "existing-uuid" }]);

    const counts = await importExercises([MINIMAL_RECORD]);

    expect(counts.imported).toBe(0);
    expect(counts.skippedAlreadyImported).toBe(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("is idempotent: running twice produces the same result (no new inserts)", async () => {
    // First run: exercise not yet in DB
    mockSelectChain.limit.mockResolvedValueOnce([]);
    const first = await importExercises([MINIMAL_RECORD]);
    expect(first.imported).toBe(1);

    resetMocks();

    // Second run: exercise now exists (simulate by returning a row)
    mockSelectChain.limit.mockResolvedValueOnce([{ id: "existing-uuid" }]);
    const second = await importExercises([MINIMAL_RECORD]);
    expect(second.imported).toBe(0);
    expect(second.skippedAlreadyImported).toBe(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });

  it("counts invalid records correctly without attempting an insert", async () => {
    const counts = await importExercises([
      null,
      { id: "", name: "Bad" },
      { name: "No ID" },
      MINIMAL_RECORD,
    ]);

    expect(counts.skippedInvalid).toBe(3);
    expect(counts.imported).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// importExercises — preserving custom exercises
// ---------------------------------------------------------------------------

describe("importExercises — custom exercise preservation", () => {
  beforeEach(resetMocks);

  it("never touches a coach-created exercise (source=null)", async () => {
    // A coach's custom exercise has no source / sourceId.
    // The duplicate check queries WHERE source='free-exercise-db' AND source_id=record.id,
    // so a custom exercise with source=null is never matched — it's always a separate row.
    // Here we verify a new import record goes through even if a same-named custom exercise exists.
    mockSelectChain.limit.mockResolvedValueOnce([]); // no existing seeded record found

    const counts = await importExercises([MINIMAL_RECORD]);
    expect(counts.imported).toBe(1);

    // The insert uses source = FREE_EXERCISE_DB_SOURCE — it never touches coach records
    const insertedValues = mockInsertChain.values.mock.calls[0][0];
    expect(insertedValues.source).toBe(FREE_EXERCISE_DB_SOURCE);
  });

  it("dry run does not call insert", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]);

    const counts = await importExercises([MINIMAL_RECORD], { dryRun: true });
    expect(counts.imported).toBe(1);
    expect(mockDb.insert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// importExercises — field mapping integration
// ---------------------------------------------------------------------------

describe("importExercises — inserted values mapping", () => {
  beforeEach(resetMocks);

  it("maps equipment, muscles, and exerciseType correctly on insert", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]);

    await importExercises([MINIMAL_RECORD]);

    const v = mockInsertChain.values.mock.calls[0][0];
    expect(v.equipment).toEqual(["Barbell"]);
    expect(v.primaryMuscleGroups).toEqual(["Quads", "Glutes"]);
    expect(v.exerciseType).toBe("STRENGTH");
  });

  it("formats instructions as HTML ordered list", async () => {
    mockSelectChain.limit.mockResolvedValueOnce([]);

    await importExercises([MINIMAL_RECORD]);

    const v = mockInsertChain.values.mock.calls[0][0];
    expect(v.instructions).toBe(
      "<ol><li>Set up the barbell.</li><li>Squat down.</li><li>Drive back up.</li></ol>"
    );
  });
});
