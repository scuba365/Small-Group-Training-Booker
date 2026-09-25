import { Router } from "express";
import { db } from "@workspace/db";
import {
  sessionTypesTable,
  sessionsTable,
  bookingsTable,
  organisationsTable,
  organisationMembersTable,
  usersTable,
  workoutsTable,
} from "@workspace/db";
import {
  eq,
  and,
  gte,
  lte,
  inArray,
  count,
  sql,
  asc,
} from "drizzle-orm";
import { z } from "zod";
import { requireCoach } from "../middleware/require-role";
import { logger } from "../lib/logger";
import type { Request, Response } from "express";

const router = Router();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Combine YYYY-MM-DD + HH:MM into a Date (local time). */
function sessionDateTime(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00`);
}

/** Generate dates in [startDate, endDate] whose day-of-week is in daysOfWeek. */
function generateDates(
  startDate: string,
  endDate: string,
  daysOfWeek: number[],
): string[] {
  const dates: string[] = [];
  const end = new Date(endDate + "T00:00:00");
  const cur = new Date(startDate + "T00:00:00");
  while (cur <= end) {
    if (daysOfWeek.includes(cur.getDay())) {
      dates.push(cur.toISOString().slice(0, 10));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const ACTIVE_STATUSES = ["BOOKED", "ATTENDED"] as const;

// ---------------------------------------------------------------------------
// Validation schemas
// ---------------------------------------------------------------------------

const TimeStr = z.string().regex(/^\d{2}:\d{2}$/, "Must be HH:MM");
const DateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD");

const CreateSessionTypeBody = z.object({
  name: z.string().min(1).max(100),
  color: z.string().max(20).optional(),
  defaultDurationMinutes: z.number().int().positive().optional(),
  defaultCapacity: z.number().int().positive().optional(),
});

const UpdateSessionTypeBody = CreateSessionTypeBody.partial();

const CreateSessionBody = z.object({
  sessionTypeId: z.string().optional(),
  name: z.string().min(1).max(200),
  coachId: z.string().optional(),
  date: DateStr,
  startTime: TimeStr,
  durationMinutes: z.number().int().positive().default(60),
  capacity: z.number().int().positive(),
  location: z.string().max(200).optional(),
  workoutId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

const UpdateSessionBody = CreateSessionBody.partial();

const RecurringBody = CreateSessionBody.omit({ date: true }).extend({
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1)
    .max(7),
  startDate: DateStr,
  // Optional — if omitted the recurring schedule runs for 1 year from startDate
  endDate: DateStr.optional(),
});

const SessionsQuery = z.object({
  start: DateStr,
  end: DateStr,
});

const BookBody = z.object({
  // Coach-only: book on behalf of another member
  memberId: z.string().optional(),
});

const AttendanceBody = z.object({
  status: z.enum(["ATTENDED", "NO_SHOW", "BOOKED", "CANCELLED", "LATE_CANCEL"]),
  feeAmountCents: z.number().int().nonnegative().optional(),
});

// ---------------------------------------------------------------------------
// Session Types
// ---------------------------------------------------------------------------

router.get(
  "/session-types",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(sessionTypesTable)
        .where(
          and(
            eq(sessionTypesTable.organisationId, req.organisationId!),
            eq(sessionTypesTable.isArchived, false),
          ),
        )
        .orderBy(asc(sessionTypesTable.name));
      res.json(rows);
    } catch (err) {
      logger.error({ err }, "List session types error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.post(
  "/session-types",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateSessionTypeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const [row] = await db
        .insert(sessionTypesTable)
        .values({ ...parsed.data, organisationId: req.organisationId! })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      logger.error({ err }, "Create session type error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.put(
  "/session-types/:id",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UpdateSessionTypeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const [updated] = await db
        .update(sessionTypesTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(
            eq(sessionTypesTable.id, req.params.id as string),
            eq(sessionTypesTable.organisationId, req.organisationId!),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Session type not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Update session type error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.delete(
  "/session-types/:id",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [updated] = await db
        .update(sessionTypesTable)
        .set({ isArchived: true, updatedAt: new Date() })
        .where(
          and(
            eq(sessionTypesTable.id, req.params.id as string),
            eq(sessionTypesTable.organisationId, req.organisationId!),
          ),
        )
        .returning({ id: sessionTypesTable.id });
      if (!updated) {
        res.status(404).json({ error: "Session type not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Archive session type error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Sessions — list
// ---------------------------------------------------------------------------

router.get(
  "/sessions",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SessionsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        error: "Query params ?start=YYYY-MM-DD&end=YYYY-MM-DD required",
        details: parsed.error.flatten(),
      });
      return;
    }
    const { start, end } = parsed.data;
    const orgId = req.organisationId!;

    try {
      // One query: sessions + session type + coach name
      const sessionRows = await db
        .select({
          session: sessionsTable,
          sessionTypeName: sessionTypesTable.name,
          sessionTypeColor: sessionTypesTable.color,
          coachName: usersTable.name,
        })
        .from(sessionsTable)
        .leftJoin(
          sessionTypesTable,
          eq(sessionsTable.sessionTypeId, sessionTypesTable.id),
        )
        .leftJoin(usersTable, eq(sessionsTable.coachId, usersTable.id))
        .where(
          and(
            eq(sessionsTable.organisationId, orgId),
            gte(sessionsTable.date, start),
            lte(sessionsTable.date, end),
            eq(sessionsTable.status, "SCHEDULED"),
          ),
        )
        .orderBy(asc(sessionsTable.date), asc(sessionsTable.startTime));

      if (sessionRows.length === 0) {
        res.json([]);
        return;
      }

      const sessionIds = sessionRows.map((r) => r.session.id);
      const userId = req.user!.id;

      // One query: all bookings for returned sessions
      const bookingRows = await db
        .select({
          sessionId: bookingsTable.sessionId,
          memberId: bookingsTable.memberId,
          status: bookingsTable.status,
        })
        .from(bookingsTable)
        .where(inArray(bookingsTable.sessionId, sessionIds));

      // Assemble counts and user's own booking status
      const countMap = new Map<string, number>();
      const myStatusMap = new Map<string, string>();

      for (const b of bookingRows) {
        if ((ACTIVE_STATUSES as readonly string[]).includes(b.status)) {
          countMap.set(b.sessionId, (countMap.get(b.sessionId) ?? 0) + 1);
        }
        if (b.memberId === userId) {
          myStatusMap.set(b.sessionId, b.status);
        }
      }

      res.json(
        sessionRows.map(({ session, sessionTypeName, sessionTypeColor, coachName }) => ({
          ...session,
          sessionTypeName,
          sessionTypeColor,
          coachName,
          bookedCount: countMap.get(session.id) ?? 0,
          myBookingStatus: myStatusMap.get(session.id) ?? null,
        })),
      );
    } catch (err) {
      logger.error({ err }, "List sessions error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Sessions — detail
// ---------------------------------------------------------------------------

router.get(
  "/sessions/:id",
  async (req: Request, res: Response): Promise<void> => {
    const orgId = req.organisationId!;
    try {
      const [sessionRow] = await db
        .select({
          session: sessionsTable,
          sessionTypeName: sessionTypesTable.name,
          sessionTypeColor: sessionTypesTable.color,
          coachName: usersTable.name,
        })
        .from(sessionsTable)
        .leftJoin(
          sessionTypesTable,
          eq(sessionsTable.sessionTypeId, sessionTypesTable.id),
        )
        .leftJoin(usersTable, eq(sessionsTable.coachId, usersTable.id))
        .where(
          and(
            eq(sessionsTable.id, req.params.id as string),
            eq(sessionsTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!sessionRow) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      // Bookings with member names — one query
      const bookingRows = await db
        .select({
          booking: bookingsTable,
          memberName: usersTable.name,
          memberEmail: usersTable.email,
        })
        .from(bookingsTable)
        .innerJoin(usersTable, eq(bookingsTable.memberId, usersTable.id))
        .where(eq(bookingsTable.sessionId, req.params.id as string))
        .orderBy(asc(bookingsTable.bookedAt));

      // Workout name only (coach clicks "Open Workout" for full detail)
      let workout: { id: string; name: string } | null = null;
      if (sessionRow.session.workoutId) {
        const [workoutRow] = await db
          .select({ id: workoutsTable.id, name: workoutsTable.name })
          .from(workoutsTable)
          .where(eq(workoutsTable.id, sessionRow.session.workoutId))
          .limit(1);
        if (workoutRow) workout = workoutRow;
      }

      const bookedCount = bookingRows.filter((b) =>
        (ACTIVE_STATUSES as readonly string[]).includes(b.booking.status),
      ).length;

      res.json({
        ...sessionRow.session,
        sessionTypeName: sessionRow.sessionTypeName,
        sessionTypeColor: sessionRow.sessionTypeColor,
        coachName: sessionRow.coachName,
        bookedCount,
        bookings: bookingRows.map(({ booking, memberName, memberEmail }) => ({
          ...booking,
          memberName,
          memberEmail,
        })),
        workout,
      });
    } catch (err) {
      logger.error({ err }, "Get session error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Sessions — create (single)
// Must be registered BEFORE /:id routes to avoid "recurring" matching /:id
// ---------------------------------------------------------------------------

router.post(
  "/sessions",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const [session] = await db
        .insert(sessionsTable)
        .values({ ...parsed.data, organisationId: req.organisationId! })
        .returning();
      res.status(201).json(session);
    } catch (err) {
      logger.error({ err }, "Create session error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Sessions — create (recurring)
// ---------------------------------------------------------------------------

router.post(
  "/sessions/recurring",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = RecurringBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    const { daysOfWeek, startDate, endDate: rawEndDate, ...fields } = parsed.data;

    // If no end date, default to 1 year from start
    const endDate =
      rawEndDate ??
      (() => {
        const d = new Date(startDate + "T00:00:00");
        d.setFullYear(d.getFullYear() + 1);
        return d.toISOString().slice(0, 10);
      })();

    if (new Date(endDate) < new Date(startDate)) {
      res.status(400).json({ error: "endDate must be on or after startDate" });
      return;
    }

    const dates = generateDates(startDate, endDate, daysOfWeek);
    if (dates.length === 0) {
      res.status(400).json({
        error: "No matching dates found for the given daysOfWeek in the date range",
      });
      return;
    }
    if (dates.length > 500) {
      res.status(400).json({
        error: "Recurring range would generate more than 500 sessions — reduce the date range",
      });
      return;
    }

    try {
      const recurringGroupId = crypto.randomUUID();
      const sessions = await db
        .insert(sessionsTable)
        .values(
          dates.map((date) => ({
            ...fields,
            date,
            organisationId: req.organisationId!,
            recurringGroupId,
          })),
        )
        .returning();

      res.status(201).json({ recurringGroupId, count: sessions.length, sessions });
    } catch (err) {
      logger.error({ err }, "Create recurring sessions error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Sessions — update / cancel
// ---------------------------------------------------------------------------

router.put(
  "/sessions/:id",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = UpdateSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }
    try {
      const [updated] = await db
        .update(sessionsTable)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(
          and(
            eq(sessionsTable.id, req.params.id as string),
            eq(sessionsTable.organisationId, req.organisationId!),
          ),
        )
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Update session error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

router.delete(
  "/sessions/:id",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [updated] = await db
        .update(sessionsTable)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(
          and(
            eq(sessionsTable.id, req.params.id as string),
            eq(sessionsTable.organisationId, req.organisationId!),
          ),
        )
        .returning({ id: sessionsTable.id });
      if (!updated) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      res.status(204).send();
    } catch (err) {
      logger.error({ err }, "Cancel session error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Bookings — book a session
// ---------------------------------------------------------------------------

router.post(
  "/sessions/:id/bookings",
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.params.id as string;
    const orgId = req.organisationId!;
    const currentUserId = req.user!.id;
    const isCoach = req.user!.role !== "MEMBER";

    const parsed = BookBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    if (parsed.data.memberId && !isCoach) {
      res.status(403).json({ error: "Only coaches can book on behalf of a member" });
      return;
    }

    const memberId = parsed.data.memberId ?? currentUserId;

    try {
      const [sessionRow, org] = await Promise.all([
        db
          .select()
          .from(sessionsTable)
          .where(
            and(
              eq(sessionsTable.id, sessionId),
              eq(sessionsTable.organisationId, orgId),
            ),
          )
          .limit(1)
          .then((r) => r[0]),
        db
          .select()
          .from(organisationsTable)
          .where(eq(organisationsTable.id, orgId))
          .limit(1)
          .then((r) => r[0]),
      ]);

      if (!sessionRow) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      if (sessionRow.status === "CANCELLED") {
        res.status(409).json({ error: "This session has been cancelled" });
        return;
      }

      // When booking for another member, verify they belong to this org
      if (memberId !== currentUserId) {
        const [membership] = await db
          .select({ id: organisationMembersTable.id })
          .from(organisationMembersTable)
          .where(
            and(
              eq(organisationMembersTable.userId, memberId),
              eq(organisationMembersTable.organisationId, orgId),
              eq(organisationMembersTable.status, "ACTIVE"),
            ),
          )
          .limit(1);
        if (!membership) {
          res.status(404).json({ error: "Member not found in this organisation" });
          return;
        }
      }

      // Members are subject to booking window rules; coaches bypass
      if (!isCoach && org) {
        const sessionDT = sessionDateTime(sessionRow.date, sessionRow.startTime);
        const now = new Date();
        const openAt = new Date(
          sessionDT.getTime() - (org.bookingOpenHours ?? 168) * 3_600_000,
        );
        const closeAt = new Date(
          sessionDT.getTime() - (org.bookingCloseHours ?? 12) * 3_600_000,
        );
        if (now < openAt) {
          res.status(400).json({
            error: `Bookings open ${org.bookingOpenHours} hours before the session`,
          });
          return;
        }
        if (now > closeAt) {
          res.status(400).json({
            error: `Booking window has closed — book at least ${org.bookingCloseHours} hours in advance`,
          });
          return;
        }
      }

      // Concurrency-safe capacity check: lock the session row, count, insert
      let booking;
      try {
        booking = await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT id FROM sessions WHERE id = ${sessionId} FOR UPDATE`,
          );

          const [{ activeCount }] = await tx
            .select({ activeCount: count() })
            .from(bookingsTable)
            .where(
              and(
                eq(bookingsTable.sessionId, sessionId),
                inArray(bookingsTable.status, [...ACTIVE_STATUSES]),
              ),
            );

          if (Number(activeCount) >= sessionRow.capacity) {
            throw Object.assign(new Error("full"), { code: "FULL" });
          }

          const [existing] = await tx
            .select()
            .from(bookingsTable)
            .where(
              and(
                eq(bookingsTable.sessionId, sessionId),
                eq(bookingsTable.memberId, memberId),
              ),
            )
            .limit(1);

          if (existing) {
            if (
              existing.status === "BOOKED" ||
              existing.status === "ATTENDED"
            ) {
              throw Object.assign(new Error("duplicate"), { code: "DUPLICATE" });
            }
            // Reactivate a previously cancelled booking
            const [updated] = await tx
              .update(bookingsTable)
              .set({
                status: "BOOKED",
                bookedAt: new Date(),
                cancelledAt: null,
                feeAmountCents: null,
                feeReason: null,
                updatedBy: currentUserId,
                updatedAt: new Date(),
              })
              .where(eq(bookingsTable.id, existing.id))
              .returning();
            return updated;
          }

          const [inserted] = await tx
            .insert(bookingsTable)
            .values({
              organisationId: orgId,
              sessionId,
              memberId,
              status: "BOOKED",
              updatedBy: currentUserId,
            })
            .returning();
          return inserted;
        });
      } catch (err: unknown) {
        const e = err as { code?: string };
        if (e.code === "FULL") {
          res.status(409).json({ error: "This session is full" });
          return;
        }
        if (e.code === "DUPLICATE") {
          res.status(409).json({ error: "Already booked for this session" });
          return;
        }
        throw err;
      }

      res.status(201).json(booking);
    } catch (err) {
      logger.error({ err }, "Book session error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Bookings — cancel
// ---------------------------------------------------------------------------

router.patch(
  "/sessions/:id/bookings/:bookingId",
  async (req: Request, res: Response): Promise<void> => {
    const { bookingId } = req.params;
    const sessionId = req.params.id as string;
    const orgId = req.organisationId!;
    const currentUserId = req.user!.id;
    const isCoach = req.user!.role !== "MEMBER";

    try {
      const [booking] = await db
        .select()
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.id, bookingId as string),
            eq(bookingsTable.sessionId, sessionId),
            eq(bookingsTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!booking) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }
      if (!isCoach && booking.memberId !== currentUserId) {
        res.status(403).json({ error: "You can only cancel your own bookings" });
        return;
      }
      if (booking.status !== "BOOKED") {
        res.status(409).json({ error: `Booking is already ${booking.status}` });
        return;
      }

      let newStatus: "CANCELLED" | "LATE_CANCEL" = "CANCELLED";
      let feeAmountCents: number | null = null;
      let feeReason: string | null = null;

      // Members get late-cancel fee if inside the cancellation window
      if (!isCoach) {
        const [sessionRow, org] = await Promise.all([
          db
            .select({ date: sessionsTable.date, startTime: sessionsTable.startTime })
            .from(sessionsTable)
            .where(eq(sessionsTable.id, sessionId))
            .limit(1)
            .then((r) => r[0]),
          db
            .select({
              bookingCloseHours: organisationsTable.bookingCloseHours,
              noShowFeeCents: organisationsTable.noShowFeeCents,
            })
            .from(organisationsTable)
            .where(eq(organisationsTable.id, orgId))
            .limit(1)
            .then((r) => r[0]),
        ]);

        if (sessionRow && org) {
          const sessionDT = sessionDateTime(sessionRow.date, sessionRow.startTime);
          const closeAt = new Date(
            sessionDT.getTime() - (org.bookingCloseHours ?? 12) * 3_600_000,
          );
          if (new Date() > closeAt) {
            newStatus = "LATE_CANCEL";
            feeAmountCents = org.noShowFeeCents ?? 500;
            feeReason = "LATE_CANCEL";
          }
        }
      }

      const [updated] = await db
        .update(bookingsTable)
        .set({
          status: newStatus,
          cancelledAt: new Date(),
          feeAmountCents,
          feeReason,
          updatedBy: currentUserId,
          updatedAt: new Date(),
        })
        .where(eq(bookingsTable.id, bookingId as string))
        .returning();

      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Cancel booking error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Bookings — update attendance (coach only)
// ---------------------------------------------------------------------------

router.patch(
  "/sessions/:id/bookings/:bookingId/attendance",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const { bookingId } = req.params;
    const sessionId = req.params.id as string;
    const orgId = req.organisationId!;

    const parsed = AttendanceBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request body", details: parsed.error.flatten() });
      return;
    }

    try {
      const [booking] = await db
        .select()
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.id, bookingId as string),
            eq(bookingsTable.sessionId, sessionId),
            eq(bookingsTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!booking) {
        res.status(404).json({ error: "Booking not found" });
        return;
      }

      const updates: Record<string, unknown> = {
        status: parsed.data.status,
        updatedBy: req.user!.id,
        updatedAt: new Date(),
      };

      // Auto-apply fee for NO_SHOW from org settings if not explicitly provided
      if (parsed.data.status === "NO_SHOW" && booking.feeAmountCents === null) {
        if (parsed.data.feeAmountCents !== undefined) {
          updates.feeAmountCents = parsed.data.feeAmountCents;
          updates.feeReason = "NO_SHOW";
        } else {
          const [org] = await db
            .select({ noShowFeeCents: organisationsTable.noShowFeeCents })
            .from(organisationsTable)
            .where(eq(organisationsTable.id, orgId))
            .limit(1);
          updates.feeAmountCents = org?.noShowFeeCents ?? 500;
          updates.feeReason = "NO_SHOW";
        }
      } else if (parsed.data.feeAmountCents !== undefined) {
        updates.feeAmountCents = parsed.data.feeAmountCents;
      }

      const [updated] = await db
        .update(bookingsTable)
        .set(updates)
        .where(eq(bookingsTable.id, bookingId as string))
        .returning();

      res.json(updated);
    } catch (err) {
      logger.error({ err }, "Update attendance error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

// ---------------------------------------------------------------------------
// Bookings — mark all attended (coach only)
// ---------------------------------------------------------------------------

router.post(
  "/sessions/:id/mark-all-attended",
  requireCoach,
  async (req: Request, res: Response): Promise<void> => {
    const sessionId = req.params.id as string;
    const orgId = req.organisationId!;

    try {
      const [session] = await db
        .select({ id: sessionsTable.id })
        .from(sessionsTable)
        .where(
          and(
            eq(sessionsTable.id, sessionId),
            eq(sessionsTable.organisationId, orgId),
          ),
        )
        .limit(1);

      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const updated = await db
        .update(bookingsTable)
        .set({
          status: "ATTENDED",
          updatedBy: req.user!.id,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(bookingsTable.sessionId, sessionId),
            eq(bookingsTable.status, "BOOKED"),
          ),
        )
        .returning({ id: bookingsTable.id });

      res.json({ updated: updated.length });
    } catch (err) {
      logger.error({ err }, "Mark all attended error");
      res.status(500).json({ error: "Internal server error" });
    }
  },
);

export default router;
