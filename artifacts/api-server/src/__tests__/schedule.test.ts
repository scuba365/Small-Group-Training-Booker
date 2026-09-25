import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock setup
// ---------------------------------------------------------------------------

const { mockRows, mockDbChain, mockTx, mockDb } = vi.hoisted(() => {
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
    execute: ReturnType<typeof vi.fn>;
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
    execute: vi.fn().mockResolvedValue(undefined),
    [Symbol.iterator]: () => (mockRows as unknown[])[Symbol.iterator](),
  };

  // tx shares the same chain; transaction passes it to the callback
  const mockTx = {
    execute: vi.fn().mockResolvedValue(undefined),
    select: vi.fn().mockReturnValue(mockDbChain),
    insert: vi.fn().mockReturnValue(mockDbChain),
    update: vi.fn().mockReturnValue(mockDbChain),
  };

  const mockDb = {
    select: vi.fn().mockReturnValue(mockDbChain),
    insert: vi.fn().mockReturnValue(mockDbChain),
    update: vi.fn().mockReturnValue(mockDbChain),
    delete: vi.fn().mockReturnValue(mockDbChain),
    transaction: vi.fn().mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) =>
      fn(mockTx),
    ),
  };

  return { mockRows, mockDbChain, mockTx, mockDb };
});

