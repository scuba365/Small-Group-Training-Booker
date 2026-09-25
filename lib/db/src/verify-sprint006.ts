/**
 * Sprint 006 — production verification script.
 *
 * Checks:
 *   1. Required tables exist (session_types, sessions, bookings)
 *   2. Session types are present for The Barracks with distinct colours
 *   3. Safely updates colours by name WITHOUT creating duplicates
 *
 * Run on Replit:
 *   pnpm --filter @workspace/db run verify-sprint006
 */

import { db, pool } from "./index";
import { sessionTypesTable } from "./schema";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

const BARRACKS_ORG_ID = "org_barracks_fitness_01";

// Canonical colours for each session type name
const EXPECTED_COLOURS: Record<string, string> = {
  "SGPT":               "#ef4444",
  "ATC":                "#3b82f6",
  "Hyrox":              "#a855f7",
  "Prime Strength":     "#f59e0b",
  "Next Gen Strength":  "#10b981",
  "Run Club":           "#06b6d4",
  "Other":              "#6b7280",
};

const DEFAULT_COLOUR = "#6366f1";

async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${tableName}
    ) AS "exists"
  `);
  return (result.rows[0] as { exists: boolean }).exists;
}

async function main() {
  console.log("=== Sprint 006 — Production Verification ===\n");

  // ── 1. Table existence ────────────────────────────────────────────────────

  console.log("── Tables ──");
  const tables = ["session_types", "sessions", "bookings"];
  let allPresent = true;
  for (const t of tables) {
    const ok = await tableExists(t);
    console.log(`  ${ok ? "✓" : "✗"} ${t}`);
    if (!ok) allPresent = false;
  }

  if (!allPresent) {
    console.error(
      "\n✗ One or more required tables are missing.\n" +
      "  Run: pnpm --filter @workspace/db run push-force\n"
    );
    process.exit(1);
  }

  // ── 2. Session type inventory ─────────────────────────────────────────────

  console.log("\n── Session types (org: The Barracks Fitness) ──");
  const existing = await db
    .select()
    .from(sessionTypesTable)
    .where(
      and(
        eq(sessionTypesTable.organisationId, BARRACKS_ORG_ID),
        eq(sessionTypesTable.isArchived, false),
      ),
    );

  if (existing.length === 0) {
    console.warn(
      "  ⚠ No session types found for org_barracks_fitness_01.\n" +
      "  Run: BARRACKS_OWNER_PASSWORD=<pw> pnpm --filter @workspace/db run seed\n"
    );
  } else {
    for (const st of existing) {
      const expected = EXPECTED_COLOURS[st.name];
      const colourOk = expected ? st.color === expected : true;
      const marker = colourOk ? "✓" : "~";
      console.log(
        `  ${marker} ${st.name.padEnd(20)} colour: ${st.color ?? "(null)"}` +
        (colourOk ? "" : `  → should be ${expected}`),
      );
    }
  }

  // ── 3. Safe colour update ─────────────────────────────────────────────────

  let updated = 0;
  for (const st of existing) {
    const expected = EXPECTED_COLOURS[st.name];
    if (!expected) continue; // unknown type — leave as-is
    if (st.color === expected) continue; // already correct
    if (st.color !== DEFAULT_COLOUR && st.color !== null) {
      console.log(
        `  ⚠ Skipping ${st.name}: colour is "${st.color}" (non-default, non-expected) — update manually`,
      );
      continue;
    }
    await db
      .update(sessionTypesTable)
      .set({ color: expected, updatedAt: new Date() })
      .where(eq(sessionTypesTable.id, st.id));
    console.log(`  ✓ Updated ${st.name}: ${st.color ?? "(null)"} → ${expected}`);
    updated++;
  }

  if (updated > 0) {
    console.log(`\n  ${updated} colour(s) updated.`);
  } else {
    console.log("\n  Colours are already correct — no updates needed.");
  }

  // ── 4. Row counts ─────────────────────────────────────────────────────────

  console.log("\n── Row counts ──");
  const counts = await db.execute(sql`
    SELECT
      (SELECT COUNT(*) FROM session_types WHERE organisation_id = ${BARRACKS_ORG_ID}) AS session_types,
      (SELECT COUNT(*) FROM sessions       WHERE organisation_id = ${BARRACKS_ORG_ID}) AS sessions,
      (SELECT COUNT(*) FROM bookings        WHERE organisation_id = ${BARRACKS_ORG_ID}) AS bookings
  `);
  const row = counts.rows[0] as Record<string, string>;
  console.log(`  session_types : ${row.session_types}`);
  console.log(`  sessions      : ${row.sessions}`);
  console.log(`  bookings      : ${row.bookings}`);

  console.log("\n=== Verification complete ===\n");
  console.log("Next step: redeploy the application on Replit, then test the coach workflow.");
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error("Verify script failed:", err);
    pool.end().then(() => process.exit(1));
  });
