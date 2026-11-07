// Attendance — Phase 2. Core rules:
//   • "Unrecorded ≠ present": only SUBMITTED sessions count in statistics,
//     and a student without a record row inside a submitted session is
//     reported as «نا-ثبت» — never silently present or absent.
//   • At most one session per (section, date, period) — DB-enforced; late or
//     makeup recording reuses the idempotent open-or-return-existing flow.
//   • Records exist only for students with an ACTIVE enrollment in the
//     section at recording time.
//   • A submitted session is immutable; corrections go through an audited
//     reopen (attendance.correct) followed by re-saving and re-submitting.

import { z } from "zod";
import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { writeAudit } from "@/server/shared/audit";
import { can, canAccessSection, staffForUser, canViewStudent, sectionListWhere } from "@/server/rbac/scope";
import { dateInput } from "@/server/academic";
import type { AuthContext } from "@/server/auth/context";

export const ATTENDANCE_STATUSES = ["present", "absent", "late", "excused"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غیرحاضر",
  late: "ناوقت",
  excused: "رخصت",
};

// ── DTOs ────────────────────────────────────────────────────────────────────

export const sessionUpsertDto = z.object({
  classSectionId: z.string().min(1, "شعبهٔ صنف را انتخاب کنید."),
  date: dateInput,
  period: z.coerce.number().int().min(0, "نفریزه باید بین ۰ تا ۸ باشد.").max(8, "نفریزه باید بین ۰ تا ۸ باشد.").default(0),
  subjectId: z.string().optional().nullable(),
  note: z.string().max(200).optional().nullable(),
});

export const recordRowDto = z.object({
  studentId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES, { message: "وضعیت حاضری معتبر نیست." }),
  note: z.string().max(120).optional().nullable(),
});

export const saveRecordsDto = z.object({
  version: z.number().int().min(1),
  records: z.array(recordRowDto).max(80, "فهرست حاضری بیش از حد بزرگ است."),
});

export const submitDto = z.object({
  version: z.number().int().min(1),
});

export const reopenDto = z.object({
  reason: z.string().min(3, "دلیل بازکردن مجدد را بنویسید.").max(200),
});

// ── Helpers ─────────────────────────────────────────────────────────────────

async function requireSectionAccess(ctx: AuthContext, sectionId: string, permission: string) {
  const ok = await canAccessSection(ctx, permission, sectionId);
  if (!ok) throw errors.forbidden("شما اجازهٔ دسترسی به این شعبهٔ صنف را ندارید.");
}

/** The viewer may see this session's detail if they can see its section. */
async function assertSessionVisible(ctx: AuthContext, session: { classSectionId: string }) {
  await requireSectionAccess(ctx, session.classSectionId, "attendance.view");
}

/** Resolve the StaffMember recording on behalf of this user (may be null). */
async function recorderStaffId(ctx: AuthContext): Promise<string | null> {
  const staff = await staffForUser(ctx.user.id);
  return staff?.id ?? null;
}

function publicSession(row: {
  id: string; classSectionId: string; date: string; period: number; status: string;
  note: string | null; submittedAt: Date | null; createdAt: Date; version: number;
  classSection: { label: string; gradeLevel: { nameDari: string }; branch: { name: string } };
  recorder?: { fullName: string } | null;
  submitter?: { fullName: string } | null;
  _count?: { records: number };
}) {
  return {
    id: row.id,
    classSectionId: row.classSectionId,
    gradeName: row.classSection.gradeLevel.nameDari,
    sectionLabel: row.classSection.label,
    branchName: row.classSection.branch.name,
    date: row.date,
    period: row.period,
    status: row.status,
    note: row.note,
    recorderName: row.recorder?.fullName ?? null,
    submitterName: row.submitter?.fullName ?? null,
    submittedAt: row.submittedAt,
    recordCount: row._count?.records ?? null,
    version: row.version,
    createdAt: row.createdAt,
  };
}

const SESSION_INCLUDE = {
  classSection: {
    select: {
      id: true, label: true,
      gradeLevel: { select: { nameDari: true } },
      branch: { select: { name: true } },
    },
  },
  recorder: { select: { fullName: true } },
  submitter: { select: { fullName: true } },
  _count: { select: { records: true } },
} as const;

// ── Queries ─────────────────────────────────────────────────────────────────