vi.mock("@workspace/db", () => ({
  db: mockDb,
  authSessionsTable: { token: "token", expiresAt: "expiresAt", userId: "userId", id: "id" },
  usersTable: { id: "id", email: "email", name: "name" },
  organisationMembersTable: {
    id: "id",
    organisationId: "organisationId",
    role: "role",
    status: "status",
    userId: "userId",
  },
  organisationsTable: {
    id: "id",
    bookingOpenHours: "bookingOpenHours",
    bookingCloseHours: "bookingCloseHours",
    noShowFeeCents: "noShowFeeCents",
  },
  sessionTypesTable: {
    id: "id",
    organisationId: "organisationId",
    name: "name",
    color: "color",
    isArchived: "isArchived",
    defaultDurationMinutes: "defaultDurationMinutes",
    defaultCapacity: "defaultCapacity",
  },
  sessionsTable: {
    id: "id",
    organisationId: "organisationId",
    sessionTypeId: "sessionTypeId",
    name: "name",
    coachId: "coachId",
    date: "date",
    startTime: "startTime",
    durationMinutes: "durationMinutes",
    capacity: "capacity",
    location: "location",
    workoutId: "workoutId",
    status: "status",
    notes: "notes",
    recurringGroupId: "recurringGroupId",
  },
  bookingsTable: {
    id: "id",
    organisationId: "organisationId",
    sessionId: "sessionId",
    memberId: "memberId",
    status: "status",
    bookedAt: "bookedAt",
    cancelledAt: "cancelledAt",
    feeAmountCents: "feeAmountCents",
    feeReason: "feeReason",
    updatedBy: "updatedBy",
  },
  workoutsTable: {
    id: "id",
    name: "name",
  },
  clientsTable: { id: "id", organisationId: "organisationId", isMember: "isMember" },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import scheduleRouter from "../routes/schedule";

// ---------------------------------------------------------------------------
// Shared session fixtures
// ---------------------------------------------------------------------------

const COACH_SESSION = {
  session: { token: "coach-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "u1" },
  user: { id: "u1", email: "coach@test.com", name: "Coach One", role: "COACH" },
  member: { organisationId: "org-1", role: "COACH", status: "ACTIVE" },
};

const MEMBER_SESSION = {
  session: { token: "member-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "u2" },
  user: { id: "u2", email: "member@test.com", name: "Member One", role: "MEMBER" },
  member: { organisationId: "org-1", role: "MEMBER", status: "ACTIVE" },
};

const ORG_B_COACH = {
  session: { token: "orgb-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "u3" },
  user: { id: "u3", email: "coach@orgb.com", name: "Org B Coach", role: "COACH" },
  member: { organisationId: "org-2", role: "COACH", status: "ACTIVE" },
};

// ---------------------------------------------------------------------------
// Shared data fixtures
// ---------------------------------------------------------------------------

const MOCK_SESSION_TYPE = {
  id: "st-1",
  organisationId: "org-1",
  name: "SGPT",
  color: "#ef4444",
  defaultDurationMinutes: 45,
  defaultCapacity: 6,
  isArchived: false,
};

const MOCK_SESSION = {
  id: "sess-1",
  organisationId: "org-1",
  sessionTypeId: "st-1",
  name: "SGPT Morning",
  coachId: "u1",
  date: "2030-06-15",
  startTime: "06:00",
  durationMinutes: 45,
  capacity: 6,
  location: "Main floor",
  workoutId: null,
  status: "SCHEDULED",
  notes: null,
  recurringGroupId: null,
};

const MOCK_ORG = {
  id: "org-1",
  bookingOpenHours: 9999,
  bookingCloseHours: 0,
  noShowFeeCents: 500,
};

const MOCK_BOOKING = {
  id: "book-1",
  organisationId: "org-1",
  sessionId: "sess-1",
  memberId: "u2",
  status: "BOOKED",
  bookedAt: new Date().toISOString(),
  cancelledAt: null,
  feeAmountCents: null,
  feeReason: null,
  updatedBy: "u2",
};

// ---------------------------------------------------------------------------
// App factory + reset
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireAuth as Parameters<typeof app.use>[0]);
  app.use(scheduleRouter);
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
  mockDbChain.execute.mockResolvedValue(undefined);
  mockDbChain.limit.mockImplementation(() => Promise.resolve([...mockRows]));
  mockDbChain.orderBy.mockImplementation(() => Promise.resolve([...mockRows]));
  mockDbChain.returning.mockImplementation(() => Promise.resolve([...mockRows]));

  mockTx.execute.mockResolvedValue(undefined);
  mockTx.select.mockReturnValue(mockDbChain);
  mockTx.insert.mockReturnValue(mockDbChain);
  mockTx.update.mockReturnValue(mockDbChain);

  mockDb.select.mockReturnValue(mockDbChain);
  mockDb.insert.mockReturnValue(mockDbChain);
  mockDb.update.mockReturnValue(mockDbChain);
  mockDb.delete.mockReturnValue(mockDbChain);
  mockDb.transaction.mockImplementation(
    async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  );
}

// ---------------------------------------------------------------------------
// Session Types
// ---------------------------------------------------------------------------

describe("Session Types — CRUD", () => {
  beforeEach(resetMocks);

  it("GET /session-types returns 403 for MEMBER", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/session-types")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });

  it("GET /session-types returns 200 for COACH with list", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_SESSION_TYPE]);
    const res = await request(makeApp())
      .get("/session-types")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /session-types creates a type (201)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([MOCK_SESSION_TYPE]);
    const res = await request(makeApp())
      .post("/session-types")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Hyrox", color: "#a855f7", defaultDurationMinutes: 60, defaultCapacity: 12 });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("SGPT");
  });

  it("POST /session-types rejects missing name (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/session-types")
      .set("Cookie", "__session=coach-token")
      .send({ color: "#fff" });
    expect(res.status).toBe(400);
  });

  it("PUT /session-types/:id returns 404 when not found", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .put("/session-types/st-99")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Updated" });
    expect(res.status).toBe(404);
  });

  it("DELETE /session-types/:id archives (204)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([{ id: "st-1" }]);
    const res = await request(makeApp())
      .delete("/session-types/st-1")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Sessions — list
// ---------------------------------------------------------------------------

describe("Sessions — list", () => {
  beforeEach(resetMocks);

  it("GET /sessions requires ?start and ?end (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/sessions")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(400);
  });

  it("GET /sessions validates date format (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/sessions?start=not-a-date&end=2030-01-07")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(400);
  });

  it("GET /sessions returns session list (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    // sessions query terminates with orderBy
    mockDbChain.orderBy.mockResolvedValueOnce([
      {
        session: MOCK_SESSION,
        sessionTypeName: "SGPT",
        sessionTypeColor: "#ef4444",
        coachName: "Coach One",
      },
    ]);
    // bookings query terminates with where(inArray(...)); mockDbChain is iterable (via Symbol.iterator → mockRows=[])
    const res = await request(makeApp())
      .get("/sessions?start=2030-06-09&end=2030-06-15")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].id).toBe("sess-1");
    expect(res.body[0].bookedCount).toBe(0);
  });

  it("GET /sessions returns empty array when no sessions (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .get("/sessions?start=2030-06-09&end=2030-06-15")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Sessions — detail
// ---------------------------------------------------------------------------

describe("Sessions — detail", () => {
  beforeEach(resetMocks);

  it("GET /sessions/:id returns 404 when not found", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // session not found
    const res = await request(makeApp())
      .get("/sessions/sess-missing")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(404);
  });

  it("GET /sessions/:id returns session with bookings", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    // session row
    mockDbChain.limit.mockResolvedValueOnce([
      {
        session: MOCK_SESSION,
        sessionTypeName: "SGPT",
        sessionTypeColor: "#ef4444",
        coachName: "Coach One",
      },
    ]);
    // bookings (orderBy terminal)
    mockDbChain.orderBy.mockResolvedValueOnce([
      { booking: MOCK_BOOKING, memberName: "Member One", memberEmail: "member@test.com" },
    ]);
    const res = await request(makeApp())
      .get("/sessions/sess-1")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(200);
    expect(res.body.id).toBe("sess-1");
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings[0].memberName).toBe("Member One");
    expect(res.body.bookedCount).toBe(1); // BOOKED status counts
  });

  it("GET /sessions/:id scopes to org — denies cross-org access", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH]);
    mockDbChain.limit.mockResolvedValueOnce([]); // org-2 coach can't see org-1 session
    const res = await request(makeApp())
      .get("/sessions/sess-1")
      .set("Cookie", "__session=orgb-token");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Sessions — create (single)
