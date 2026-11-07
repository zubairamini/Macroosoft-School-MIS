// Role-aware dashboard KPIs. Every KPI has a defined calculation and is
// computed from live data with the caller's scope applied.

import { db } from "@/lib/db";
import { studentListWhere, sectionListWhere, directBranchFilter } from "@/server/rbac/scope";
import { todayIsoKabul, jalaliWeekdayName, formatJalali, afghanWeekdayIndex } from "@/server/shared/jalali";
import type { AuthContext } from "@/server/auth/context";
import { can } from "@/server/rbac/scope";

export async function dashboardSummary(ctx: AuthContext) {
  const org = await db.organization.findFirst();
  const currentYear = await db.academicYear.findFirst({
    where: { isCurrent: true },
  });

  const base: Record<string, unknown> = {
    orgName: org?.name ?? "",
    productName: org?.productName ?? "مکتب‌یار",
    academicYearName: currentYear?.name ?? null,
    today: todayIsoKabul(),
    todayJalali: formatJalali(todayIsoKabul()),
    weekday: jalaliWeekdayName(todayIsoKabul()),
    roleKeys: ctx.roles,
  };

  // ── Student KPIs (scoped) ─────────────────────────────────────────────
  const scope = await studentListWhere(ctx);
  if (scope !== null) {
    const where = { ...scope };
    const [totalStudents, activeStudents, maleCount, femaleCount] = await Promise.all([
      db.student.count({ where }),
      db.student.count({ where: { ...where, status: "active" } }),
      // Gender lives in the personal JSON; counted via contains on markers
      db.student.count({ where: { ...where, personal: { contains: '"gender":"male"' } } }),
      db.student.count({ where: { ...where, personal: { contains: '"gender":"female"' } } }),
    ]);
    base.students = { total: totalStudents, active: activeStudents, male: maleCount, female: femaleCount };
  } else {
    base.students = null;
  }

  // ── Application funnel (permission-aware) ──────────────────────────────
  if (can(ctx, "applications.view") && currentYear) {
    const branchScope = directBranchFilter(ctx, "applications.view");
    const groups = await db.application.groupBy({
      by: ["status"],
      where: {
        academicYearId: currentYear.id,
        ...(branchScope?.branchIds ? { branchId: { in: branchScope.branchIds } } : {}),
      },
      _count: { _all: true },
    });
    base.applications = groups.map((g) => ({
      status: g.status,
      count: g._count._all,
    }));
  } else {
    base.applications = null;
  }

  // ── Sections & capacity (academic.view) ────────────────────────────────
  if (can(ctx, "academic.view") && currentYear) {
    const scopeWhere = await sectionListWhere(ctx, "academic.view");
    const sections = scopeWhere === null
      ? []
      : await db.classSection.findMany({
          where: { academicYearId: currentYear.id, ...scopeWhere },
          include: {
            gradeLevel: { select: { nameDari: true } },
            _count: { select: { enrollments: { where: { status: "active" } } } },
          },
          orderBy: { gradeLevelId: "asc" },
        });
    base.sections = {
      count: sections.length,
      totalCapacity: sections.reduce((s, x) => s + x.capacity, 0),
      totalEnrolled: sections.reduce((s, x) => s + x._count.enrollments, 0),
      byGrade: sections.map((s) => ({
        gradeName: s.gradeLevel.nameDari,
        label: s.label,
        enrolled: s._count.enrollments,
        capacity: s.capacity,
      })),
    };
  }

  // ── Teacher's assigned sections ────────────────────────────────────────
  const sectionIds = ctx.grants.flatMap((g) => g.sectionIds ?? []);
  if (sectionIds.length > 0) {
    const assigned = await db.classSection.findMany({
      where: { id: { in: sectionIds } },
      include: {
        gradeLevel: { select: { nameDari: true } },
        _count: { select: { enrollments: { where: { status: "active" } } } },
      },
    });
    base.assignedSections = assigned.map((s) => ({
      id: s.id,
      gradeName: s.gradeLevel.nameDari,
      label: s.label,
      students: s._count.enrollments,
    }));
  }

  // ── Parent's children ──────────────────────────────────────────────────
  if (ctx.guardianId) {
    const links = await db.studentGuardian.findMany({
      where: { guardianId: ctx.guardianId },
      include: {
        student: {
          include: {
            enrollments: {
              where: { academicYearId: currentYear?.id },
              take: 1,
              include: {
                gradeLevel: { select: { nameDari: true } },
                classSection: { select: { label: true } },
              },
            },
          },
        },
      },
    });
    base.children = links
      .filter((l) => l.contactRights)
      .map((l) => {
        let firstName = "";
        try { firstName = JSON.parse(l.student.personal).firstName ?? ""; } catch { /* noop */ }
        const e = l.student.enrollments[0];
        return {
          studentId: l.student.id,
          studentNumber: l.student.studentNumber,
          firstName,
          gradeName: e?.gradeLevel.nameDari ?? null,
          sectionLabel: e?.classSection?.label ?? null,
          status: l.student.status,
        };
      });
  }

  // ── Recent audit (audit.view) ──────────────────────────────────────────
  if (can(ctx, "audit.view")) {
    const events = await db.auditEvent.findMany({ orderBy: { at: "desc" }, take: 8 });
    base.recentAudit = events.map((e) => ({
      id: e.id,
      action: e.action,
      actorName: e.actorName,
      entity: e.entity,
      at: e.at,
    }));
  }

  // ── Unread notifications ───────────────────────────────────────────────
  const unread = await db.notification.count({
    where: { userId: ctx.user.id, isRead: false },
  });
  base.unreadNotifications = unread;

  // ── Phase 2: teaching KPIs (teacher with a linked staff record) ────────
  if (can(ctx, "attendance.record") || can(ctx, "timetable.view")) {
    const staff = await db.staffMember.findFirst({
      where: { userId: ctx.user.id },
      select: { id: true },
    });
    if (staff) {
      const today = todayIsoKabul();
      const ownIds = new Set(sectionIds);
      // Today's open attendance sessions in the teacher's sections — the
      // "record it before it locks" nudge.
      const openToday = await db.attendanceSession.findMany({
        where: {
          date: today,
          status: "open",
          ...(ownIds.size > 0 ? { classSectionId: { in: [...ownIds] } } : { recordedById: staff.id }),
        },
        include: {
          classSection: { select: { id: true, label: true, gradeLevel: { select: { nameDari: true } } } },
        },
        take: 6,
      });
      base.attendanceToday = openToday.map((s) => ({
        id: s.id,
        sectionId: s.classSection.id,
        gradeName: s.classSection.gradeLevel.nameDari,
        sectionLabel: s.classSection.label,
      }));
      // Next classes today from the weekly timetable (Afghan weekday index).
      const weekday = afghanWeekdayIndex(today);
      if (weekday >= 0) {
        const nextSlots = await db.timetableSlot.findMany({
          where: { staffId: staff.id, weekday },
          include: {
            classSection: { select: { label: true, gradeLevel: { select: { nameDari: true } } } },
            subject: { select: { nameDari: true } },
          },
          orderBy: { period: "asc" },
        });
        base.todayClasses = nextSlots.map((t) => ({
          period: t.period,
          subjectName: t.subject?.nameDari ?? "—",
          gradeName: t.classSection.gradeLevel.nameDari,
          sectionLabel: t.classSection.label,
          roomName: t.roomName,
        }));
      }
    }
  }

  // ── Phase 2: recent published grades (student / parent portals) ────────
  if (can(ctx, "grades.view") && (ctx.linkedStudentId || ctx.guardianId)) {
    const studentIds = ctx.linkedStudentId
      ? [ctx.linkedStudentId]
      : ctx.guardianId
        ? (await db.studentGuardian.findMany({
            where: { guardianId: ctx.guardianId, contactRights: true },
            select: { studentId: true },
          })).map((l) => l.studentId)
        : [];
    if (studentIds.length > 0) {
      const rows = await db.grade.findMany({
        where: { studentId: { in: studentIds }, assessment: { status: "published" } },
        include: {
          assessment: {
            select: { id: true, title: true, maxScore: true, subject: { select: { nameDari: true } } },
          },
          student: { select: { id: true, personal: true } },
        },
        orderBy: { updatedAt: "desc" },
        take: 6,
      });
      base.recentGrades = rows.map((r) => {
        let firstName = "";
        try { firstName = JSON.parse(r.student.personal).firstName ?? ""; } catch { /* noop */ }
        return {
          studentId: r.studentId,
          firstName,
          title: r.assessment.title,
          subjectName: r.assessment.subject.nameDari,
          score: r.score,
          maxScore: r.assessment.maxScore,
          isAbsent: r.isAbsent,
          at: r.updatedAt,
        };
      });
    }
  }

  // ── Phase 2: attendance KPIs for managers (branch overview) ────────────
  if (can(ctx, "attendance.view") && !can(ctx, "attendance.record") && currentYear) {
    const today = todayIsoKabul();
    const scopeWhere = await sectionListWhere(ctx, "attendance.view");
    const sectionFilter = scopeWhere === null ? { id: "__none__" } : scopeWhere;
    const [submittedToday, openTodayCount] = await Promise.all([
      db.attendanceSession.count({ where: { date: today, status: "submitted", classSection: sectionFilter } }),
      db.attendanceSession.count({ where: { date: today, status: "open", classSection: sectionFilter } }),
    ]);
    base.attendanceOverviewToday = { submitted: submittedToday, open: openTodayCount };
  }

  return base;
}
