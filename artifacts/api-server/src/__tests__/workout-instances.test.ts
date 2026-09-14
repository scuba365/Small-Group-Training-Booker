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
  usersTable: { id: "id", email: "email", name: "name", role: "role" },
  organisationMembersTable: {
    organisationId: "organisationId",
    role: "role",
    status: "status",
    userId: "userId",
  },
  organisationsTable: { id: "id", name: "name" },
  clientsTable: { id: "id", organisationId: "organisationId", isMember: "isMember" },
  programmeAssignmentsTable: {
    id: "id",
    organisationId: "organisationId",
    programmeId: "programmeId",
    memberId: "memberId",
    status: "status",
  },
  workoutInstancesTable: {
    id: "id",
    organisationId: "organisationId",
    assignmentId: "assignmentId",
    workoutId: "workoutId",
    memberId: "memberId",
    status: "status",
    startedAt: "startedAt",
    completedAt: "completedAt",
    durationSeconds: "durationSeconds",
    sessionRpe: "sessionRpe",
    notes: "notes",
    createdAt: "createdAt",
    updatedAt: "updatedAt",
  },
  exerciseInstancesTable: {
    id: "id",
    workoutInstanceId: "workoutInstanceId",
    workoutExerciseId: "workoutExerciseId",
    exerciseId: "exerciseId",
    orderIndex: "orderIndex",
  },
  setLogsTable: {
    id: "id",
    exerciseInstanceId: "exerciseInstanceId",
    setNumber: "setNumber",
    reps: "reps",
    loadKg: "loadKg",
    rpe: "rpe",
    rir: "rir",
    distanceMeters: "distanceMeters",
    timeSeconds: "timeSeconds",
    pacePerKm: "pacePerKm",
    calories: "calories",
    completed: "completed",
    updatedAt: "updatedAt",
  },
  workoutsTable: { id: "id", dayId: "dayId" },
  workoutBlocksTable: { id: "id", workoutId: "workoutId", orderIndex: "orderIndex" },
  workoutExercisesTable: {
    id: "id",
    blockId: "blockId",
    exerciseId: "exerciseId",
    orderIndex: "orderIndex",
  },
  exercisesTable: { id: "id", name: "name", exerciseType: "exerciseType" },
  phasesTable: { id: "id", programmeId: "programmeId" },
  weeksTable: { id: "id", phaseId: "phaseId" },
  daysTable: { id: "id", weekId: "weekId" },
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import routers after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import workoutInstancesRouter from "../routes/workout-instances";

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

const MEMBER_B_SESSION = {
  session: { token: "member-b-token", expiresAt: new Date(Date.now() + 86400000), userId: "u3" },
  user: { id: "u3", email: "memberb@test.com", name: "Member B", role: "MEMBER" },
  member: { organisationId: "org-1", role: "MEMBER", status: "ACTIVE" },
};

function makeApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(requireAuth as any);
  app.use(workoutInstancesRouter);
  return app;
}