// ---------------------------------------------------------------------------

describe("Sessions — create single", () => {
  beforeEach(resetMocks);

  it("POST /sessions blocks MEMBER (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/sessions")
      .set("Cookie", "__session=member-token")
      .send({ name: "Test", date: "2030-06-15", startTime: "06:00", capacity: 6 });
    expect(res.status).toBe(403);
  });

  it("POST /sessions creates session (201)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([MOCK_SESSION]);
    const res = await request(makeApp())
      .post("/sessions")
      .set("Cookie", "__session=coach-token")
      .send({
        name: "SGPT Morning",
        date: "2030-06-15",
        startTime: "06:00",
        durationMinutes: 45,
        capacity: 6,
        location: "Main floor",
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe("sess-1");
  });

  it("POST /sessions rejects missing required fields (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/sessions")
      .set("Cookie", "__session=coach-token")
      .send({ name: "No date or capacity" });
    expect(res.status).toBe(400);
  });

  it("POST /sessions rejects invalid date format (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/sessions")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Bad date", date: "15/06/2030", startTime: "06:00", capacity: 6 });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Sessions — create (recurring)
// ---------------------------------------------------------------------------

describe("Sessions — create recurring", () => {
  beforeEach(resetMocks);

  it("POST /sessions/recurring blocks MEMBER (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/sessions/recurring")
      .set("Cookie", "__session=member-token")
      .send({
        name: "SGPT",
        startTime: "06:00",
        capacity: 6,
        daysOfWeek: [1],
        startDate: "2030-06-01",
        endDate: "2030-06-30",
      });
    expect(res.status).toBe(403);
  });

  it("POST /sessions/recurring creates sessions for matching days (201)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const sessions = [
      { ...MOCK_SESSION, id: "r1", date: "2030-06-02" },
      { ...MOCK_SESSION, id: "r2", date: "2030-06-09" },
      { ...MOCK_SESSION, id: "r3", date: "2030-06-16" },
      { ...MOCK_SESSION, id: "r4", date: "2030-06-23" },
    ];
    mockDbChain.returning.mockResolvedValueOnce(sessions);
    const res = await request(makeApp())
      .post("/sessions/recurring")
      .set("Cookie", "__session=coach-token")
      .send({
        name: "SGPT",
        startTime: "06:00",
        capacity: 6,
        daysOfWeek: [1], // Mondays only
        startDate: "2030-06-01",
        endDate: "2030-06-30",
      });
    expect(res.status).toBe(201);
    expect(res.body.count).toBe(4);
    expect(res.body.recurringGroupId).toBeDefined();
  });

  it("POST /sessions/recurring rejects empty daysOfWeek (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/sessions/recurring")
      .set("Cookie", "__session=coach-token")
      .send({
        name: "SGPT",
        startTime: "06:00",
        capacity: 6,
        daysOfWeek: [],
        startDate: "2030-06-01",
        endDate: "2030-06-30",
      });
    expect(res.status).toBe(400);
  });

  it("POST /sessions/recurring rejects end before start (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/sessions/recurring")
      .set("Cookie", "__session=coach-token")
      .send({
        name: "SGPT",
        startTime: "06:00",
        capacity: 6,
        daysOfWeek: [1],
        startDate: "2030-06-30",
        endDate: "2030-06-01",
      });
    expect(res.status).toBe(400);
  });

  it("POST /sessions/recurring returns 400 when no dates match", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // 2030-06-04 is Tuesday, 2030-06-07 is Friday — no Monday in Tue–Fri range
    const res = await request(makeApp())
      .post("/sessions/recurring")
      .set("Cookie", "__session=coach-token")
      .send({
        name: "SGPT",
        startTime: "06:00",
        capacity: 6,
        daysOfWeek: [1], // Monday only
        startDate: "2030-06-04",
        endDate: "2030-06-07",
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/No matching dates/);
  });
});

