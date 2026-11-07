// Login / logout / me / change-password use cases.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors, ApiError } from "@/server/shared/http";
import { verifyPassword, hashPassword, passwordPolicyError } from "./password";
import { isLoginLocked, recordLoginAttempt } from "./rate-limit";
import {
  createSession, setSessionCookie, clearSessionCookie,
  readSessionToken, revokeSessionByToken, revokeAllUserSessions,
} from "./session";
import { buildAuthContext } from "./context";
import { writeAudit } from "@/server/shared/audit";
import { drainOutbox } from "@/server/notifications";
import { toLatinDigits } from "@/server/shared/normalization";
import type { AuthContext } from "./context";

export const loginDto = z.object({
  username: z.string().min(1, "نام کاربری را وارد کنید.").max(60)
    .transform((v) => toLatinDigits(v).trim()),
  password: z.string().min(1, "رمز را وارد کنید.").max(100),
});

export const changePasswordDto = z.object({
  currentPassword: z.string().min(1, "رمز فعلی را وارد کنید."),
  newPassword: z.string().min(1, "رمز جدید را وارد کنید.").max(100),
});

export function authContextPublic(ctx: AuthContext | null) {
  if (!ctx) return null;
  return {
    user: {
      id: ctx.user.id,
      username: ctx.user.username,
      fullName: ctx.user.fullName,
      phone: ctx.user.phone,
      email: ctx.user.email,
      mustChangePassword: ctx.user.mustChangePassword,
      guardianId: ctx.guardianId,
      linkedStudentId: ctx.linkedStudentId,
    },
    roles: ctx.roles,
    grants: ctx.grants.map((g) => ({
      permission: g.permission,
      scope: g.scope,
      branchId: g.branchId,
      academicYearId: g.academicYearId,
      sectionIds: g.sectionIds,
    })),
    branchId: ctx.branchId,
    ownBranchIds: ctx.ownBranchIds,
    isCrossBranch: ctx.isCrossBranch,
  };
}

export async function login(
  username: string,
  password: string,
  ip: string,
  userAgent: string | null,
) {
  if (await isLoginLocked(username, ip)) {
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "به دلیل تلاش‌های ناموفق زیاد، ورود موقتاً مسدود است. لطفاً پس از چند دقیقه دوباره تلاش کنید.",
    );
  }

  const user = await db.user.findUnique({ where: { username } });
  const ok = user ? verifyPassword(password, user.passwordHash) : false;

  if (!user || !ok || !user.isActive) {
    await recordLoginAttempt(username, ip, false);
    // Uniform message — does not reveal which part was wrong.
    throw new ApiError(401, "INVALID_CREDENTIALS", "نام کاربری یا رمز درست نیست.");
  }

  await recordLoginAttempt(username, ip, true);
  const { token, expiresAt } = await createSession(user.id, ip, userAgent);
  await setSessionCookie(token, expiresAt);
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  await writeAudit(db, {
    actorId: user.id,
    actorName: user.fullName,
    action: "auth.login",
    entity: "User",
    entityId: user.id,
    ip,
  });
  // Drain pending outbox events opportunistically (sandbox worker step).
  drainOutbox().catch(() => undefined);

  const ctx = await buildAuthContext(user.id, "__fresh__", ip, null);
  return authContextPublic(ctx);
}

export async function logout(ip: string | null) {
  const token = await readSessionToken();
  if (token) {
    await revokeSessionByToken(token);
  }
  await clearSessionCookie();
  return { ok: true };
}

export async function changePassword(ctx: AuthContext, currentPassword: string, newPassword: string) {
  const user = await db.user.findUnique({ where: { id: ctx.user.id } });
  if (!user) throw errors.unauthorized();
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new ApiError(400, "VALIDATION_ERROR", "رمز فعلی درست نیست.");
  }
  const policy = passwordPolicyError(newPassword);
  if (policy) throw new ApiError(400, "VALIDATION_ERROR", policy);
  if (newPassword === currentPassword) {
    throw new ApiError(400, "VALIDATION_ERROR", "رمز جدید باید با رمز فعلی فرق داشته باشد.");
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: { passwordHash: hashPassword(newPassword), mustChangePassword: false },
    });
    await writeAudit(tx, {
      actorId: user.id,
      actorName: user.fullName,
      action: "auth.change-password",
      entity: "User",
      entityId: user.id,
      ip: ctx.ip,
    });
  });
  // Revoke other sessions after a password change.
  await revokeAllUserSessions(user.id);
  // Re-issue a fresh session for the current browser.
  const { token, expiresAt } = await createSession(user.id, ctx.ip, null);
  await setSessionCookie(token, expiresAt);
  return { ok: true };
}
