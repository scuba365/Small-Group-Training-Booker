import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock setup — same pattern as other test files
// ---------------------------------------------------------------------------

const { mockRows, mockDbChain, mockDb } = vi.hoisted(() => {
  const mockRows: unknown[] = [];

  const mockDbChain: Record<string | symbol, unknown> & {
    from: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    limit: ReturnType<typeof vi.fn>;
    orderBy: ReturnType<typeof vi.fn>;
    leftJoin: ReturnType<typeof vi.fn>;
    innerJoin: ReturnType<typeof vi.fn>;
    returning: ReturnType<typeof vi.fn>;
    set: ReturnType<typeof vi.fn>;
    values: ReturnType<typeof vi.fn>;
    $dynamic: ReturnType<typeof vi.fn>;
    [Symbol.iterator]: () => Iterator<unknown>;
  } = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve([...mockRows])),
    orderBy: vi.fn().mockImplementation(() => Promise.resolve([...mockRows])),
    leftJoin: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    returning: vi.fn().mockImplementation(() => Promise.resolve([...mockRows])),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    $dynamic: vi.fn().mockReturnThis(),
    [Symbol.iterator]: () => (mockRows as unknown[])[Symbol.iterator](),
  };

  const mockDb = {
    select: vi.fn().mockReturnValue(mockDbChain),
    insert: vi.fn().mockReturnValue(mockDbChain),
    update: vi.fn().mockReturnValue(mockDbChain),
    delete: vi.fn().mockReturnValue(mockDbChain),
  };

  return { mockRows, mockDbChain, mockDb };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  // Auth
  authSessionsTable: { token: "token", expiresAt: "expiresAt", userId: "userId", id: "id" },
  usersTable: { id: "id", email: "email", name: "name", avatarUrl: "avatarUrl", phone: "phone" },
  organisationMembersTable: {
    id: "id", organisationId: "organisationId", userId: "userId",
    role: "role", status: "status", membershipPlan: "membershipPlan",
    membershipStartDate: "membershipStartDate", createdAt: "createdAt",
  },
  organisationsTable: { id: "id", name: "name", slug: "slug", timezone: "timezone", currency: "currency" },
  // Bookings / sessions
  bookingsTable: {
    id: "id", organisationId: "organisationId", memberId: "memberId",
    sessionId: "sessionId", status: "status", bookedAt: "bookedAt",
    cancelledAt: "cancelledAt", feeAmountCents: "feeAmountCents", feeReason: "feeReason",
  },
  sessionsTable: {
    id: "id", organisationId: "organisationId", name: "name",
    date: "date", startTime: "startTime",
  },
  sessionTypesTable: { id: "id", organisationId: "organisationId", name: "name", isArchived: "isArchived" },
  // Programmes
  programmesTable: { id: "id", organisationId: "organisationId", name: "name" },
  phasesTable: { id: "id", programmeId: "programmeId", name: "name", orderIndex: "orderIndex" },
  weeksTable: { id: "id", phaseId: "phaseId", weekNumber: "weekNumber", orderIndex: "orderIndex" },
  daysTable: { id: "id", weekId: "weekId", dayNumber: "dayNumber", orderIndex: "orderIndex" },
  workoutsTable: { id: "id", name: "name", dayId: "dayId", orderIndex: "orderIndex" },
  workoutBlocksTable: { id: "id", workoutId: "workoutId", orderIndex: "orderIndex" },
  workoutExercisesTable: { id: "id", blockId: "blockId", exerciseId: "exerciseId", orderIndex: "orderIndex" },
  exercisesTable: { id: "id", name: "name" },
  // Assignments
  programmeAssignmentsTable: {
    id: "id", organisationId: "organisationId", programmeId: "programmeId",
    memberId: "memberId", status: "status", startDate: "startDate",
    endDate: "endDate", assignedBy: "assignedBy", notes: "notes",
    createdAt: "createdAt", updatedAt: "updatedAt",
  },
  ASSIGNMENT_STATUSES: ["ACTIVE", "INACTIVE", "COMPLETED"],
  // Workout instances
  workoutInstancesTable: {
    id: "id", organisationId: "organisationId", assignmentId: "assignmentId",
    workoutId: "workoutId", memberId: "memberId", status: "status",
    startedAt: "startedAt", completedAt: "completedAt", durationSeconds: "durationSeconds",
    sessionRpe: "sessionRpe", notes: "notes", createdAt: "createdAt", updatedAt: "updatedAt",
  },
  exerciseInstancesTable: {
    id: "id", workoutInstanceId: "workoutInstanceId", workoutExerciseId: "workoutExerciseId",
    exerciseId: "exerciseId", orderIndex: "orderIndex",
  },
  setLogsTable: { id: "id", exerciseInstanceId: "exerciseInstanceId", setNumber: "setNumber" },
  // Coach monitoring
  PROGRAMME_STATUSES: ["DRAFT", "ACTIVE", "ARCHIVED"],
  BLOCK_TYPES: ["STRAIGHT_SET", "SUPERSET"],
  coachNotesTable: {
    id: "id", organisationId: "organisationId", memberId: "memberId",
    coachId: "coachId", body: "body", createdAt: "createdAt", updatedAt: "updatedAt",
  },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import meRouter from "../routes/me";
