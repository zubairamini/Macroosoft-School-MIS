// Scope engine: resolves grants and enforces permission checks against
// concrete resources. Used by HTTP controllers, search, exports, and jobs.

import { db } from "@/lib/db";
import type { AuthContext } from "@/server/auth/context";
import type { ResolvedGrant } from "./permissions";
import { grantsForRole } from "./permissions";

export interface StudentScopeResource {
  studentId: string;
  /** Current-year enrollment context (nullable when never enrolled). */
  academicYearId?: string | null;
  classSectionId?: string | null;
  branchId?: string | null;
  /** Owning portal user (student accounts only). */
  studentUserId?: string | null;
}

/** Flat permission check, ignoring resource narrowing. */
export function can(ctx: AuthContext | null, permission: string): boolean {
  if (!ctx) return false;
  return ctx.grants.some((g) => g.permission === permission);
}

/** Grants usable without a concrete resource (e.g. settings screens). */
export function canAny(ctx: AuthContext | null, permission: string): boolean {
  return can(ctx, permission);
}

export async function canViewStudent(
  ctx: AuthContext,
  studentId: string,
): Promise<{ allowed: boolean; grant?: ResolvedGrant }> {
  const grants = ctx.grants.filter((g) => g.permission === "students.view");
  if (grants.length === 0) return { allowed: false };

  // Own-record scope (student portal account)
  if (ctx.linkedStudentId) {
    if (ctx.linkedStudentId === studentId) {
      const own = grants.find((g) => g.scope === "own");
      if (own) return { allowed: true, grant: own };
    }
  }

  // Guardian scope: explicit guardian-child links only.
  const guardianGrants = grants.filter((g) => g.scope === "guardian");
  if (guardianGrants.length > 0 && ctx.guardianId) {
    const link = await db.studentGuardian.findFirst({
      where: { studentId, guardianId: ctx.guardianId, contactRights: true },
      select: { id: true },
    });
    if (link) return { allowed: true, grant: guardianGrants[0] };
  }

  // Section scope (teacher): current enrollment inside assigned sections.
  const sectionGrants = grants.filter((g) => g.scope === "section");
  if (sectionGrants.length > 0) {
    const allowedSections = new Set(
      sectionGrants.flatMap((g) => g.sectionIds ?? []),
    );
    if (allowedSections.size > 0) {
      const enr = await db.enrollment.findFirst({
        where: { studentId, classSectionId: { in: [...allowedSections] } },
        select: { id: true },
      });
      if (enr) return { allowed: true, grant: sectionGrants[0] };
    }
  }

  // Branch scope: any enrollment in an allowed branch.
  const branchGrants = grants.filter((g) => g.scope === "branch");
  const withBranchParam = branchGrants.filter((g) => g.branchId);
  if (withBranchParam.length > 0) {
    const allowedBranches = withBranchParam.map((g) => g.branchId) as string[];
    const enr = await db.enrollment.findFirst({
      where: { studentId, classSection: { branchId: { in: allowedBranches } } },
      select: { id: true },
    });
    if (enr) return { allowed: true, grant: withBranchParam[0] };
  }
  if (branchGrants.some((g) => !g.branchId)) {
    // branch-scoped grant without narrowing parameter = all branches
    return { allowed: true, grant: branchGrants.find((g) => !g.branchId) };
  }

  // Organization-wide scope.
  if (grants.some((g) => g.scope === "all")) {
    return { allowed: true, grant: grants.find((g) => g.scope === "all") };
  }

  return { allowed: false };
}

/**
 * Prisma `where` for student LIST queries filtered by the viewer's
 * students.view grants. Returns null when the viewer has no usable grant.
 */
export async function studentListWhere(
  ctx: AuthContext,
): Promise<Record<string, unknown> | null> {
  const grants = ctx.grants.filter((g) => g.permission === "students.view");
  if (grants.length === 0) return null;

  const or: Record<string, unknown>[] = [];

  if (ctx.linkedStudentId) or.push({ id: ctx.linkedStudentId });

  if (ctx.guardianId && grants.some((g) => g.scope === "guardian")) {
    or.push({ guardians: { some: { guardianId: ctx.guardianId, contactRights: true } } });
  }

  const sectionGrants = grants.filter((g) => g.scope === "section");
  const sectionIds = sectionGrants.flatMap((g) => g.sectionIds ?? []);
  if (sectionGrants.length > 0 && sectionIds.length > 0) {
    or.push({ enrollments: { some: { classSectionId: { in: sectionIds } } } });
  }

  const branchGrants = grants.filter((g) => g.scope === "branch");
  const allowedBranches = branchGrants
    .map((g) => g.branchId)
    .filter((b): b is string => Boolean(b));
  if (branchGrants.length > 0) {
    if (allowedBranches.length > 0) {
      // Narrowed to specific branches on the user's role assignment.
      or.push({
        enrollments: { some: { classSection: { branchId: { in: allowedBranches } } } },
      });
    } else {
      // Branch-scoped grant WITHOUT narrowing parameter = all branches.
      // (Consistent with canViewStudent; the shell's branch context is a
      // display preference, not an authorization boundary.)
      return {};
    }
  }

  if (grants.some((g) => g.scope === "all")) return {};

  if (or.length === 0) {
    // Has grants but none usable without parameters → nothing visible.
    return { id: "__none__" };
  }
  return { OR: or };
}

/** Whether the viewer may see restricted personal fields on a student. */
export function canViewSensitive(ctx: AuthContext): boolean {
  return can(ctx, "students.view_sensitive");
}
