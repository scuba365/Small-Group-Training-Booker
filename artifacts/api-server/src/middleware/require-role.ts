import { type Request, type Response, type NextFunction } from "express";

type Role = "OWNER" | "ADMIN" | "COACH" | "MEMBER";

const ROLE_HIERARCHY: Record<Role, number> = {
  OWNER: 4,
  ADMIN: 3,
  COACH: 2,
  MEMBER: 1,
};

/**
 * Requires the authenticated user to have at least one of the given roles.
 * Role hierarchy: OWNER > ADMIN > COACH > MEMBER
 *
 * Must be used after requireAuth.
 */
export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Unauthenticated" });
      return;
    }

    const userRole = req.user.role as Role;
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const minRequired = Math.min(...roles.map((r) => ROLE_HIERARCHY[r] ?? 99));

    if (userLevel < minRequired) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}

/** Shorthand for coach-or-above. */
export const requireCoach = requireRole("COACH", "ADMIN", "OWNER");

/** Shorthand for admin-or-above. */
export const requireAdmin = requireRole("ADMIN", "OWNER");

/** Shorthand for owner only. */
export const requireOwner = requireRole("OWNER");
