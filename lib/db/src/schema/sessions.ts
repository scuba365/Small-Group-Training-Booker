import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Session Types — org-configurable class types (SGPT, ATC, Hyrox, etc.)
// ---------------------------------------------------------------------------

export const sessionTypesTable = pgTable(
  "session_types",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organisationId: text("organisation_id").notNull(),
    name: text("name").notNull(),
    color: text("color").default("#6366f1"),
    defaultDurationMinutes: integer("default_duration_minutes")
      .notNull()
      .default(60),
    defaultCapacity: integer("default_capacity").notNull().default(12),
    isArchived: boolean("is_archived").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [index("session_types_org_idx").on(table.organisationId)],
);

// ---------------------------------------------------------------------------
// Sessions — one row per scheduled class instance
// ---------------------------------------------------------------------------

export const SESSION_STATUSES = ["SCHEDULED", "CANCELLED"] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organisationId: text("organisation_id").notNull(),
    // Nullable — session can exist without a type (e.g. custom one-off)
    sessionTypeId: text("session_type_id"),
    name: text("name").notNull(),
    // Nullable — session can exist without an assigned coach
    coachId: text("coach_id"),
    date: text("date").notNull(), // YYYY-MM-DD
    startTime: text("start_time").notNull(), // HH:MM (24-hour)
    durationMinutes: integer("duration_minutes").notNull().default(60),
    capacity: integer("capacity").notNull(),
    location: text("location"),
    // Optional link to a workout definition (from programme hierarchy or template).
    // Informational — shows "Today's Workout" in session detail.
    // Actual member performance records live in workout_instances (separate system).
    workoutId: text("workout_id"),
    status: text("status").notNull().default("SCHEDULED"),
    notes: text("notes"),
    // Groups sessions created from the same recurring schedule
    recurringGroupId: text("recurring_group_id"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    index("sessions_org_date_idx").on(table.organisationId, table.date),
    index("sessions_recurring_idx").on(table.recurringGroupId),
  ],
);

// ---------------------------------------------------------------------------
// Bookings — one row per member per session, updated in place
//
// Status lifecycle:
//   BOOKED → ATTENDED (coach marks, or auto on completion)
//   BOOKED → CANCELLED (member cancels before window, no fee)
//   BOOKED → LATE_CANCEL (member cancels inside window, fee recorded)
//   BOOKED → NO_SHOW (session passed, coach marks or system flags, fee recorded)
//   LATE_CANCEL / NO_SHOW → fee fields populated
//
// Capacity is counted from status IN ('BOOKED', 'ATTENDED').
// ---------------------------------------------------------------------------

export const BOOKING_STATUSES = [
  "BOOKED",
  "ATTENDED",
  "NO_SHOW",
  "CANCELLED",
  "LATE_CANCEL",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const bookingsTable = pgTable(
  "bookings",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organisationId: text("organisation_id").notNull(),
    sessionId: text("session_id").notNull(),
    memberId: text("member_id").notNull(),
    status: text("status").notNull().default("BOOKED"),
    bookedAt: timestamp("booked_at").defaultNow(),
    // Populated when status changes to CANCELLED or LATE_CANCEL
    cancelledAt: timestamp("cancelled_at"),
    // Populated when status is NO_SHOW or LATE_CANCEL
    feeAmountCents: integer("fee_amount_cents"),
    // "NO_SHOW" | "LATE_CANCEL" — reason for the fee
    feeReason: text("fee_reason"),
    // userId of the coach/system who last changed the status
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => [
    uniqueIndex("bookings_session_member_unique").on(
      table.sessionId,
      table.memberId,
    ),
    index("bookings_session_idx").on(table.sessionId),
    index("bookings_member_org_idx").on(table.memberId, table.organisationId),
  ],
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SessionType = typeof sessionTypesTable.$inferSelect;
export type InsertSessionType = typeof sessionTypesTable.$inferInsert;
export type Session = typeof sessionsTable.$inferSelect;
export type InsertSession = typeof sessionsTable.$inferInsert;
export type Booking = typeof bookingsTable.$inferSelect;
export type InsertBooking = typeof bookingsTable.$inferInsert;
