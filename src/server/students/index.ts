// Students module: scoped lists, permission-aware profiles, lifecycle
// status changes, guardian management.
//
// Sensitive personal fields (healthNotes, identity details) are stripped
// from every response unless the viewer holds students.view_sensitive.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors, ApiError } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { normalizeDariText, normalizePhone } from "@/server/shared/normalization";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";
import { canViewStudent, studentListWhere, canViewSensitive, can } from "@/server/rbac/scope";
import type { Prisma } from "@prisma/client";

export const STUDENT_STATUSES = [
  "active", "inactive", "transferred", "withdrawn", "graduated",
] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

export const STUDENT_STATUS_LABELS: Record<StudentStatus, string> = {
  active: "فعال",
  inactive: "غیرفعال موقت",
  transferred: "منتقل‌شده",
  withdrawn: "انصراف‌داده",
  graduated: "فارغ‌التحصیل",
};

export const ENROLLMENT_STATUS_LABELS: Record<string, string> = {
  active: "فعال",
  promoted: "ارتقا یافته",
  repeated: "تکرار صنف",
  transferred: "منتقل‌شده",
  withdrawn: "منسحب",
  graduated: "فارغ‌التحصیل",
};

function parsePersonal(s: string) {
  try { return JSON.parse(s); } catch { return {}; }
}