function resetMocks() {
  vi.resetAllMocks(); // clears queued once-values AND resets implementations
  mockRows.length = 0;
  // Re-initialise ALL chain methods after resetAllMocks wipes implementations
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
// Start workout
// ---------------------------------------------------------------------------

describe("Workout Instances — Start workout", () => {
  beforeEach(resetMocks);

  it("MEMBER can start a workout — returns 201 with instance id", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]); // auth
    mockDbChain.limit.mockResolvedValueOnce([{ id: "assign-1", programmeId: "p-1", memberId: "u2" }]); // assignment
    mockDbChain.limit.mockResolvedValueOnce([{ id: "w-1" }]); // workout in programme
    const newInstance = { id: "inst-1", memberId: "u2", workoutId: "w-1", status: "IN_PROGRESS" };
    mockDbChain.returning.mockResolvedValueOnce([newInstance]); // insert instance
    mockDbChain.orderBy.mockResolvedValueOnce([]); // workout exercises (none)

    const res = await request(makeApp())
      .post("/workout-instances")
      .set("Cookie", "__session=member-a-token")
      .send({ assignmentId: "assign-1", workoutId: "w-1" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe("inst-1");
  });

  it("returns 400 for missing body fields", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .post("/workout-instances")
      .set("Cookie", "__session=member-a-token")
      .send({ assignmentId: "assign-1" }); // missing workoutId
    expect(res.status).toBe(400);
  });

  it("returns 404 when assignment not found (or belongs to another member)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // no assignment for this member
    const res = await request(makeApp())
      .post("/workout-instances")
      .set("Cookie", "__session=member-a-token")
      .send({ assignmentId: "assign-b", workoutId: "w-1" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when workout not in assigned programme", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ id: "assign-1", programmeId: "p-1", memberId: "u2" }]);
    mockDbChain.limit.mockResolvedValueOnce([]); // workout not found in programme
    const res = await request(makeApp())
      .post("/workout-instances")
      .set("Cookie", "__session=member-a-token")
      .send({ assignmentId: "assign-1", workoutId: "w-other" });
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Get workout instance
// ---------------------------------------------------------------------------

describe("Workout Instances — Get workout", () => {
  beforeEach(resetMocks);

  it("MEMBER can get their own workout instance (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]); // auth
    const instance = { id: "inst-1", memberId: "u2", workoutId: "w-1", organisationId: "org-1", status: "IN_PROGRESS", startedAt: null, completedAt: null };
    mockDbChain.limit.mockResolvedValueOnce([instance]); // instance lookup
    mockDbChain.orderBy.mockResolvedValueOnce([]); // blocks
    mockDbChain.orderBy.mockResolvedValueOnce([]); // exercise instances
    mockDbChain.orderBy.mockResolvedValueOnce([]); // set logs

    const res = await request(makeApp())
      .get("/workout-instances/inst-1")
      .set("Cookie", "__session=member-a-token");

    expect(res.status).toBe(200);
    expect(res.body.id).toBe("inst-1");
  });

  it("MEMBER cannot access another member's workout instance (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_B_SESSION]); // auth as Member B
    mockDbChain.limit.mockResolvedValueOnce([]); // WHERE memberId=u3 returns nothing for inst-1
    const res = await request(makeApp())
      .get("/workout-instances/inst-1")
      .set("Cookie", "__session=member-b-token");
    expect(res.status).toBe(404);
  });

  it("COACH can access any member's workout instance (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]); // auth
    const instance = { id: "inst-1", memberId: "u2", workoutId: "w-1", organisationId: "org-1", status: "COMPLETED", startedAt: new Date(), completedAt: new Date() };
    mockDbChain.limit.mockResolvedValueOnce([instance]);
    mockDbChain.orderBy.mockResolvedValueOnce([]); // blocks
    mockDbChain.orderBy.mockResolvedValueOnce([]); // exercise instances
    mockDbChain.orderBy.mockResolvedValueOnce([]); // set logs

    const res = await request(makeApp())
      .get("/workout-instances/inst-1")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
  });

  it("returns 404 for non-existent instance", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .get("/workout-instances/does-not-exist")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Complete workout
// ---------------------------------------------------------------------------

describe("Workout Instances — Complete workout", () => {
  beforeEach(resetMocks);

  it("MEMBER can complete their workout with session RPE (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const instance = { id: "inst-1", memberId: "u2", workoutId: "w-1", organisationId: "org-1", status: "IN_PROGRESS", startedAt: new Date(Date.now() - 3600000) };
    mockDbChain.limit.mockResolvedValueOnce([instance]);
    const completed = { ...instance, status: "COMPLETED", sessionRpe: 8, durationSeconds: 3600 };
    mockDbChain.returning.mockResolvedValueOnce([completed]);

    const res = await request(makeApp())
      .patch("/workout-instances/inst-1")
      .set("Cookie", "__session=member-a-token")
      .send({ status: "COMPLETED", sessionRpe: 8 });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("COMPLETED");
    expect(res.body.sessionRpe).toBe(8);
  });

  it("rejects sessionRpe outside 1-10 (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .patch("/workout-instances/inst-1")
      .set("Cookie", "__session=member-a-token")
      .send({ status: "COMPLETED", sessionRpe: 11 });
    expect(res.status).toBe(400);
  });

  it("rejects sessionRpe of 0 (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .patch("/workout-instances/inst-1")
      .set("Cookie", "__session=member-a-token")
      .send({ status: "COMPLETED", sessionRpe: 0 });
    expect(res.status).toBe(400);
  });

  it("MEMBER cannot complete another member's workout (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_B_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([]); // memberId=u3 doesn't match inst-1
    const res = await request(makeApp())
      .patch("/workout-instances/inst-1")
      .set("Cookie", "__session=member-b-token")
      .send({ status: "COMPLETED", sessionRpe: 7 });
    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Set logging
// ---------------------------------------------------------------------------

describe("Workout Instances — Log sets", () => {
  beforeEach(resetMocks);

  it("MEMBER can log a set (201)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]); // auth
    const instance = { id: "inst-1", memberId: "u2", organisationId: "org-1" };
    mockDbChain.limit.mockResolvedValueOnce([instance]); // ownership check
    const ei = { id: "ei-1", workoutInstanceId: "inst-1" };
    mockDbChain.limit.mockResolvedValueOnce([ei]); // exercise instance check
    const setLog = { id: "sl-1", exerciseInstanceId: "ei-1", setNumber: 1, reps: 5, loadKg: 100, completed: true };
    mockDbChain.returning.mockResolvedValueOnce([setLog]);

    const res = await request(makeApp())
      .post("/workout-instances/inst-1/exercises/ei-1/sets")
      .set("Cookie", "__session=member-a-token")
      .send({ setNumber: 1, reps: 5, loadKg: 100, completed: true });

    expect(res.status).toBe(201);
    expect(res.body.reps).toBe(5);
    expect(res.body.loadKg).toBe(100);
  });

  it("returns 400 for missing setNumber", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const res = await request(makeApp())
      .post("/workout-instances/inst-1/exercises/ei-1/sets")
      .set("Cookie", "__session=member-a-token")
      .send({ reps: 5, loadKg: 100 }); // no setNumber
    expect(res.status).toBe(400);
  });

  it("MEMBER cannot log a set on another member's workout (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_B_SESSION]); // auth as B
    mockDbChain.limit.mockResolvedValueOnce([]); // memberId=u3 doesn't own inst-1
    const res = await request(makeApp())
      .post("/workout-instances/inst-1/exercises/ei-1/sets")
      .set("Cookie", "__session=member-b-token")
      .send({ setNumber: 1, reps: 5 });
    expect(res.status).toBe(404);
  });

  it("returns 404 when exercise instance not in this workout", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    const instance = { id: "inst-1", memberId: "u2", organisationId: "org-1" };
    mockDbChain.limit.mockResolvedValueOnce([instance]);
    mockDbChain.limit.mockResolvedValueOnce([]); // ei not found in this instance
    const res = await request(makeApp())
      .post("/workout-instances/inst-1/exercises/ei-other/sets")
      .set("Cookie", "__session=member-a-token")
      .send({ setNumber: 1, reps: 5 });
    expect(res.status).toBe(404);
  });

  it("MEMBER can update a set (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ id: "inst-1", memberId: "u2", organisationId: "org-1" }]);
    const updated = { id: "sl-1", reps: 8, loadKg: 102.5, completed: true };
    mockDbChain.returning.mockResolvedValueOnce([updated]);

    const res = await request(makeApp())
      .put("/workout-instances/inst-1/exercises/ei-1/sets/sl-1")
      .set("Cookie", "__session=member-a-token")
      .send({ reps: 8, loadKg: 102.5 });

    expect(res.status).toBe(200);
    expect(res.body.reps).toBe(8);
  });

  it("MEMBER can delete a set (204)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ id: "inst-1", memberId: "u2", organisationId: "org-1" }]);
    mockDbChain.returning.mockResolvedValueOnce([{ id: "sl-1" }]);

    const res = await request(makeApp())
      .delete("/workout-instances/inst-1/exercises/ei-1/sets/sl-1")
      .set("Cookie", "__session=member-a-token");

    expect(res.status).toBe(204);
  });
});

