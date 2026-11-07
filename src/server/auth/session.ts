// Opaque session tokens in an HttpOnly cookie (SameSite adaptive: Lax for
// plain-HTTP dev, None+Secure behind HTTPS proxies/preview gateways).
// The raw token exists ONLY in the cookie; the database stores its SHA-256.
// No credentials are ever placed in localStorage.

import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";

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

// Cookie attributes adapt to the request context:
//   - Plain HTTP localhost dev → SameSite=Lax (first-party page, classic behavior).
//   - HTTPS (production or a TLS-terminating proxy/preview gateway) →
//     SameSite=None + Secure. Required when the app is displayed inside a
//     gateway iframe (third-party context): Lax cookies are rejected there,
//     which silently logged users out right after login. The trusted-client-
//     header CSRF layer (guard.ts) keeps cross-site abuse of a None cookie
//     impossible: cross-site forms cannot send the custom header, and a
//     cross-site fetch() with it never passes a CORS preflight this API
//     approves.
async function requestSecure(): Promise<boolean> {
  const h = await headers();
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  try {
    const host = (h.get("host") ?? "").toLowerCase();
    return host.startsWith("https://") || host.endsWith(":443");
  } catch {
    return false;
  }
}

export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const [jar, secure] = await Promise.all([cookies(), requestSecure()]);
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const [jar, secure] = await Promise.all([cookies(), requestSecure()]);
  jar.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: secure ? "none" : "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionToken(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(SESSION_COOKIE)?.value ?? null;
}