// ---------------------------------------------------------------------------
// Sessions — update / cancel
// ---------------------------------------------------------------------------

describe("Sessions — update and cancel", () => {
  beforeEach(resetMocks);

  it("PUT /sessions/:id updates session", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([{ ...MOCK_SESSION, name: "Updated SGPT" }]);
    const res = await request(makeApp())
      .put("/sessions/sess-1")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Updated SGPT" });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Updated SGPT");
  });

  it("PUT /sessions/:id returns 404 for wrong org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .put("/sessions/sess-99")
      .set("Cookie", "__session=coach-token")
      .send({ name: "X" });
    expect(res.status).toBe(404);
  });

  it("DELETE /sessions/:id soft-cancels (204)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([{ id: "sess-1" }]);
    const res = await request(makeApp())
      .delete("/sessions/sess-1")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(204);
    // Verify update was called (not delete)
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.delete).not.toHaveBeenCalled();
  });

  it("DELETE /sessions/:id returns 404 when not found", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .delete("/sessions/sess-missing")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
  });

  it("DELETE /sessions/:id blocks MEMBER (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .delete("/sessions/sess-1")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Bookings — book
// ---------------------------------------------------------------------------

describe("Bookings — book session", () => {
  beforeEach(resetMocks);

  it("returns 404 when session not found", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]); // auth
    mockDbChain.limit.mockResolvedValueOnce([]);                // session → undefined
    mockDbChain.limit.mockResolvedValueOnce([MOCK_ORG]);        // org (Promise.all parallel)

    const res = await request(makeApp())
      .post("/sessions/sess-missing/bookings")
      .set("Cookie", "__session=member-token")
      .send({});
    expect(res.status).toBe(404);
  });

  it("returns 403 when MEMBER tries to book for another member", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/sessions/sess-1/bookings")
      .set("Cookie", "__session=member-token")
      .send({ memberId: "u-other" });
    expect(res.status).toBe(403);
  });

  it("returns 201 when coach books successfully", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]); // auth
    mockDbChain.limit.mockResolvedValueOnce([MOCK_SESSION]);  // Promise.all: session
    mockDbChain.limit.mockResolvedValueOnce([MOCK_ORG]);      // Promise.all: org
    // where is called 4 times before the terminal count query:
    //   1) auth (intermediate → followed by limit)
    //   2) Promise.all session (intermediate → followed by limit)
    //   3) Promise.all org (intermediate → followed by limit)
    //   4) tx count SELECT (TERMINAL — awaited directly)
    mockDbChain.where
      .mockReturnValueOnce(mockDbChain) // auth
      .mockReturnValueOnce(mockDbChain) // session
      .mockReturnValueOnce(mockDbChain) // org
      .mockResolvedValueOnce([{ activeCount: "2" }]); // tx count
    mockDbChain.limit.mockResolvedValueOnce([]);              // tx existing booking check
    mockDbChain.returning.mockResolvedValueOnce([MOCK_BOOKING]); // tx insert

    const res = await request(makeApp())
      .post("/sessions/sess-1/bookings")
      .set("Cookie", "__session=coach-token")
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("BOOKED");
  });

  it("returns 409 when session is full", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_ORG]);
    mockDbChain.where
      .mockReturnValueOnce(mockDbChain)
      .mockReturnValueOnce(mockDbChain)
      .mockReturnValueOnce(mockDbChain)
      .mockResolvedValueOnce([{ activeCount: "6" }]); // at capacity → FULL

    const res = await request(makeApp())
      .post("/sessions/sess-1/bookings")
      .set("Cookie", "__session=coach-token")
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/full/i);
  });

  it("returns 409 when already booked", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_ORG]);
    mockDbChain.where
      .mockReturnValueOnce(mockDbChain)
      .mockReturnValueOnce(mockDbChain)
      .mockReturnValueOnce(mockDbChain)
      .mockResolvedValueOnce([{ activeCount: "2" }]); // under capacity
    // Existing booking found — same member already BOOKED
    mockDbChain.limit.mockResolvedValueOnce([{ ...MOCK_BOOKING, memberId: "u1", status: "BOOKED" }]);

    const res = await request(makeApp())
      .post("/sessions/sess-1/bookings")
      .set("Cookie", "__session=coach-token")
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/Already booked/i);
  });
});

