import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock setup
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
  authSessionsTable: { token: "token", expiresAt: "expiresAt", userId: "userId", id: "id" },
  usersTable: { id: "id", email: "email", name: "name", avatarUrl: "avatarUrl", phone: "phone" },
  organisationMembersTable: {
    id: "id",
    organisationId: "organisationId",
    userId: "userId",
    role: "role",
    status: "status",
    membershipPlan: "membershipPlan",
    membershipStartDate: "membershipStartDate",
    createdAt: "createdAt",
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
  },
  sessionsTable: {
    id: "id",
    organisationId: "organisationId",
    name: "name",
    date: "date",
    startTime: "startTime",
  },
  programmeAssignmentsTable: {
    id: "id",
    organisationId: "organisationId",
    programmeId: "programmeId",
    memberId: "memberId",
    status: "status",
    startDate: "startDate",
  },
  programmesTable: { id: "id", name: "name", organisationId: "organisationId" },
  workoutInstancesTable: {
    id: "id",
    organisationId: "organisationId",
    memberId: "memberId",
    workoutId: "workoutId",
    status: "status",
    completedAt: "completedAt",
    durationSeconds: "durationSeconds",
    sessionRpe: "sessionRpe",
    createdAt: "createdAt",
  },
  workoutsTable: { id: "id", name: "name" },
  coachNotesTable: {
    id: "id",
    organisationId: "organisationId",
    memberId: "memberId",
    coachId: "coachId",
    body: "body",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import membersRouter from "../routes/members";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const COACH_SESSION = {
  session: { token: "coach-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "coach-1" },
  user: { id: "coach-1", email: "coach@test.com", name: "Coach One" },
  member: { organisationId: "org-1", role: "COACH", status: "ACTIVE" },
};

const MEMBER_SESSION = {
  session: { token: "member-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "m1" },
  user: { id: "m1", email: "member@test.com", name: "Alice" },
  member: { organisationId: "org-1", role: "MEMBER", status: "ACTIVE" },
};

const ORG_B_COACH = {
  session: { token: "orgb-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "orgb-c1" },
  user: { id: "orgb-c1", email: "coach@orgb.com", name: "OrgB Coach" },
  member: { organisationId: "org-2", role: "COACH", status: "ACTIVE" },
};

const MOCK_MEMBER_ROW = {
  id: "m1",
  name: "Alice",
  email: "alice@test.com",
  avatarUrl: null,
  phone: null,
  role: "MEMBER",
  status: "ACTIVE",
  membershipPlan: "Monthly SGPT",
  membershipStartDate: null,
  joinedAt: new Date("2026-01-01"),
};

const MOCK_BOOKING_ATTENDED = {
  memberId: "m1",
  status: "ATTENDED",
  sessionDate: "2026-09-01",
};

const MOCK_BOOKING_NO_SHOW = {
  memberId: "m1",
  status: "NO_SHOW",
  sessionDate: "2026-09-05",
};

const MOCK_BOOKING_CANCELLED = {
  memberId: "m1",
  status: "CANCELLED",
  sessionDate: "2026-09-10",
};

const MOCK_BOOKING_LATE_CANCEL = {
  memberId: "m1",
  status: "LATE_CANCEL",
  sessionDate: "2026-09-12",
};

const MOCK_ASSIGNMENT = {
  memberId: "m1",
  programmeName: "Block A Strength",
};

const MOCK_NOTE = {
  id: "note-1",
  organisationId: "org-1",
  memberId: "m1",
  coachId: "coach-1",
  body: "Great effort this week.",
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// App factory + reset
// ---------------------------------------------------------------------------

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireAuth as any); // eslint-disable-line @typescript-eslint/no-explicit-any
  app.use(membersRouter);
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
// GET /members
// ---------------------------------------------------------------------------

describe("Members list — GET /members", () => {
  beforeEach(resetMocks);

  it("returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });

  it("returns empty array when no members in org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([]); // empty members
    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it("returns members list with name, status, programme, attendance", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_MEMBER_ROW]);            // members
    mockDbChain.orderBy.mockResolvedValueOnce([
      MOCK_BOOKING_ATTENDED, MOCK_BOOKING_NO_SHOW, MOCK_BOOKING_CANCELLED, MOCK_BOOKING_LATE_CANCEL,
    ]);                                                                        // bookings
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_ASSIGNMENT]);             // assignments

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    const m = res.body[0];
    expect(m.id).toBe("m1");
    expect(m.programmeName).toBe("Block A Strength");
    expect(m.status).toBe("ACTIVE");
  });

  it("attendance: ATTENDED/(ATTENDED+NO_SHOW+LATE_CANCEL), CANCELLED excluded", async () => {
    // 1 ATTENDED, 1 NO_SHOW, 1 LATE_CANCEL, 1 CANCELLED (excluded)
    // denominator = 3, rate = 33%
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([
      MOCK_BOOKING_ATTENDED, MOCK_BOOKING_NO_SHOW, MOCK_BOOKING_LATE_CANCEL, MOCK_BOOKING_CANCELLED,
    ]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");

    const m = res.body[0];
    expect(m.attendanceAttended).toBe(1);
    expect(m.attendanceDenominator).toBe(3);
    expect(m.attendanceRate).toBe(33);
  });

  it("attendance: null when no countable bookings", async () => {
    // Only CANCELLED bookings — denominator=0, rate=null
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_BOOKING_CANCELLED]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");

    expect(res.body[0].attendanceRate).toBeNull();
    expect(res.body[0].attendanceDenominator).toBe(0);
  });

  it("attendance: 100% when all bookings are ATTENDED", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_BOOKING_ATTENDED, MOCK_BOOKING_ATTENDED]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");

    expect(res.body[0].attendanceRate).toBe(100);
    expect(res.body[0].attendanceDenominator).toBe(2);
  });

  it("lastSessionDate is the most recent ATTENDED session", async () => {
    const older = { memberId: "m1", status: "ATTENDED", sessionDate: "2026-08-01" };
    const newer = { memberId: "m1", status: "ATTENDED", sessionDate: "2026-09-20" };

    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([older, newer]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");

    expect(res.body[0].lastSessionDate).toBe("2026-09-20");
  });

  it("nextBookingDate reflects earliest future BOOKED session", async () => {
    const pastBooked = { memberId: "m1", status: "BOOKED", sessionDate: "2020-01-01" };
    const futureBooked = { memberId: "m1", status: "BOOKED", sessionDate: "2099-12-31" };
    const futureBooked2 = { memberId: "m1", status: "BOOKED", sessionDate: "2099-06-01" };

    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([pastBooked, futureBooked, futureBooked2]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=coach-token");

    expect(res.body[0].nextBookingDate).toBe("2099-06-01");
  });

  it("org isolation — org-2 coach only sees their own org data", async () => {
    const orgBMember = { ...MOCK_MEMBER_ROW, id: "m2", name: "OrgB Alice" };
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH]);
    mockDbChain.orderBy.mockResolvedValueOnce([orgBMember]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .get("/members")
      .set("Cookie", "__session=orgb-token");

    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe("m2");
  });
});

