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
  programmesTable: {
    id: "id",
    organisationId: "organisationId",
    name: "name",
    status: "status",
    createdBy: "createdBy",
    description: "description",
  },
  phasesTable: {
    id: "id",
    programmeId: "programmeId",
    name: "name",
    orderIndex: "orderIndex",
    description: "description",
  },
  weeksTable: {
    id: "id",
    phaseId: "phaseId",
    weekNumber: "weekNumber",
    orderIndex: "orderIndex",
    label: "label",
  },
  daysTable: {
    id: "id",
    weekId: "weekId",
    dayNumber: "dayNumber",
    orderIndex: "orderIndex",
    label: "label",
  },
  workoutsTable: {
    id: "id",
    dayId: "dayId",
    name: "name",
    orderIndex: "orderIndex",
    description: "description",
  },
  workoutBlocksTable: {
    id: "id",
    workoutId: "workoutId",
    blockType: "blockType",
    orderIndex: "orderIndex",
    name: "name",
    rounds: "rounds",
    timeCapSeconds: "timeCapSeconds",
    restBetweenRoundsSeconds: "restBetweenRoundsSeconds",
    notes: "notes",
  },
  workoutExercisesTable: {
    id: "id",
    blockId: "blockId",
    exerciseId: "exerciseId",
    orderIndex: "orderIndex",
    sets: "sets",
    repsMin: "repsMin",
    repsMax: "repsMax",
    loadKg: "loadKg",
    loadPercent1rm: "loadPercent1rm",
    rpe: "rpe",
    rir: "rir",
    tempo: "tempo",
    restSeconds: "restSeconds",
    durationSeconds: "durationSeconds",
    distanceMeters: "distanceMeters",
    pacePerKm: "pacePerKm",
    calories: "calories",
    targetTime: "targetTime",
    targetPace: "targetPace",
    notes: "notes",
  },
  exercisesTable: {
    id: "id",
    organisationId: "organisationId",
    name: "name",
  },
  PROGRAMME_STATUSES: ["DRAFT", "ACTIVE", "ARCHIVED"],
  BLOCK_TYPES: ["STRAIGHT_SET", "SUPERSET", "CIRCUIT", "AMRAP", "EMOM", "FOR_TIME", "TABATA"],
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Import routers after mocks
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import programmesRouter from "../routes/programmes";

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
  app.use(programmesRouter);
  return app;
}

function resetMocks() {
  vi.clearAllMocks();
  mockRows.length = 0;
  // IMPORTANT: re-initialise ALL chain methods — clearAllMocks wipes implementations
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

describe("Programme — Role Enforcement", () => {
  beforeEach(resetMocks);

  it("blocks a MEMBER from listing programmes (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .get("/programmes")
      .set("Cookie", "__session=member-token");
    expect(res.status).toBe(403);
  });

  it("allows a COACH to list programmes (200)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.orderBy.mockResolvedValueOnce([]);
    const res = await request(makeApp())
      .get("/programmes")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("blocks a MEMBER from creating a programme (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/programmes")
      .set("Cookie", "__session=member-token")
      .send({ name: "8-Week Strength" });
    expect(res.status).toBe(403);
  });

  it("blocks a MEMBER from updating a programme (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .put("/programmes/prog-1")
      .set("Cookie", "__session=member-token")
      .send({ name: "Updated" });
    expect(res.status).toBe(403);
  });

  it("blocks a MEMBER from adding a phase (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);
    const res = await request(makeApp())
      .post("/programmes/prog-1/phases")
      .set("Cookie", "__session=member-token")
      .send({ name: "Phase 1" });
    expect(res.status).toBe(403);
  });
});

describe("Programme — CRUD", () => {
  beforeEach(resetMocks);

  it("creates a programme and returns 201", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const newProgramme = {
      id: "prog-1",
      organisationId: "org-1",
      name: "8-Week Strength",
      status: "DRAFT",
      createdBy: "u1",
    };
    mockDbChain.returning.mockResolvedValueOnce([newProgramme]);

    const res = await request(makeApp())
      .post("/programmes")
      .set("Cookie", "__session=coach-token")
      .send({ name: "8-Week Strength" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("8-Week Strength");
    expect(res.body.status).toBe("DRAFT");
  });

  it("rejects programme creation with missing name (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/programmes")
      .set("Cookie", "__session=coach-token")
      .send({ description: "No name given" });
    expect(res.status).toBe(400);
  });

  it("rejects programme creation with invalid status (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const res = await request(makeApp())
      .post("/programmes")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Test", status: "INVALID_STATUS" });
    expect(res.status).toBe(400);
  });

  it("archives a programme (soft delete) — returns 204", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([{ id: "prog-1" }]);

    const res = await request(makeApp())
      .delete("/programmes/prog-1")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(204);
  });

  it("returns 404 when archiving a non-existent programme", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.returning.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .delete("/programmes/does-not-exist")
      .set("Cookie", "__session=coach-token");
    expect(res.status).toBe(404);
  });
});

