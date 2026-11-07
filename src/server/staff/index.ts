// Staff register (teachers & employees) — Phase 2.
// Domain rules live here, independent of HTTP and React.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { normalizePhone } from "@/server/shared/normalization";
import { can } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

// ── DTOs ────────────────────────────────────────────────────────────────────

export const staffCreateDto = z.object({
  fullName: z.string().min(3, "نام کامل را وارد کنید.").max(120),
  fatherName: z.string().min(2, "نام پدر را وارد کنید.").max(120),
  gender: z.enum(["male", "female"], { message: "جنسیت را انتخاب کنید." }),
  birthDate: dateInput,
  phone: z.string().max(20).optional().nullable()
    .transform((v) => (v ? normalizePhone(v) : v)),
  email: z.string().email("ایمیل معتبر نیست.").optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  branchId: z.string().optional().nullable(),
  position: z.enum(["teacher", "admin_staff", "support"]).default("teacher"),
  qualification: z.string().max(120).optional().nullable(),
  hireDate: dateInput.optional().nullable(),
  employmentType: z.enum(["full_time", "part_time", "contract"]).default("full_time"),
  specialtySubjectIds: z.array(z.string()).default([]),
});

export const staffUpdateDto = staffCreateDto.partial().extend({
  status: z.enum(["active", "inactive", "terminated"]).optional(),
  statusNote: z.string().max(200).optional().nullable(),
  version: z.number().int().min(1),
  userId: z.string().optional().nullable(),
});

// ── Queries ─────────────────────────────────────────────────────────────────

const STAFF_INCLUDE = {
  branch: { select: { id: true, name: true } },
  user: { select: { id: true, username: true, isActive: true } },
  _count: { select: { teachingAssignments: true } },
} as const;

function publicStaff(row: {
  id: string; branchId: string | null; userId: string | null;
  fullName: string; fatherName: string; gender: string; birthDate: string;
  phone: string | null; email: string | null; address: string | null;
  position: string; qualification: string | null; hireDate: string | null;
  employmentType: string; specialtySubjectIds: string; status: string;
  statusNote: string | null; version: number; createdAt: Date;
  branch: { id: string; name: string } | null;
  user: { id: string; username: string; isActive: boolean } | null;
  _count: { teachingAssignments: number };
}) {
  let specialtySubjectIds: string[] = [];
  try { specialtySubjectIds = JSON.parse(row.specialtySubjectIds ?? "[]"); } catch { /* noop */ }
  return {
    id: row.id,
    fullName: row.fullName,
    fatherName: row.fatherName,
    gender: row.gender,
    birthDate: row.birthDate,
    phone: row.phone,
    email: row.email,
    address: row.address,
    branchId: row.branchId,
    branchName: row.branch?.name ?? null,
    position: row.position,
    qualification: row.qualification,
    hireDate: row.hireDate,
    employmentType: row.employmentType,
    specialtySubjectIds,
    status: row.status,
    statusNote: row.statusNote,
    portal: row.user ? { id: row.user.id, username: row.user.username, isActive: row.user.isActive } : null,
    teachingAssignmentCount: row._count.teachingAssignments,
    version: row.version,
    createdAt: row.createdAt,
  };
}

export async function listStaff(ctx: AuthContext, filters: { q?: string; position?: string; status?: string }) {
  const rows = await db.staffMember.findMany({
    where: {
      AND: [
        filters.status ? { status: filters.status } : {},
        filters.position ? { position: filters.position } : {},
        filters.q
          ? {
              OR: [
                { fullName: { contains: filters.q } },
                { fatherName: { contains: filters.q } },
                { phone: { contains: filters.q } },
              ],
            }
          : {},
      ],
    },
    orderBy: [{ status: "asc" }, { fullName: "asc" }],
    include: STAFF_INCLUDE,
  });
  return rows.map(publicStaff);
}