// ---------------------------------------------------------------------------
// Bookings — cancel
// ---------------------------------------------------------------------------

describe("Bookings — cancel", () => {
  beforeEach(resetMocks);

  it("PATCH /sessions/:id/bookings/:bookingId cancels booking (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_BOOKING]); // booking found
    // cancellation window check: session + org
    mockDbChain.limit.mockResolvedValueOnce([{ date: "2030-06-15", startTime: "06:00" }]); // session
    mockDbChain.limit.mockResolvedValueOnce([{ bookingCloseHours: 12, noShowFeeCents: 500 }]); // org
    mockDbChain.returning.mockResolvedValueOnce([{ ...MOCK_BOOKING, status: "CANCELLED" }]);

    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1")
      .set("Cookie", "__session=member-token")
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("CANCELLED");
  });

  it("PATCH blocks member from cancelling another member's booking (403)", async () => {
    const otherMemberBooking = { ...MOCK_BOOKING, memberId: "u-other" };
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([otherMemberBooking]);

    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1")
      .set("Cookie", "__session=member-token")
      .send({});
    expect(res.status).toBe(403);
  });

  it("PATCH returns 409 when booking already cancelled", async () => {
    const cancelledBooking = { ...MOCK_BOOKING, memberId: "u2", status: "CANCELLED" };
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([cancelledBooking]);

    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1")
      .set("Cookie", "__session=member-token")
      .send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/CANCELLED/);
  });

  it("PATCH returns 404 when booking not found", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-missing")
      .set("Cookie", "__session=member-token")
      .send({});
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Bookings — attendance (coach only)
// ---------------------------------------------------------------------------

describe("Bookings — attendance", () => {
  beforeEach(resetMocks);

  it("PATCH /.../attendance blocks MEMBER (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1/attendance")
      .set("Cookie", "__session=member-token")
      .send({ status: "ATTENDED" });
    expect(res.status).toBe(403);
  });

  it("PATCH /.../attendance marks ATTENDED (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_BOOKING]);
    mockDbChain.returning.mockResolvedValueOnce([{ ...MOCK_BOOKING, status: "ATTENDED" }]);

    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1/attendance")
      .set("Cookie", "__session=coach-token")
      .send({ status: "ATTENDED" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ATTENDED");
  });

  it("PATCH /.../attendance auto-applies NO_SHOW fee from org settings", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ ...MOCK_BOOKING, feeAmountCents: null }]); // no fee yet
    // org settings query (needed for auto-fee)
    mockDbChain.limit.mockResolvedValueOnce([{ noShowFeeCents: 500 }]);
    mockDbChain.returning.mockResolvedValueOnce([
      { ...MOCK_BOOKING, status: "NO_SHOW", feeAmountCents: 500, feeReason: "NO_SHOW" },
    ]);

    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1/attendance")
      .set("Cookie", "__session=coach-token")
      .send({ status: "NO_SHOW" });
    expect(res.status).toBe(200);
    expect(res.body.feeAmountCents).toBe(500);
    expect(res.body.feeReason).toBe("NO_SHOW");
  });

  it("PATCH /.../attendance rejects invalid status (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .patch("/sessions/sess-1/bookings/book-1/attendance")
      .set("Cookie", "__session=coach-token")
      .send({ status: "MAYBE" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Mark all attended
// ---------------------------------------------------------------------------

describe("Mark all attended", () => {
  beforeEach(resetMocks);

  it("POST /sessions/:id/mark-all-attended blocks MEMBER (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/sessions/sess-1/mark-all-attended")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });

  it("POST /sessions/:id/mark-all-attended returns 404 for missing session", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // session not found
    const res = await request(makeApp())
      .post("/sessions/sess-missing/mark-all-attended")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
  });

  it("POST /sessions/:id/mark-all-attended updates BOOKED → ATTENDED (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ id: "sess-1" }]); // session found
    mockDbChain.returning.mockResolvedValueOnce([{ id: "book-1" }, { id: "book-2" }]);

    const res = await request(makeApp())
      .post("/sessions/sess-1/mark-all-attended")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
    expect(res.body.updated).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Org isolation
// ---------------------------------------------------------------------------

describe("Org isolation", () => {
  beforeEach(resetMocks);

  it("coach from org-2 cannot see org-1 session detail (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH]);
    mockDbChain.limit.mockResolvedValueOnce([]); // no result (org scoped)
    const res = await request(makeApp())
      .get("/sessions/sess-1")
      .set("Cookie", "__session=orgb-token");
    expect(res.status).toBe(404);
  });

  it("coach from org-2 cannot cancel org-1 session (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH]);
    mockDbChain.returning.mockResolvedValueOnce([]); // no row updated (org scoped)
    const res = await request(makeApp())
      .delete("/sessions/sess-1")
      .set("Cookie", "__session=orgb-token");
    expect(res.status).toBe(404);
  });

  it("session types are scoped to org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH]);
    mockDbChain.orderBy.mockResolvedValueOnce([]); // org-2 has no session types
    const res = await request(makeApp())
      .get("/session-types")
      .set("Cookie", "__session=orgb-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});
