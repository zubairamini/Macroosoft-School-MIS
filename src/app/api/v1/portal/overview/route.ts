import type { NextRequest } from "next/server";
import { withApi } from "@/server/auth/guard";
import { jsonOk } from "@/server/shared/http";
import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";

function personalOf(raw: string | null | undefined): { firstName: string; fatherName: string } {
  try {
    const p = JSON.parse(raw ?? "{}");
    return { firstName: p.firstName ?? "", fatherName: p.fatherName ?? "" };
  } catch {
    return { firstName: "", fatherName: "" };
  }
}

/**
 * Guardian / student portal overview — ONE aggregate call:
 *   children (or self) → current enrollment, published results summary,
 *   attendance snapshot, outstanding fee balance, latest announcements.
 * Scope is derived from the session (guardianId / linkedStudentId) — never
 * from query parameters. Users without a portal linkage get an empty view.
 */
export const GET = withApi(
  {},
  async (_req: NextRequest, { auth }: { auth: AuthContext }) => {
    const org = await db.organization.findFirst({ select: { id: true, name: true } });
    const year = await db.academicYear.findFirst({
      where: { orgId: org?.id, isCurrent: true },
      select: { id: true, name: true },
    });

    // ── Resolve children (guardian) or self (student account) ─────────────
    let studentIds: string[] = [];
    if (auth.guardianId) {
      const links = await db.studentGuardian.findMany({
        where: { guardianId: auth.guardianId, contactRights: true },
        select: { studentId: true },
      });
      studentIds = links.map((l) => l.studentId);
    } else if (auth.linkedStudentId) {
      studentIds = [auth.linkedStudentId];
    }

    const children: Array<Record<string, unknown>> = [];

    for (const studentId of studentIds) {
      const student = await db.student.findUnique({
        where: { id: studentId },
        select: {
          id: true, studentNumber: true, personal: true, status: true,
          enrollments: {
            where: { academicYearId: year?.id ?? "" },
            include: {
              gradeLevel: { select: { nameDari: true } },
              classSection: {
                select: { id: true, label: true, branch: { select: { id: true, name: true } } },
              },
            },
            take: 1,
          },
        },
      });
      if (!student) continue;
      const p = personalOf(student.personal);
      const enr = student.enrollments[0];
      const sectionId = enr?.classSectionId ?? null;

      // Attendance snapshot over this section's submitted sessions.
      let attendance: Record<string, number> = { sessions: 0, present: 0, absent: 0, late: 0, excused: 0, notRecorded: 0 };
      if (sectionId) {
        const sessions = await db.attendanceSession.findMany({
          where: { classSectionId: sectionId, status: "submitted" },
          select: { id: true },
        });
        const sessionIds = sessions.map((s) => s.id);
        const records = sessionIds.length
          ? await db.attendanceRecord.findMany({
              where: { sessionId: { in: sessionIds }, studentId },
              select: { status: true },
            })
          : [];
        const agg: Record<string, number> = { sessions: sessions.length, present: 0, absent: 0, late: 0, excused: 0, notRecorded: 0 };
        for (const r of records) {
          if (r.status in agg) agg[r.status] += 1;
        }
        agg.notRecorded = Math.max(0, sessions.length - records.length);
        attendance = agg;
      }

      // Published subject averages (missing grades excluded — never zero).
      const grades: Array<Record<string, unknown>> = [];
      if (sectionId) {
        const assessments = await db.assessment.findMany({
          where: { classSectionId: sectionId, status: "published" },
          include: {
            subject: { select: { nameDari: true } },
            grades: { where: { studentId, score: { not: null } } },
          },
        });
        type Cell = { weightSum: number; scoreSum: number };
        const bySubject = new Map<string, Cell>();
        for (const a of assessments) {
          for (const g of a.grades) {
            if (g.score === null) continue;
            const cell = bySubject.get(a.subjectId) ?? { weightSum: 0, scoreSum: 0 };
            const max = a.maxScore || 100;
            const weight = a.weight || 1;
            cell.weightSum += weight;
            cell.scoreSum += (g.score / max) * weight;
            bySubject.set(a.subjectId, cell);
          }
        }
        const subjectNames = new Map(assessments.map((a) => [a.subjectId, a.subject.nameDari] as const));
        for (const [subjectId, cell] of bySubject) {
          if (cell.weightSum === 0) continue;
          grades.push({
            subjectId,
            subjectName: subjectNames.get(subjectId) ?? subjectId,
            averagePercent: Math.round((cell.scoreSum / cell.weightSum) * 100),
          });
        }
      }

      // Outstanding fee balance of live invoices.
      const invoices = await db.invoice.findMany({
        where: { studentId, status: { in: ["issued", "partially_paid"] } },
        select: { netDiram: true, paidDiram: true },
      });
      const balanceDiram = invoices.reduce((s, i) => s + Math.max(0, i.netDiram - i.paidDiram), 0);

      children.push({
        id: student.id,
        studentNumber: student.studentNumber,
        name: p.firstName,
        fatherName: p.fatherName,
        status: student.status,
        yearName: year?.name ?? null,
        gradeName: enr?.gradeLevel.nameDari ?? null,
        sectionLabel: enr?.classSection?.label ?? null,
        branchId: enr?.classSection?.branch.id ?? null,
        branchName: enr?.classSection?.branch.name ?? null,
        attendance,
        grades,
        outstandingBalanceDiram: balanceDiram,
      });
    }

    // ── Announcements for this portal user ─────────────────────────────────
    const announcements: Array<Record<string, unknown>> = [];
    if (children.length > 0) {
      const branchIds = children
        .map((c) => c.branchId)
        .filter((b): b is string => typeof b === "string" && b.length > 0);
      if (branchIds.length > 0) {
        const rows = await db.announcement.findMany({
          where: {
            status: "published",
            audience: auth.guardianId ? { in: ["all", "guardians"] } : "all",
            classSectionId: null,
            branchId: { in: branchIds },
          },
          orderBy: { publishedAt: "desc" },
          take: 10,
          include: {
            reads: { where: { userId: auth.user.id }, select: { id: true } },
          },
        });
        for (const r of rows) {
          announcements.push({
            id: r.id,
            title: r.title,
            body: r.body,
            publishedAt: r.publishedAt,
            readByMe: r.reads.length > 0,
          });
        }
      }
    }

    return jsonOk({
      isGuardian: Boolean(auth.guardianId),
      isStudent: Boolean(auth.linkedStudentId),
      orgName: org?.name ?? "",
      yearName: year?.name ?? null,
      children,
      announcements,
    });
  },
);