export async function listSessions(
  ctx: AuthContext,
  filters: { classSectionId?: string; from?: string; to?: string; status?: string },
) {
  if (filters.classSectionId) {
    await requireSectionAccess(ctx, filters.classSectionId, "attendance.view");
  }
  // Branch isolation: sessions only for sections the viewer may see.
  const scopeWhere = await sectionListWhere(ctx, "attendance.view");
  if (scopeWhere === null) return [];
  const rows = await db.attendanceSession.findMany({
    where: {
      AND: [
        { classSection: scopeWhere },
        ...(filters.classSectionId ? [{ classSectionId: filters.classSectionId }] : []),
        ...(filters.status ? [{ status: filters.status }] : []),
        ...(filters.from || filters.to
          ? [{ date: { gte: filters.from, lte: filters.to } }]
          : []),
      ],
    },
    include: SESSION_INCLUDE,
    orderBy: [{ date: "desc" }, { period: "asc" }],
    take: 100,
  });
  return rows.map(publicSession);
}

export async function getSession(ctx: AuthContext, id: string) {
  const session = await db.attendanceSession.findUnique({
    where: { id },
    include: SESSION_INCLUDE,
  });
  if (!session) throw errors.notFound("سیشن حاضری");

  await assertSessionVisible(ctx, session);

  // Roster = active enrollments of the section, joined with existing records.
  const [enrollments, records] = await Promise.all([
    db.enrollment.findMany({
      where: { classSectionId: session.classSectionId, status: "active" },
      include: { student: { select: { id: true, studentNumber: true, personal: true } } },
      orderBy: { rollNumber: "asc" },
    }),
    db.attendanceRecord.findMany({ where: { sessionId: id } }),
  ]);
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const roster = enrollments.map((e) => {
    const personal = safeJson(e.student.personal);
    const rec = byStudent.get(e.student.id);
    return {
      studentId: e.student.id,
      studentNumber: e.student.studentNumber,
      firstName: personal.firstName ?? "",
      fatherName: personal.fatherName ?? "",
      rollNumber: e.rollNumber,
      record: rec
        ? { status: rec.status, note: rec.note, updatedAt: rec.updatedAt }
        : null,
    };
  });
  return { ...publicSession(session), roster };
}

// ── Mutations ───────────────────────────────────────────────────────────────