describe("Programme — Hierarchy Creation", () => {
  beforeEach(resetMocks);

  it("creates a phase under an existing org-owned programme — 201", async () => {
    // requireAuth lookup
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // getProgrammeForOrg
    mockDbChain.limit.mockResolvedValueOnce([
      { id: "prog-1", organisationId: "org-1", name: "Prog" },
    ]);
    // insert phase
    mockDbChain.returning.mockResolvedValueOnce([
      { id: "phase-1", programmeId: "prog-1", name: "Accumulation", orderIndex: 0 },
    ]);

    const res = await request(makeApp())
      .post("/programmes/prog-1/phases")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Accumulation" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Accumulation");
  });

  it("returns 404 when adding a phase to a different org's programme", async () => {
    // requireAuth lookup (org-1 coach)
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // getProgrammeForOrg — org-2 programme not found for org-1 coach
    mockDbChain.limit.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .post("/programmes/prog-org2/phases")
      .set("Cookie", "__session=coach-token")
      .send({ name: "Phase 1" });

    expect(res.status).toBe(404);
  });

  it("creates a block with a specific block type — 201", async () => {
    // requireAuth
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // getWorkoutForOrg (walks hierarchy via joins)
    mockDbChain.limit.mockResolvedValueOnce([{ workout: { id: "wo-1", dayId: "day-1" } }]);
    // insert block
    mockDbChain.returning.mockResolvedValueOnce([
      { id: "block-1", workoutId: "wo-1", blockType: "AMRAP", orderIndex: 0, exercises: [] },
    ]);

    const res = await request(makeApp())
      .post("/workouts/wo-1/blocks")
      .set("Cookie", "__session=coach-token")
      .send({ blockType: "AMRAP", rounds: 3, timeCapSeconds: 600 });

    expect(res.status).toBe(201);
    expect(res.body.blockType).toBe("AMRAP");
  });
});

describe("Programme — Prescription Validation", () => {
  beforeEach(resetMocks);

  it("accepts a fully structured strength prescription", async () => {
    // requireAuth
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    // getBlockForOrg
    mockDbChain.limit.mockResolvedValueOnce([{ block: { id: "block-1", workoutId: "wo-1" } }]);
    const savedWE = {
      id: "we-1",
      blockId: "block-1",
      exerciseId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      sets: 4,
      repsMin: 6,
      repsMax: 8,
      loadPercent1rm: 75,
      rpe: 8.0,
      tempo: "3-1-1-0",
      restSeconds: 180,
    };
    mockDbChain.returning.mockResolvedValueOnce([savedWE]);
    // exercise lookup after insert
    mockDbChain.limit.mockResolvedValueOnce([{ id: "ex-1", name: "Back Squat" }]);

    const res = await request(makeApp())
      .post("/blocks/block-1/exercises")
      .set("Cookie", "__session=coach-token")
      .send({
        exerciseId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        sets: 4,
        repsMin: 6,
        repsMax: 8,
        loadPercent1rm: 75,
        rpe: 8.0,
        tempo: "3-1-1-0",
        restSeconds: 180,
      });

    expect(res.status).toBe(201);
    expect(res.body.sets).toBe(4);
    expect(res.body.repsMin).toBe(6);
    expect(res.body.repsMax).toBe(8);
    expect(res.body.tempo).toBe("3-1-1-0");
  });

  it("accepts a cardio prescription with pace and distance", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ block: { id: "block-1" } }]);
    const savedWE = {
      id: "we-2",
      blockId: "block-1",
      exerciseId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      distanceMeters: 5000,
      pacePerKm: "5:30",
      targetTime: "sub 27:30",
    };
    mockDbChain.returning.mockResolvedValueOnce([savedWE]);
    mockDbChain.limit.mockResolvedValueOnce([{ id: "ex-2", name: "5km Run" }]);

    const res = await request(makeApp())
      .post("/blocks/block-1/exercises")
      .set("Cookie", "__session=coach-token")
      .send({
        exerciseId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        distanceMeters: 5000,
        pacePerKm: "5:30",
        targetTime: "sub 27:30",
      });

    expect(res.status).toBe(201);
    expect(res.body.distanceMeters).toBe(5000);
    expect(res.body.pacePerKm).toBe("5:30");
  });

  it("rejects RPE above 10 (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ block: { id: "block-1" } }]);

    const res = await request(makeApp())
      .post("/blocks/block-1/exercises")
      .set("Cookie", "__session=coach-token")
      .send({
        exerciseId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        rpe: 11,
      });
    expect(res.status).toBe(400);
  });

  it("rejects loadPercent1rm above 100 (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ block: { id: "block-1" } }]);

    const res = await request(makeApp())
      .post("/blocks/block-1/exercises")
      .set("Cookie", "__session=coach-token")
      .send({
        exerciseId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        loadPercent1rm: 150,
      });
    expect(res.status).toBe(400);
  });

  it("rejects invalid exerciseId UUID (400)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    mockDbChain.limit.mockResolvedValueOnce([{ block: { id: "block-1" } }]);

    const res = await request(makeApp())
      .post("/blocks/block-1/exercises")
      .set("Cookie", "__session=coach-token")
      .send({ exerciseId: "not-a-uuid" });
    expect(res.status).toBe(400);
  });
});

describe("Programme — Organisation Scoping", () => {
  beforeEach(resetMocks);

  it("org-2 coach cannot update org-1 programme (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH_SESSION]);
    // update returns nothing — WHERE organisationId = org-2 filters it out
    mockDbChain.returning.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .put("/programmes/prog-org1")
      .set("Cookie", "__session=orgb-token")
      .send({ name: "Hijacked" });

    expect(res.status).toBe(404);
  });

  it("org-2 coach cannot add phases to org-1 programme (404)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([ORG_B_COACH_SESSION]);
    // getProgrammeForOrg: WHERE org-2 matches nothing
    mockDbChain.limit.mockResolvedValueOnce([]);

    const res = await request(makeApp())
      .post("/programmes/prog-org1/phases")
      .set("Cookie", "__session=orgb-token")
      .send({ name: "Phase 1" });

    expect(res.status).toBe(404);
  });

  it("member from same org cannot list programmes (403)", async () => {
    mockDbChain.limit.mockResolvedValueOnce([MEMBER_SESSION]);

    const res = await request(makeApp())
      .get("/programmes")
      .set("Cookie", "__session=member-token");

    expect(res.status).toBe(403);
  });
});