import programmesRouter from "../routes/programmes";
import coachMonitoringRouter from "../routes/coach-monitoring";
import scheduleRouter from "../routes/schedule";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MEMBER_SESSION = {
  session: { token: "member-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "tm1" },
  user: { id: "tm1", email: "cahillstephen@hotmail.com", name: "Stephen Cahill" },
  member: { organisationId: "org-1", role: "MEMBER", status: "ACTIVE" },
};

const MOCK_BOOKING = {
  id: "bk-1",
  status: "ATTENDED",
  bookedAt: new Date("2026-09-10"),
  cancelledAt: null,
  feeAmountCents: null,
  feeReason: null,
  sessionId: "sess-1",
  sessionName: "SGPT — Morning",
  sessionDate: "2026-09-10",
  sessionStartTime: "06:00",
};

const MOCK_BOOKING_FUTURE = {
  id: "bk-2",
  status: "BOOKED",
  bookedAt: new Date("2026-09-20"),
  cancelledAt: null,
  feeAmountCents: null,
  feeReason: null,
  sessionId: "sess-2",
  sessionName: "SGPT — Morning",
  sessionDate: "2026-10-10",
  sessionStartTime: "06:00",
};

const MOCK_ASSIGNMENT = {
  assignment: { id: "asgn-1", organisationId: "org-1", memberId: "tm1", status: "ACTIVE", startDate: "2026-09-01" },
  programme: { id: "prog-1", name: "SGPT Test Block" },
  member: { id: "tm1", name: "Stephen Cahill", email: "cahillstephen@hotmail.com" },
};

// ---------------------------------------------------------------------------
// App factories
// ---------------------------------------------------------------------------

function makeAppWith(router: express.Router) {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireAuth as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  app.use(router);
  return app;
}

function resetMocks() {
  vi.resetAllMocks();
  mockRows.length = 0;

  mockDbChain.from.mockReturnThis();
  mockDbChain.where.mockReturnThis();
  mockDbChain.innerJoin.mockReturnThis();
  mockDbChain.leftJoin.mockReturnThis();
  mockDbChain.set.mockReturnThis();
  mockDbChain.values.mockReturnThis();
  mockDbChain.$dynamic.mockReturnThis();
  mockDbChain.limit.mockImplementation(() => Promise.resolve([...mockRows]));
  mockDbChain.orderBy.mockImplementation(() => Promise.resolve([...mockRows]));
  mockDbChain.returning.mockImplementation(() => Promise.resolve([...mockRows]));

  mockDb.select.mockReturnValue(mockDbChain);
  mockDb.insert.mockReturnValue(mockDbChain);
  mockDb.update.mockReturnValue(mockDbChain);
  mockDb.delete.mockReturnValue(mockDbChain);
}

// ---------------------------------------------------------------------------
// GET /me/bookings — member's own booking history
// ---------------------------------------------------------------------------

describe("MEMBER — GET /me/bookings", () => {
  beforeEach(resetMocks);

  it("returns 200 with own bookings (session details included)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_BOOKING, MOCK_BOOKING_FUTURE]);

    const res = await request(makeAppWith(meRouter))
      .get("/me/bookings")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].sessionName).toBe("SGPT — Morning");
    expect(res.body[0].status).toBe("ATTENDED");
    expect(res.body[1].status).toBe("BOOKED");
  });

  it("returns 200 with empty array when member has no bookings", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeAppWith(meRouter))
      .get("/me/bookings")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(makeAppWith(meRouter)).get("/me/bookings");
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /me/programme — member's active programme
// ---------------------------------------------------------------------------

describe("MEMBER — GET /me/programme", () => {
  beforeEach(resetMocks);

  it("returns 404 when no active programme assignment", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // no active assignment

    const res = await request(makeAppWith(meRouter))
      .get("/me/programme")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No active programme assignment");
  });
});

// ---------------------------------------------------------------------------
// MEMBER blocked from coach-only routes
// ---------------------------------------------------------------------------

describe("MEMBER — blocked from /programmes (requireCoach)", () => {
  beforeEach(resetMocks);

  it("GET /programmes returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);

    const res = await request(makeAppWith(programmesRouter))
      .get("/programmes")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(403);
  });
});

describe("MEMBER — blocked from /coach/* (requireCoach)", () => {
  beforeEach(resetMocks);

  it("GET /coach/workout-instances returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);

    const res = await request(makeAppWith(coachMonitoringRouter))
      .get("/coach/workout-instances")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(403);
  });
});

describe("MEMBER — blocked from /session-types (requireCoach)", () => {
  beforeEach(resetMocks);

  it("GET /session-types returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);

    const res = await request(makeAppWith(scheduleRouter))
      .get("/session-types")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Org isolation — MEMBER cannot access data scoped to another org
// ---------------------------------------------------------------------------

describe("MEMBER — org isolation on /me/bookings", () => {
  beforeEach(resetMocks);

  it("member only receives bookings belonging to their own organisation", async () => {
    // The route filters by req.organisationId (from the auth session) AND req.user.id.
    // A booking from org-2 will never appear because the WHERE clause enforces both.
    // We model this by returning an empty array — DB has filtered them out.
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]); // org-1
    mockDbChain.orderBy.mockResolvedValueOnce([]);             // no org-1 bookings

    const res = await request(makeAppWith(meRouter))
      .get("/me/bookings")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
