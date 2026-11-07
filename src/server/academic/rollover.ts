// Year-end rollover — Phase 5: the repeat-safe academic-year closing.
//
// WORKFLOW:
//   1. preview   — per-student default decisions for the closing year
//                  (grade 12 → «تخارج», everyone else → «ارتقا»).
//   2. decide    — the academic manager overrides individuals (repeat /
//                  leave / graduate) before applying.
//   3. apply     — ONE transaction creates next-year enrollments, closes
//                  the old ones, and marks the year «closed».
//
// INVARIANTS:
//  - REPEAT-SAFE: Enrollment's @@unique([studentId, academicYearId]) makes
//    double enrollment structurally impossible; decisions carry appliedAt,
//    so re-running apply skips finished rows and only processes the rest.
//    Applying a closed year again is a no-op (0 new rows), never an error.
//  - DEBT SURVIVES: academic closing NEVER erases debt or closes financial
//    periods — invoices/payments/payroll rows are year-bound records and
//    are not touched here.
//  - SECTIONS ARE NOT AUTO-CREATED: promoted enrollments land without a
//    class section; assigning sections is the new year's setup task
//    (registrar / academic manager).
//  - GRADE 12: promote from grade 12 is rejected (must graduate or leave).
//  - PERMISSION: year_end.manage — admin and general_manager only.
//  - AUDIT: one audit event per apply with full counts + one per batch.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { todayIsoKabul } from "@/server/shared/jalali";
import { toLatinDigits, toPersianDigits } from "@/server/shared/normalization";
import type { AuthContext } from "@/server/auth/context";

export const DECISIONS = ["promote", "repeat", "graduate", "leave"] as const;
export const DECISION_LABELS: Record<string, string> = {
  promote: "ارتقا به صنف بعد",
  repeat: "تکرار همین صنف",
  graduate: "تخارج",
  leave: "ترک مکتب",
};

export const rolloverDecideDto = z.object({
  decisions: z.array(z.object({
    studentId: z.string().min(1),
    decision: z.enum(DECISIONS),
    note: z.string().max(200).optional().nullable(),
  })).min(1, "حداقل یک تصمیم لازم است.").max(500),
});

export const rolloverApplyDto = z.object({
  toAcademicYearId: z.string().min(1, "سال تعلیمی بعدی را انتخاب کنید."),
  setAsCurrent: z.boolean().default(true),
});

/** The academic year name as a comparable number ("۱۴۰۵" → 1405).
 *  Exported for unit tests of the digit-style rollover math. */
export function yearNameAsNumber(name: string): number {
  const latin = toLatinDigits(name).replace(/[^0-9]/g, "");
  if (latin.length === 0) return NaN;
  const n = Number(latin);
  return Number.isFinite(n) ? n : NaN;
}

/** The academic year being closed (must exist). */
async function requireYear(yearId: string) {
  const year = await db.academicYear.findUnique({ where: { id: yearId } });
  if (!year) throw errors.notFound("سال تعلیمی");
  return year;
}

interface PreviewRow {
  studentId: string;
  studentNumber: string;
  studentName: string;
  fatherName: string;
  gradeLevelId: string;
  gradeLevel: number;
  gradeName: string;
  sectionLabel: string | null;
  branchId: string | null;
  defaultDecision: "promote" | "graduate";
  savedDecision: string | null;
  savedNote: string | null;
  appliedAt: Date | null;
}

// ── Preview ─────────────────────────────────────────────────────────────────