export async function getStaff(ctx: AuthContext, id: string) {
  const row = await db.staffMember.findFirst({
    where: { id },
    include: {
      ...STAFF_INCLUDE,
      teachingAssignments: {
        take: 50,
        include: {
          classSection: { select: { id: true, label: true, gradeLevel: { select: { level: true, nameDari: true } } } },
          subject: { select: { id: true, nameDari: true } },
          academicYear: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!row) throw errors.notFound("کارمند");
  const assignments = row.teachingAssignments.map((a) => ({
    id: a.id,
    academicYearId: a.academicYearId,
    academicYearName: a.academicYear.name,
    sectionId: a.classSectionId,
    gradeName: a.classSection.gradeLevel.nameDari,
    sectionLabel: a.classSection.label,
    subjectId: a.subjectId,
    subjectName: a.subject.nameDari,
  }));
  return { ...publicStaff(row), assignments };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function createStaff(ctx: AuthContext, dto: z.infer<typeof staffCreateDto>) {
  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");
  if (dto.branchId) {
    const branch = await db.branch.findFirst({ where: { id: dto.branchId, orgId: org.id } });
    if (!branch) throw errors.notFound("شعبهٔ مکتب");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.staffMember.create({
      data: {
        orgId: org.id,
        branchId: dto.branchId || null,
        fullName: dto.fullName,
        fatherName: dto.fatherName,
        gender: dto.gender,
        birthDate: dto.birthDate,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        address: dto.address ?? null,
        position: dto.position,
        qualification: dto.qualification ?? null,
        hireDate: dto.hireDate ?? null,
        employmentType: dto.employmentType,
        specialtySubjectIds: JSON.stringify(dto.specialtySubjectIds),
        status: "active",
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "staff.create",
      entity: "StaffMember",
      entityId: row.id,
      after: { fullName: row.fullName, position: row.position, branchId: row.branchId },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function updateStaff(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof staffUpdateDto>,
) {
  const staff = await db.staffMember.findUnique({ where: { id } });
  if (!staff) throw errors.notFound("کارمند");
  if (staff.version !== dto.version) {
    throw errors.conflict(
      "این معلومات توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.",
    );
  }
  if (dto.status && dto.status !== staff.status && staff.status === "terminated") {
    throw errors.badRequest("کارمند ختم‌شده را نمی‌توان دوباره فعال کرد؛ رکورد جدید ایجاد کنید.");
  }
  // Portal-account link changes are HR-sensitive: only users.manage holders
  // may link/unlink an account on top of staff.manage.
  if (dto.userId !== undefined && !can(ctx, "users.manage")) {
    throw errors.forbidden("پیوند حساب کاربری کارمند نیاز به اجازهٔ مدیریت کاربران دارد.");
  }
  if (dto.userId) {
    const user = await db.user.findUnique({ where: { id: dto.userId } });
    if (!user) throw errors.notFound("حساب کاربری");
    const taken = await db.staffMember.findFirst({ where: { userId: dto.userId, NOT: { id } } });
    if (taken) throw errors.conflict("این حساب کاربری با کارمند دیگری پیوند شده است.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.staffMember.update({
      where: { id },
      data: {
        fullName: dto.fullName ?? staff.fullName,
        fatherName: dto.fatherName ?? staff.fatherName,
        gender: dto.gender ?? staff.gender,
        birthDate: dto.birthDate ?? staff.birthDate,
        phone: dto.phone !== undefined ? dto.phone : staff.phone,
        email: dto.email !== undefined ? dto.email : staff.email,
        address: dto.address !== undefined ? dto.address : staff.address,
        branchId: dto.branchId !== undefined ? (dto.branchId || null) : staff.branchId,
        position: dto.position ?? staff.position,
        qualification: dto.qualification !== undefined ? dto.qualification : staff.qualification,
        hireDate: dto.hireDate !== undefined ? dto.hireDate : staff.hireDate,
        employmentType: dto.employmentType ?? staff.employmentType,
        specialtySubjectIds: dto.specialtySubjectIds
          ? JSON.stringify(dto.specialtySubjectIds)
          : staff.specialtySubjectIds,
        status: dto.status ?? staff.status,
        statusNote: dto.statusNote !== undefined ? dto.statusNote : staff.statusNote,
        userId: dto.userId !== undefined ? (dto.userId || null) : staff.userId,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "staff.update",
      entity: "StaffMember",
      entityId: id,
      before: { status: staff.status, fullName: staff.fullName, position: staff.position, userId: staff.userId },
      after: { status: row.status, fullName: row.fullName, position: row.position, userId: row.userId },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function listTeachersMinimal() {
  return db.staffMember.findMany({
    where: { status: "active", position: "teacher" },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
}