// ---------------------------------------------------------------------------
// GET /members/:id
// ---------------------------------------------------------------------------

describe("Member profile — GET /members/:id", () => {
  beforeEach(resetMocks);

  it("returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/members/m1")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });

  it("returns 404 when member not in org (DB enforces org isolation)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]); // auth
    mockDbChain.limit.mockResolvedValueOnce([]);              // member lookup returns empty
    const res = await request(makeApp())
      .get("/members/unknown-id")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Member not found");
  });

  it("org-2 coach cannot access org-1 member (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH]);
    mockDbChain.limit.mockResolvedValueOnce([]); // member not in org-2
    const res = await request(makeApp())
      .get("/members/m1")
      .set("Cookie", "__session=orgb-token");
    expect(res.status).toBe(404);
  });

  it("returns full profile for valid org member", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_MEMBER_ROW]);  // member row
    mockDbChain.orderBy.mockResolvedValueOnce([                  // bookings
      MOCK_BOOKING_ATTENDED, MOCK_BOOKING_NO_SHOW,
    ]);
    mockDbChain.limit.mockResolvedValueOnce([{                   // active assignment
      id: "asgn-1", status: "ACTIVE", startDate: "2026-01-01",
      programmeName: "Block A", programmeId: "prog-1",
    }]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);               // recent workouts
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_NOTE]);      // coach notes

    const res = await request(makeApp())
      .get("/members/m1")
      .set("Cookie", "__session=coach-token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("m1");
    expect(res.body.name).toBe("Alice");
    expect(res.body.attendanceRate).toBe(50); // 1/2 = 50%
    expect(res.body.attendanceAttended).toBe(1);
    expect(res.body.attendanceDenominator).toBe(2);
    expect(res.body.activeAssignment.programmeName).toBe("Block A");
    expect(res.body.coachNotes).toHaveLength(1);
    expect(res.body.coachNotes[0].body).toBe("Great effort this week.");
  });

  it("returns null activeAssignment when member has no active programme", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);               // no bookings
    mockDbChain.limit.mockResolvedValueOnce([]);                 // no assignment
    mockDbChain.orderBy.mockResolvedValueOnce([]);               // no workouts
    mockDbChain.orderBy.mockResolvedValueOnce([]);               // no notes

    const res = await request(makeApp())
      .get("/members/m1")
      .set("Cookie", "__session=coach-token");

    expect(res.status).toBe(200);
    expect(res.body.activeAssignment).toBeNull();
    expect(res.body.attendanceRate).toBeNull();
    expect(res.body.attendanceDenominator).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// PATCH /members/:id
// ---------------------------------------------------------------------------

