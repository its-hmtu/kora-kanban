import type { Prisma } from '../../generated/prisma/client';

/** User fields exposed on `req.user` (never secrets such as `passwordHash`). */
export const AUTH_USER_SELECT = {
  id: true,
  email: true,
  emailVerifiedAt: true,
  name: true,
  locale: true,
  theme: true,
  timezone: true,
} satisfies Prisma.UserSelect;

export type AuthUser = Prisma.UserGetPayload<{ select: typeof AUTH_USER_SELECT }>;

/** The authenticated session on `req.session`; also the exact shape cached in Redis. */
export interface SessionInfo {
  id: string;
  userId: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

export interface AuthContext {
  session: SessionInfo;
  user: AuthUser;
  /** True when this validation slid the expiry, so the cookie should be re-issued. */
  refreshed: boolean;
}

// Express's Request extends the global `Express.Request`, so this types `req.user`/`req.session`.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- the only way to augment Express
  namespace Express {
    interface Request {
      user?: AuthUser;
      session?: SessionInfo;
    }
  }
}
