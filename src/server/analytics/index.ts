// Analytics & at-risk oversight — Phase 8 (تحلیل‌ها).
//
// WHAT THIS MODULE COMPUTES (all scoped by branch isolation):
//  - KPIs: active students, submitted attendance records, collection rate
//    of the current year, open (unresolved) discipline incidents, merits.
//  - TRENDS: the last six Solar Hijri months of (a) attendance absent-rate,
//    (b) discipline incidents vs merits, (c) billed vs collected diram.
//  - AT-RISK STUDENTS: three independent flags, each with its own evidence —
//      attendance  : rate below 80% with at least 5 recorded days
//                    (present + late + excused count as attended;
//                     «نا-ثبت» never counts either way)
//      academics   : weighted average of published grades below 40% of
//                    maxScore (missing grades are excluded, never zero)
//      finance     : overdue balance > 0 on a non-void invoice
//    Risk score = number of flags; the list is sorted by score, then name.
//
// The flag thresholds are exported so unit tests can pin the policy.

import { db } from "@/lib/db";
import { errors } from "@/server/shared/http";
import { directBranchFilter } from "@/server/rbac/scope";
import { isoToJalali, instantToJalali, jalaliToIso, jalaliMonthLength, AFGHAN_MONTHS } from "@/server/shared/jalali";
import type { AuthContext } from "@/server/auth/context";

// ── At-risk policy (exported for tests) ─────────────────────────────────────

export const AT_RISK_POLICY = {
  /** Attended = present + late + excused; rate below this flags the student. */
  minAttendanceRate: 0.8,
  /** Minimum recorded days before attendance can flag (small-sample noise). */
  minRecordedDays: 5,
  /** Weighted average (0..100) below this flags the student. */
  failingAverage: 40,
} as const;

export interface RiskInputs {
  recordedDays: number;
  attendedDays: number;
  weightedSum: number; // Σ (score/maxScore)*100*weight
  weightSum: number;   // Σ weight
  overdueBalanceDiram: number;
}

export interface RiskAssessment {
  flags: Array<"attendance" | "academics" | "finance">;
  attendanceRate: number | null;
  averagePct: number | null;
  overdueBalanceDiram: number;
  score: number;
}