export async function upsertSession(ctx: AuthContext, dto: z.infer<typeof sessionUpsertDto>) {
  const section = await db.classSection.findUnique({ where: { id: dto.classSectionId } });
  if (!section) throw errors.notFound("شعبهٔ صنف");
  await requireSectionAccess(ctx, dto.classSectionId, "attendance.record");

  if (dto.subjectId) {
    const subject = await db.subject.findUnique({ where: { id: dto.subjectId } });
    if (!subject) throw errors.notFound("مضمون");
  }

  const recorderId = await recorderStaffId(ctx);

  return db.$transaction(async (tx) => {
    const existing = await tx.attendanceSession.findUnique({
      where: {
        classSectionId_date_period: {
          classSectionId: dto.classSectionId,
          date: dto.date,
          period: dto.period,
        },
      },
    });
    if (existing) {
      if (existing.status === "submitted") {
        throw errors.conflict(
          "حاضری این روز از قبل ثبت و قطعی شده است. برای تصحیح، از مسیر بازکردن مجدد استفاده کنید.",
        );
      }
      // Idempotent: reopen the existing open session (late/makeup recording).
      return existing;
    }
    const row = await tx.attendanceSession.create({
      data: {
        classSectionId: dto.classSectionId,
        date: dto.date,
        period: dto.period,
        subjectId: dto.subjectId || null,
        note: dto.note ?? null,
        recordedById: recorderId,
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "attendance.session-create",
      entity: "AttendanceSession",
      entityId: row.id,
      after: { sectionId: dto.classSectionId, date: dto.date, period: dto.period },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function saveRecords(ctx: AuthContext, sessionId: string, dto: z.infer<typeof saveRecordsDto>) {
  const session = await db.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw errors.notFound("سیشن حاضری");
  if (session.version !== dto.version) {
    throw errors.conflict(
      "این حاضری توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.",
    );
  }
  await requireSectionAccess(ctx, session.classSectionId, "attendance.record");
  if (session.status === "submitted") {
    throw errors.badRequest(
      "حاضری قطعی‌شده قابل ویرایش نیست. ابتدا توسط مدیر تعلیمی بازگردانده شود.",
    );
  }

  // Records only for students with an ACTIVE enrollment in this section.
  const enrolled = await db.enrollment.findMany({
    where: { classSectionId: session.classSectionId, status: "active" },
    select: { studentId: true },
  });
  const enrolledIds = new Set(enrolled.map((e) => e.studentId));
  for (const r of dto.records) {
    if (!enrolledIds.has(r.studentId)) {
      throw errors.badRequest("یکی از شاگردان در این شعبهٔ صنف ثبت‌نام فعال ندارد.");
    }
  }

  return db.$transaction(async (tx) => {
    for (const r of dto.records) {
      await tx.attendanceRecord.upsert({
        where: { sessionId_studentId: { sessionId, studentId: r.studentId } },
        create: {
          sessionId, studentId: r.studentId, status: r.status,
          note: r.note ?? null, editedById: ctx.user.id, editedAt: new Date(),
        },
        update: {
          status: r.status, note: r.note ?? null,
          editedById: ctx.user.id, editedAt: new Date(),
        },
      });
    }
    const row = await tx.attendanceSession.update({
      where: { id: sessionId },
      data: { version: { increment: 1 } },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "attendance.save",
      entity: "AttendanceSession",
      entityId: sessionId,
      after: { count: dto.records.length },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function submitSession(ctx: AuthContext, sessionId: string, dto: z.infer<typeof submitDto>) {
  const session = await db.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw errors.notFound("سیشن حاضری");
  if (session.version !== dto.version) {
    throw errors.conflict("این حاضری توسط شخص دیگری تغییر کرده است. صفحه را دوباره بارگذاری کنید.");
  }
  await requireSectionAccess(ctx, session.classSectionId, "attendance.record");
  if (session.status === "submitted") {
    throw errors.badRequest("این حاضری از قبل قطعی شده است.");
  }

  const submitterId = await recorderStaffId(ctx);

  return db.$transaction(async (tx) => {
    const row = await tx.attendanceSession.update({
      where: { id: sessionId },
      data: {
        status: "submitted",
        submittedById: submitterId,
        submittedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "attendance.submit",
      entity: "AttendanceSession",
      entityId: sessionId,
      before: { status: session.status },
      after: { status: "submitted" },
      ip: ctx.ip,
    });
    return row;
  });
}

export async function reopenSession(ctx: AuthContext, sessionId: string, dto: z.infer<typeof reopenDto>) {
  if (!can(ctx, "attendance.correct")) {
    throw errors.forbidden("بازگرداندن حاضری قطعی‌شده فقط برای مدیر تعلیمی/مدیر مکتب مجاز است.");
  }
  const session = await db.attendanceSession.findUnique({ where: { id: sessionId } });
  if (!session) throw errors.notFound("سیشن حاضری");
  if (session.status !== "submitted") {
    throw errors.badRequest("فقط حاضری قطعی‌شده نیاز به بازگرداندن دارد.");
  }
  await requireSectionAccess(ctx, session.classSectionId, "attendance.correct");

  return db.$transaction(async (tx) => {
    const row = await tx.attendanceSession.update({
      where: { id: sessionId },
      data: {
        status: "open",
        reopenedById: ctx.user.id,
        reopenedReason: dto.reason,
        version: { increment: 1 },
      },
    });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "attendance.reopen",
      entity: "AttendanceSession",
      entityId: sessionId,
      before: { status: "submitted" },
      after: { status: "open" },
      reason: dto.reason,
      ip: ctx.ip,
    });
    return row;
  });
}

// ── Delete (Phase 6: full CRUD on sessions) ─────────────────────────────────
// Only OPEN (draft) sessions can be deleted — a submitted session is part of
// the statistical record and must be reopened by a manager instead. Drafts
// with saved marks are deleted together with their records, in one
// transaction, always audit-logged with a before snapshot.

export async function deleteSession(ctx: AuthContext, sessionId: string) {
  const session = await db.attendanceSession.findUnique({
    where: { id: sessionId },
    include: { _count: { select: { records: true } } },
  });
  if (!session) throw errors.notFound("سیشن حاضری");
  if (session.status !== "open") {
    throw errors.badRequest(
      "حاضری قطعی‌شده حذف نمی‌شود — آمار تاریخی است. برای تصحیح، از مسیر بازکردن مجدد استفاده کنید.",
    );
  }
  await requireSectionAccess(ctx, session.classSectionId, "attendance.record");

  return db.$transaction(async (tx) => {
    await tx.attendanceRecord.deleteMany({ where: { sessionId } });
    await tx.attendanceSession.delete({ where: { id: sessionId } });
    await writeAudit(tx, {
      actorId: ctx.user.id,
      actorName: ctx.user.fullName,
      action: "attendance.session-delete",
      entity: "AttendanceSession",
      entityId: sessionId,
      before: {
        classSectionId: session.classSectionId,
        date: session.date,
        period: session.period,
        recordCount: session._count.records,
      },
      ip: ctx.ip,
    });
    return { ok: true };
  });
}

// ── Summary (statistics) ────────────────────────────────────────────────────
// Only SUBMITTED sessions count. Students enrolled in the section(s) without
// a record row are counted as «نا-ثبت» (notRecorded) — never as present.

export async function attendanceSummary(
  ctx: AuthContext,
  filters: { classSectionId?: string; studentId?: string; from?: string; to?: string },
) {
  let studentScopeIds: string[] | null = null;
  if (filters.studentId) {
    const allowed = await canViewStudent(ctx, filters.studentId);
    if (!allowed.allowed) throw errors.forbidden("شما اجازهٔ مشاهدهٔ حاضری این شاگرد را ندارید.");
    studentScopeIds = [filters.studentId];
  }

  // Section scope: either the explicit filter (must be accessible) or all
  // sections the viewer can see.
  let sectionIds: string[];
  if (filters.classSectionId) {
    await requireSectionAccess(ctx, filters.classSectionId, "attendance.view");
    sectionIds = [filters.classSectionId];
  } else if (studentScopeIds) {
    // Student-centered summary: sections from the student's enrollments.
    const enrollments = await db.enrollment.findMany({
      where: { studentId: { in: studentScopeIds }, status: "active" },
      select: { classSectionId: true },
    });
    sectionIds = enrollments
      .map((e) => e.classSectionId)
      .filter((v): v is string => v !== null);
    if (sectionIds.length === 0) {
      return { sessions: 0, byStatus: emptyStatus(), students: [] };
    }
  } else {
    throw errors.badRequest("شعبهٔ صنف یا شاگرد را مشخص کنید.");
  }

  // SUBMITTED sessions only — open sessions are invisible to statistics.
  const sessions = await db.attendanceSession.findMany({
    where: {
      classSectionId: { in: sectionIds },
      status: "submitted",
      date: { gte: filters.from, lte: filters.to },
    },
    select: { id: true, classSectionId: true, date: true },
  });
  const sessionIds = sessions.map((s) => s.id);

  const [records, enrollments] = await Promise.all([
    sessionIds.length > 0
      ? db.attendanceRecord.findMany({
          where: { sessionId: { in: sessionIds }, ...(studentScopeIds ? { studentId: { in: studentScopeIds } } : {}) },
          select: { studentId: true, status: true },
        })
      : Promise.resolve([]),
    db.enrollment.findMany({
      where: { classSectionId: { in: sectionIds }, status: "active" },
      select: { studentId: true, student: { select: { studentNumber: true, personal: true } } },
    }),
  ]);

  const recByStudent = new Map<string, { present: number; absent: number; late: number; excused: number }>();
  for (const r of records) {
    const agg = recByStudent.get(r.studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    if (r.status === "present") agg.present += 1;
    else if (r.status === "absent") agg.absent += 1;
    else if (r.status === "late") agg.late += 1;
    else if (r.status === "excused") agg.excused += 1;
    recByStudent.set(r.studentId, agg);
  }

  // Students in scope: either the requested student(s) or all enrolled ones.
  const studentIds = studentScopeIds ?? [...new Set(enrollments.map((e) => e.studentId))];
  const enrollByStudent = new Map(enrollments.map((e) => [e.studentId, e]));

  const totalSessions = sessions.length;
  const students = studentIds.map((studentId) => {
    const enr = enrollByStudent.get(studentId);
    const personal = safeJson(enr?.student.personal);
    const agg = recByStudent.get(studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    const recorded = agg.present + agg.absent + agg.late + agg.excused;
    return {
      studentId,
      studentNumber: enr?.student.studentNumber ?? "",
      firstName: personal.firstName ?? "",
      sessions: totalSessions,
      ...agg,
      notRecorded: Math.max(0, totalSessions - recorded), // نا-ثبت — never present/absent
    };
  });

  const byStatus = emptyStatus();
  for (const s of students) {
    byStatus.present += s.present;
    byStatus.absent += s.absent;
    byStatus.late += s.late;
    byStatus.excused += s.excused;
    byStatus.notRecorded += s.notRecorded;
  }

  return { sessions: totalSessions, byStatus, students };
}

function emptyStatus() {
  return { present: 0, absent: 0, late: 0, excused: 0, notRecorded: 0 };
}

function safeJson(raw: string | null | undefined): Record<string, unknown> {
  try { return JSON.parse(raw ?? "{}"); } catch { return {}; }
}
