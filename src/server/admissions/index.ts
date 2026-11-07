// Admissions module: Application → Review → Decision → Enrollment.
//
// STATE MACHINE (documented invariant):
//   draft ──submit──▶ submitted ──start-review──▶ under_review
//        │                 │                           │
//        │                 └───────────────────────────┤
//        ▼                                             ▼
//   cancelled                                  approved ──enroll──▶ enrolled
//   (draft/submitted only)                              │
//                                                        └──reject──▶ rejected
//
// Rules:
//  - Only DRAFT applications can be edited (by applications.update).
//  - A REJECTED application requires a decision note (reason).
//  - Only APPROVED applications can be enrolled, exactly once.
//  - Enrollment is atomic: Student + guardians + links + Enrollment +
//    documents + audit + outbox in ONE transaction.
//  - Duplicate detection only WARNS; the system never auto-merges students.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors, ApiError } from "@/server/shared/http";
import { writeAudit, writeOutbox, nextDocNumber } from "@/server/shared/audit";
import { normalizeDariText, normalizePhone } from "@/server/shared/normalization";
import { dateInput } from "@/server/academic";
import { canAccessBranch, directBranchFilter } from "@/server/rbac/scope";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

export const APPLICATION_STATUSES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "enrolled",
  "cancelled",
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "پیش‌نویس",
  submitted: "ارائه‌شده",
  under_review: "در حال بررسی",
  approved: "تاییدشده",
  rejected: "ردشده",
  enrolled: "شمول‌شده",
  cancelled: "لغو‌شده",
};

