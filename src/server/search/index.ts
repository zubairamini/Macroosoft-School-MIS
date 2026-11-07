// Permission-aware global search across students and applications.
// Results are pre-filtered by the caller's grants — no post-hoc filtering.

import { db } from "@/lib/db";
import { studentListWhere } from "@/server/rbac/scope";
import { can } from "@/server/rbac/scope";
import { normalizeDariText } from "@/server/shared/normalization";
import type { AuthContext } from "@/server/auth/context";

export interface SearchHit {
  kind: "student" | "application" | "user";
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

export async function globalSearch(ctx: AuthContext, q: string): Promise<SearchHit[]> {
  const trimmed = q.trim();
  if (trimmed.length < 2) return [];
  const nq = normalizeDariText(trimmed);
  const hits: SearchHit[] = [];

  // Students — scope-filtered
  const scope = await studentListWhere(ctx);
  if (scope !== null) {
    const rows = await db.student.findMany({
      where: {
        ...scope,
        OR: [
          { studentNumber: { contains: trimmed } },
          { personal: { contains: trimmed } },
          ...(nq !== trimmed ? [{ personal: { contains: nq } }] : []),
        ],
      },
      take: 8,
      include: {
        enrollments: {
          where: { academicYear: { isCurrent: true } },
          take: 1,
          include: { gradeLevel: { select: { nameDari: true } } },
        },
      },
    });
    for (const s of rows) {
      let p: Record<string, string> = {};
      try { p = JSON.parse(s.personal); } catch { /* noop */ }
      hits.push({
        kind: "student",
        id: s.id,
        title: `${p.firstName ?? ""} ${p.fatherName ?? ""}`.trim(),
        subtitle: `${s.studentNumber}${s.enrollments[0] ? ` — ${s.enrollments[0].gradeLevel.nameDari}` : ""}`,
        route: `#/students/${s.id}`,
      });
    }
  }

  // Applications
  if (can(ctx, "applications.view")) {
    const rows = await db.application.findMany({
      where: {
        OR: [
          { applicantNumber: { contains: trimmed } },
          { personal: { contains: trimmed } },
          ...(nq !== trimmed ? [{ personal: { contains: nq } }] : []),
        ],
      },
      take: 6,
      include: { gradeLevel: { select: { nameDari: true } } },
    });
    for (const a of rows) {
      let p: Record<string, string> = {};
      try { p = JSON.parse(a.personal); } catch { /* noop */ }
      hits.push({
        kind: "application",
        id: a.id,
        title: `${p.firstName ?? ""} ${p.fatherName ?? ""}`.trim(),
        subtitle: `${a.applicantNumber}${a.gradeLevel ? ` — ${a.gradeLevel.nameDari}` : ""}`,
        route: `#/admissions/${a.id}`,
      });
    }
  }

  // Users — admin/HR only
  if (can(ctx, "users.view")) {
    const rows = await db.user.findMany({
      where: {
        OR: [
          { fullName: { contains: trimmed } },
          { username: { contains: trimmed } },
        ],
      },
      take: 5,
      select: { id: true, fullName: true, username: true },
    });
    for (const u of rows) {
      hits.push({
        kind: "user",
        id: u.id,
        title: u.fullName,
        subtitle: `کاربر — ${u.username}`,
        route: `#/settings/users`,
      });
    }
  }

  return hits.slice(0, 20);
}
