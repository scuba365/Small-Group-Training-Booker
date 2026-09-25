/**
 * One-time import of the Free Exercise DB into the exercises table.
 *
 * Usage:
 *   pnpm --filter @workspace/db run seed-exercises
 *
 * Idempotent: records already imported (matched by source + source_id) are
 * skipped. Custom/org exercises are never touched.
 *
 * License: Free Exercise DB is released under the Unlicense (public domain).
 * Images are NOT imported — media is handled separately.
 */

import { db } from "./index.js";
import { exercisesTable } from "./schema/index.js";
import { and, eq, isNull, sql } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Source constants
// ---------------------------------------------------------------------------

export const FREE_EXERCISE_DB_SOURCE = "free-exercise-db";
const DATA_URL =
  "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json";

// ---------------------------------------------------------------------------
// Source record shape
// ---------------------------------------------------------------------------

export interface FreeExerciseRecord {
  id: string;
  name: string;
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  equipment?: string | null;
  primaryMuscles?: string[];
  secondaryMuscles?: string[];
  instructions?: string[];
  category?: string | null;
  images?: string[];
}

// ---------------------------------------------------------------------------
// Field mappers (exported for testing)
// ---------------------------------------------------------------------------

const EQUIPMENT_MAP: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  cable: "Cable",
  machine: "Machine",
  kettlebells: "Kettlebell",
  "body only": "Bodyweight",
  bands: "Other",
  "foam roll": "Other",
  "e-z curl bar": "Barbell",
  "exercise ball": "Other",
  "medicine ball": "Other",
  other: "Other",
};

const MUSCLE_MAP: Record<string, string> = {
  abdominals: "Core",
  abductors: "Other",
  adductors: "Other",
  biceps: "Biceps",
  calves: "Calves",
  chest: "Chest",
  forearms: "Other",
  glutes: "Glutes",
  hamstrings: "Hamstrings",
  lats: "Back",
  "lower back": "Back",
  "middle back": "Back",
  neck: "Other",
  quadriceps: "Quads",
  shoulders: "Shoulders",
  traps: "Back",
  triceps: "Triceps",
};

const CATEGORY_TO_TYPE: Record<string, string> = {
  strength: "STRENGTH",
  cardio: "CARDIO",
  stretching: "CONDITIONING",
  plyometrics: "CONDITIONING",
  "olympic weightlifting": "STRENGTH",
  powerlifting: "STRENGTH",
  strongman: "STRENGTH",
};

export function mapEquipment(equipment: string | null | undefined): string[] {
  if (!equipment) return [];
  const mapped = EQUIPMENT_MAP[equipment.toLowerCase().trim()];
  return mapped ? [mapped] : ["Other"];
}

export function mapMuscles(muscles: string[] | undefined): string[] {
  if (!muscles || muscles.length === 0) return [];
  const mapped = muscles
    .map((m) => MUSCLE_MAP[m.toLowerCase().trim()])
    .filter((m): m is string => m !== undefined);
  // deduplicate — multiple source values (e.g. lats + lower back) both map to "Back"
  return [...new Set(mapped)];
}

