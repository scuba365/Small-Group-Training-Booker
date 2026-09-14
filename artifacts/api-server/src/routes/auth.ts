import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  authSessionsTable,
  organisationMembersTable,
  organisationsTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { randomBytes, randomUUID } from "node:crypto";
import { logger } from "../lib/logger";
import { requireAuth } from "../middleware/auth";
import type { Request, Response } from "express";

const SESSION_COOKIE = "__session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function cookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: SESSION_TTL_MS,
    path: "/",
  };
}

function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

const router = Router();

// POST /api/auth/login
router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body ?? {};

  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, normalizedEmail))
      .limit(1);

    if (users.length === 0) {
      // Constant-time compare to prevent user enumeration
      await bcrypt.compare(password, "$2b$12$invalidhashfortimingnormalize0000000000000");
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    const user = users[0];
    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      res.status(401).json({ error: "Invalid email or password" });
      return;
    }

    // Fetch organisation membership
    const memberships = await db
      .select({
        member: organisationMembersTable,
        org: organisationsTable,
      })
      .from(organisationMembersTable)
      .innerJoin(
        organisationsTable,
        eq(organisationMembersTable.organisationId, organisationsTable.id),
      )
      .where(
        and(
          eq(organisationMembersTable.userId, user.id),
          eq(organisationMembersTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (memberships.length === 0) {
      res.status(403).json({ error: "No active organisation membership found" });
      return;
    }

    const { member, org } = memberships[0];

    // Create session
    const token = generateSessionToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.insert(authSessionsTable).values({
      id: sessionId,
      token,
      userId: user.id,
      expiresAt,
    });

    logger.info({ userId: user.id, orgId: org.id }, "User logged in");

    res.cookie(SESSION_COOKIE, token, cookieOptions(req));
    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: member.role,
      },
      organisation: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        currency: org.currency,
      },
    });
  } catch (err) {
    logger.error({ err }, "Login error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", requireAuth, async (req: Request, res: Response): Promise<void> => {
  const token: string | undefined = req.cookies?.[SESSION_COOKIE];

  try {
    if (token) {
      await db.delete(authSessionsTable).where(eq(authSessionsTable.token, token));
    }

    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.status(204).send();
  } catch (err) {
    logger.error({ err }, "Logout error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/auth/me
router.get("/auth/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const memberships = await db
      .select({
        member: organisationMembersTable,
        org: organisationsTable,
      })
      .from(organisationMembersTable)
      .innerJoin(
        organisationsTable,
        eq(organisationMembersTable.organisationId, organisationsTable.id),
      )
      .where(
        and(
          eq(organisationMembersTable.userId, req.user!.id),
          eq(organisationMembersTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (memberships.length === 0) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }

    const { member, org } = memberships[0];

    res.json({
      user: {
        id: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        role: req.user!.role,
      },
      organisation: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        timezone: org.timezone,
        currency: org.currency,
      },
    });
  } catch (err) {
    logger.error({ err }, "Get me error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
