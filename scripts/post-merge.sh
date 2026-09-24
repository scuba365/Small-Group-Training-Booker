#!/bin/bash
set -e
pnpm install --frozen-lockfile

# Idempotent development-only normalization: exercises list fields are stored
# as comma-separated text but mapped to arrays in the application. Convert any
# older development text[] columns back to the schema's physical text type
# before push-force introspects the schema. This never targets production.
# Safe to run repeatedly: each conversion is guarded by the current column type.
(cd lib/db && node << 'NODESCRIPT'
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query(`
  DO $$
  BEGIN
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'primary_muscle_groups') = 'ARRAY' THEN
      ALTER TABLE exercises
        ALTER COLUMN primary_muscle_groups TYPE text
        USING array_to_string(primary_muscle_groups, ', ');
    END IF;
    IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'exercises'
        AND column_name = 'equipment') = 'ARRAY' THEN
      ALTER TABLE exercises
        ALTER COLUMN equipment TYPE text
        USING array_to_string(equipment, ', ');
    END IF;
  END $$;
`).then(() => {
  console.log('Pre-migration: array->text conversion applied (or already done)');
  return pool.end();
}).catch(e => {
  console.error('Pre-migration failed:', e.message);
  process.exit(1);
});
NODESCRIPT
)

pnpm --filter @workspace/db run push-force
