import { type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import {
  authSessionsTable,
  organisationMembersTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";
import { logger } from "../lib/logger";

const SESSION_COOKIE = "__session";

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token: string | undefined = req.cookies?.[SESSION_COOKIE];

  if (!token) {
    res.status(401).json({ error: "Unauthenticated" });
    return;
  }

  try {
    const now = new Date();

    const rows = await db
      .select({
        session: authSessionsTable,
        user: {
          id: usersTable.id,
          email: usersTable.email,
          name: usersTable.name,
        },
        member: {
          organisationId: organisationMembersTable.organisationId,
          role: organisationMembersTable.role,
          status: organisationMembersTable.status,
        },
      })
      .from(authSessionsTable)
      .innerJoin(usersTable, eq(authSessionsTable.userId, usersTable.id))
      .innerJoin(
        organisationMembersTable,
        eq(authSessionsTable.userId, organisationMembersTable.userId),
      )
      .where(
        and(
          eq(authSessionsTable.token, token),
          gt(authSessionsTable.expiresAt, now),
          eq(organisationMembersTable.status, "ACTIVE"),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      res.clearCookie(SESSION_COOKIE);
      res.status(401).json({ error: "Session expired or invalid" });
      return;
    }

    const row = rows[0];

    req.user = {
      id: row.user.id,
      email: row.user.email,
      name: row.user.name,
      role: row.member.role,
    };
    req.organisationId = row.member.organisationId;

    next();
  } catch (err) {
    logger.error({ err }, "Auth middleware error");
    res.status(500).json({ error: "Internal server error" });
  }
}
