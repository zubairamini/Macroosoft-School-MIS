// Opaque session tokens in a Secure HttpOnly SameSite=Lax cookie.
// The raw token exists ONLY in the cookie; the database stores its SHA-256.
// No credentials are ever placed in localStorage.

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "maktabyar_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours absolute
const SLIDING_REFRESH_MS = 6 * 60 * 60 * 1000; // extend when < 6h remain

export interface SessionRow {
  id: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function createSession(
  userId: string,
  ip: string | null,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const { db } = await import("@/lib/db");
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: {
      userId,
      tokenHash: hashToken(token),
      expiresAt,
      ip,
      userAgent,
    },
  });
  return { token, expiresAt };
}

/** Loads and validates a session by raw token; applies sliding refresh. */
export async function getSessionByToken(token: string): Promise<SessionRow | null> {
  const { db } = await import("@/lib/db");
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
  });
  if (!session) return null;
  if (session.revokedAt) return null;
  if (session.expiresAt.getTime() < Date.now()) return null;

  if (session.expiresAt.getTime() - Date.now() < SLIDING_REFRESH_MS) {
    await db.session.update({
      where: { id: session.id },
      data: {
        lastSeenAt: new Date(),
        expiresAt: new Date(Date.now() + SESSION_TTL_MS),
      },
    });
  } else {
    await db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return session;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.session.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes every active session of a user (e.g. after password change). */
export async function revokeAllUserSessions(userId: string): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
