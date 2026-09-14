/**
 * One-off password reset for the Barracks owner account.
 *
 * Usage (from repo root):
 *   BARRACKS_OWNER_PASSWORD=<new-password> pnpm --filter @workspace/db run reset-password
 *
 * The script:
 *   1. Reads BARRACKS_OWNER_PASSWORD from env (required)
 *   2. Looks up the user by email (stephen@thebarracksfitness.com or BARRACKS_OWNER_EMAIL)
 *   3. Hashes the password with bcrypt (cost 12)
 *   4. Updates ONLY the password_hash column for that user
 *   5. Prints the hash prefix (first 10 chars) to confirm it's a valid bcrypt hash
 *
 * Safe to run multiple times. Does not touch any other columns or records.
 */

import { db } from "./index";
import { usersTable } from "./schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

async function main() {
  const ownerEmail = process.env.BARRACKS_OWNER_EMAIL ?? "stephen@thebarracksfitness.com";
  const newPassword = process.env.BARRACKS_OWNER_PASSWORD;

  if (!newPassword) {
    console.error(
      "\n✗ BARRACKS_OWNER_PASSWORD environment variable is required.\n" +
        "  BARRACKS_OWNER_PASSWORD=yourpassword pnpm --filter @workspace/db run reset-password\n",
    );
    process.exit(1);
  }

  const users = await db
    .select({ id: usersTable.id, email: usersTable.email, hash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.email, ownerEmail))
    .limit(1);

  if (users.length === 0) {
    console.error(`\n✗ No user found with email: ${ownerEmail}`);
    console.error("  Run the seed first: pnpm --filter @workspace/db run seed\n");
    process.exit(1);
  }

  const user = users[0];
  console.log(`Found user: ${user.email} (id: ${user.id})`);
  console.log(`Current hash prefix: ${user.hash.slice(0, 10)}`);

  const passwordHash = await bcrypt.hash(newPassword, 12);

  await db
    .update(usersTable)
    .set({ passwordHash })
    .where(eq(usersTable.id, user.id));

  console.log(`\n✓ Password updated.`);
  console.log(`  New hash prefix: ${passwordHash.slice(0, 10)} (should start with $2b$12$)`);
  console.log(`\nYou can now log in at /login with email: ${ownerEmail}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Reset failed:", err);
    process.exit(1);
  });
