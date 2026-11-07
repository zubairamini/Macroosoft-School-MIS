// Assessments, grades & report cards — Phase 2. Core rules:
//   • A MISSING grade is never a zero: null scores are excluded from every
//     aggregation (subject averages, report cards) instead of counting as 0.
//   • Exam-day absence (isAbsent) is recorded distinctly from a missing grade.
//   • Grade entry is restricted to the assigned teacher (teaching assignment
//     or section-scoped grant) — publishing is a separate approval step
//     (assessments.manage: academic manager / manager).
//   • PUBLISHING locks the grade table and snapshots the grading policy in
//     force at publish time ({maxScore, weight, type}); published results are
//     immutable — corrections arrive in a later phase as approved reversals.
//   • Students and parents see grades only after publishing, and only their
//     own / their children's rows.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { can, canAccessSection, teachesSubject, canViewStudent, sectionListWhere } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

export const ASSESSMENT_TYPES = ["quiz", "assignment", "midterm", "final", "project"] as const;
export type AssessmentType = (typeof ASSESSMENT_TYPES)[number];

export const ASSESSMENT_TYPE_LABELS: Record<AssessmentType, string> = {
  quiz: "کوئیز",
  assignment: "مشق",
  midterm: "امتحان میان‌ترم",
  final: "امتحان نهایی",
  project: "پروژه",
};

// ── DTOs ────────────────────────────────────────────────────────────────────

export const assessmentCreateDto = z.object({
  academicYearId: z.string().min(1, "سال تعلیمی را انتخاب کنید."),
  termId: z.string().optional().nullable(),
  classSectionId: z.string().min(1, "شعبهٔ صنف را انتخاب کنید."),
  subjectId: z.string().min(1, "مضمون را انتخاب کنید."),
  staffId: z.string().optional().nullable(),
  title: z.string().min(3, "عنوان را وارد کنید.").max(120),
  type: z.enum(ASSESSMENT_TYPES).default("quiz"),
  date: dateInput.optional().nullable(),
  maxScore: z.coerce.number().int().min(1, "نمرهٔ کل باید حداقل ۱ باشد.").max(1000),
  weight: z.coerce.number().int().min(1, "وزن باید حداقل ۱ باشد.").max(20).default(1),
});

export const assessmentUpdateDto = assessmentCreateDto.partial().extend({
  version: z.number().int().min(1),
});

export const gradeRowDto = z.object({
  studentId: z.string().min(1),
  score: z.coerce.number().int().min(0).max(1000).optional().nullable(),
  isAbsent: z.boolean().default(false),
  note: z.string().max(120).optional().nullable(),
});

export const enterGradesDto = z.object({
  version: z.number().int().min(1),
  grades: z.array(gradeRowDto).max(80, "فهرست نمرات بیش از حد بزرگ است."),
});

