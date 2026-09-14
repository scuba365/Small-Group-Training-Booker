import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock setup
// ---------------------------------------------------------------------------

const { mockRows, mockDbChain, mockDb } = vi.hoisted(() => {
  const mockRows: unknown[] = [];

  const mockDbChain = {
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
  usersTable: { id: "id", email: "email", name: "name" },
  organisationMembersTable: {
    organisationId: "organisationId",
    role: "role",
    status: "status",
    userId: "userId",
  },
  clientsTable: { id: "id", organisationId: "organisationId", isMember: "isMember" },
  organisationsTable: { id: "id", name: "name" },
  exercisesTable: {
    id: "id",
    organisationId: "organisationId",
    name: "name",
    description: "description",
    exerciseType: "exerciseType",
    isArchived: "isArchived",
    createdBy: "createdBy",
  },
  EXERCISE_TYPES: ["STRENGTH", "CARDIO", "CONDITIONING", "HYROX"],
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import routers after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import exercisesRouter from "../routes/exercises";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const COACH_SESSION = {
  session: { token: "coach-token", expiresAt: new Date(Date.now() + 86400000), userId: "u1" },
  user: { id: "u1", email: "coach@test.com", name: "Coach", role: "COACH" },
  member: { organisationId: "org-1", role: "COACH", status: "ACTIVE" },
};

const MEMBER_SESSION = {
  session: { token: "member-token", expiresAt: new Date(Date.now() + 86400000), userId: "u2" },
  user: { id: "u2", email: "member@test.com", name: "Member", role: "MEMBER" },
  member: { organisationId: "org-1", role: "MEMBER", status: "ACTIVE" },
};

const ORG_B_COACH_SESSION = {
  session: { token: "orgb-token", expiresAt: new Date(Date.now() + 86400000), userId: "u3" },
  user: { id: "u3", email: "coach@orgb.com", name: "Org B Coach", role: "COACH" },
  member: { organisationId: "org-2", role: "COACH", status: "ACTIVE" },
};

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireAuth as any);
  app.use(exercisesRouter);
  return app;
}

function resetMocks() {
  vi.clearAllMocks();
  mockRows.length = 0;
  // Re-initialise ALL chain methods after clearAllMocks wipes implementations
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
// Tests
// ---------------------------------------------------------------------------

describe("Exercise Library — Role Enforcement", () => {
  beforeEach(resetMocks);

  it("blocks a MEMBER from listing exercises (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/exercises")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });

  it("allows a COACH to list exercises (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // orderBy is the terminal call for list exercises
    mockDbChain.orderBy.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .get("/exercises")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("blocks a MEMBER from creating an exercise (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/exercises")
      .set("Cookie", "__session=member-token")
      .send({ name: "Squat", exerciseType: "STRENGTH" });
    expect(res.status).toBe(403);
  });

  it("blocks a MEMBER from updating an exercise (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .put("/exercises/ex-1")
      .set("Cookie", "__session=member-token")
      .send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("blocks a MEMBER from deleting an exercise (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .delete("/exercises/ex-1")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });
});

describe("Exercise Library — CRUD", () => {
  beforeEach(resetMocks);

  it("creates an exercise and returns 201", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const newExercise = {
      id: "ex-1",
      organisationId: "org-1",
      name: "Back Squat",
      exerciseType: "STRENGTH",
      isArchived: false,
    };
    mockDbChain.returning.mockResolvedValueOnce([newExercise]);

    const res = await request(makeApp())
      .post("/exercises")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Back Squat", exerciseType: "STRENGTH" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Back Squat");
    expect(res.body.organisationId).toBe("org-1");
  });

  it("rejects create with missing name (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/exercises")
      .set("Cookie", "__session=coach-token")
      .send({ exerciseType: "STRENGTH" });
    expect(res.status).toBe(400);
  });

  it("rejects create with invalid exerciseType (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/exercises")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Squat", exerciseType: "BADTYPE" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a non-existent exercise", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // second limit call (GET exercise by id) returns nothing
    mockDbChain.limit.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .get("/exercises/does-not-exist")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
  });

  it("archives (soft-deletes) an exercise — returns 204", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([{ id: "ex-1" }]);

    const res = await request(makeApp())
      .delete("/exercises/ex-1")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(204);
  });

  it("returns 404 when archiving a non-existent exercise", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]); // not found

    const res = await request(makeApp())
      .delete("/exercises/does-not-exist")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
  });
});

describe("Exercise Library — Organisation Scoping", () => {
  beforeEach(resetMocks);

  it("org-2 coach cannot update an org-1 exercise (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH_SESSION]);
    // update WHERE clause filters by org-2 → returns nothing
    mockDbChain.returning.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .put("/exercises/ex-org1")
      .set("Cookie", "__session=orgb-token")
      .send({ name: "Updated Name" });

    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found|not editable/i);
  });

  it("org-2 coach cannot archive an org-1 exercise (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]); // org scope eliminates the row

    const res = await request(makeApp())
      .delete("/exercises/ex-org1")
      .set("Cookie", "__session=orgb-token");

    expect(res.status).toBe(404);
  });
});