/** Pure classification — unit-tested policy core. */
export function classifyRisk(input: RiskInputs): RiskAssessment {
  const attendanceRate =
    input.recordedDays >= AT_RISK_POLICY.minRecordedDays && input.recordedDays > 0
      ? input.attendedDays / input.recordedDays
      : null;
  const averagePct =
    input.weightSum > 0
      ? Math.round((input.weightedSum / input.weightSum) * 100) / 100
      : null;

  const flags: RiskAssessment["flags"] = [];
  if (attendanceRate !== null && attendanceRate < AT_RISK_POLICY.minAttendanceRate) {
    flags.push("attendance");
  }
  if (averagePct !== null && averagePct < AT_RISK_POLICY.failingAverage) {
    flags.push("academics");
  }
  if (input.overdueBalanceDiram > 0) flags.push("finance");

  return {
    flags,
    attendanceRate,
    averagePct,
    overdueBalanceDiram: input.overdueBalanceDiram,
    score: flags.length,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function safeJson(raw: string): Record<string, unknown> {
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

const MONTHS_IN_TREND = 6;

interface MonthBucket {
  key: string;        // "1405-08"
  label: string;      // "میزان ۱۴۰۵"
  fromIso: string;    // inclusive first day
  toIso: string;      // inclusive last day
}

function toPersianDigits(n: number | string): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** The last `count` Solar Hijri months ending with the current one. */
export function recentJalaliMonths(todayIso: string, count = MONTHS_IN_TREND): MonthBucket[] {
  const { jy, jm } = isoToJalali(todayIso);
  const out: MonthBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    let y = jy;
    let m = jm - i;
    while (m <= 0) { m += 12; y -= 1; }
    const first = jalaliToIso({ jy: y, jm: m, jd: 1 });
    const last = jalaliToIso({ jy: y, jm: m, jd: jalaliMonthLength(y, m) });
    out.push({
      key: `${y}-${String(m).padStart(2, "0")}`,
      label: `${AFGHAN_MONTHS[m - 1]} ${toPersianDigits(y)}`,
      fromIso: first,
      toIso: last,
    });
  }
  return out;
}

// ── Overview ────────────────────────────────────────────────────────────────

export async function analyticsOverview(ctx: AuthContext) {
  const filter = directBranchFilter(ctx, "analytics.view");
  if (filter === null) {
    // Route guard already checked the permission; this is belt & braces.
    throw errors.forbidden("شما اجازهٔ مشاهدهٔ تحلیل‌ها را ندارید.");
  }
  const branchIds = filter.branchIds; // null = every branch (no context)

  const org = await db.organization.findFirst({ select: { id: true } });
  if (!org) throw errors.notFound("مکتب");

  const year = await db.academicYear.findFirst({
    where: { orgId: org.id, isCurrent: true },
  });

  const todayIso = new Date().toISOString().slice(0, 10);
  const months = recentJalaliMonths(todayIso);

  // Scoped class sections (branch isolation; analytics has branch/all scopes).
  const sections = await db.classSection.findMany({
    where: branchIds ? { branchId: { in: branchIds } } : {},
    select: {
      id: true, label: true,
      gradeLevel: { select: { nameDari: true } },
      branch: { select: { id: true, name: true } },
    },
  });
  const sectionIds = sections.map((s) => s.id);

  // Active enrollments of the current year in scoped sections.
  const enrollments = year
    ? await db.enrollment.findMany({
        where: {
          academicYearId: year.id,
          status: "active",
          classSectionId: { in: sectionIds.length ? sectionIds : ["__none__"] },
        },
        select: {
          studentId: true,
          student: { select: { studentNumber: true, personal: true } },
          classSectionId: true,
        },
      })
    : [];

  const studentIds = enrollments.map((e) => e.studentId);
  const sectionById = new Map(sections.map((s) => [s.id, s]));

  // ── Attendance aggregation (submitted sessions only) ──
  const attendanceRows = sectionIds.length
    ? await db.attendanceRecord.findMany({
        where: {
          session: {
            classSectionId: { in: sectionIds },
            status: "submitted",
          },
        },
        select: { studentId: true, status: true, session: { select: { date: true } } },
      })
    : [];

  const attByStudent = new Map<string, { recorded: number; attended: number }>();
  const attByMonth = new Map<string, { recorded: number; absent: number }>();
  for (const r of attendanceRows) {
    const s = attByStudent.get(r.studentId) ?? { recorded: 0, attended: 0 };
    s.recorded += 1;
    if (r.status === "present" || r.status === "late" || r.status === "excused") s.attended += 1;
    attByStudent.set(r.studentId, s);

    const bucket = months.find((m) => r.session.date >= m.fromIso && r.session.date <= m.toIso);
    if (bucket) {
      const b = attByMonth.get(bucket.key) ?? { recorded: 0, absent: 0 };
      b.recorded += 1;
      if (r.status === "absent") b.absent += 1;
      attByMonth.set(bucket.key, b);
    }
  }

  // ── Published grades aggregation (weighted, missing excluded) ──
  const publishedAssessments = year && sectionIds.length
    ? await db.assessment.findMany({
        where: {
          academicYearId: year.id,
          classSectionId: { in: sectionIds },
          status: "published",
        },
        select: { id: true, maxScore: true, weight: true },
      })
    : [];
  const assessmentById = new Map(publishedAssessments.map((a) => [a.id, a]));
  const gradeRows = publishedAssessments.length && studentIds.length
    ? await db.grade.findMany({
        where: {
          assessmentId: { in: publishedAssessments.map((a) => a.id) },
          studentId: { in: studentIds },
        },
        select: { studentId: true, assessmentId: true, score: true },
      })
    : [];

  const gradesByStudent = new Map<string, { weightedSum: number; weightSum: number }>();
  for (const g of gradeRows) {
    const a = assessmentById.get(g.assessmentId);
    if (!a || g.score === null) continue; // missing ≠ zero
    const s = gradesByStudent.get(g.studentId) ?? { weightedSum: 0, weightSum: 0 };
    s.weightedSum += (g.score / a.maxScore) * 100 * a.weight;
    s.weightSum += a.weight;
    gradesByStudent.set(g.studentId, s);
  }

  // ── Finance: overdue balances + collection (non-void invoices) ──
  const invoices = year && studentIds.length
    ? await db.invoice.findMany({
        where: {
          academicYearId: year.id,
          status: { not: "void" },
          ...(branchIds ? { branchId: { in: branchIds } } : {}),
          studentId: { in: studentIds },
        },
        select: { studentId: true, netDiram: true, paidDiram: true, dueDate: true, createdAt: true },
      })
    : [];

  const overdueByStudent = new Map<string, number>();
  let billedDiram = 0;
  let collectedDiram = 0;
  const billedByMonth = new Map<string, number>();
  for (const inv of invoices) {
    billedDiram += inv.netDiram;
    collectedDiram += inv.paidDiram;
    const balance = inv.netDiram - inv.paidDiram;
    if (balance > 0 && inv.dueDate && inv.dueDate < todayIso) {
      overdueByStudent.set(inv.studentId, (overdueByStudent.get(inv.studentId) ?? 0) + balance);
    }
    const j = instantToJalali(inv.createdAt);
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    billedByMonth.set(key, (billedByMonth.get(key) ?? 0) + inv.netDiram);
  }

  const paymentRows = await db.payment.findMany({
    where: {
      voidedAt: null,
      date: {
        gte: months[0]?.fromIso ?? todayIso,
        lte: months[months.length - 1]?.toIso ?? todayIso,
      },
      ...(branchIds ? { branchId: { in: branchIds } } : {}),
    },
    select: { amountDiram: true, date: true },
  });
  const collectedByMonth = new Map<string, number>();
  for (const p of paymentRows) {
    const j = isoToJalali(p.date);
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    collectedByMonth.set(key, (collectedByMonth.get(key) ?? 0) + p.amountDiram);
  }

  // ── Discipline: incidents vs merits ──
  const incidentRows = await db.disciplineIncident.findMany({
    where: branchIds ? { branchId: { in: branchIds } } : {},
    select: { kind: true, resolvedAt: true, date: true },
  });
  let openIncidents = 0;
  let meritCount = 0;
  const incidentsByMonth = new Map<string, number>();
  const meritsByMonth = new Map<string, number>();
  for (const inc of incidentRows) {
    const isMerit = inc.kind === "merit";
    if (isMerit) meritCount += 1;
    else if (inc.resolvedAt === null) openIncidents += 1;
    const bucket = months.find((m) => inc.date >= m.fromIso && inc.date <= m.toIso);
    if (bucket) {
      const target = isMerit ? meritsByMonth : incidentsByMonth;
      target.set(bucket.key, (target.get(bucket.key) ?? 0) + 1);
    }
  }

  // ── At-risk students ──
  const atRisk = enrollments
    .map((e) => {
      const att = attByStudent.get(e.studentId) ?? { recorded: 0, attended: 0 };
      const grd = gradesByStudent.get(e.studentId) ?? { weightedSum: 0, weightSum: 0 };
      const overdue = overdueByStudent.get(e.studentId) ?? 0;
      const risk = classifyRisk({
        recordedDays: att.recorded,
        attendedDays: att.attended,
        weightedSum: grd.weightedSum,
        weightSum: grd.weightSum,
        overdueBalanceDiram: overdue,
      });
      const personal = safeJson(e.student.personal);
      const section = e.classSectionId ? sectionById.get(e.classSectionId) : undefined;
      return {
        studentId: e.studentId,
        studentNumber: e.student.studentNumber,
        firstName: (personal.firstName as string) ?? "",
        fatherName: (personal.fatherName as string) ?? "",
        gradeName: section?.gradeLevel.nameDari ?? "—",
        sectionLabel: section?.label ?? "—",
        branchName: section?.branch.name ?? "—",
        ...risk,
      };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) =>
      b.score - a.score ||
      (a.attendanceRate ?? 1) - (b.attendanceRate ?? 1) ||
      a.firstName.localeCompare(b.firstName, "fa"),
    )
    .slice(0, 50);

  // ── Shape the response ──
  const collectionRate =
    billedDiram > 0 ? Math.round((collectedDiram / billedDiram) * 1000) / 10 : null;

  return {
    yearName: year?.name ?? null,
    generatedAt: new Date().toISOString(),
    kpis: {
      activeStudents: enrollments.length,
      submittedSessionRecords: attendanceRows.length,
      collectionRatePct: collectionRate,
      billedDiram,
      collectedDiram,
      openIncidents,
      meritIncidents: meritCount,
    },
    trends: months.map((m) => {
      const att = attByMonth.get(m.key) ?? { recorded: 0, absent: 0 };
      return {
        key: m.key,
        label: m.label,
        absentRatePct: att.recorded > 0 ? Math.round((att.absent / att.recorded) * 1000) / 10 : null,
        incidents: incidentsByMonth.get(m.key) ?? 0,
        merits: meritsByMonth.get(m.key) ?? 0,
        billedDiram: billedByMonth.get(m.key) ?? 0,
        collectedDiram: collectedByMonth.get(m.key) ?? 0,
      };
    }),
    atRisk,
  };
}
