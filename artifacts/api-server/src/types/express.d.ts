import "express";

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      organisationId?: string;
    }
  }
}
