// Reports module — Phase 5: printable/exportable registries.
//
// Reports return a GENERIC TABLE contract: { title, columns[], rows[][] }
// with values already formatted as Dari display strings (Jalali dates,
// Persian digits). The same contract feeds:
//   - the screen view (RTL table),
//   - the print view (browser print),
//   - CSV export (?format=csv — UTF-8 with BOM so Excel reads Dari).
//
// SCOPING: every report reuses the RBAC scope engine — branch-bound roles
// see their own branch, teachers see their assigned sections, guardians and
// students would see nothing here (no reports.view grant by design).
// Finance reporting keeps its dedicated module (/api/v1/finance/reports).

import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { studentListWhere, sectionListWhere } from "@/server/rbac/scope";
import { formatJalaliNumeric } from "@/server/shared/jalali";
import { toPersianDigits } from "@/server/shared/normalization";
import { STUDENT_STATUS_LABELS, ENROLLMENT_STATUS_LABELS } from "@/server/students";
import type { AuthContext } from "@/server/auth/context";
import type { Prisma } from "@prisma/client";

export const REPORT_KINDS = ["students", "attendance", "results"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  students: "ثبت‌نامهٔ شاگردان",
  attendance: "گزارش حاضری",
  results: "گزارش نتایج (نمرات منتشرشده)",
};

export interface ReportTable {
  kind: ReportKind;
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: string[][];
  meta: Record<string, string>;
}

function faNum(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return toPersianDigits(String(n));
}

function faDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatJalaliNumeric(iso);
}

/** CSV with a UTF-8 BOM so Excel opens Dari text correctly. The report
 *  title (and meta facts) lead the file so the exported sheet is
 *  self-describing even after it leaves the system. */
