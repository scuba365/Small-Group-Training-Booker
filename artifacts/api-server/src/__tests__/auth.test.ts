import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Request, type Response } from "express";
import cookieParser from "cookie-parser";
import request from "supertest";

// ---------------------------------------------------------------------------
// Hoisted mock setup — vi.mock factories are hoisted above imports so any
// variables they reference must be created with vi.hoisted().
// ---------------------------------------------------------------------------

const { mockSessionRows, mockDbChain, mockDb } = vi.hoisted(() => {
  const mockSessionRows: unknown[] = [];

  const mockDbChain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(() => Promise.resolve([...mockSessionRows])),
    returning: vi.fn().mockImplementation(() => Promise.resolve([])),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
  };

  const mockDb = {
    select: vi.fn().mockReturnValue(mockDbChain),
    delete: vi.fn().mockReturnValue(mockDbChain),
    update: vi.fn().mockReturnValue(mockDbChain),
    insert: vi.fn().mockReturnValue(mockDbChain),
  };

  return { mockSessionRows, mockDbChain, mockDb };
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
}));

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { mockBcryptCompare } = vi.hoisted(() => ({
  mockBcryptCompare: vi.fn().mockResolvedValue(true),
}));

vi.mock("bcryptjs", () => ({
  default: {
    compare: mockBcryptCompare,
    hash: vi.fn().mockResolvedValue("$2b$12$mockhashedpassword"),
  },
}));

// ---------------------------------------------------------------------------
// Import middleware AFTER mocks are set up
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import { requireCoach, requireRole } from "../middleware/require-role";
import authRouter from "../routes/auth";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeApp(...middlewares: Array<(req: Request, res: Response, next: () => void) => void>) {
  const app = express();
  app.use(cookieParser());
  for (const mw of middlewares) app.use(mw as any);
  app.get("/test", (req, res) => {
    res.json({ user: req.user, organisationId: req.organisationId });
  });
  return app;
}

const COACH_SESSION = {
  session: { token: "valid-coach-token", expiresAt: new Date(Date.now() + 86400000), userId: "u1" },
  user: { id: "u1", email: "coach@test.com", name: "Coach User" },
  member: { organisationId: "org-a", role: "COACH", status: "ACTIVE" },
};

const MEMBER_SESSION = {
  session: { token: "valid-member-token", expiresAt: new Date(Date.now() + 86400000), userId: "u2" },
  user: { id: "u2", email: "member@test.com", name: "Member User" },
  member: { organisationId: "org-a", role: "MEMBER", status: "ACTIVE" },
};

