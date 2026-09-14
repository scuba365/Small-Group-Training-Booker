import { pgTable, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const organisationsTable = pgTable("organisations", {
  id: text("id").primaryKey(), // UUID stored as text
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  timezone: text("timezone").notNull().default("Europe/Dublin"),
  currency: text("currency").notNull().default("EUR"),
  bookingOpenHours: integer("booking_open_hours").notNull().default(168), // 7 days
  bookingCloseHours: integer("booking_close_hours").notNull().default(12),
  noShowFeeCents: integer("no_show_fee_cents").notNull().default(500), // €5
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertOrganisationSchema = createInsertSchema(organisationsTable).omit({
  createdAt: true,
  updatedAt: true,
});
export type InsertOrganisation = z.infer<typeof insertOrganisationSchema>;
export type Organisation = typeof organisationsTable.$inferSelect;
