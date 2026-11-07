// Scope engine: resolves grants and enforces permission checks against
// concrete resources. Used by HTTP controllers, search, exports, and jobs.
//
// BRANCH ISOLATION (Phase 3, fail-closed):
//   A branch-scoped grant WITHOUT a concrete UserRole.branchId grants
//   NOTHING. Before Phase 3 it meant "all branches"; under the strict
//   isolation policy only scope "all" (admin / general_manager) crosses
//   branch boundaries. Every list helper below enforces this.

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

// ── Branch scope helpers ────────────────────────────────────────────────────

/** Concrete branch ids that narrow the viewer's branch-scoped grants for
 *  `permission`. `null` = not branch-narrowed (all-scope grant or no grant);
 *  an empty array = branch-scoped grants whose UserRole rows carry no
 *  branchId → NOTHING is visible (fail closed). */
export function branchIdsFor(ctx: AuthContext, permission: string): string[] | null {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return null;
  if (grants.some((g) => g.scope === "all")) return null;
  return [
    ...new Set(
      grants
        .filter((g) => g.scope === "branch" && g.branchId)
        .map((g) => g.branchId as string),
    ),
  ];
}

/** Whether the viewer may act on data of `branchId` under `permission`.
 *  All-scope grants (admin / مدیر عام) pass for any branch. */
export function canAccessBranch(
  ctx: AuthContext,
  permission: string,
  branchId: string,
): boolean {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return false;
  if (grants.some((g) => g.scope === "all")) return true;
  return grants.some((g) => g.scope === "branch" && g.branchId === branchId);
}

/** Branch narrowing for models with a DIRECT branchId column (FeeStructure,
 *  Invoice, Payment, Expense, PayrollRun, StaffMember, …).
 *  Returns `null` when the viewer has no grant at all (caller: deny/empty),
 *  `{ branchIds: null }` for unrestricted (all-scope, no active context),
 *  or a concrete branch id list otherwise — which may be ["__none__"] when
 *  branch-scoped grants carry no branch parameter (fail closed). */
export function directBranchFilter(
  ctx: AuthContext,
  permission: string,
): { branchIds: string[] | null } | null {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return null;
  if (grants.some((g) => g.scope === "all")) {
    // Cross-branch authority narrowed to the active branch context.
    return { branchIds: ctx.branchId ? [ctx.branchId] : null };
  }
  const ids = branchIdsFor(ctx, permission) ?? [];
  if (ids.length === 0) return { branchIds: ["__none__"] };
  return { branchIds: ids };
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

  // Branch scope: any enrollment in an explicitly bound branch. A branch
  // grant WITHOUT a branchId grants nothing (strict isolation).
  const withBranchParam = grants.filter((g) => g.scope === "branch" && g.branchId);
  if (withBranchParam.length > 0) {
    const allowedBranches = withBranchParam.map((g) => g.branchId) as string[];
    const enr = await db.enrollment.findFirst({
      where: { studentId, classSection: { branchId: { in: allowedBranches } } },
      select: { id: true },
    });
    if (enr) return { allowed: true, grant: withBranchParam[0] };
  }

  // Organization-wide scope (admin / general_manager).
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

  // Branch scope — ONLY grants with a concrete branchId contribute.
  const branchGrants = grants.filter((g) => g.scope === "branch");
  const allowedBranches = branchGrants
    .map((g) => g.branchId)
    .filter((b): b is string => Boolean(b));
  if (allowedBranches.length > 0) {
    or.push({
      enrollments: { some: { classSection: { branchId: { in: allowedBranches } } } },
    });
  }

  // Organization-wide scope (admin / مدیر عام), narrowed by the active
  // branch context when one is selected in the shell.
  if (grants.some((g) => g.scope === "all")) {
    return ctx.branchId
      ? { enrollments: { some: { classSection: { branchId: ctx.branchId } } } }
      : {};
  }

  if (or.length === 0) {
    // Has grants but none usable without parameters (e.g. branch grant
    // without a UserRole.branchId) → strict isolation: nothing visible.
    return { id: "__none__" };
  }
  return { OR: or };
}