describe("Member edit — PATCH /members/:id", () => {
  beforeEach(resetMocks);

  it("returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=member-token")
      .send({ name: "New Name" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty body", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid email", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when member not in org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // member not found
    const res = await request(makeApp())
      .patch("/members/unknown-id")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
  });

  it("returns 200 and updates user fields", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "m1" }]); // verify member
    // update calls resolve via mockReturnThis / where chaining — no explicit mock needed
    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Alice Updated", phone: "+353861234567" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 200 and updates membership fields", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "m1" }]);
    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({ status: "INACTIVE", membershipPlan: "Annual" });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("returns 400 for invalid status value", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({ status: "DELETED" });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// POST /members/:id/notes
// ---------------------------------------------------------------------------

describe("Coach notes — POST /members/:id/notes", () => {
  beforeEach(resetMocks);

  it("returns 403 for MEMBER role", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/members/m1/notes")
      .set("Cookie", "__session=member-token")
      .send({ body: "Note text" });
    expect(res.status).toBe(403);
  });

  it("returns 400 for empty body field", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/members/m1/notes")
      .set("Cookie", "__session=coach-token")
      .send({ body: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for missing body field", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/members/m1/notes")
      .set("Cookie", "__session=coach-token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when member not in org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .post("/members/unknown-id/notes")
      .set("Cookie", "__session=coach-token")
      .send({ body: "Note text" });
    expect(res.status).toBe(404);
  });

  it("creates a note and returns 201 with the note", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "m1" }]);
    mockDbChain.returning.mockResolvedValueOnce([MOCK_NOTE]);

    const res = await request(makeApp())
      .post("/members/m1/notes")
      .set("Cookie", "__session=coach-token")
      .send({ body: "Great effort this week." });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe("Great effort this week.");
    expect(res.body.memberId).toBe("m1");
  });

  it("rejects body longer than 2000 characters (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/members/m1/notes")
      .set("Cookie", "__session=coach-token")
      .send({ body: "x".repeat(2001) });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------------------
// Sprint 007B — additional profile, attendance, and membership date tests
// ---------------------------------------------------------------------------

describe("Sprint 007B — Member profile coverage", () => {
  beforeEach(resetMocks);

  it("attendance aggregation: 2 ATTENDED + 1 NO_SHOW + 1 LATE_CANCEL + 3 CANCELLED → rate 50%, denominator 4", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([
      { ...MOCK_BOOKING_ATTENDED, sessionDate: "2026-08-01" },
      { ...MOCK_BOOKING_ATTENDED, sessionDate: "2026-08-15" },
      MOCK_BOOKING_NO_SHOW,
      MOCK_BOOKING_LATE_CANCEL,
      { ...MOCK_BOOKING_CANCELLED, sessionDate: "2026-07-01" },
      { ...MOCK_BOOKING_CANCELLED, sessionDate: "2026-07-10" },
      { ...MOCK_BOOKING_CANCELLED, sessionDate: "2026-07-20" },
    ]);
    mockDbChain.limit.mockResolvedValueOnce([]);   // no assignment
    mockDbChain.orderBy.mockResolvedValueOnce([]); // no workouts
    mockDbChain.orderBy.mockResolvedValueOnce([]); // no notes

    const res = await request(makeApp())
      .get("/members/m1")
      .set("Cookie", "__session=coach-token");

    expect(res.status).toBe(200);
    expect(res.body.attendanceAttended).toBe(2);
    expect(res.body.attendanceDenominator).toBe(4); // 2 + 1 + 1 (CANCELLED excluded)
    expect(res.body.attendanceRate).toBe(50);
  });

  it("profile response includes bookings array and coachNotes with coachName field", async () => {
    const noteWithCoach = { ...MOCK_NOTE, coachName: "Coach One" };

    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_MEMBER_ROW]);
    mockDbChain.orderBy.mockResolvedValueOnce([MOCK_BOOKING_ATTENDED]); // bookings
    mockDbChain.limit.mockResolvedValueOnce([]);                         // no assignment
    mockDbChain.orderBy.mockResolvedValueOnce([]);                        // no workouts
    mockDbChain.orderBy.mockResolvedValueOnce([noteWithCoach]);           // notes with coach name

    const res = await request(makeApp())
      .get("/members/m1")
      .set("Cookie", "__session=coach-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.bookings)).toBe(true);
    expect(res.body.bookings).toHaveLength(1);
    expect(res.body.bookings[0].status).toBe("ATTENDED");
    expect(res.body.coachNotes).toHaveLength(1);
    expect(res.body.coachNotes[0].coachName).toBe("Coach One");
  });

  it("PATCH: membershipStartDate accepts ISO datetime string", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "m1" }]);

    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({ membershipStartDate: "2026-01-15T00:00:00.000Z" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("PATCH: membershipStartDate can be cleared to null", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "m1" }]);

    const res = await request(makeApp())
      .patch("/members/m1")
      .set("Cookie", "__session=coach-token")
      .send({ membershipStartDate: null });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