export function stripSensitive(personal: Record<string, unknown>) {
  const clone = { ...personal };
  delete clone.healthNotes;
  delete clone.tazkiraNumber;
  return clone;
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export const studentUpdateDto = z.object({
  personal: z.object({
    firstName: z.string().min(2, "نام شاگرد را وارد کنید.").max(60),
    fatherName: z.string().min(2, "نام پدر را وارد کنید.").max(60),
    grandfatherName: z.string().max(60).optional().nullable(),
    gender: z.enum(["male", "female"], { message: "جنسیت را انتخاب کنید." }),
    birthDate: dateInput,
    birthPlace: z.string().max(60).optional().nullable(),
    phone: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
    address: z.string().max(200).optional().nullable(),
    previousSchool: z.string().max(120).optional().nullable(),
    previousGrade: z.coerce.number().int().min(0).max(12).optional().nullable(),
    healthNotes: z.string().max(500).optional().nullable(),
  }),
  status: z.enum(STUDENT_STATUSES).optional(),
  version: z.number().int().min(1, "نسخهٔ رکورد لازم است."),
});

export const studentStatusDto = z.object({
  status: z.enum(STUDENT_STATUSES, { message: "وضعیت را انتخاب کنید." }),
  note: z.string().max(300).optional(),
});

export const guardianLinkDto = z.object({
  guardianId: z.string().min(1, "ولی را انتخاب کنید."),
  relationship: z.string().min(2, "نسبت را وارد کنید.").max(30),
  isPrimary: z.boolean().default(false),
  contactRights: z.boolean().default(true),
});

export const guardianCreateDto = z.object({
  fullName: z.string().min(2, "نام ولی را وارد کنید.").max(80),
  relationship: z.string().min(2, "نسبت را وارد کنید.").max(30),
  phone: z.string().min(6, "شمارهٔ تماس را وارد کنید.").max(20).transform(normalizePhone),
  phone2: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
  email: z.string().email("ایمیل معتبر نیست.").optional().nullable(),
  occupation: z.string().max(60).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  canPickUp: z.boolean().default(false),
  portalAccess: z.boolean().default(false),
});

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listStudents(
  ctx: AuthContext,
  filters: { q?: string; status?: string; gradeLevelId?: string; classSectionId?: string;
            academicYearId?: string; page: number; pageSize: number },
) {
  const scopeWhere = await studentListWhere(ctx);
  if (scopeWhere === null) {
    return { items: [], meta: { total: 0, page: filters.page, pageSize: filters.pageSize } };
  }

  const where: Prisma.StudentWhereInput = { ...scopeWhere };
  if (filters.status && STUDENT_STATUSES.includes(filters.status as StudentStatus)) {
    where.status = filters.status;
  }
  if (filters.gradeLevelId || filters.classSectionId || filters.academicYearId) {
    where.enrollments = {
      some: {
        ...(filters.academicYearId ? { academicYearId: filters.academicYearId } : {}),
        ...(filters.gradeLevelId ? { gradeLevelId: filters.gradeLevelId } : {}),
        ...(filters.classSectionId ? { classSectionId: filters.classSectionId } : {}),
      },
    };
  }
  if (filters.q) {
    const nq = normalizeDariText(filters.q);
    where.OR = [
      { studentNumber: { contains: filters.q } },
      { personal: { contains: filters.q } },
      ...(nq !== filters.q ? [{ personal: { contains: nq } }] : []),
    ];
  }

  const currentYear = await db.academicYear.findFirst({
    where: { isCurrent: true },
    select: { id: true },
  });

  const [total, rows] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        enrollments: {
          where: { academicYearId: filters.academicYearId ?? currentYear?.id },
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            gradeLevel: { select: { id: true, level: true, nameDari: true } },
            classSection: {
              select: {
                id: true, label: true,
                branch: { select: { id: true, name: true } },
                shift: { select: { name: true } },
              },
            },
          },
        },
        guardians: { include: { guardian: true } },
      },
    }),
  ]);

  const sensitive = canViewSensitive(ctx);
  const items = rows.map((s) => {
    const personal = parsePersonal(s.personal);
    const enr = s.enrollments[0];
    return {
      id: s.id,
      studentNumber: s.studentNumber,
      status: s.status,
      statusLabel: STUDENT_STATUS_LABELS[s.status as StudentStatus] ?? s.status,
      personal: sensitive ? personal : stripSensitive(personal),
      currentEnrollment: enr
        ? {
            gradeName: enr.gradeLevel.nameDari,
            gradeLevelId: enr.gradeLevel.id,
            sectionLabel: enr.classSection?.label ?? null,
            classSectionId: enr.classSection?.id ?? null,
            branchName: enr.classSection?.branch.name ?? null,
            shiftName: enr.classSection?.shift?.name ?? null,
            rollNumber: enr.rollNumber,
            enrolledOn: enr.enrolledOn,
            status: enr.status,
          }
        : null,
      guardianSummary: s.guardians
        .filter((g) => g.contactRights)
        .map((g) => ({
          id: g.guardianId,
          fullName: g.guardian.fullName,
          relationship: g.relationship,
          isPrimary: g.isPrimary,
        })),
      version: s.version,
      createdAt: s.createdAt,
    };
  });
  return { items, meta: { total, page: filters.page, pageSize: filters.pageSize } };
}

