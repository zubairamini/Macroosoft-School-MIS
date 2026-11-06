// Academic configuration module: organization, branches, academic years,
// grade levels (1–12), class sections, shifts, subjects.
// Domain rules live here — independent of HTTP and React.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { isValidIsoDateOnly, normalizePhone } from "@/server/shared/normalization";
import { parseJalaliInput, jalaliToIso } from "@/server/shared/jalali";
import type { AuthContext } from "@/server/auth/context";

// ── DTOs ────────────────────────────────────────────────────────────────────

const isoDate = z
  .string()
  .refine(isValidIsoDateOnly, { message: "تاریخ باید به شکل معتبر باشد." });

// Accepts "1405/08/15" (any digit script) OR an ISO date-only string.
export const dateInput = z.string().min(4).transform((raw, ctx) => {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && isValidIsoDateOnly(raw)) return raw;
  try {
    const j = parseJalaliInput(raw);
    const { jy } = j;
    // Jalali years 1300..1500 sanity range
    if (jy < 1300 || jy > 1500) {
      ctx.addIssue({ code: "custom", message: "سال شمسی معتبر نیست (۱۳۰۰–۱۵۰۰)." });
      return z.NEVER;
    }
    return jalaliToIso(j);
  } catch (e) {
    ctx.addIssue({ code: "custom", message: (e as Error).message });
    return z.NEVER;
  }
});

export const orgDto = z.object({
  productName: z.string().min(2, "نام محصول را وارد کنید.").max(60),
  name: z.string().min(2, "نام مکتب را وارد کنید.").max(120),
  schoolType: z.enum(["public", "private"], { message: "نوعیت مکتب را انتخاب کنید." }),
  province: z.string().max(60).optional().nullable(),
  district: z.string().max(60).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
  email: z.string().email("ایمیل معتبر نیست.").optional().nullable(),
  emisCode: z.string().max(30).optional().nullable(),
  registrationNumber: z.string().max(30).optional().nullable(),
  reportHeading: z.string().max(200).optional().nullable(),
  reportFooter: z.string().max(200).optional().nullable(),
  version: z.number().int().min(1),
});

export const branchDto = z.object({
  name: z.string().min(2, "نام شعبهٔ مکتب را وارد کنید.").max(80),
  code: z.string().min(1, "کد شعبه را وارد کنید.").max(20),
  province: z.string().max(60).optional().nullable(),
  district: z.string().max(60).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
  isActive: z.boolean().default(true),
});

export const academicYearDto = z.object({
  name: z.string().min(2, "نام سال تعلیمی را وارد کنید (مثلاً ۱۴۰۵).").max(20),
  startDate: dateInput,
  endDate: dateInput,
  isCurrent: z.boolean().default(false),
});

export const sectionDto = z.object({
  academicYearId: z.string().min(1, "سال تعلیمی را انتخاب کنید."),
  gradeLevelId: z.string().min(1, "صنف را انتخاب کنید."),
  branchId: z.string().min(1, "شعبهٔ مکتب را انتخاب کنید."),
  shiftId: z.string().optional().nullable(),
  roomName: z.string().max(40).optional().nullable(),
  capacity: z.coerce.number().int().min(1, "ظرفیت باید حداقل ۱ باشد.").max(200),
  label: z.string().min(1, "نام شعبهٔ صنف را وارد کنید (الف، ب، ...).").max(20),
});

export const shiftDto = z.object({
  name: z.string().min(2, "نام وخت (شیفت) را وارد کنید.").max(40),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "وخت شروع را به شکل ۰۷:۰۰ وارد کنید."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "وخت ختم را به شکل ۱۲:۰۰ وارد کنید."),
});

export const subjectDto = z.object({
  nameDari: z.string().min(2, "نام مضمون را وارد کنید.").max(60),
  code: z.string().min(1, "کد مضمون را وارد کنید.").max(20),
  grades: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  isActive: z.boolean().default(true),
});

// ── Queries ─────────────────────────────────────────────────────────────────

export async function getOrg() {
  return db.organization.findFirst();
}

export async function requireOrg() {
  const org = await getOrg();
  if (!org) throw errors.notFound("مکتب");
  return org;
}