// ---------------------------------------------------------------------------
// Previous performance
// ---------------------------------------------------------------------------

describe("Workout Instances — Previous performance", () => {
  beforeEach(resetMocks);

  it("returns previous performance data when available", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]); // auth
    const instance = { id: "inst-2", memberId: "u2", workoutId: "w-1", organisationId: "org-1", status: "IN_PROGRESS", startedAt: null, completedAt: null };
    mockDbChain.limit.mockResolvedValueOnce([instance]); // get instance
    mockDbChain.orderBy.mockResolvedValueOnce([]); // blocks
    mockDbChain.orderBy.mockResolvedValueOnce([]); // template exercises
    const exerciseInstances = [{ id: "ei-1", exerciseId: "ex-1", workoutInstanceId: "inst-2", workoutExerciseId: "we-1", orderIndex: 0 }];
    mockDbChain.orderBy.mockResolvedValueOnce(exerciseInstances); // exercise instances
    mockDbChain.orderBy.mockResolvedValueOnce([]); // set logs for this instance

    // Previous performance query for ei-1
    const prevEI = { id: "ei-prev", completedAt: new Date("2026-09-01") };
    mockDbChain.limit.mockResolvedValueOnce([prevEI]);
    const prevSets = [{ id: "sl-prev", setNumber: 1, reps: 5, loadKg: 80, completed: true }];
    mockDbChain.orderBy.mockResolvedValueOnce(prevSets);

    const res = await request(makeApp())
      .get("/workout-instances/inst-2")
      .set("Cookie", "__session=member-a-token");

    expect(res.status).toBe(200);
  });

  it("returns null previous performance for a first-ever workout", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_A_SESSION]); // auth
    const instance = { id: "inst-1", memberId: "u2", workoutId: "w-1", organisationId: "org-1", status: "IN_PROGRESS", startedAt: null, completedAt: null };
    mockDbChain.limit.mockResolvedValueOnce([instance]);
    mockDbChain.orderBy.mockResolvedValueOnce([]); // blocks
    mockDbChain.orderBy.mockResolvedValueOnce([]); // template exercises
    mockDbChain.orderBy.mockResolvedValueOnce([]); // exercise instances (none)
    mockDbChain.orderBy.mockResolvedValueOnce([]); // set logs (none)

    const res = await request(makeApp())
      .get("/workout-instances/inst-1")
      .set("Cookie", "__session=member-a-token");

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.blocks)).toBe(true);
  });
});