export async function getStudentProfile(ctx: AuthContext, id: string) {
  const check = await canViewStudent(ctx, id);
  if (!check.allowed) {
    throw errors.forbidden("شما اجازهٔ مشاهدهٔ این شاگرد را ندارید.");
  }
  const student = await db.student.findUnique({
    where: { id },
    include: {
      application: { select: { id: true, applicantNumber: true, status: true } },
      enrollments: {
        orderBy: [{ academicYear: { name: "desc" } }],
        include: {
          academicYear: { select: { id: true, name: true } },
          gradeLevel: { select: { id: true, level: true, nameDari: true } },
          classSection: {
            select: {
              id: true, label: true, capacity: true,
              branch: { select: { id: true, name: true } },
              shift: { select: { id: true, name: true } },
            },
          },
        },
      },
      guardians: {
        include: { guardian: true },
        orderBy: [{ isPrimary: "desc" }],
      },
      documents: { orderBy: { uploadedAt: "desc" } },
    },
  });
  if (!student) throw errors.notFound("شاگرد");

  const sensitive = canViewSensitive(ctx);
  const personal = parsePersonal(student.personal);

  const recentAudit = can(ctx, "audit.view")
    ? await db.auditEvent.findMany({
        where: { OR: [{ entity: "Student", entityId: id }, { entity: "Application", entityId: student.applicationId ?? "__none__" }] },
        orderBy: { at: "desc" },
        take: 20,
      })
    : [];

  return {
    id: student.id,
    studentNumber: student.studentNumber,
    status: student.status,
    statusLabel: STUDENT_STATUS_LABELS[student.status as StudentStatus] ?? student.status,
    statusNote: student.statusNote,
    application: student.application,
    personal: sensitive ? personal : stripSensitive(personal),
    canSeeSensitive: sensitive,
    enrollments: student.enrollments.map((e) => ({
      id: e.id,
      academicYearName: e.academicYear.name,
      academicYearId: e.academicYear.id,
      gradeName: e.gradeLevel.nameDari,
      gradeLevelId: e.gradeLevel.id,
      classSectionId: e.classSection?.id ?? null,
      sectionLabel: e.classSection?.label ?? null,
      branchName: e.classSection?.branch?.name ?? null,
      shiftName: e.classSection?.shift?.name ?? null,
      rollNumber: e.rollNumber,
      enrolledOn: e.enrolledOn,
      status: e.status,
      statusLabel: ENROLLMENT_STATUS_LABELS[e.status] ?? e.status,
    })),
    guardians: student.guardians.map((g) => ({
      id: g.guardianId,
      linkId: g.id,
      fullName: g.guardian.fullName,
      relationship: g.relationship,
      isPrimary: g.isPrimary,
      contactRights: g.contactRights,
      phone: g.guardian.phone,
      phone2: g.guardian.phone2,
      occupation: g.guardian.occupation,
      address: g.guardian.address,
      portalAccess: g.guardian.portalAccess,
    })),
    documents: student.documents.map((d) => ({
      id: d.id,
      type: d.type,
      title: d.title,
      isVerified: d.isVerified,
      uploadedAt: d.uploadedAt,
    })),
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      action: a.action,
      actorName: a.actorName,
      at: a.at,
      reason: a.reason,
    })),
    version: student.version,
    createdAt: student.createdAt,
  };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function updateStudent(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof studentUpdateDto>,
) {
  const student = await db.student.findUnique({ where: { id } });
  if (!student) throw errors.notFound("شاگرد");
  if (student.version !== dto.version) {
    throw errors.conflict(
      "معلومات این شاگرد توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.",
    );
  }
  const before = { personal: parsePersonal(student.personal), status: student.status };
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.student.update({
      where: { id },
      data: {
        personal: JSON.stringify(dto.personal),
        ...(dto.status ? { status: dto.status } : {}),
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "student.update",
      entity: "Student",
      entityId: id,
      before,
      after: { personal: dto.personal, status: dto.status ?? student.status },
      ip: ctx.ip,
    });
    return row;
  });
  return { id: updated.id, version: updated.version };
}

export async function changeStudentStatus(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof studentStatusDto>,
) {
  const student = await db.student.findUnique({ where: { id } });
  if (!student) throw errors.notFound("شاگرد");

  const needsReason = dto.status === "withdrawn" || dto.status === "transferred";
  if (needsReason && !dto.note?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "برای انصراف یا انتقال، ذکر دلیل الزامی است.");
  }
  if (dto.status === "active" && student.status === "active") {
    throw errors.badRequest("این شاگرد از قبل فعال است.");
  }

  await db.$transaction(async (tx) => {
    await tx.student.update({
      where: { id },
      data: { status: dto.status, statusNote: dto.note ?? null, version: { increment: 1 } },
    });
    if (dto.status === "withdrawn" || dto.status === "transferred") {
      await tx.enrollment.updateMany({
        where: { studentId: id, status: "active" },
        data: { status: dto.status, statusNote: dto.note ?? null },
      });
    }
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "student.status-change",
      entity: "Student",
      entityId: id,
      before: { status: student.status },
      after: { status: dto.status, note: dto.note },
      reason: dto.note,
      ip: ctx.ip,
    });
  });
  return { ok: true };
}

