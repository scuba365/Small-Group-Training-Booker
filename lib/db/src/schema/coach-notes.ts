import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { organisationsTable } from "./organisations";
import { usersTable } from "./users";

export const coachNotesTable = pgTable(
  "coach_notes",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisationsTable.id, { onDelete: "cascade" }),
    memberId: text("member_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    coachId: text("coach_id")
      .references(() => usersTable.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("coach_notes_member_org_idx").on(table.memberId, table.organisationId),
  ],
);

export type CoachNote = typeof coachNotesTable.$inferSelect;
export type InsertCoachNote = typeof coachNotesTable.$inferInsert;
