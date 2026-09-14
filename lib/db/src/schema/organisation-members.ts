import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organisationsTable } from "./organisations";
import { usersTable } from "./users";

export const MEMBER_ROLES = ["OWNER", "ADMIN", "COACH", "MEMBER"] as const;
export const MEMBER_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export type MemberRole = (typeof MEMBER_ROLES)[number];
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export const organisationMembersTable = pgTable(
  "organisation_members",
  {
    id: text("id").primaryKey(), // UUID stored as text
    organisationId: text("organisation_id")
      .notNull()
      .references(() => organisationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("MEMBER"),
    status: text("status").notNull().default("ACTIVE"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => [uniqueIndex("org_user_unique").on(table.organisationId, table.userId)],
);

export const insertOrganisationMemberSchema = createInsertSchema(organisationMembersTable).omit({
  createdAt: true,
});
export type InsertOrganisationMember = z.infer<typeof insertOrganisationMemberSchema>;
export type OrganisationMember = typeof organisationMembersTable.$inferSelect;