export const publishDto = z.object({
  version: z.number().int().min(1),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

type AssessmentRow = {
  id: string; orgId: string; academicYearId: string; termId: string | null;
  classSectionId: string; subjectId: string; staffId: string | null;
  title: string; type: string; date: string | null; maxScore: number;
  weight: number; status: string; gradingPolicy: string | null;
  publishedAt: Date | null; version: number; createdAt: Date;
  classSection: { label: string; gradeLevel: { nameDari: string }; branch: { name: string } };
  subject: { nameDari: string };
  staff: { fullName: string } | null;
  _count: { grades: number };
};

function publicAssessment(row: AssessmentRow) {
  return {
    id: row.id,
    academicYearId: row.academicYearId,
    termId: row.termId,
    classSectionId: row.classSectionId,
    gradeName: row.classSection.gradeLevel.nameDari,
    sectionLabel: row.classSection.label,
    branchName: row.classSection.branch.name,
    subjectId: row.subjectId,
    subjectName: row.subject.nameDari,
    staffId: row.staffId,
    staffName: row.staff?.fullName ?? null,
    title: row.title,
    type: row.type,
    date: row.date,
    maxScore: row.maxScore,
    weight: row.weight,
    status: row.status,
    publishedAt: row.publishedAt,
    gradeCount: row._count.grades,
    version: row.version,
    createdAt: row.createdAt,
  };
}

const ASSESSMENT_INCLUDE = {
  classSection: {
    select: {
      id: true, label: true, academicYearId: true,
      gradeLevel: { select: { nameDari: true } },
      branch: { select: { name: true } },
    },
  },
  subject: { select: { nameDari: true } },
  staff: { select: { fullName: true } },
  _count: { select: { grades: true } },
} as const;

/** May the viewer enter grades for this assessment? */
async function canEnterGrades(ctx: AuthContext, assessment: {
  academicYearId: string; classSectionId: string; subjectId: string;
}): Promise<boolean> {
  if (!can(ctx, "grades.enter")) return false;
  // Branch/all-scoped grant (academic manager substituting, or unscoped).
  if (await canAccessSection(ctx, "grades.enter", assessment.classSectionId)) return true;
  // The assigned teacher: binding teaching contract for this subject+section.
  return teachesSubject(ctx.user.id, assessment.academicYearId, assessment.classSectionId, assessment.subjectId);
}

/** May the viewer see grades of this assessment (any student)? */
async function canViewGrades(ctx: AuthContext, assessment: { classSectionId: string }): Promise<boolean> {
  return canAccessSection(ctx, "grades.view", assessment.classSectionId);
}

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listAssessments(
  ctx: AuthContext,
  filters: { academicYearId?: string; classSectionId?: string; subjectId?: string; status?: string },
) {
  if (filters.classSectionId) {
    const ok = await canAccessSection(ctx, "assessments.view", filters.classSectionId);
    if (!ok) throw errors.forbidden("شما اجازهٔ مشاهدهٔ امتحانات این شعبهٔ صنف را ندارید.");
  }
  // Branch isolation: assessments only for sections the viewer may see.
  const scopeWhere = await sectionListWhere(ctx, "assessments.view");
  if (scopeWhere === null) return [];
  const rows = await db.assessment.findMany({
    where: {
      AND: [
        { classSection: scopeWhere },
        ...(filters.academicYearId ? [{ academicYearId: filters.academicYearId }] : []),
        ...(filters.classSectionId ? [{ classSectionId: filters.classSectionId }] : []),
        ...(filters.subjectId ? [{ subjectId: filters.subjectId }] : []),
        ...(filters.status ? [{ status: filters.status }] : []),
      ],
    },
    include: ASSESSMENT_INCLUDE,
    orderBy: [{ createdAt: "desc" }],
    take: 200,
  });
  return rows.map(publicAssessment);
}

export async function getAssessment(ctx: AuthContext, id: string) {
  const assessment = await db.assessment.findUnique({ where: { id }, include: ASSESSMENT_INCLUDE });
  if (!assessment) throw errors.notFound("امتحان");

  const viewAll = await canViewGrades(ctx, assessment);
  if (!viewAll) {
    // Student/parent scopes: only PUBLISHED assessments, single own grade.
    if (assessment.status !== "published") throw errors.forbidden();
  }

  const [grades, enrolled] = await Promise.all([
    db.grade.findMany({
      where: { assessmentId: id },
      include: { student: { select: { studentNumber: true, personal: true } } },
    }),
    db.enrollment.findMany({
      where: { classSectionId: assessment.classSectionId, status: "active" },
      orderBy: { rollNumber: "asc" },
      include: { student: { select: { id: true, studentNumber: true, personal: true } } },
    }),
  ]);
  const gradeByStudent = new Map(grades.map((g) => [g.studentId, g]));

  const roster = enrolled.map((e) => {
    const personal = safeJson(e.student.personal);
    const g = gradeByStudent.get(e.student.id);
    return {
      studentId: e.student.id,
      studentNumber: e.student.studentNumber,
      firstName: personal.firstName ?? "",
      fatherName: personal.fatherName ?? "",
      rollNumber: e.rollNumber,
      score: g?.score ?? null, // null = missing (≠ zero)
      isAbsent: g?.isAbsent ?? false,
      note: g?.note ?? null,
      hasGrade: Boolean(g),
    };
  });

  return {
    ...publicAssessment(assessment),
    roster,
    canEnterGrades: await canEnterGrades(ctx, assessment),
    canPublish:
      can(ctx, "assessments.manage") &&
      assessment.status !== "published" &&
      (await canAccessSection(ctx, "assessments.manage", assessment.classSectionId)),
  };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function createAssessment(ctx: AuthContext, dto: z.infer<typeof assessmentCreateDto>) {
  if (!can(ctx, "assessments.manage")) {
    throw errors.forbidden("ایجاد امتحان فقط برای مدیر تعلیمی/مدیر مکتب مجاز است.");
  }
  const [year, section, subject] = await Promise.all([
    db.academicYear.findUnique({ where: { id: dto.academicYearId } }),
    db.classSection.findUnique({ where: { id: dto.classSectionId } }),
    db.subject.findUnique({ where: { id: dto.subjectId } }),
  ]);
  if (!year) throw errors.notFound("سال تعلیمی");
  if (!section) throw errors.notFound("شعبهٔ صنف");
  if (!subject) throw errors.notFound("مضمون");
  if (section.academicYearId !== year.id) {
    throw errors.badRequest("شعبهٔ صنف به این سال تعلیمی تعلق ندارد.");
  }
  const sectionOk = await canAccessSection(ctx, "assessments.manage", dto.classSectionId);
  if (!sectionOk) throw errors.forbidden("ایجاد امتحان برای این شعبهٔ صنف مجاز نیست.");
  if (dto.staffId) {
    const staff = await db.staffMember.findUnique({ where: { id: dto.staffId } });
    if (!staff || staff.status !== "active") throw errors.badRequest("استاد فعال را انتخاب کنید.");
  }

  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");

  return db.$transaction(async (tx) => {
    const row = await tx.assessment.create({
      data: {
        orgId: org.id,
        academicYearId: dto.academicYearId,
        termId: dto.termId || null,
        classSectionId: dto.classSectionId,
        subjectId: dto.subjectId,
        staffId: dto.staffId || null,
        title: dto.title,
        type: dto.type,
        date: dto.date ?? null,
        maxScore: dto.maxScore,
        weight: dto.weight,
        status: "grading",
        createdById: ctx.user.id,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "assessment.create",
      entity: "Assessment",
      entityId: row.id,
      after: { title: row.title, type: row.type, maxScore: row.maxScore, weight: row.weight },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function updateAssessment(
  ctx: AuthContext,
  id: string,
  dto: z.infer<typeof assessmentUpdateDto>,
) {
  const assessment = await db.assessment.findUnique({ where: { id } });
  if (!assessment) throw errors.notFound("امتحان");
  if (assessment.version !== dto.version) {
    throw errors.conflict("این امتحان توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
  }
  if (assessment.status === "published") {
    throw errors.badRequest("امتحان منتشرشده قابل ویرایش نیست؛ نمرات آن قطعی است.");
  }
  if (!can(ctx, "assessments.manage")) throw errors.forbidden();

  // Score ceiling may never drop below an already-entered score.
  if (dto.maxScore !== undefined && dto.maxScore < assessment.maxScore) {
    const top = await db.grade.findFirst({
      where: { assessmentId: id, score: { gt: dto.maxScore } },
      select: { score: true },
    });
    if (top) {
      throw errors.badRequest(
        `نمرهٔ کل نمی‌تواند کمتر از نمرهٔ ثبت‌شده (${top.score}) باشد.`,
      );
    }
  }

  return db.$transaction(async (tx) => {
    const row = await tx.assessment.update({
      where: { id },
      data: {
        title: dto.title ?? assessment.title,
        type: dto.type ?? assessment.type,
        date: dto.date !== undefined ? dto.date : assessment.date,
        maxScore: dto.maxScore ?? assessment.maxScore,
        weight: dto.weight ?? assessment.weight,
        staffId: dto.staffId !== undefined ? (dto.staffId || null) : assessment.staffId,
        termId: dto.termId !== undefined ? (dto.termId || null) : assessment.termId,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "assessment.update",
      entity: "Assessment",
      entityId: id,
      before: { title: assessment.title, maxScore: assessment.maxScore, weight: assessment.weight },
      after: { title: row.title, maxScore: row.maxScore, weight: row.weight },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function enterGrades(ctx: AuthContext, id: string, dto: z.infer<typeof enterGradesDto>) {
  const assessment = await db.assessment.findUnique({ where: { id } });
  if (!assessment) throw errors.notFound("امتحان");
  if (assessment.version !== dto.version) {
    throw errors.conflict("این امتحان توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
  }
  if (assessment.status === "published") {
    throw errors.badRequest("نمرات منتشرشده قابل تغییر نیست؛ نتیجه قطعی است.");
  }
  const allowed = await canEnterGrades(ctx, assessment);
  if (!allowed) {
    throw errors.forbidden("ثبت نمرات فقط برای استاد مضمون یا مدیر تعلیمی مجاز است.");
  }

  // Grades only for actively enrolled students of this section.
  const enrolled = await db.enrollment.findMany({
    where: { classSectionId: assessment.classSectionId, status: "active" },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  for (const g of dto.grades) {
    if (!enrolledIds.has(g.studentId)) {
      throw errors.badRequest("یکی از شاگردان در این شعبهٔ صنف ثبت‌نام فعال ندارد.");
    }
    if (g.score !== null && g.score !== undefined && g.score > assessment.maxScore) {
      throw errors.badRequest(
        `نمره نمی‌تواند از ${assessment.maxScore} بیشتر باشد.`,
      );
    }
    if (g.score != null && g.isAbsent) {
      throw errors.badRequest("نمره و غیرحاضری با هم ثبت نمی‌شود؛ یکی را انتخاب کنید.");
    }
  }

  return db.$transaction(async (tx) => {
    for (const g of dto.grades) {
      await tx.grade.upsert({
        where: { assessmentId_studentId: { assessmentId: id, studentId: g.studentId } },
        create: {
          assessmentId: id, studentId: g.studentId,
          score: g.score ?? null, isAbsent: g.isAbsent, note: g.note ?? null,
          enteredById: ctx.user.id, enteredAt: new Date(),
        },
        update: {
          score: g.score ?? null, isAbsent: g.isAbsent, note: g.note ?? null,
          enteredById: ctx.user.id, enteredAt: new Date(),
        },
      });
    }
    const row = await tx.assessment.update({
      where: { id },
      data: { status: "grading", version: { increment: 1 } },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "grades.enter",
      entity: "Assessment",
      entityId: id,
      after: { count: dto.grades.length },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function publishAssessment(ctx: AuthContext, id: string, dto: z.infer<typeof publishDto>) {
  if (!can(ctx, "assessments.manage")) {
    throw errors.forbidden("انتشار نتایج فقط برای مدیر تعلیمی/مدیر مکتب مجاز است.");
  }
  const assessment = await db.assessment.findUnique({ where: { id } });
  if (!assessment) throw errors.notFound("امتحان");
  if (assessment.version !== dto.version) {
    throw errors.conflict("این امتحان توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
  }
  if (assessment.status === "published") {
    throw errors.badRequest("این نتیجه از قبل منتشر شده است.");
  }
  const gradeCount = await db.grade.count({ where: { assessmentId: id } });
  if (gradeCount === 0) {
    throw errors.badRequest("قبل از انتشار حداقل یک نمره باید ثبت شود.");
  }

  return db.$transaction(async (tx) => {
    // Snapshot the grading policy in force at publish time. Published results
    // keep this version even if the assessment row is edited later (it cannot
    // be — published assessments are immutable).
    const policy = { maxScore: assessment.maxScore, weight: assessment.weight, type: assessment.type };
    const row = await tx.assessment.update({
      where: { id },
      data: {
        status: "published",
        publishedById: ctx.user.id,
        publishedAt: new Date(),
        gradingPolicy: JSON.stringify(policy),
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "assessment.publish",
      entity: "Assessment",
      entityId: id,
      before: { status: assessment.status },
      after: { status: "published", policy },
      ip: ctx.ip,
    });
    return row;
  });
}

// ── Report card ─────────────────────────────────────────────────────────────
// Per student: PUBLISHED assessments only, grouped by subject, weighted
// average over non-missing grades (missing ≠ zero). Requires grades.view and
// visibility of the student (own/guardian/section/branch/all scopes).

export async function reportCard(ctx: AuthContext, studentId: string, filters: { academicYearId?: string }) {
  const allowed = await canViewStudent(ctx, studentId);
  if (!allowed.allowed || !can(ctx, "grades.view")) {
    throw errors.forbidden("شما اجازهٔ مشاهدهٔ نتایج این شاگرد را ندارید.");
  }
  const student = await db.student.findUnique({
    where: { id: studentId },
    include: {
      enrollments: {
        where: { status: "active" },
        include: {
          gradeLevel: { select: { nameDari: true } },
          classSection: { select: { label: true } },
          academicYear: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!student) throw errors.notFound("شاگرد");

  const personal = safeJson(student.personal);
  const enrollment = student.enrollments.find(
    (e) => !filters.academicYearId || e.academicYearId === filters.academicYearId,
  );
  if (!enrollment || !enrollment.classSectionId) {
    return {
      studentId,
      studentNumber: student.studentNumber,
      firstName: personal.firstName ?? "",
      gradeName: null,
      sectionLabel: null,
      academicYearName: null,
      subjects: [],
      attendance: null,
    };
  }
  const sectionId: string = enrollment.classSectionId;

  const [published, attendanceAgg] = await Promise.all([
    db.assessment.findMany({
      where: {
        classSectionId: sectionId,
        status: "published",
        academicYearId: enrollment.academicYearId,
      },
      include: { subject: { select: { id: true, nameDari: true } } },
      orderBy: [{ subjectId: "asc" }, { publishedAt: "asc" }],
    }),
    (async () => {
      const sessions = await db.attendanceSession.findMany({
        where: { classSectionId: sectionId, status: "submitted" },
        select: { id: true },
      });
      if (sessions.length === 0) return { sessions: 0, present: 0, absent: 0, late: 0, excused: 0, notRecorded: 0 };
      const recs = await db.attendanceRecord.findMany({
        where: { sessionId: { in: sessions.map((s) => s.id) }, studentId },
        select: { status: true },
      });
      const agg = { sessions: sessions.length, present: 0, absent: 0, late: 0, excused: 0, notRecorded: 0 };
      for (const r of recs) {
        if (r.status === "present") agg.present += 1;
        else if (r.status === "absent") agg.absent += 1;
        else if (r.status === "late") agg.late += 1;
        else if (r.status === "excused") agg.excused += 1;
      }
      agg.notRecorded = agg.sessions - (agg.present + agg.absent + agg.late + agg.excused);
      return agg;
    })(),
  ]);

  const grades = await db.grade.findMany({
    where: {
      assessmentId: { in: published.map((a) => a.id) },
      studentId,
    },
  });
  const gradeByAssessment = new Map(grades.map((g) => [g.assessmentId, g]));

  // Group by subject; weighted average EXCLUDES missing grades (≠ zero).
  const bySubject = new Map<string, { subjectName: string; items: Array<{
    assessmentId: string; title: string; type: string; score: number | null;
    maxScore: number; weight: number; isAbsent: boolean; publishedAt: Date | null;
  }>; weightedSum: number; weightSum: number }>();

  for (const a of published) {
    const g = gradeByAssessment.get(a.id);
    const entry = bySubject.get(a.subjectId) ?? {
      subjectName: a.subject.nameDari, items: [], weightedSum: 0, weightSum: 0,
    };
    const score = g?.score ?? null;
    entry.items.push({
      assessmentId: a.id,
      title: a.title,
      type: a.type,
      score,
      maxScore: a.maxScore,
      weight: a.weight,
      isAbsent: g?.isAbsent ?? false,
      publishedAt: a.publishedAt,
    });
    if (score !== null) {
      // Normalize to 0..100 per assessment, then weight.
      entry.weightedSum += (score / a.maxScore) * a.weight;
      entry.weightSum += a.weight;
    }
    bySubject.set(a.subjectId, entry);
  }

  const subjects = [...bySubject.entries()].map(([subjectId, e]) => ({
    subjectId,
    subjectName: e.subjectName,
    average: e.weightSum > 0 ? Math.round((e.weightedSum / e.weightSum) * 10000) / 100 : null,
    items: e.items,
  }));

  return {
    studentId,
    studentNumber: student.studentNumber,
    firstName: personal.firstName ?? "",
    gradeName: enrollment.gradeLevel.nameDari,
    sectionLabel: enrollment.classSection?.label ?? null,
    academicYearName: enrollment.academicYear.name,
    subjects,
    attendance: attendanceAgg,
  };
}

// ── Recent published grades (dashboard for students/parents) ────────────────

export async function recentPublishedGrades(ctx: AuthContext, limit = 8) {
  let studentIds: string[] = [];
  if (ctx.linkedStudentId) studentIds = [ctx.linkedStudentId];
  else if (ctx.guardianId) {
    const links = await db.studentGuardian.findMany({
      where: { guardianId: ctx.guardianId, contactRights: true },
      select: { studentId: true },
    });
    studentIds = links.map((l) => l.studentId);
  }
  if (studentIds.length === 0) return [];

  const rows = await db.grade.findMany({
    where: { studentId: { in: studentIds }, assessment: { status: "published" } },
    include: {
      assessment: {
        select: { id: true, title: true, type: true, maxScore: true, subject: { select: { nameDari: true } } },
      },
      student: { select: { id: true, studentNumber: true, personal: true } },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: limit,
  });
  return rows.map((r) => ({
    studentId: r.studentId,
    firstName: safeJson(r.student.personal).firstName ?? "",
    assessmentId: r.assessmentId,
    title: r.assessment.title,
    type: r.assessment.type,
    subjectName: r.assessment.subject.nameDari,
    score: r.score,
    maxScore: r.assessment.maxScore,
    isAbsent: r.isAbsent,
    at: r.updatedAt,
  }));
}

function safeJson(raw: string | null | undefined): Record<string, unknown> {
  try { return JSON.parse(raw ?? "{}"); } catch { return {}; }
}
