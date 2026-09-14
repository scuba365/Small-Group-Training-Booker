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
    innerJoin: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
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
  organisationsTable: { id: "id", name: "name" },
  clientsTable: { id: "id", organisationId: "organisationId", isMember: "isMember" },
  programmesTable: {
    id: "id",
    organisationId: "organisationId",
    name: "name",
    description: "description",
  },
  programmeAssignmentsTable: {
    id: "id",
    organisationId: "organisationId",
    programmeId: "programmeId",
    memberId: "memberId",
    status: "status",
    startDate: "startDate",
    endDate: "endDate",
    assignedBy: "assignedBy",
    notes: "notes",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  ASSIGNMENT_STATUSES: ["ACTIVE", "INACTIVE", "COMPLETED"],
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import routers after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import assignmentsRouter from "../routes/assignments";

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

const COACH_SESSION = {
  session: { token: "coach-token", expiresAt: new Date(Date.now() + 86400000), userId: "u1" },
  user: { id: "u1", email: "coach@test.com", name: "Coach", role: "COACH" },
  member: { organisationId: "org-1", role: "COACH", status: "ACTIVE" },
};

const MEMBER_A_SESSION = {
  session: { token: "member-a-token", expiresAt: new Date(Date.now() + 86400000), userId: "u2" },
  user: { id: "u2", email: "membera@test.com", name: "Member A", role: "MEMBER" },
  member: { organisationId: "org-1", role: "MEMBER", status: "ACTIVE" },
};


const ORG_B_COACH_SESSION = {
  session: { token: "orgb-token", expiresAt: new Date(Date.now() + 86400000), userId: "u4" },
  user: { id: "u4", email: "coach@orgb.com", name: "Org B Coach", role: "COACH" },
  member: { organisationId: "org-2", role: "COACH", status: "ACTIVE" },
};

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireAuth as any);
  app.use(assignmentsRouter);
  return app;
}

function resetMocks() {
  vi.clearAllMocks();
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
// Tests
// ---------------------------------------------------------------------------

describe("Assignments — Role Enforcement", () => {
  beforeEach(resetMocks);

  it("blocks a MEMBER from creating an assignment (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .post("/assignments")
      .set("Cookie", "__session=member-a-token")
      .send({ memberId: "u2", programmeId: "p-1", startDate: "2026-01-01" });
    expect(res.status).toBe(403);
  });

  it("blocks a MEMBER from patching an assignment (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .patch("/assignments/assign-1")
      .set("Cookie", "__session=member-a-token")
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(403);
  });

  it("blocks a MEMBER from deleting an assignment (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .delete("/assignments/assign-1")
      .set("Cookie", "__session=member-a-token");
    expect(res.status).toBe(403);
  });
});