export async function previewRollover(ctx: AuthContext, yearId: string) {
  const year = await requireYear(yearId);

  const enrollments = await db.enrollment.findMany({
    where: { academicYearId: year.id, status: "active" },
    include: {
      student: { select: { id: true, studentNumber: true, personal: true, status: true } },
      gradeLevel: { select: { id: true, level: true, nameDari: true } },
      classSection: { select: { label: true, branchId: true } },
    },
    orderBy: { student: { studentNumber: "asc" } },
  });

  const saved = await db.promotionDecision.findMany({
    where: { academicYearId: year.id },
  });
  const savedByStudent = new Map(saved.map((d) => [d.studentId, d]));

  const rows: PreviewRow[] = enrollments.map((e) => {
    let firstName = "";
    let fatherName = "";
    try {
      const p = JSON.parse(e.student.personal ?? "{}");
      firstName = p.firstName ?? "";
      fatherName = p.fatherName ?? "";
    } catch { /* noop */ }
    const d = savedByStudent.get(e.studentId);
    return {
      studentId: e.studentId,
      studentNumber: e.student.studentNumber,
      studentName: firstName,
      fatherName,
      gradeLevelId: e.gradeLevelId,
      gradeLevel: e.gradeLevel.level,
      gradeName: e.gradeLevel.nameDari,
      sectionLabel: e.classSection?.label ?? null,
      branchId: e.classSection?.branchId ?? null,
      defaultDecision: e.gradeLevel.level >= 12 ? "graduate" : "promote",
      savedDecision: d?.decision ?? null,
      savedNote: d?.note ?? null,
      appliedAt: d?.appliedAt ?? null,
    };
  });

  const counts = { promote: 0, repeat: 0, graduate: 0, leave: 0, pending: 0, applied: 0 };
  for (const r of rows) {
    const decision = r.savedDecision ?? r.defaultDecision;
    if (decision in counts) counts[decision as keyof typeof counts]++;
    if (r.appliedAt) counts.applied++;
    else counts.pending++;
  }

  // Candidate "next" years: same org, not this year, not closed.
  const nextYears = await db.academicYear.findMany({
    where: { orgId: year.orgId, id: { not: year.id }, status: { not: "closed" } },
    select: { id: true, name: true, status: true, isCurrent: true, startDate: true, endDate: true },
    orderBy: { name: "asc" },
  });

  return {
    year: {
      id: year.id,
      name: year.name,
      status: year.status,
      isCurrent: year.isCurrent,
      activeEnrollments: rows.length,
    },
    // Suggested next-year label keeps the year's digit style (Persian or
    // Latin digits — "۱۴۰۵" → "۱۴۰۶").
    suggestedNextYearName: Number.isNaN(yearNameAsNumber(year.name))
      ? ""
      : year.name.includes("۰") || /[۰-۹]/.test(year.name)
        ? toPersianDigits(String(yearNameAsNumber(year.name) + 1))
        : String(yearNameAsNumber(year.name) + 1),
    nextYears,
    counts,
    rows,
  };
}

// ── Decide (upsert overrides before applying) ───────────────────────────────

export async function upsertDecisions(
  ctx: AuthContext,
  yearId: string,
  dto: z.infer<typeof rolloverDecideDto>,
) {
  const year = await requireYear(yearId);

  // Validate every student has an ACTIVE enrollment in this year.
  const studentIds = dto.decisions.map((d) => d.studentId);
  const enrollments = await db.enrollment.findMany({
    where: { academicYearId: year.id, status: "active", studentId: { in: studentIds } },
    include: { gradeLevel: { select: { id: true, level: true } } },
  });
  const byStudent = new Map(enrollments.map((e) => [e.studentId, e]));
  for (const d of dto.decisions) {
    const e = byStudent.get(d.studentId);
    if (!e) {
      throw errors.badRequest("یکی از شاگردان در این سال تعلیمی فعال نیست.");
    }
    if (d.decision === "promote" && e.gradeLevel.level >= 12) {
      throw errors.badRequest("از صنف دوازدهم نمی‌توان ارتقا داد؛ تخارج یا ترک را انتخاب کنید.");
    }
  }

  await db.$transaction(async (tx) => {
    for (const d of dto.decisions) {
      const e = byStudent.get(d.studentId)!;
      const toGradeLevelId =
        d.decision === "promote"
          ? await gradeByLevel(tx, year.orgId, e.gradeLevel.level + 1)
          : d.decision === "repeat"
            ? e.gradeLevelId
            : null;
      const existing = await tx.promotionDecision.findUnique({
        where: { academicYearId_studentId: { academicYearId: year.id, studentId: d.studentId } },
      });
      if (existing?.appliedAt) {
        throw errors.badRequest("برای یکی از شاگردان تصمیم اعمال‌شده وجود دارد و قابل تغییر نیست.");
      }
      await tx.promotionDecision.upsert({
        where: { academicYearId_studentId: { academicYearId: year.id, studentId: d.studentId } },
        create: {
          orgId: year.orgId,
          academicYearId: year.id,
          studentId: d.studentId,
          fromGradeLevelId: e.gradeLevelId,
          toGradeLevelId,
          decision: d.decision,
          decidedById: ctx.user.id,
          note: d.note ?? null,
        },
        update: {
          decision: d.decision,
          toGradeLevelId,
          decidedById: ctx.user.id,
          decidedAt: new Date(),
          note: d.note ?? existing?.note ?? null,
        },
      });
    }
    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "rollover.decide", entity: "AcademicYear", entityId: year.id,
      after: { count: dto.decisions.length },
      ip: ctx.ip,
    });
  });
  return { ok: true, count: dto.decisions.length };
}

