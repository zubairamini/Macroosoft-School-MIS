// Users & role assignments (Phase 1 scope: list, create, reset password,
// activate/deactivate, role assignment with scope parameters).

import { z } from "zod";
import { db } from "@/lib/db";
import { errors, ApiError } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { hashPassword, passwordPolicyError } from "@/server/auth/password";
import { revokeAllUserSessions } from "@/server/auth/session";
import { isValidRoleKey } from "@/server/rbac/permissions";
import { normalizePhone } from "@/server/shared/normalization";
import type { AuthContext } from "@/server/auth/context";

export const userCreateDto = z.object({
  username: z
    .string()
    .min(3, "نام کاربری باید حداقل ۳ حرف باشد.")
    .max(30)
    .regex(/^[a-zA-Z0-9._-]+$/, "نام کاربری فقط می‌تواند حروف لاتین، عدد، نقطه، خط تیره داشته باشد."),
  fullName: z.string().min(3, "نام کامل را وارد کنید.").max(80),
  password: z.string().min(8, "رمز باید حداقل ۸ حرف باشد.").max(100),
  phone: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
  email: z.string().email("ایمیل معتبر نیست.").optional().nullable(),
  roleKey: z.string().refine(isValidRoleKey, { message: "نقش معتبر را انتخاب کنید." }),
  branchId: z.string().optional().nullable(),
  academicYearId: z.string().optional().nullable(),
  sectionIds: z.array(z.string()).default([]),
  guardianId: z.string().optional().nullable(),
});

export const userUpdateDto = z.object({
  action: z.enum(["reset-password", "deactivate", "activate", "assign-role"]),
  password: z.string().min(8, "رمز باید حداقل ۸ حرف باشد.").max(100).optional(),
  roleKey: z.string().refine(isValidRoleKey, { message: "نقش معتبر را انتخاب کنید." }).optional(),
  branchId: z.string().optional().nullable(),
  academicYearId: z.string().optional().nullable(),
  sectionIds: z.array(z.string()).default([]),
});

export async function listUsers() {
  const rows = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      userRoles: {
        include: {
          branch: { select: { id: true, name: true } },
        },
      },
      guardian: { select: { id: true, fullName: true } },
      _count: { select: { sessions: true } },
    },
  });
  return rows.map((u) => ({
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    phone: u.phone,
    email: u.email,
    isActive: u.isActive,
    mustChangePassword: u.mustChangePassword,
    lastLoginAt: u.lastLoginAt,
    roles: u.userRoles.map((r) => ({
      roleKey: r.roleKey,
      branchName: r.branch?.name ?? null,
      academicYearId: r.academicYearId,
      sectionIds: JSON.parse(r.sectionIds || "[]") as string[],
    })),
    guardian: u.guardian ? { id: u.guardian.id, fullName: u.guardian.fullName } : null,
  }));
}

export async function createUser(ctx: AuthContext, dto: z.infer<typeof userCreateDto>) {
  const policyError = passwordPolicyError(dto.password);
  if (policyError) throw new ApiError(400, "VALIDATION_ERROR", policyError);
  const dup = await db.user.findUnique({ where: { username: dto.username } });
  if (dup) throw errors.conflict("نام کاربری از قبل موجود است.");

  const sectionIds = JSON.stringify(dto.sectionIds ?? []);
  return db.$transaction(async (tx) => {
    const row = await tx.user.create({
      data: {
        username: dto.username,
        passwordHash: hashPassword(dto.password),
        fullName: dto.fullName,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        mustChangePassword: true,
        guardianId: dto.guardianId || null,
      },
    });
    await tx.userRole.create({
      data: {
        userId: row.id,
        roleKey: dto.roleKey,
        branchId: dto.branchId || null,
        academicYearId: dto.academicYearId || null,
        sectionIds,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "user.create",
      entity: "User",
      entityId: row.id,
      after: { username: row.username, fullName: row.fullName, roleKey: dto.roleKey },
      ip: ctx.ip,
    });
    return { id: row.id, username: row.username };
  });
}

export async function updateUser(ctx: AuthContext, userId: string, dto: z.infer<typeof userUpdateDto>) {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw errors.notFound("کاربر");

  if (dto.action === "reset-password") {
    if (!dto.password) {
      throw new ApiError(400, "VALIDATION_ERROR", "رمز جدید را وارد کنید.");
    }
    const policyError = passwordPolicyError(dto.password);
    if (policyError) throw new ApiError(400, "VALIDATION_ERROR", policyError);
    if (user.id === ctx.user.id) {
      throw errors.badRequest("برای تغییر رمز خودتان از پروفایل کاربری استفاده کنید.");
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { passwordHash: hashPassword(dto.password!), mustChangePassword: true },
      });
      await writeAudit(tx, {
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        action: "user.reset-password",
        entity: "User",
        entityId: userId,
        ip: ctx.ip,
      });
    });
    await revokeAllUserSessions(userId);
    return { ok: true };
  }

  if (dto.action === "deactivate") {
    if (user.id === ctx.user.id) {
      throw errors.badRequest("حساب کاربری خودتان را نمی‌توانید غیرفعال کنید.");
    }
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: false } });
      await writeAudit(tx, {
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        action: "user.deactivate",
        entity: "User",
        entityId: userId,
        ip: ctx.ip,
      });
    });
    await revokeAllUserSessions(userId);
    return { ok: true };
  }

  if (dto.action === "activate") {
    await db.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { isActive: true } });
      await writeAudit(tx, {
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        action: "user.activate",
        entity: "User",
        entityId: userId,
        ip: ctx.ip,
      });
    });
    return { ok: true };
  }

  // assign-role: replaces the user's role assignments
  if (dto.action === "assign-role") {
    if (!dto.roleKey) throw new ApiError(400, "VALIDATION_ERROR", "نقش را انتخاب کنید.");
    if (user.id === ctx.user.id && dto.roleKey !== "admin") {
      // Guard: don't let the last admin demote themselves accidentally.
      const admins = await db.userRole.count({ where: { roleKey: "admin" } });
      if (admins <= 1) {
        throw errors.badRequest("آخرین مدیر سیستم نمی‌تواند نقش خود را تغییر دهد.");
      }
    }
    await db.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.create({
        data: {
          userId,
          roleKey: dto.roleKey!,
          branchId: dto.branchId || null,
          academicYearId: dto.academicYearId || null,
          sectionIds: JSON.stringify(dto.sectionIds ?? []),
        },
      });
      await writeAudit(tx, {
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        action: "user.assign-role",
        entity: "User",
        entityId: userId,
        after: { roleKey: dto.roleKey, branchId: dto.branchId ?? null },
        ip: ctx.ip,
      });
    });
    return { ok: true };
  }
  return { ok: true };
}