export function reportToCsv(table: ReportTable): string {
  const esc = (v: string) => {
    const s = v.replace(/"/g, '""');
    return /[",\n]/.test(s) ? `"${s}"` : s;
  };
  const metaLine = Object.entries(table.meta)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" · ");
  const lines = [
    esc(table.title),
    ...(metaLine ? [esc(metaLine)] : []),
    table.columns.map((c) => esc(c.label)).join(","),
    ...table.rows.map((r) => r.map(esc).join(",")),
  ];
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}

function personalOf(raw: string | null | undefined): { firstName: string; fatherName: string; gender?: string } {
  try {
    const p = JSON.parse(raw ?? "{}");
    return { firstName: p.firstName ?? "", fatherName: p.fatherName ?? "", gender: p.gender };
  } catch {
    return { firstName: "", fatherName: "" };
  }
}

// ── Students registry (ثبت‌نامهٔ شاگردان) ────────────────────────────────────

export async function studentsRegistry(
  ctx: AuthContext,
  filters: { gradeLevelId?: string; classSectionId?: string; status?: string },
): Promise<ReportTable> {
  const where = await studentListWhere(ctx);
  if (where === null) {
    return emptyTable("students", "ثبت‌نامهٔ شاگردان");
  }
  const year = await db.academicYear.findFirst({
    where: { orgId: { not: "" }, isCurrent: true },
    select: { id: true, name: true },
  });
  const and: Prisma.StudentWhereInput[] = [where];
  if (filters.status) and.push({ status: filters.status });
  if (filters.gradeLevelId || filters.classSectionId) {
    and.push({
      enrollments: {
        some: {
          ...(year ? { academicYearId: year.id } : {}),
          ...(filters.gradeLevelId ? { gradeLevelId: filters.gradeLevelId } : {}),
          ...(filters.classSectionId ? { classSectionId: filters.classSectionId } : {}),
        },
      },
    });
  }
  const rows = await db.student.findMany({
    where: { AND: and },
    include: {
      enrollments: {
        where: year ? { academicYearId: year.id } : {},
        include: {
          gradeLevel: { select: { nameDari: true } },
          classSection: {
            select: { label: true, branch: { select: { name: true } } },
          },
        },
        orderBy: { enrolledOn: "desc" },
        take: 1,
      },
    },
    orderBy: { studentNumber: "asc" },
    take: 1000,
  });

  return {
    kind: "students",
    title: "ثبت‌نامهٔ شاگردان",
    columns: [
      { key: "num", label: "شمارهٔ شاگرد" },
      { key: "name", label: "نام" },
      { key: "father", label: "نام پدر" },
      { key: "grade", label: "صنف" },
      { key: "section", label: "شعبهٔ صنفی" },
      { key: "branch", label: "شعبهٔ مکتب" },
      { key: "status", label: "وضعیت" },
      { key: "enrolledOn", label: "تاریخ شمولیت" },
    ],
    rows: rows.map((s) => {
      const p = personalOf(s.personal);
      const e = s.enrollments[0];
      return [
        s.studentNumber,
        p.firstName,
        p.fatherName,
        e?.gradeLevel.nameDari ?? "—",
        e?.classSection?.label ?? "—",
        e?.classSection?.branch.name ?? "—",
        STUDENT_STATUS_LABELS[s.status as keyof typeof STUDENT_STATUS_LABELS] ?? s.status,
        faDate(e?.enrolledOn),
      ];
    }),
    meta: {
      totalCount: faNum(rows.length),
      year: year?.name ?? "—",
    },
  };
}

// ── Attendance report (گزارش حاضری) ─────────────────────────────────────────

export async function attendanceReport(
  ctx: AuthContext,
  filters: { classSectionId?: string; from?: string; to?: string },
): Promise<ReportTable> {
  const sectionWhere = await sectionListWhere(ctx, "attendance.view");
  if (sectionWhere === null) {
    return emptyTable("attendance", "گزارش حاضری");
  }
  const and: Prisma.ClassSectionWhereInput[] = [sectionWhere];
  if (filters.classSectionId) and.push({ id: filters.classSectionId });
  const sections = await db.classSection.findMany({
    where: { AND: and },
    include: { gradeLevel: { select: { nameDari: true } }, branch: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const sectionIds = sections.map((s) => s.id);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  const sessions = await db.attendanceSession.findMany({
    where: {
      classSectionId: { in: sectionIds },
      status: "submitted", // only submitted sessions enter statistics
      date: { gte: filters.from, lte: filters.to },
    },
    select: { id: true, classSectionId: true },
  });
  const sessionIds = sessions.map((s) => s.id);
  const sessionsBySection = new Map<string, number>();
  for (const s of sessions) {
    sessionsBySection.set(s.classSectionId, (sessionsBySection.get(s.classSectionId) ?? 0) + 1);
  }

  const [records, enrollments] = await Promise.all([
    sessionIds.length > 0
      ? db.attendanceRecord.findMany({
          where: { sessionId: { in: sessionIds } },
          select: { studentId: true, status: true },
        })
      : Promise.resolve([] as Array<{ studentId: string; status: string }>),
    db.enrollment.findMany({
      where: { classSectionId: { in: sectionIds }, status: "active" },
      include: { student: { select: { studentNumber: true, personal: true } } },
      orderBy: { student: { studentNumber: "asc" } },
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

  const rows = enrollments.map((e) => {
    const p = personalOf(e.student.personal);
    const section = sectionById.get(e.classSectionId ?? "");
    const agg = recByStudent.get(e.studentId) ?? { present: 0, absent: 0, late: 0, excused: 0 };
    const recorded = agg.present + agg.absent + agg.late + agg.excused;
    const totalSessions = sessionsBySection.get(e.classSectionId ?? "") ?? 0;
    const notRecorded = Math.max(0, totalSessions - recorded); // نا-ثبت ≠ حاضر
    const attended = agg.present + agg.late + agg.excused;
    const rate = totalSessions > 0 ? Math.round((attended / totalSessions) * 100) : null;
    return [
      e.student.studentNumber,
      p.firstName,
      p.fatherName,
      section ? `${section.gradeLevel.nameDari} — ${section.label}` : "—",
      faNum(totalSessions),
      faNum(agg.present),
      faNum(agg.absent),
      faNum(agg.late),
      faNum(agg.excused),
      faNum(notRecorded),
      rate === null ? "—" : faNum(rate) + "٪",
    ];
  });

  return {
    kind: "attendance",
    title: "گزارش حاضری",
    columns: [
      { key: "num", label: "شمارهٔ شاگرد" },
      { key: "name", label: "نام" },
      { key: "father", label: "نام پدر" },
      { key: "section", label: "شعبهٔ صنفی" },
      { key: "sessions", label: "جلسات قطعی‌شده" },
      { key: "present", label: "حاضر" },
      { key: "absent", label: "غیرحاضر" },
      { key: "late", label: "ناوقت" },
      { key: "excused", label: "رخصت" },
      { key: "notRecorded", label: "نا-ثبت" },
      { key: "rate", label: "نسبت حاضری" },
    ],
    rows,
    meta: {
      sessions: faNum(sessions.length),
      students: faNum(rows.length),
      from: filters.from ? faDate(filters.from) : "—",
      to: filters.to ? faDate(filters.to) : "—",
    },
  };
}

// ── Results report (نتایج منتشرشده) ────────────────────────────────────────

export async function resultsReport(
  ctx: AuthContext,
  filters: { classSectionId?: string; subjectId?: string },
): Promise<ReportTable> {
  // Scoped by grades.view (the broadest results-visibility grant — the same
  // permission that gates report cards and the parent/student portals).
  const sectionWhere = await sectionListWhere(ctx, "grades.view");
  if (sectionWhere === null) {
    return emptyTable("results", "گزارش نتایج");
  }
  const and: Prisma.ClassSectionWhereInput[] = [sectionWhere];
  if (filters.classSectionId) and.push({ id: filters.classSectionId });
  const sections = await db.classSection.findMany({
    where: { AND: and },
    include: { gradeLevel: { select: { nameDari: true } }, branch: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  const sectionIds = sections.map((s) => s.id);

  // PUBLISHED assessments only — unpublished grades are nobody's report.
  const assessments = await db.assessment.findMany({
    where: {
      classSectionId: { in: sectionIds },
      status: "published",
      ...(filters.subjectId ? { subjectId: filters.subjectId } : {}),
    },
    include: {
      subject: { select: { nameDari: true } },
      grades: { where: { OR: [{ score: { not: null } }, { isAbsent: true }] } },
    },
  });

  // Per (student × subject): weighted average of non-missing grades.
  type Cell = { weightSum: number; scoreSum: number };
  const byStudentSubject = new Map<string, Cell>();
  const studentIds = new Set<string>();
  for (const a of assessments) {
    for (const g of a.grades) {
      if (g.score === null) continue; // missing ≠ zero — excluded
      const key = `${g.studentId}|${a.subjectId}`;
      const cell = byStudentSubject.get(key) ?? { weightSum: 0, scoreSum: 0 };
      const max = a.maxScore || 100;
      const weight = a.weight || 1;
      cell.weightSum += weight;
      cell.scoreSum += (g.score / max) * weight;
      byStudentSubject.set(key, cell);
      studentIds.add(g.studentId);
    }
  }

  const subjects = [...new Set(assessments.map((a) => a.subjectId))];
  const subjectNames = new Map(
    assessments.map((a) => [a.subjectId, a.subject.nameDari] as const),
  );

  const enrollments = await db.enrollment.findMany({
    where: { classSectionId: { in: sectionIds }, status: "active", studentId: { in: [...studentIds] } },
    include: {
      student: { select: { studentNumber: true, personal: true } },
      classSection: { include: { gradeLevel: { select: { nameDari: true } } } },
    },
    orderBy: { student: { studentNumber: "asc" } },
  });

  const rows = enrollments.map((e) => {
    const p = personalOf(e.student.personal);
    const cells = subjects.map((subjectId) => {
      const cell = byStudentSubject.get(`${e.studentId}|${subjectId}`);
      if (!cell || cell.weightSum === 0) return "—"; // no average ≠ zero
      const avg = Math.round((cell.scoreSum / cell.weightSum) * 100);
      return faNum(avg) + "٪";
    });
    return [
      e.student.studentNumber,
      p.firstName,
      p.fatherName,
      e.classSection
        ? `${e.classSection.gradeLevel.nameDari} — ${e.classSection.label}`
        : "—",
      ...cells,
    ];
  });

  return {
    kind: "results",
    title: "گزارش نتایج (نمرات منتشرشده)",
    columns: [
      { key: "num", label: "شمارهٔ شاگرد" },
      { key: "name", label: "نام" },
      { key: "father", label: "نام پدر" },
      { key: "section", label: "شعبهٔ صنفی" },
      ...subjects.map((subjectId) => ({
        key: subjectId,
        label: subjectNames.get(subjectId) ?? subjectId,
      })),
    ],
    rows,
    meta: {
      assessments: faNum(assessments.length),
      subjects: faNum(subjects.length),
      students: faNum(rows.length),
    },
  };
}

function emptyTable(kind: ReportKind, title: string): ReportTable {
  return { kind, title, columns: [], rows: [], meta: {} };
}

/** Entry point used by the /api/v1/reports/[kind] route. */
export async function buildReport(
  ctx: AuthContext,
  kind: string,
  filters: {
    gradeLevelId?: string; classSectionId?: string; status?: string;
    from?: string; to?: string; subjectId?: string;
  },
): Promise<ReportTable> {
  switch (kind) {
    case "students":
      return studentsRegistry(ctx, filters);
    case "attendance":
      return attendanceReport(ctx, filters);
    case "results":
      return resultsReport(ctx, filters);
    default:
      throw errors.notFound("گزارش");
  }
}

// Re-export for the view's enrollment status labels.
export { ENROLLMENT_STATUS_LABELS };