export function statusLabel(s: string): string {
  return APPLICATION_STATUS_LABELS[s as ApplicationStatus] ?? s;
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export const guardianInputDto = z.object({
  fullName: z.string().min(2, "نام ولی را وارد کنید.").max(80),
  relationship: z.string().min(2, "نسبت را وارد کنید (پدر، مادر، ...).").max(30),
  phone: z.string().min(6, "شمارهٔ تماس ولی را وارد کنید.").max(20)
    .transform(normalizePhone),
  phone2: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
  occupation: z.string().max(60).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  isPrimary: z.boolean().default(true),
  contactRights: z.boolean().default(true),
  portalAccess: z.boolean().default(false),
});

export const documentChecklistDto = z.object({
  type: z.enum(["tazkira", "photo", "previous_certificate", "medical", "other"]),
  title: z.string().min(2).max(80),
  provided: z.boolean().default(false),
});

export const personalDto = z.object({
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
  healthNotes: z.string().max(500).optional().nullable(), // restricted field
});

export const applicationCreateDto = z.object({
  academicYearId: z.string().min(1, "سال تعلیمی را انتخاب کنید."),
  personal: personalDto,
  requestedGradeId: z.string().min(1, "صنف را انتخاب کنید."),
  requestedSectionId: z.string().optional().nullable(),
  requestedShiftId: z.string().optional().nullable(),
  guardians: z.array(guardianInputDto).min(1, "حداقل یک ولی باید ثبت شود."),
  documents: z.array(documentChecklistDto).default([]),
});

export const applicationUpdateDto = applicationCreateDto.extend({
  version: z.number().int().min(1, "نسخهٔ رکورد لازم است."),
});

export const reviewDto = z.object({
  action: z.enum(["start", "approve", "reject"]),
  note: z.string().max(500).optional(),
});

export const enrollDto = z.object({
  classSectionId: z.string().min(1, "شعبهٔ صنف را انتخاب کنید."),
  enrolledOn: dateInput.optional(),
  rollNumber: z.coerce.number().int().min(1).max(999).optional().nullable(),
});

type Tx = Prisma.TransactionClient;

// ── Queries ─────────────────────────────────────────────────────────────────

function parsePersonal(row: { personal: string }) {
  try { return JSON.parse(row.personal); } catch { return {}; }
}
function parseGuardians(row: { guardians: string }) {
  try { return JSON.parse(row.guardians); } catch { return []; }
}
function parseDocuments(row: { documents: string }) {
  try { return JSON.parse(row.documents); } catch { return []; }
}

export function applicationToJson(row: {
  id: string; applicantNumber: string; academicYearId: string; branchId: string | null;
  requestedGradeId: string | null; requestedSectionId: string | null; requestedShiftId: string | null;
  personal: string; guardians: string; documents: string; status: string;
  decisionNote: string | null; submittedAt: Date | null; reviewedAt: Date | null;
  decidedAt: Date | null; enrolledAt: Date | null; version: number;
  createdById: string | null; createdAt: Date; updatedAt: Date;
  gradeLevel?: { id: string; level: number; nameDari: string } | null;
  academicYear?: { id: string; name: string } | null;
}) {
  return {
    id: row.id,
    applicantNumber: row.applicantNumber,
    academicYearId: row.academicYearId,
    academicYearName: row.academicYear?.name ?? null,
    requestedGradeId: row.requestedGradeId,
    requestedGradeName: row.gradeLevel?.nameDari ?? null,
    requestedSectionId: row.requestedSectionId,
    requestedShiftId: row.requestedShiftId,
    personal: parsePersonal(row),
    guardians: parseGuardians(row),
    documents: parseDocuments(row),
    status: row.status,
    statusLabel: statusLabel(row.status),
    decisionNote: row.decisionNote,
    submittedAt: row.submittedAt,
    reviewedAt: row.reviewedAt,
    decidedAt: row.decidedAt,
    enrolledAt: row.enrolledAt,
    version: row.version,
    createdById: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listApplications(ctx: AuthContext, filters: {
  q?: string; status?: string; academicYearId?: string; page: number; pageSize: number;
}) {
  const where: Prisma.ApplicationWhereInput = {};
  // Branch isolation: branch-bound roles see only their own branch's
  // applications; cross-branch roles see the active context (or all).
  const branchScope = directBranchFilter(ctx, "applications.view");
  if (!branchScope) return { items: [], meta: { total: 0, page: filters.page, pageSize: filters.pageSize } };
  if (branchScope.branchIds) where.branchId = { in: branchScope.branchIds };
  if (filters.status && APPLICATION_STATUSES.includes(filters.status as ApplicationStatus)) {
    where.status = filters.status;
  }
  if (filters.academicYearId) where.academicYearId = filters.academicYearId;
  if (filters.q) {
    // Name/number search with ی/ک normalization applied to comparison only.
    const nq = normalizeDariText(filters.q);
    where.OR = [
      { applicantNumber: { contains: filters.q } },
      { personal: { contains: filters.q } },
      ...(nq !== filters.q ? [{ personal: { contains: nq } }] : []),
    ];
  }
  const [total, rows] = await Promise.all([
    db.application.count({ where }),
    db.application.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
      include: {
        gradeLevel: { select: { id: true, level: true, nameDari: true } },
        academicYear: { select: { id: true, name: true } },
      },
    }),
  ]);
  return {
    items: rows.map(applicationToJson),
    meta: { total, page: filters.page, pageSize: filters.pageSize },
  };
}

export async function getApplication(ctx: AuthContext, id: string) {
  const row = await db.application.findUnique({
    where: { id },
    include: {
      gradeLevel: { select: { id: true, level: true, nameDari: true } },
      academicYear: { select: { id: true, name: true } },
    },
  });
  if (!row) throw errors.notFound("درخواست شمولیت");
  if (row.branchId && !canAccessBranch(ctx, "applications.view", row.branchId)) {
    throw errors.forbidden("این درخواست به شعبهٔ دیگری تعلق دارد.");
  }
  return applicationToJson(row);
}

// ── Duplicate detection (advisory only — NEVER auto-merges) ────────────────

export async function findSimilarApplications(personal: {
  firstName: string; fatherName: string; birthDate?: string; phone?: string | null;
}, excludeApplicationId?: string) {
  const normFirst = normalizeDariText(personal.firstName);
  const normFather = normalizeDariText(personal.fatherName);
  const candidates = await db.application.findMany({
    where: {
      status: { not: "cancelled" },
      ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
      personal: { contains: personal.birthDate ?? personal.firstName },
    },
    take: 200,
    include: {
      gradeLevel: { select: { nameDari: true } },
      academicYear: { select: { name: true } },
    },
  });
  const students = await db.student.findMany({
    where: { personal: { contains: personal.birthDate ?? personal.firstName } },
    take: 200,
  });

  const results: Array<{
    kind: "application" | "student";
    id: string;
    displayName: string;
    reasons: string[];
    statusLabel?: string;
  }> = [];

  for (const c of candidates) {
    const p = parsePersonal(c);
    const reasons: string[] = [];
    const sameName =
      normalizeDariText(p.firstName ?? "") === normFirst &&
      normalizeDariText(p.fatherName ?? "") === normFather;
    if (sameName) reasons.push("نام و نام پدر یکسان است");
    if (personal.birthDate && p.birthDate === personal.birthDate) reasons.push("تاریخ تولد یکسان است");
    if (personal.phone && p.phone && p.phone === personal.phone) reasons.push("شمارهٔ تماس یکسان است");
    if (reasons.length >= 2 || (sameName && personal.birthDate && p.birthDate === personal.birthDate)) {
      results.push({
        kind: "application",
        id: c.id,
        displayName: `${p.firstName ?? ""} ${p.fatherName ?? ""} (${c.applicantNumber})`,
        reasons,
        statusLabel: statusLabel(c.status),
      });
    }
  }
  for (const s of students) {
    const p = parsePersonal(s);
    const reasons: string[] = [];
    const sameName =
      normalizeDariText(p.firstName ?? "") === normFirst &&
      normalizeDariText(p.fatherName ?? "") === normFather;
    if (sameName) reasons.push("نام و نام پدر یکسان است");
    if (personal.birthDate && p.birthDate === personal.birthDate) reasons.push("تاریخ تولد یکسان است");
    if (personal.phone && p.phone && p.phone === personal.phone) reasons.push("شمارهٔ تماس یکسان است");
    if (reasons.length >= 2) {
      results.push({
        kind: "student",
        id: s.id,
        displayName: `${p.firstName ?? ""} ${p.fatherName ?? ""} (${s.studentNumber})`,
        reasons,
        statusLabel: s.status === "active" ? "شاگرد فعال" : s.status,
      });
    }
  }
  return results;
}

// ── Mutations ───────────────────────────────────────────────────────────────

async function genApplicantNumber(tx: Tx, yearName: string): Promise<string> {
  const n = await nextDocNumber(tx, "applicant", yearName);
  return `A-${toLatinYear(yearName)}-${String(n).padStart(4, "0")}`;
}
function toLatinYear(yearName: string): string {
  const digits = yearName.replace(/[^0-9۰-۹٠-٩]/g, "");
  const latin = digits.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  return latin || "0000";
}

export async function createApplication(ctx: AuthContext, dto: z.infer<typeof applicationCreateDto>) {
  const [org, year, grade] = await Promise.all([
    db.organization.findFirst(),
    db.academicYear.findUnique({ where: { id: dto.academicYearId } }),
    dto.requestedGradeId ? db.gradeLevel.findUnique({ where: { id: dto.requestedGradeId } }) : null,
  ]);
  if (!org) throw errors.notFound("مکتب");
  if (!year || year.orgId !== org.id) throw errors.notFound("سال تعلیمی");
  if (!grade || grade.orgId !== org.id) throw errors.notFound("صنف");
  if (!dto.guardians.some((g) => g.isPrimary)) {
    throw new ApiError(400, "VALIDATION_ERROR", "یک ولی باید به عنوان ولیٔ اصلی مشخص شود.");
  }

  // Branch isolation: applications belong to the creator's active branch.
  const branchId = ctx.branchId;

  return db.$transaction(async (tx) => {
    const applicantNumber = await genApplicantNumber(tx, year.name);
    const row = await tx.application.create({
      data: {
        orgId: org.id,
        academicYearId: year.id,
        branchId,
        applicantNumber,
        personal: JSON.stringify(dto.personal),
        requestedGradeId: grade.id,
        requestedSectionId: dto.requestedSectionId || null,
        requestedShiftId: dto.requestedShiftId || null,
        guardians: JSON.stringify(dto.guardians),
        documents: JSON.stringify(dto.documents),
        status: "draft",
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "application.create",
      entity: "Application",
      entityId: row.id,
      after: { applicantNumber, personal: dto.personal },
      ip: ctx.ip,
    });
    return applicationToJson({ ...row, gradeLevel: grade, academicYear: year });
  });
}

export async function updateApplication(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof applicationUpdateDto>,
) {
  const row = await db.application.findUnique({ where: { id } });
  if (!row) throw errors.notFound("درخواست شمولیت");
  if (row.branchId && !canAccessBranch(ctx, "applications.update", row.branchId)) {
    throw errors.forbidden("این درخواست به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.status !== "draft") {
    throw errors.badRequest(
      "فقط درخواست‌های در حالت پیش‌نویس قابل ویرایش هستند. برای تغییر بعد از ارائه، ابتدا با مسجل تماس بگیرید.",
    );
  }
  if (row.version !== dto.version) {
    throw errors.conflict(
      "این درخواست توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.",
    );
  }
  const grade = await db.gradeLevel.findUnique({ where: { id: dto.requestedGradeId } });
  if (!grade) throw errors.notFound("صنف");

  const updated = await db.$transaction(async (tx) => {
    const before = applicationToJson(row);
    const next = await tx.application.update({
      where: { id: row.id },
      data: {
        personal: JSON.stringify(dto.personal),
        requestedGradeId: grade.id,
        requestedSectionId: dto.requestedSectionId || null,
        requestedShiftId: dto.requestedShiftId || null,
        guardians: JSON.stringify(dto.guardians),
        documents: JSON.stringify(dto.documents),
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "application.update",
      entity: "Application",
      entityId: row.id,
      before,
      after: { personal: dto.personal, guardians: dto.guardians },
      ip: ctx.ip,
    });
    return next;
  });
  return applicationToJson(updated);
}

export async function transitionApplication(
  ctx: AuthContext,
  id: string,
  transition: "submit" | "start" | "approve" | "reject" | "cancel",
  note?: string,
) {
  const row = await db.application.findUnique({ where: { id } });
  if (!row) throw errors.notFound("درخواست شمولیت");
  // Branch isolation — checked with the permission the transition itself
  // requires (submit ≠ review ≠ update).
  const transitionPermission =
    transition === "submit" ? "applications.submit"
    : transition === "cancel" ? "applications.update"
    : "applications.review";
  if (row.branchId && !canAccessBranch(ctx, transitionPermission, row.branchId)) {
    throw errors.forbidden("این درخواست به شعبهٔ دیگری تعلق دارد.");
  }

  const allowed: Record<string, Partial<Record<ApplicationStatus, ApplicationStatus>>> = {
    submit: { draft: "submitted" },
    start: { submitted: "under_review" },
    approve: { submitted: "approved", under_review: "approved" },
    reject: { submitted: "rejected", under_review: "rejected" },
    cancel: { draft: "cancelled", submitted: "cancelled" },
  };
  const target = allowed[transition]?.[row.status as ApplicationStatus];
  if (!target) {
    throw errors.badRequest(
      `این عمل روی درخواست در حالت «${statusLabel(row.status)}» ممکن نیست.`,
    );
  }
  if (transition === "reject" && !note?.trim()) {
    throw new ApiError(400, "VALIDATION_ERROR", "برای رد کردن درخواست، ذکر دلیل الزامی است.");
  }

  const updated = await db.$transaction(async (tx) => {
    // Guard against concurrent transitions with a conditional update.
    const next = await tx.application.updateMany({
      where: { id: row.id, status: row.status, version: row.version },
      data: {
        status: target,
        version: { increment: 1 },
        decisionNote: transition === "approve" || transition === "reject" ? note ?? null : row.decisionNote,
        submittedAt: transition === "submit" ? new Date() : row.submittedAt,
        reviewedById:
          transition === "start" ? ctx.user.id : row.reviewedById,
        reviewedAt: transition === "start" ? new Date() : row.reviewedAt,
        decidedById:
          transition === "approve" || transition === "reject" ? ctx.user.id : row.decidedById,
        decidedAt: transition === "approve" || transition === "reject" ? new Date() : row.decidedAt,
      },
    });
    if (next.count === 0) {
      throw errors.conflict("وضعیت درخواست هم‌زمان تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
    }
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: `application.${transition}`,
      entity: "Application",
      entityId: row.id,
      before: { status: row.status, version: row.version },
      after: { status: target, note: note ?? null },
      reason: note,
      ip: ctx.ip,
    });
    if (transition === "submit") {
      await writeOutbox(tx, "application.submitted", {
        applicationId: row.id,
        applicantNumber: row.applicantNumber,
      });
    }
    return tx.application.findUniqueOrThrow({ where: { id: row.id } });
  });
  return applicationToJson(updated);
}

// ── Enrollment (atomic, idempotent) ─────────────────────────────────────────

async function genStudentNumber(tx: Tx, yearName: string): Promise<string> {
  const n = await nextDocNumber(tx, "student", yearName);
  return `S-${toLatinYear(yearName)}-${String(n).padStart(4, "0")}`;
}

export async function enrollApplication(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof enrollDto>,
) {
  const row = await db.application.findUnique({
    where: { id },
    include: { academicYear: true, gradeLevel: true },
  });
  if (!row) throw errors.notFound("درخواست شمولیت");
  if (row.branchId && !canAccessBranch(ctx, "applications.enroll", row.branchId)) {
    throw errors.forbidden("این درخواست به شعبهٔ دیگری تعلق دارد.");
  }
  if (row.status !== "approved") {
    throw errors.badRequest(
      `فقط درخواست‌های تاییدشده قابل شمول هستند. وضعیت فعلی: «${statusLabel(row.status)}».`,
    );
  }
  const section = await db.classSection.findUnique({
    where: { id: dto.classSectionId },
    include: { gradeLevel: true, academicYear: true },
  });
  if (!section) throw errors.notFound("شعبهٔ صنف");
  // Branch isolation: the target section must belong to an accessible branch.
  if (!canAccessBranch(ctx, "applications.enroll", section.branchId)) {
    throw errors.forbidden("شعبهٔ صنف انتخاب‌شده به شعبهٔ دیگری تعلق دارد.");
  }
  if (section.academicYearId !== row.academicYearId) {
    throw errors.badRequest("شعبهٔ صنف انتخاب‌شده به سال تعلیمی این درخواست تعلق ندارد.");
  }
  const personal = parsePersonal(row);
  const guardians = parseGuardians(row);
  const documents = parseDocuments(row);
  const enrolledOn = dto.enrolledOn ?? new Date().toISOString().slice(0, 10);

  return db.$transaction(async (tx) => {
    // Capacity check inside the transaction.
    const activeCount = await tx.enrollment.count({
      where: { classSectionId: section.id, status: "active" },
    });
    if (activeCount >= section.capacity) {
      throw errors.badRequest("ظرفیت این شعبهٔ صنف تکمیل است. شعبهٔ دیگری را انتخاب کنید.");
    }

    const studentNumber = await genStudentNumber(tx, row.academicYear.name);

    // Create the persistent Student identity (separate from yearly enrollment).
    const student = await tx.student.create({
      data: {
        orgId: row.orgId,
        applicationId: row.id,
        studentNumber,
        personal: row.personal,
        status: "active",
        createdById: ctx.user.id,
      },
    });

    // Guardians: upsert by normalized (name + phone) identity, then link.
    for (const g of guardians) {
      let guardian = g.phone
        ? await tx.guardian.findFirst({ where: { orgId: row.orgId, phone: g.phone } })
        : null;
      if (!guardian) {
        guardian = await tx.guardian.create({
          data: {
            orgId: row.orgId,
            fullName: g.fullName,
            relationship: g.relationship,
            phone: g.phone ?? null,
            phone2: g.phone2 ?? null,
            occupation: g.occupation ?? null,
            address: g.address ?? null,
            canPickUp: g.contactRights,
            portalAccess: g.portalAccess,
          },
        });
      }
      await tx.studentGuardian.create({
        data: {
          studentId: student.id,
          guardianId: guardian.id,
          relationship: g.relationship,
          isPrimary: Boolean(g.isPrimary),
          contactRights: g.contactRights !== false,
        },
      });
    }

    // Yearly enrollment — unique (studentId, academicYearId) guards duplicates.
    const enrollment = await tx.enrollment.create({
      data: {
        studentId: student.id,
        academicYearId: row.academicYearId,
        gradeLevelId: section.gradeLevelId,
        classSectionId: section.id,
        rollNumber: dto.rollNumber ?? null,
        enrolledOn,
        status: "active",
      },
    });

    // Carry provided documents into the student record.
    const provided = documents.filter((d: { provided: boolean }) => d.provided);
    if (provided.length > 0) {
      await tx.studentDocument.createMany({
        data: provided.map((d: { type: string; title: string }) => ({
          studentId: student.id,
          type: d.type,
          title: d.title,
          uploadedById: ctx.user.id,
        })),
      });
    }

    // Exactly-once transition (conditional update on status).
    const applied = await tx.application.updateMany({
      where: { id: row.id, status: "approved" },
      data: { status: "enrolled", enrolledAt: new Date(), version: { increment: 1 } },
    });
    if (applied.count === 0) {
      throw errors.conflict("این درخواست هم‌زمان توسط شخص دیگری شمول شده است.");
    }

    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "application.enroll",
      entity: "Application",
      entityId: row.id,
      before: { status: "approved" },
      after: {
        status: "enrolled",
        studentId: student.id,
        studentNumber,
        classSection: `${section.gradeLevel.nameDari} — ${section.label}`,
        enrolledOn,
      },
      ip: ctx.ip,
    });
    await writeOutbox(tx, "student.enrolled", {
      studentId: student.id,
      studentNumber,
      applicationId: row.id,
      enrolledOn,
    });

    return {
      studentId: student.id,
      studentNumber,
      enrollmentId: enrollment.id,
      sectionLabel: section.label,
      gradeName: section.gradeLevel.nameDari,
    };
  });
}