const ORG_B_SESSION = {
  session: { token: "org-b-token", expiresAt: new Date(Date.now() + 86400000), userId: "u3" },
  user: { id: "u3", email: "other@test.com", name: "Other Org User" },
  member: { organisationId: "org-b", role: "COACH", status: "ACTIVE" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Authentication & Authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSessionRows.length = 0;
    mockDbChain.from.mockReturnThis();
    mockDbChain.innerJoin.mockReturnThis();
    mockDbChain.where.mockReturnThis();
    mockDbChain.limit.mockImplementation(() => Promise.resolve([...mockSessionRows]));
    mockDb.select.mockReturnValue(mockDbChain);
    mockDb.delete.mockReturnValue(mockDbChain);
    mockDb.update.mockReturnValue(mockDbChain);
  });

  // Test 1: Unauthenticated request is rejected
  it("rejects requests without a session cookie with 401", async () => {
    const app = makeApp(requireAuth);
    const res = await request(app).get("/test");
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/unauthenticated/i);
  });

  // Test 2: Authenticated request succeeds
  it("allows requests with a valid session cookie", async () => {
    mockSessionRows.push(COACH_SESSION);
    mockDbChain.limit.mockResolvedValue([COACH_SESSION]);
    const app = makeApp(requireAuth);

    const res = await request(app)
      .get("/test")
      .set("Cookie", "__session=valid-coach-token");

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("coach@test.com");
    expect(res.body.organisationId).toBe("org-a");
  });

  // Test 3: Member cannot access coach-only endpoint
  it("blocks a MEMBER role from a coach-only endpoint with 403", async () => {
    mockDbChain.limit.mockResolvedValue([MEMBER_SESSION]);
    const app = makeApp(requireAuth, requireCoach as any);

    const res = await request(app)
      .get("/test")
      .set("Cookie", "__session=valid-member-token");

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/forbidden/i);
  });

  // Test 4: Coach can access coach-only endpoint
  it("allows a COACH role to access a coach-only endpoint", async () => {
    mockDbChain.limit.mockResolvedValue([COACH_SESSION]);
    const app = makeApp(requireAuth, requireCoach as any);

    const res = await request(app)
      .get("/test")
      .set("Cookie", "__session=valid-coach-token");

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("COACH");
  });

  // Test 5: Organisation A cannot read Organisation B's data
  it("scopes req.organisationId to the session owner's org, not a client-supplied value", async () => {
    mockDbChain.limit.mockResolvedValue([ORG_B_SESSION]);

    const scopedApp = express();
    scopedApp.use(cookieParser());
    scopedApp.use(requireAuth as any);
    scopedApp.get("/clients", (req, res) => {
      const requestedOrg = req.query.organisation_id as string | undefined;
      const effectiveOrg = req.organisationId!; // always from session, never client
      res.json({ effectiveOrg, requestedOrg, isSafe: effectiveOrg !== requestedOrg });
    });

    const res = await request(scopedApp)
      .get("/clients?organisation_id=org-a") // attacker requests org-a data
      .set("Cookie", "__session=org-b-token");   // but session belongs to org-b

    expect(res.status).toBe(200);
    expect(res.body.effectiveOrg).toBe("org-b");
    expect(res.body.requestedOrg).toBe("org-a");
    expect(res.body.isSafe).toBe(true);
  });

  // Test 6: Existing Barracks data is accessible after migration
  it("allows the seeded Barracks OWNER to authenticate and reach the app", async () => {
    const barracksSession = {
      session: { token: "barracks-token", expiresAt: new Date(Date.now() + 86400000), userId: "user_stephen_cahill_01" },
      user: { id: "user_stephen_cahill_01", email: "stephen@thebarracksfitness.com", name: "Stephen Cahill" },
      member: { organisationId: "org_barracks_fitness_01", role: "OWNER", status: "ACTIVE" },
    };
    mockDbChain.limit.mockResolvedValue([barracksSession]);
    const app = makeApp(requireAuth);

    const res = await request(app)
      .get("/test")
      .set("Cookie", "__session=barracks-token");

    expect(res.status).toBe(200);
    expect(res.body.organisationId).toBe("org_barracks_fitness_01");
    expect(res.body.user.role).toBe("OWNER");
  });

  // Test 7: Logout invalidates the session
  it("returns 401 after logout (session row removed from DB)", async () => {
    // First request succeeds
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);
    const app = makeApp(requireAuth);

    const firstRes = await request(app)
      .get("/test")
      .set("Cookie", "__session=valid-coach-token");
    expect(firstRes.status).toBe(200);

    // After logout the session row is gone — DB returns empty
    mockDbChain.limit.mockResolvedValue([]);

    const secondRes = await request(app)
      .get("/test")
      .set("Cookie", "__session=valid-coach-token");
    expect(secondRes.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// requireRole unit tests
// ---------------------------------------------------------------------------

describe("requireRole middleware", () => {
  function mockReq(role: string): Partial<Request> {
    return { user: { id: "u1", email: "e@e.com", name: "Test", role } };
  }

  function runMiddleware(
    middleware: ReturnType<typeof requireRole>,
    role: string,
  ): Promise<number> {
    return new Promise((resolve) => {
      const req = mockReq(role) as Request;
      const res = {
        status: (code: number) => ({ json: () => { resolve(code); } }),
      } as unknown as Response;
      const next = () => resolve(200);
      middleware(req, res, next);
    });
  }

  it("grants OWNER access to admin-only route", async () => {
    expect(await runMiddleware(requireRole("ADMIN", "OWNER"), "OWNER")).toBe(200);
  });

  it("grants ADMIN access to admin-only route", async () => {
    expect(await runMiddleware(requireRole("ADMIN", "OWNER"), "ADMIN")).toBe(200);
  });

  it("denies COACH access to admin-only route", async () => {
    expect(await runMiddleware(requireRole("ADMIN", "OWNER"), "COACH")).toBe(403);
  });

  it("denies MEMBER access to coach-only route", async () => {
    expect(await runMiddleware(requireCoach, "MEMBER")).toBe(403);
  });

  it("grants COACH access to coach-only route", async () => {
    expect(await runMiddleware(requireCoach, "COACH")).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Auth route integration tests
// ---------------------------------------------------------------------------

const MOCK_USER_MEMBER = {
  id: "tm1",
  email: "cahillstephen@hotmail.com",
  name: "Stephen Cahill",
  passwordHash: "$2b$12$mockhashedpassword",
};

const MOCK_USER_OWNER = {
  id: "u-owner-1",
  email: "stephen@thebarracksfitness.com",
  name: "Stephen Cahill",
  passwordHash: "$2b$12$mockhashedpassword",
};

const MOCK_ORG_RECORD = {
  id: "org-a",
  name: "The Barracks Fitness",
  slug: "the-barracks-fitness",
  timezone: "Europe/Dublin",
  currency: "EUR",
};

function makeAuthApp() {
  const app = express();
  app.use(cookieParser());
  app.use(express.json());
  app.use(authRouter);
  return app;
}

function resetAuthMocks() {
  vi.clearAllMocks();
  mockSessionRows.length = 0;
  mockDbChain.from.mockReturnThis();
  mockDbChain.innerJoin.mockReturnThis();
  mockDbChain.where.mockReturnThis();
  mockDbChain.values.mockReturnThis();
  mockDbChain.limit.mockImplementation(() => Promise.resolve([...mockSessionRows]));
  mockDbChain.returning.mockImplementation(() => Promise.resolve([]));
  mockDb.select.mockReturnValue(mockDbChain);
  mockDb.insert.mockReturnValue(mockDbChain);
  mockDb.delete.mockReturnValue(mockDbChain);
  mockDb.update.mockReturnValue(mockDbChain);
  mockBcryptCompare.mockResolvedValue(true);
}

describe("POST /auth/login", () => {
  beforeEach(resetAuthMocks);

  it("returns 200 with user.role MEMBER and sets a session cookie", async () => {
    mockDbChain.limit
      .mockResolvedValueOnce([MOCK_USER_MEMBER])
      .mockResolvedValueOnce([{ member: { organisationId: "org-a", role: "MEMBER", status: "ACTIVE" }, org: MOCK_ORG_RECORD }]);

    const res = await request(makeAuthApp())
      .post("/auth/login")
      .send({ email: "cahillstephen@hotmail.com", password: "TestMember2026!" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("MEMBER");
    expect(res.body.user.email).toBe("cahillstephen@hotmail.com");
    expect(res.body.organisation.id).toBe("org-a");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 200 with user.role OWNER and sets a session cookie", async () => {
    mockDbChain.limit
      .mockResolvedValueOnce([MOCK_USER_OWNER])
      .mockResolvedValueOnce([{ member: { organisationId: "org-a", role: "OWNER", status: "ACTIVE" }, org: MOCK_ORG_RECORD }]);

    const res = await request(makeAuthApp())
      .post("/auth/login")
      .send({ email: "stephen@thebarracksfitness.com", password: "BarracksOwner2026!" });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("OWNER");
    expect(res.headers["set-cookie"]).toBeDefined();
  });

  it("returns 401 when password is incorrect", async () => {
    mockBcryptCompare.mockResolvedValueOnce(false);
    mockDbChain.limit.mockResolvedValueOnce([MOCK_USER_MEMBER]);

    const res = await request(makeAuthApp())
      .post("/auth/login")
      .send({ email: "cahillstephen@hotmail.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/invalid email or password/i);
  });

  it("returns 401 when user does not exist", async () => {
    mockDbChain.limit.mockResolvedValueOnce([]);

    const res = await request(makeAuthApp())
      .post("/auth/login")
      .send({ email: "nonexistent@test.com", password: "anything" });

    expect(res.status).toBe(401);
  });
});

describe("GET /auth/me — session persistence", () => {
  beforeEach(resetAuthMocks);

  it("returns 200 with user and organisation on valid session (simulates page refresh)", async () => {
    const SESSION = {
      session: { token: "coach-token", expiresAt: new Date(Date.now() + 86_400_000), userId: "u1" },
      user: { id: "u1", email: "coach@test.com", name: "Coach User" },
      member: { organisationId: "org-a", role: "COACH", status: "ACTIVE" },
    };
    mockDbChain.limit
      .mockResolvedValueOnce([SESSION])
      .mockResolvedValueOnce([{ member: { organisationId: "org-a", role: "COACH", status: "ACTIVE" }, org: MOCK_ORG_RECORD }]);

    const res = await request(makeAuthApp())
      .get("/auth/me")
      .set("Cookie", "__session=coach-token");

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("coach@test.com");
    expect(res.body.user.role).toBe("COACH");
    expect(res.body.organisation.id).toBe("org-a");
  });

  it("returns 401 when no session cookie is present (expired or missing)", async () => {
    const res = await request(makeAuthApp()).get("/auth/me");
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  beforeEach(resetAuthMocks);

  it("returns 204 and clears the session cookie", async () => {
    mockDbChain.limit.mockResolvedValueOnce([COACH_SESSION]);

    const res = await request(makeAuthApp())
      .post("/auth/logout")
      .set("Cookie", "__session=valid-coach-token");

    expect(res.status).toBe(204);
    const cookies = res.headers["set-cookie"] as string[] | string | undefined;
    expect(cookies).toBeDefined();
    const cookieArr = Array.isArray(cookies) ? cookies : [cookies as string];
    expect(cookieArr.some((c) => c.startsWith("__session="))).toBe(true);
  });

  it("returns 401 when attempting to logout without a session cookie", async () => {
    const res = await request(makeAuthApp()).post("/auth/logout");
    expect(res.status).toBe(401);
  });
});