async function gradeByLevel(tx: { gradeLevel: { findFirst: typeof db.gradeLevel.findFirst } }, orgId: string, level: number) {
  const grade = await tx.gradeLevel.findFirst({ where: { orgId, level } });
  if (!grade) throw errors.badRequest(`صنف سطح ${level} در سیستم ثبت نشده است.`);
  return grade.id;
}

// ── Apply (repeat-safe) ─────────────────────────────────────────────────────

export async function applyRollover(
  ctx: AuthContext,
  yearId: string,
  dto: z.infer<typeof rolloverApplyDto>,
) {
  const year = await requireYear(yearId);
  const toYear = await db.academicYear.findUnique({ where: { id: dto.toAcademicYearId } });
  if (!toYear || toYear.orgId !== year.orgId) throw errors.notFound("سال تعلیمی بعدی");
  if (toYear.id === year.id) {
    throw errors.badRequest("سال مقصد باید سالی متفاوت باشد.");
  }
  if (toYear.status === "closed") {
    throw errors.badRequest("سال تعلیمی مقصد بسته شده است.");
  }

  const result = await db.$transaction(async (tx) => {
    // 1. Ensure a decision row exists for EVERY active enrollment
    //    (defaults: grade 12 → graduate, else promote).
    const enrollments = await tx.enrollment.findMany({
      where: { academicYearId: year.id, status: "active" },
      include: { gradeLevel: { select: { id: true, level: true } } },
    });
    for (const e of enrollments) {
      const defaultDecision = e.gradeLevel.level >= 12 ? "graduate" : "promote";
      const toGradeLevelId =
        defaultDecision === "promote"
          ? await gradeByLevel(tx, year.orgId, e.gradeLevel.level + 1)
          : null;
      await tx.promotionDecision.upsert({
        where: { academicYearId_studentId: { academicYearId: year.id, studentId: e.studentId } },
        create: {
          orgId: year.orgId,
          academicYearId: year.id,
          studentId: e.studentId,
          fromGradeLevelId: e.gradeLevelId,
          toGradeLevelId,
          decision: defaultDecision,
          decidedById: ctx.user.id,
        },
        update: {}, // saved decisions win; never overwrite a human choice
      });
    }

    // 2. Apply every not-yet-applied decision. Existing next-year
    //    enrollments (unique constraint) are skipped — repeat-safe.
    const pending = await tx.promotionDecision.findMany({
      where: { academicYearId: year.id, appliedAt: null },
      include: { student: { select: { id: true, status: true } } },
    });

    const counts = { promoted: 0, repeated: 0, graduated: 0, left: 0, skipped: 0 };
    const today = todayIsoKabul();

    for (const d of pending) {
      // Structural idempotency: skip students already enrolled next year.
      const existing = await tx.enrollment.findUnique({
        where: { studentId_academicYearId: { studentId: d.studentId, academicYearId: toYear.id } },
        select: { id: true },
      });
      if (existing) {
        counts.skipped++;
        await tx.promotionDecision.update({
          where: { id: d.id },
          data: { appliedAt: new Date() },
        });
        continue;
      }

      if (d.decision === "promote" || d.decision === "repeat") {
        if (!d.toGradeLevelId) {
          throw errors.badRequest("تصمیم ارتقا/تکرار بدون صنف مقصد معتبر نیست.");
        }
        await tx.enrollment.create({
          data: {
            studentId: d.studentId,
            academicYearId: toYear.id,
            gradeLevelId: d.toGradeLevelId,
            classSectionId: null, // section assignment = new-year setup task
            enrolledOn: today,
            status: "active",
          },
        });
        await tx.enrollment.updateMany({
          where: { studentId: d.studentId, academicYearId: year.id, status: "active" },
          data: {
            status: d.decision === "promote" ? "promoted" : "repeated",
            statusNote: `سال‌گذرانی ${year.name} → ${toYear.name}`,
          },
        });
        if (d.decision === "promote") counts.promoted++;
        else counts.repeated++;
      } else if (d.decision === "graduate") {
        await tx.enrollment.updateMany({
          where: { studentId: d.studentId, academicYearId: year.id, status: "active" },
          data: { status: "graduated", statusNote: "تخارج در پایان سال تعلیمی" },
        });
        await tx.student.update({
          where: { id: d.studentId },
          data: { status: "graduated", statusNote: "تخارج" },
        });
        counts.graduated++;
      } else {
        // leave
        await tx.enrollment.updateMany({
          where: { studentId: d.studentId, academicYearId: year.id, status: "active" },
          data: { status: "withdrawn", statusNote: d.note ?? "ترک مکتب در سال‌گذرانی" },
        });
        await tx.student.update({
          where: { id: d.studentId },
          data: { status: "withdrawn", statusNote: d.note ?? "ترک مکتب" },
        });
        counts.left++;
      }

      await tx.promotionDecision.update({
        where: { id: d.id },
        data: { appliedAt: new Date() },
      });
    }

    // 3. Close the old year (idempotent update)…
    await tx.academicYear.update({
      where: { id: year.id },
      data: { status: "closed", isCurrent: false },
    });

    // 4. …and promote the next year to "current" when requested.
    if (dto.setAsCurrent) {
      await tx.academicYear.updateMany({
        where: { orgId: year.orgId, isCurrent: true },
        data: { isCurrent: false },
      });
      await tx.academicYear.update({
        where: { id: toYear.id },
        data: { isCurrent: true, status: "active" },
      });
    } else if (toYear.status === "planned") {
      await tx.academicYear.update({
        where: { id: toYear.id },
        data: { status: "active" },
      });
    }

    await writeAudit(tx, {
      actorId: ctx.user.id, actorName: ctx.user.fullName,
      action: "rollover.apply", entity: "AcademicYear", entityId: year.id,
      after: {
        fromYear: year.name,
        toYear: toYear.name,
        ...counts,
        setAsCurrent: dto.setAsCurrent,
      },
      ip: ctx.ip,
    });

    return counts;
  });

  return {
    fromYear: year.name,
    toYear: toYear.name,
    ...result,
    closed: true,
  };
}

/** Post-apply verification for the UI/e2e: how many decisions are still
 *  pending for this year (should be 0 after a successful apply). */
export async function rolloverStatus(ctx: AuthContext, yearId: string) {
  void ctx;
  const year = await requireYear(yearId);
  const [total, applied] = await Promise.all([
    db.promotionDecision.count({ where: { academicYearId: year.id } }),
    db.promotionDecision.count({ where: { academicYearId: year.id, appliedAt: { not: null } } }),
  ]);
  return { yearId: year.id, yearName: year.name, status: year.status, total, applied, pending: total - applied };
}