// ── Guardians ───────────────────────────────────────────────────────────────

export async function listGuardians(q?: string) {
  const where: Prisma.GuardianWhereInput = {};
  if (q) {
    where.OR = [
      { fullName: { contains: q } },
      { phone: { contains: q } },
    ];
  }
  const rows = await db.guardian.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      students: { include: { student: { select: { id: true, studentNumber: true, personal: true } } } },
    },
  });
  return rows.map((g) => ({
    id: g.id,
    fullName: g.fullName,
    relationship: g.relationship,
    phone: g.phone,
    phone2: g.phone2,
    occupation: g.occupation,
    address: g.address,
    canPickUp: g.canPickUp,
    portalAccess: g.portalAccess,
    children: g.students.map((sg) => {
      const p = parsePersonal(sg.student.personal);
      return {
        studentId: sg.student.id,
        studentNumber: sg.student.studentNumber,
        firstName: p.firstName,
        relationship: sg.relationship,
        isPrimary: sg.isPrimary,
      };
    }),
  }));
}

export async function createGuardian(ctx: AuthContext, dto: z.infer<typeof guardianCreateDto>) {
  const org = await db.organization.findFirst();
  if (!org) throw errors.notFound("مکتب");
  const existing = dto.phone
    ? await db.guardian.findFirst({ where: { orgId: org.id, phone: dto.phone } })
    : null;
  if (existing) {
    throw errors.conflict("ولی با این شمارهٔ تماس از قبل ثبت شده است.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.guardian.create({
      data: {
        orgId: org.id,
        fullName: dto.fullName,
        relationship: dto.relationship,
        phone: dto.phone,
        phone2: dto.phone2 ?? null,
        email: dto.email ?? null,
        occupation: dto.occupation ?? null,
        address: dto.address ?? null,
        canPickUp: dto.canPickUp,
        portalAccess: dto.portalAccess,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "guardian.create",
      entity: "Guardian",
      entityId: row.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

export async function linkGuardian(ctx: AuthContext, studentId: string, dto: z.infer<typeof guardianLinkDto>) {
  const [student, guardian] = await Promise.all([
    db.student.findUnique({ where: { id: studentId } }),
    db.guardian.findUnique({ where: { id: dto.guardianId } }),
  ]);
  if (!student) throw errors.notFound("شاگرد");
  if (!guardian) throw errors.notFound("ولی");
  const dup = await db.studentGuardian.findFirst({
    where: { studentId, guardianId: dto.guardianId },
  });
  if (dup) throw errors.conflict("این ولی از قبل به این شاگرد پیوند شده است.");
  if (dto.isPrimary) {
    await db.$transaction(async (tx) => {
      await tx.studentGuardian.updateMany({
        where: { studentId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.studentGuardian.create({
        data: {
          studentId,
          guardianId: dto.guardianId,
          relationship: dto.relationship,
          isPrimary: true,
          contactRights: dto.contactRights,
        },
      });
      await writeAudit(tx, {
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        action: "student.link-guardian",
        entity: "Student",
        entityId: studentId,
        after: { guardianId: dto.guardianId, relationship: dto.relationship, isPrimary: dto.isPrimary },
        ip: ctx.ip,
      });
    });
  } else {
    await db.$transaction(async (tx) => {
      await tx.studentGuardian.create({
        data: {
          studentId,
          guardianId: dto.guardianId,
          relationship: dto.relationship,
          isPrimary: false,
          contactRights: dto.contactRights,
        },
      });
      await writeAudit(tx, {
        actorId: ctx.user.id,
        actorName: ctx.user.fullName,
        action: "student.link-guardian",
        entity: "Student",
        entityId: studentId,
        after: { guardianId: dto.guardianId, relationship: dto.relationship },
        ip: ctx.ip,
      });
    });
  }
  return { ok: true };
}