export async function getOrgContext() {
  const org = await getOrg();
  if (!org) return { org: null, branches: [], currentYear: null, shifts: [] };
  const [branches, currentYear, shifts] = await Promise.all([
    db.branch.findMany({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    db.academicYear.findFirst({ where: { orgId: org.id, isCurrent: true } }),
    db.shift.findMany({ where: { orgId: org.id } }),
  ]);
  return { org, branches, currentYear, shifts };
}

export async function listBranches() {
  const org = await requireOrg();
  return db.branch.findMany({ where: { orgId: org.id }, orderBy: { createdAt: "asc" } });
}

export async function listAcademicYears() {
  const org = await requireOrg();
  return db.academicYear.findMany({
    where: { orgId: org.id },
    orderBy: { name: "desc" },
  });
}

export async function listGradeLevels() {
  const org = await requireOrg();
  return db.gradeLevel.findMany({ where: { orgId: org.id }, orderBy: { level: "asc" } });
}

export async function listClassSections(filters: {
  academicYearId?: string;
  gradeLevelId?: string;
  branchId?: string;
}) {
  const org = await requireOrg();
  return db.classSection.findMany({
    where: {
      academicYearId: filters.academicYearId,
      gradeLevelId: filters.gradeLevelId,
      branchId: filters.branchId,
      academicYear: { orgId: org.id },
    },
    orderBy: [{ gradeLevelId: "asc" }, { label: "asc" }],
    include: {
      gradeLevel: { select: { level: true, nameDari: true } },
      branch: { select: { id: true, name: true } },
      shift: { select: { id: true, name: true } },
      _count: { select: { enrollments: { where: { status: "active" } } } },
    },
  });
}

export async function listSubjects() {
  const org = await requireOrg();
  return db.subject.findMany({ where: { orgId: org.id }, orderBy: { nameDari: "asc" } });
}

export async function listShifts() {
  const org = await requireOrg();
  return db.shift.findMany({ where: { orgId: org.id }, orderBy: { startTime: "asc" } });
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function updateOrg(ctx: AuthContext, dto: z.infer<typeof orgDto>) {
  const org = await requireOrg();
  if (org.version !== dto.version) {
    throw errors.conflict(
      "این معلومات توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید و تغییرات خود را از نو وارد نمایید.",
    );
  }
  const before = { ...org };
  const updated = await db.$transaction(async (tx) => {
    const row = await tx.organization.update({
      where: { id: org.id },
      data: {
        productName: dto.productName,
        name: dto.name,
        schoolType: dto.schoolType,
        province: dto.province ?? null,
        district: dto.district ?? null,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        email: dto.email ?? null,
        emisCode: dto.emisCode ?? null,
        registrationNumber: dto.registrationNumber ?? null,
        reportHeading: dto.reportHeading ?? null,
        reportFooter: dto.reportFooter ?? null,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "org.update",
      entity: "Organization",
      entityId: org.id,
      before,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
  return updated;
}

export async function createBranch(ctx: AuthContext, dto: z.infer<typeof branchDto>) {
  const org = await requireOrg();
  const existing = await db.branch.findFirst({
    where: { orgId: org.id, code: dto.code },
  });
  if (existing) {
    throw errors.conflict("یک شعبهٔ مکتب با این کد از قبل موجود است.");
  }
  return db.$transaction(async (tx) => {
    const row = await tx.branch.create({
      data: {
        orgId: org.id,
        name: dto.name,
        code: dto.code,
        province: dto.province ?? null,
        district: dto.district ?? null,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
        isActive: dto.isActive,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "branch.create",
      entity: "Branch",
      entityId: row.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

export async function updateBranch(
  ctx: AuthContext,
  branchId: string,
  dto: Partial<z.infer<typeof branchDto>>,
) {
  const org = await requireOrg();
  const branch = await db.branch.findFirst({ where: { id: branchId, orgId: org.id } });
  if (!branch) throw errors.notFound("شعبهٔ مکتب");
  return db.$transaction(async (tx) => {
    const row = await tx.branch.update({
      where: { id: branch.id },
      data: {
        name: dto.name ?? branch.name,
        province: dto.province ?? branch.province,
        district: dto.district ?? branch.district,
        address: dto.address ?? branch.address,
        phone: dto.phone !== undefined ? dto.phone : branch.phone,
        isActive: dto.isActive ?? branch.isActive,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "branch.update",
      entity: "Branch",
      entityId: branch.id,
      before: branch,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

export async function createAcademicYear(
  ctx: AuthContext,
  dto: z.infer<typeof academicYearDto>,
) {
  const org = await requireOrg();
  const existing = await db.academicYear.findFirst({
    where: { orgId: org.id, name: dto.name },
  });
  if (existing) throw errors.conflict("سال تعلیمی با این نام از قبل موجود است.");
  if (dto.startDate >= dto.endDate) {
    throw errors.badRequest("تاریخ آغاز باید قبل از تاریخ ختم باشد.");
  }
  return db.$transaction(async (tx) => {
    if (dto.isCurrent) {
      await tx.academicYear.updateMany({
        where: { orgId: org.id, isCurrent: true },
        data: { isCurrent: false, status: "active" },
      });
    }
    const row = await tx.academicYear.create({
      data: {
        orgId: org.id,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        isCurrent: dto.isCurrent,
        status: dto.isCurrent ? "active" : "planned",
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "academic-year.create",
      entity: "AcademicYear",
      entityId: row.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

export async function setCurrentAcademicYear(ctx: AuthContext, yearId: string) {
  const org = await requireOrg();
  const year = await db.academicYear.findFirst({
    where: { id: yearId, orgId: org.id },
  });
  if (!year) throw errors.notFound("سال تعلیمی");
  if (year.status === "closed") {
    throw errors.badRequest("سال تعلیمی بسته‌شده را نمی‌توان فعال کرد.");
  }
  return db.$transaction(async (tx) => {
    await tx.academicYear.updateMany({
      where: { orgId: org.id, isCurrent: true },
      data: { isCurrent: false },
    });
    const row = await tx.academicYear.update({
      where: { id: year.id },
      data: { isCurrent: true, status: "active" },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "academic-year.set-current",
      entity: "AcademicYear",
      entityId: year.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

const GRADE_NAMES = [
  "صنف اول", "صنف دوم", "صنف سوم", "صنف چهارم", "صنف پنجم", "صنف ششم",
  "صنف هفتم", "صنف هشتم", "صنف نهم", "صنف دهم", "صنف یازدهم", "صنف دوازدهم",
];

/** Idempotently ensures grade levels 1..12 exist for the organization. */
export async function ensureGradeLevels(orgId: string) {
  const existing = await db.gradeLevel.findMany({ where: { orgId } });
  const have = new Set(existing.map((g) => g.level));
  const missing: { orgId: string; level: number; nameDari: string }[] = [];
  for (let level = 1; level <= 12; level++) {
    if (!have.has(level)) {
      missing.push({ orgId, level, nameDari: GRADE_NAMES[level - 1] });
    }
  }
  if (missing.length > 0) {
    await db.gradeLevel.createMany({ data: missing });
  }
}

export async function createSection(ctx: AuthContext, dto: z.infer<typeof sectionDto>) {
  const org = await requireOrg();
  const [year, grade, branch] = await Promise.all([
    db.academicYear.findFirst({ where: { id: dto.academicYearId, orgId: org.id } }),
    db.gradeLevel.findFirst({ where: { id: dto.gradeLevelId, orgId: org.id } }),
    db.branch.findFirst({ where: { id: dto.branchId, orgId: org.id } }),
  ]);
  if (!year) throw errors.notFound("سال تعلیمی");
  if (!grade) throw errors.notFound("صنف");
  if (!branch) throw errors.notFound("شعبهٔ مکتب");
  const dup = await db.classSection.findFirst({
    where: {
      academicYearId: dto.academicYearId,
      gradeLevelId: dto.gradeLevelId,
      label: dto.label,
    },
  });
  if (dup) throw errors.conflict("این شعبهٔ صنف برای همین سال و صنف از قبل ثبت شده است.");
  return db.$transaction(async (tx) => {
    const row = await tx.classSection.create({
      data: {
        academicYearId: dto.academicYearId,
        gradeLevelId: dto.gradeLevelId,
        branchId: dto.branchId,
        shiftId: dto.shiftId || null,
        roomName: dto.roomName ?? null,
        capacity: dto.capacity,
        label: dto.label,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "section.create",
      entity: "ClassSection",
      entityId: row.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

export async function createShift(ctx: AuthContext, dto: z.infer<typeof shiftDto>) {
  const org = await requireOrg();
  const dup = await db.shift.findFirst({ where: { orgId: org.id, name: dto.name } });
  if (dup) throw errors.conflict("وخت (شیفت) با این نام از قبل موجود است.");
  return db.$transaction(async (tx) => {
    const row = await tx.shift.create({
      data: { orgId: org.id, name: dto.name, startTime: dto.startTime, endTime: dto.endTime },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "shift.create",
      entity: "Shift",
      entityId: row.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

export async function createSubject(ctx: AuthContext, dto: z.infer<typeof subjectDto>) {
  const org = await requireOrg();
  const dup = await db.subject.findFirst({ where: { orgId: org.id, code: dto.code } });
  if (dup) throw errors.conflict("مضمون با این کد از قبل موجود است.");
  return db.$transaction(async (tx) => {
    const row = await tx.subject.create({
      data: {
        orgId: org.id,
        nameDari: dto.nameDari,
        code: dto.code,
        grades: JSON.stringify(dto.grades),
        isActive: dto.isActive,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "subject.create",
      entity: "Subject",
      entityId: row.id,
      after: row,
      ip: ctx.ip,
    });
    return row;
  });
}

// ── First-run setup wizard ──────────────────────────────────────────────────

export const setupDto = z.object({
  productName: z.string().min(2).max(60).default("مکتب‌یار"),
  name: z.string().min(2, "نام مکتب را وارد کنید.").max(120),
  schoolType: z.enum(["public", "private"]).default("private"),
  province: z.string().min(2, "ولایت را وارد کنید.").max(60),
  district: z.string().max(60).optional().nullable(),
  address: z.string().max(200).optional().nullable(),
  phone: z.string().max(20).optional().nullable().transform((v) => (v ? normalizePhone(v) : v)),
  emisCode: z.string().max(30).optional().nullable(),
  branchName: z.string().min(2, "نام شعبهٔ مکتب را وارد کنید.").max(80),
  branchCode: z.string().min(1, "کد شعبه را وارد کنید.").max(20).default("MAIN"),
  yearName: z.string().min(2, "نام سال تعلیمی را وارد کنید (مثلاً ۱۴۰۵).").max(20),
  yearStart: dateInput,
  yearEnd: dateInput,
  morningShift: z.boolean().default(true),
});

export async function setupSchool(ctx: AuthContext, dto: z.infer<typeof setupDto>) {
  const org = await getOrg();
  if (org?.isConfigured) {
    throw errors.badRequest(
      "تنظیمات اولیهٔ مکتب از قبل تکمیل شده است. برای تغییر از تنظیمات استفاده کنید.",
    );
  }
  if (dto.yearStart >= dto.yearEnd) {
    throw errors.badRequest("تاریخ آغاز سال تعلیمی باید قبل از تاریخ ختم آن باشد.");
  }
  return db.$transaction(async (tx) => {
    let orgId = org?.id;
    if (!orgId) {
      const created = await tx.organization.create({
        data: {
          productName: dto.productName,
          name: dto.name,
          schoolType: dto.schoolType,
          province: dto.province,
          district: dto.district ?? null,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          emisCode: dto.emisCode ?? null,
          isConfigured: true,
        },
      });
      orgId = created.id;
    } else {
      await tx.organization.update({
        where: { id: orgId },
        data: {
          productName: dto.productName,
          name: dto.name,
          schoolType: dto.schoolType,
          province: dto.province,
          district: dto.district ?? null,
          address: dto.address ?? null,
          phone: dto.phone ?? null,
          emisCode: dto.emisCode ?? null,
          isConfigured: true,
          version: { increment: 1 },
        },
      });
    }

    const branch = await tx.branch.create({
      data: {
        orgId,
        name: dto.branchName,
        code: dto.branchCode,
        province: dto.province,
        district: dto.district ?? null,
        address: dto.address ?? null,
        phone: dto.phone ?? null,
      },
    });

    const year = await tx.academicYear.create({
      data: {
        orgId,
        name: dto.yearName,
        startDate: dto.yearStart,
        endDate: dto.yearEnd,
        isCurrent: true,
        status: "active",
      },
    });

    await tx.gradeLevel.createMany({
      data: GRADE_NAMES.map((nameDari, i) => ({ orgId, level: i + 1, nameDari })),
    });

    if (dto.morningShift) {
      await tx.shift.create({
        data: { orgId, name: "صبح", startTime: "07:00", endTime: "12:00" },
      });
      await tx.shift.create({
        data: { orgId, name: "چاشت", startTime: "12:30", endTime: "17:00" },
      });
    }

    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "org.setup",
      entity: "Organization",
      entityId: orgId,
      after: { name: dto.name, branch: branch.name, year: year.name },
      ip: ctx.ip,
    });

    return { orgId, branchId: branch.id, academicYearId: year.id };
  });
}
