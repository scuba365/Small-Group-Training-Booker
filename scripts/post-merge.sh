#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Idempotent pre-step: drizzle-kit 0.31.10 generates no USING clause for
# text→text[] type changes. This converts the two affected exercises columns
# safely before push-force introspects the schema.
# Safe to run multiple times: the IF guards check the current column type first.
(cd lib/db && node << 'NODESCRIPT'
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(`
  DO $$
  BEGIN
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'primary_muscle_groups') = 'text' THEN
      ALTER TABLE exercises
        ALTER COLUMN primary_muscle_groups TYPE text[]
        USING CASE WHEN primary_muscle_groups IS NULL
                   THEN NULL ELSE ARRAY[primary_muscle_groups] END;
    END IF;
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'equipment') = 'text' THEN
      ALTER TABLE exercises
        ALTER COLUMN equipment TYPE text[]
        USING CASE WHEN equipment IS NULL
                   THEN NULL ELSE ARRAY[equipment] END;
    END IF;
  END $$;
`).then(() => {
  console.log('Pre-migration: text->text[] conversion applied (or already done)');
  return pool.end();
}).catch(e => {
  console.error('Pre-migration failed:', e.message);
  process.exit(1);
});
NODESCRIPT
)

pnpm --filter @workspace/db run push-force