/** Whether the viewer may see restricted personal fields on a student. */
export function canViewSensitive(ctx: AuthContext): boolean {
  return can(ctx, "students.view_sensitive");
}

// ── Phase 2: section, staff & teaching-assignment scoping ──────────────────

/**
 * Section ids the viewer may act on for `permission` via section-scoped
 * grants. `null` means "not narrowed by section" (all/branch grants — the
 * caller must then apply branch narrowing separately or allow everything).
 * An empty array means a teacher whose grants carry no sections: nothing.
 */
export function sectionIdsFor(ctx: AuthContext, permission: string): string[] | null {
  const sectionGrants = ctx.grants.filter(
    (g) => g.permission === permission && g.scope === "section",
  );
  if (sectionGrants.length === 0) return null;
  const ids = sectionGrants.flatMap((g) => g.sectionIds ?? []);
  return [...new Set(ids)];
}

export async function canAccessSection(
  ctx: AuthContext,
  permission: string,
  sectionId: string,
): Promise<boolean> {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return false;

  if (grants.some((g) => g.scope === "all")) return true;

  const sectionIds = sectionIdsFor(ctx, permission);
  if (sectionIds && sectionIds.includes(sectionId)) return true;

  // Branch scope — ONLY concrete branchIds count (fail closed otherwise).
  const branchIds = grants
    .filter((g) => g.scope === "branch" && g.branchId)
    .map((g) => g.branchId as string);
  if (branchIds.length > 0) {
    const section = await db.classSection.findUnique({
      where: { id: sectionId },
      select: { branchId: true },
    });
    if (section && branchIds.includes(section.branchId)) return true;
  }
  return false;
}

/** Prisma `where` for ClassSection LIST queries filtered by the viewer's
 *  grants for `permission`. Returns null when the viewer has no grant. */
export async function sectionListWhere(
  ctx: AuthContext,
  permission: string,
): Promise<Record<string, unknown> | null> {
  const grants = ctx.grants.filter((g) => g.permission === permission);
  if (grants.length === 0) return null;
  if (grants.some((g) => g.scope === "all")) {
    // Cross-branch: narrowed by the active branch context when selected.
    return ctx.branchId ? { branchId: ctx.branchId } : {};
  }

  const or: Record<string, unknown>[] = [];
  const sectionIds = sectionIdsFor(ctx, permission);
  if (sectionIds && sectionIds.length > 0) or.push({ id: { in: sectionIds } });

  // Branch scope — ONLY concrete branchIds count (fail closed otherwise).
  const branchIds = grants
    .filter((g) => g.scope === "branch" && g.branchId)
    .map((g) => g.branchId as string);
  if (branchIds.length > 0) or.push({ branchId: { in: branchIds } });

  if (or.length === 0) return { id: "__none__" };
  return { OR: or };
}

/** The StaffMember linked to the signed-in user's account, if any. */
export async function staffForUser(userId: string): Promise<{ id: string } | null> {
  return db.staffMember.findFirst({ where: { userId }, select: { id: true } });
}

/** Teaching-assignment sections for the signed-in user's staff record in the
 *  given academic year (optionally narrowed to one subject). */
export async function teachingSections(
  userId: string,
  academicYearId: string | null,
): Promise<string[]> {
  const staff = await staffForUser(userId);
  if (!staff) return [];
  const rows = await db.teachingAssignment.findMany({
    where: {
      staffId: staff.id,
      ...(academicYearId ? { academicYearId } : {}),
    },
    select: { classSectionId: true },
  });
  return [...new Set(rows.map((r) => r.classSectionId))];
}

/** Whether the signed-in user's staff record teaches `subjectId` in
 *  `sectionId` during `academicYearId` (the binding teaching contract). */
export async function teachesSubject(
  userId: string,
  academicYearId: string,
  classSectionId: string,
  subjectId: string,
): Promise<boolean> {
  const staff = await staffForUser(userId);
  if (!staff) return false;
  const row = await db.teachingAssignment.findFirst({
    where: { academicYearId, classSectionId, subjectId, staffId: staff.id },
    select: { id: true },
  });
  return Boolean(row);
}