describe("Assignments — COACH CRUD", () => {
  beforeEach(resetMocks);

  it("creates an assignment and returns 201", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]); // auth
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "u2", organisationId: "org-1", status: "ACTIVE" }]); // member lookup
    mockDbChain.limit.mockResolvedValueOnce([{ id: "p-1", organisationId: "org-1" }]); // programme lookup
    const newAssignment = { id: "assign-1", memberId: "u2", programmeId: "p-1", organisationId: "org-1", status: "ACTIVE", startDate: "2026-01-01" };
    mockDbChain.returning.mockResolvedValueOnce([newAssignment]);

    const res = await request(makeApp())
      .post("/assignments")
      .set("Cookie", "__session=coach-token")
      .send({ memberId: "u2", programmeId: "p-1", startDate: "2026-01-01" });

    expect(res.status).toBe(201);
    expect(res.body.memberId).toBe("u2");
    expect(res.body.organisationId).toBe("org-1");
  });

  it("returns 400 for invalid startDate format", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/assignments")
      .set("Cookie", "__session=coach-token")
      .send({ memberId: "u2", programmeId: "p-1", startDate: "01/01/2026" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when member not in org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // member not found
    const res = await request(makeApp())
      .post("/assignments")
      .set("Cookie", "__session=coach-token")
      .send({ memberId: "unknown", programmeId: "p-1", startDate: "2026-01-01" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/member not found/i);
  });

  it("returns 404 when programme not in org", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ userId: "u2", organisationId: "org-1" }]); // member found
    mockDbChain.limit.mockResolvedValueOnce([]); // programme not found
    const res = await request(makeApp())
      .post("/assignments")
      .set("Cookie", "__session=coach-token")
      .send({ memberId: "u2", programmeId: "unknown", startDate: "2026-01-01" });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/programme not found/i);
  });

  it("COACH can update assignment status", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const updated = { id: "assign-1", status: "INACTIVE" };
    mockDbChain.returning.mockResolvedValueOnce([updated]);
    const res = await request(makeApp())
      .patch("/assignments/assign-1")
      .set("Cookie", "__session=coach-token")
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("INACTIVE");
  });

  it("returns 400 when PATCH body is empty", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .patch("/assignments/assign-1")
      .set("Cookie", "__session=coach-token")
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 404 when PATCH target not found", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .patch("/assignments/does-not-exist")
      .set("Cookie", "__session=coach-token")
      .send({ status: "INACTIVE" });
    expect(res.status).toBe(404);
  });

  it("COACH can delete assignment — returns 204", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([{ id: "assign-1" }]);
    const res = await request(makeApp())
      .delete("/assignments/assign-1")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(204);
  });
});

describe("Assignments — Member Isolation", () => {
  beforeEach(resetMocks);

  it("MEMBER can see own assignment in list", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const ownAssignment = { assignment: { id: "assign-1", memberId: "u2" }, programme: { id: "p-1", name: "Prog" }, member: { id: "u2", name: "Member A", email: "membera@test.com" } };
    mockDbChain.orderBy.mockResolvedValueOnce([ownAssignment]);
    const res = await request(makeApp())
      .get("/assignments")
      .set("Cookie", "__session=member-a-token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("MEMBER cannot see another member's assignment by ID (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]); // auth
    mockDbChain.limit.mockResolvedValueOnce([]); // WHERE memberId=u2 AND id=assign-b returns nothing
    const res = await request(makeApp())
      .get("/assignments/assign-b")
      .set("Cookie", "__session=member-a-token");
    expect(res.status).toBe(404);
  });

  it("MEMBER can see own assignment by ID (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const row = { assignment: { id: "assign-1", memberId: "u2" }, programme: { id: "p-1" }, member: { id: "u2", name: "Member A", email: "membera@test.com" } };
    mockDbChain.limit.mockResolvedValueOnce([row]);
    const res = await request(makeApp())
      .get("/assignments/assign-1")
      .set("Cookie", "__session=member-a-token");
    expect(res.status).toBe(200);
  });

  it("COACH sees all org assignments", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const assignments = [
      { assignment: { id: "assign-1", memberId: "u2" }, programme: { id: "p-1", name: "P" }, member: { id: "u2", name: "A", email: "a@t.com" } },
      { assignment: { id: "assign-2", memberId: "u3" }, programme: { id: "p-1", name: "P" }, member: { id: "u3", name: "B", email: "b@t.com" } },
    ];
    mockDbChain.orderBy.mockResolvedValueOnce(assignments);
    const res = await request(makeApp())
      .get("/assignments")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });
});

describe("Assignments — Organisation Isolation", () => {
  beforeEach(resetMocks);

  it("org-b coach cannot create assignment for org-a member (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH_SESSION]); // auth → org-2
    mockDbChain.limit.mockResolvedValueOnce([]); // member lookup for org-2 finds nothing
    const res = await request(makeApp())
      .post("/assignments")
      .set("Cookie", "__session=orgb-token")
      .send({ memberId: "u2", programmeId: "p-1", startDate: "2026-01-01" });
    expect(res.status).toBe(404);
  });
});
