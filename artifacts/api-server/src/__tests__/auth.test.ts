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
  };

  const mockDb = {
    select: vi.fn().mockReturnValue(mockDbChain),
    delete: vi.fn().mockReturnValue(mockDbChain),
    update: vi.fn().mockReturnValue(mockDbChain),
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

// ---------------------------------------------------------------------------
// Import middleware AFTER mocks are set up
// ---------------------------------------------------------------------------

import { requireAuth } from "../middleware/auth";
import { requireCoach, requireRole } from "../middleware/require-role";

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
