import { pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const authSessionsTable = pgTable("auth_sessions", {
  id: text("id").primaryKey(), // UUID stored as text
  token: text("token").notNull().unique(), // 64-char random hex
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type AuthSession = typeof authSessionsTable.$inferSelect;