export function mapExerciseType(category: string | null | undefined): string {
  if (!category) return "STRENGTH";
  return CATEGORY_TO_TYPE[category.toLowerCase().trim()] ?? "STRENGTH";
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function formatInstructions(steps: string[] | undefined): string | null {
  if (!steps || steps.length === 0) return null;
  const items = steps
    .map((s) => `<li>${escapeHtml(s.trim())}</li>`)
    .join("");
  return `<ol>${items}</ol>`;
}

export function buildDescription(record: FreeExerciseRecord): string | null {
  const parts: string[] = [];
  if (record.level) parts.push(`Level: ${capitalise(record.level)}`);
  if (record.mechanic) parts.push(`Mechanic: ${capitalise(record.mechanic)}`);
  if (record.force) parts.push(`Force: ${capitalise(record.force)}`);
  return parts.length > 0 ? parts.join(" | ") : null;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export function isValidRecord(record: unknown): record is FreeExerciseRecord {
  if (!record || typeof record !== "object") return false;
  const r = record as Record<string, unknown>;
  return typeof r.id === "string" && r.id.length > 0 &&
    typeof r.name === "string" && r.name.trim().length > 0;
}

export function mapExerciseRecord(record: FreeExerciseRecord) {
  return {
    name: record.name.trim(),
    organisationId: null, // global — visible to all orgs
    exerciseType: mapExerciseType(record.category),
    primaryMuscleGroups: mapMuscles(record.primaryMuscles),
    equipment: mapEquipment(record.equipment),
    instructions: formatInstructions(record.instructions),
    description: buildDescription(record),
    source: FREE_EXERCISE_DB_SOURCE,
    sourceId: record.id,
    isArchived: false,
  };
}

// ---------------------------------------------------------------------------
// Main importer
// ---------------------------------------------------------------------------

interface ImportCounts {
  found: number;
  imported: number;
  skippedAlreadyImported: number;
  skippedInvalid: number;
  errors: number;
}

export async function importExercises(
  data: unknown[],
  opts: { dryRun?: boolean } = {}
): Promise<ImportCounts> {
  const counts: ImportCounts = {
    found: data.length,
    imported: 0,
    skippedAlreadyImported: 0,
    skippedInvalid: 0,
    errors: 0,
  };

  for (const raw of data) {
    if (!isValidRecord(raw)) {
      counts.skippedInvalid++;
      continue;
    }

    const record = raw as FreeExerciseRecord;

    try {
      // Duplicate check — keyed on source + source_id
      const existing = await db
        .select({ id: exercisesTable.id })
        .from(exercisesTable)
        .where(
          and(
            eq(exercisesTable.source, FREE_EXERCISE_DB_SOURCE),
            eq(exercisesTable.sourceId, record.id)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        counts.skippedAlreadyImported++;
        continue;
      }

      if (!opts.dryRun) {
        await db.insert(exercisesTable).values(mapExerciseRecord(record));
      }

      counts.imported++;
    } catch (err) {
      counts.errors++;
      console.error(`  ✗ Error importing "${record.name}":`, err);
    }
  }

  return counts;
}

/**
 * User-initiated import for the live app. No schema changes or existing-row
 * updates: missing source IDs are inserted in batches; retries are safe.
 */
export async function importFreeExerciseLibrary() {
  const response = await fetch(DATA_URL, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`Exercise source returned HTTP ${response.status}`);

  const data: unknown = await response.json();
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Exercise source returned no records");
  }

  const counts = {
    found: data.length,
    imported: 0,
    alreadyPresent: 0,
    skippedInvalid: 0,
  };
  const existingRows = await db
    .select({ sourceId: exercisesTable.sourceId })
    .from(exercisesTable)
    .where(eq(exercisesTable.source, FREE_EXERCISE_DB_SOURCE));
  const existing = new Set(existingRows.map((row) => row.sourceId));
  const seen = new Set<string>();
  const missing: ReturnType<typeof mapExerciseRecord>[] = [];

  for (const raw of data) {
    if (!isValidRecord(raw) || seen.has(raw.id)) {
      counts.skippedInvalid++;
      continue;
    }
    seen.add(raw.id);
    if (existing.has(raw.id)) {
      counts.alreadyPresent++;
    } else {
      missing.push(mapExerciseRecord(raw));
    }
  }

  if (seen.size === 0) throw new Error("Exercise source returned no valid records");

  for (let i = 0; i < missing.length; i += 100) {
    const batch = missing.slice(i, i + 100);
    const inserted = await db
      .insert(exercisesTable)
      .values(batch)
      .onConflictDoNothing({ target: [exercisesTable.source, exercisesTable.sourceId] })
      .returning({ id: exercisesTable.id });
    counts.imported += inserted.length;
    counts.alreadyPresent += batch.length - inserted.length;
  }

  return counts;
}

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

async function ensureColumns() {
  // Add source tracking columns if they don't exist yet (safe to run repeatedly).
  // This allows the seed to run without requiring a separate push-force step first.
  await db.execute(sql`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source text`);
  await db.execute(sql`ALTER TABLE exercises ADD COLUMN IF NOT EXISTS source_id text`);
}

async function main() {
  console.log("=== Free Exercise DB Import ===\n");

  process.stdout.write("Ensuring schema columns exist... ");
  await ensureColumns();
  console.log("done\n");

  console.log(`Fetching data from:\n  ${DATA_URL}\n`);

  let data: unknown[];
  try {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    data = (await res.json()) as unknown[];
  } catch (err) {
    console.error("✗ Failed to fetch exercise data:", err);
    process.exit(1);
  }

  if (!Array.isArray(data)) {
    console.error("✗ Expected an array of exercises, got:", typeof data);
    process.exit(1);
  }

  console.log(`Source records found : ${data.length}\n`);
  console.log("Importing...\n");

  const counts = await importExercises(data);

  console.log("\n=== Results ===");
  console.log(`  Imported             : ${counts.imported}`);
  console.log(`  Already imported     : ${counts.skippedAlreadyImported}`);
  console.log(`  Invalid / skipped    : ${counts.skippedInvalid}`);
  console.log(`  Errors               : ${counts.errors}`);
  console.log(`  Total found          : ${counts.found}`);

  if (counts.errors > 0) {
    console.error("\n✗ Import completed with errors.");
    process.exit(1);
  }

  console.log("\n✓ Import complete.");
}

// Only run when invoked directly as a CLI script, not when imported by tests
const argv1 = process.argv[1] ?? "";
if (argv1.endsWith("/seed-exercises.ts") || argv1.endsWith("/seed-exercises.js")) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Import failed:", err);
      process.exit(1);
    });
}
