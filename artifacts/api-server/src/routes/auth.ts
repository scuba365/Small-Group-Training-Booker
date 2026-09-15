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

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || `studio-${randomBytes(4).toString("hex")}`;
}

const router = Router();

// GET /api/auth/setup-status
// Publishing does not copy development seed records into the production database.
// This lets the client present a first-run setup screen when production is empty.
router.get("/auth/setup-status", async (_req: Request, res: Response): Promise<void> => {
  try {
    const users = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .limit(1);

    res.json({ needsSetup: users.length === 0 });
  } catch (err) {
    logger.error({ err }, "Setup status error");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/setup
// Creates the first owner account for a newly published studio.
router.post("/auth/setup", async (req: Request, res: Response): Promise<void> => {
  const { name, email, password, studioName } = req.body ?? {};

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string" ||
    typeof studioName !== "string"
  ) {
    res.status(400).json({ error: "Name, studio name, email, and password are required" });
    return;
  }

  const normalizedName = name.trim();
  const normalizedEmail = email.toLowerCase().trim();
  const normalizedStudioName = studioName.trim();

  if (!normalizedName || !normalizedStudioName || !normalizedEmail.includes("@")) {
    res.status(400).json({ error: "Enter a valid name, studio name, and email" });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }

  try {
    const existingUsers = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .limit(1);

    if (existingUsers.length > 0) {
      res.status(409).json({ error: "Studio setup is already complete. Sign in instead." });
      return;
    }

    const userId = `user_${randomUUID()}`;
    const organisationId = `org_${randomUUID()}`;
    const membershipId = `orgm_${randomUUID()}`;
    const token = generateSessionToken();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const passwordHash = await bcrypt.hash(password, 12);
    const organisationSlug = `${slugify(normalizedStudioName)}-${randomBytes(3).toString("hex")}`;

    await db.transaction(async (tx) => {
      await tx.insert(organisationsTable).values({
        id: organisationId,
        name: normalizedStudioName,
        slug: organisationSlug,
        timezone: "Europe/Dublin",
        currency: "EUR",
      });

      await tx.insert(usersTable).values({
        id: userId,
        email: normalizedEmail,
        passwordHash,
        name: normalizedName,
      });

      await tx.insert(organisationMembersTable).values({
        id: membershipId,
        organisationId,
        userId,
        role: "OWNER",
        status: "ACTIVE",
      });

      await tx.insert(authSessionsTable).values({
        id: sessionId,
        token,
        userId,
        expiresAt,
      });
    });

    logger.info({ userId, organisationId }, "Studio owner account created");

    res.cookie(SESSION_COOKIE, token, cookieOptions(req));
    res.status(201).json({
      user: {
        id: userId,
        email: normalizedEmail,
        name: normalizedName,
        role: "OWNER",
      },
      organisation: {
        id: organisationId,
        name: normalizedStudioName,
        slug: organisationSlug,
        timezone: "Europe/Dublin",
        currency: "EUR",
      },
    });
  } catch (err) {
    logger.error({ err }, "Studio setup error");
    res.status(500).json({ error: "Unable to create the studio account" });
  }
});

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
