// AuthContext: the authenticated request context (user + resolved grants)
// built from the session cookie on every API call.
//
// BRANCH ISOLATION (Phase 3 policy):
//   - `ownBranchIds` — branches bound to this user via UserRole assignments.
//   - `isCrossBranch` — true only for admin / general_manager: the only roles
//     allowed to see and touch data of every branch.
//   - `branchId` — the ACTIVE branch context. For cross-branch users it is
//     the branch they switched to (or null = all branches). For branch-bound
//     users the server FORCES it to one of their own branches; a client-sent
//     branch hint outside their own branches is ignored.

import type { ResolvedGrant } from "@/server/rbac/permissions";
import { grantsForRole } from "@/server/rbac/permissions";
import { db } from "@/lib/db";

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  mustChangePassword: boolean;
  guardianId: string | null;
}

export interface AuthContext {
  user: AuthUser;
  sessionId: string;
  roles: string[];
  grants: ResolvedGrant[];
  /** Guardian record linked to this account (parent portal). */
  guardianId: string | null;
  /** Student record linked to this account (student portal). */
  linkedStudentId: string | null;
  /** Branches this user is bound to (distinct UserRole.branchId values). */
  ownBranchIds: string[];
  /** Only admin / general_manager may work across branches. */
  isCrossBranch: boolean;
  /** Active branch context (server-verified & forced for branch-bound users;
   *  null = all branches, only meaningful for cross-branch users). */
  branchId: string | null;
  ip: string | null;
}

/** The only roles whose data access crosses branch boundaries. */
export const CROSS_BRANCH_ROLES = new Set(["admin", "general_manager"]);

export async function buildAuthContext(
  userId: string,
  sessionId: string,
  ip: string | null,
  branchIdFromClient: string | null,
): Promise<AuthContext | null> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) return null;

  const roleRows = await db.userRole.findMany({ where: { userId } });

  const grants: ResolvedGrant[] = [];
  const ownBranchIds = new Set<string>();
  for (const row of roleRows) {
    if (row.branchId) ownBranchIds.add(row.branchId);
    let sectionIds: string[] = [];
    try { sectionIds = JSON.parse(row.sectionIds ?? "[]"); } catch { sectionIds = []; }
    for (const g of grantsForRole(row.roleKey)) {
      grants.push({
        ...g,
        branchId: row.branchId ?? null,
        academicYearId: row.academicYearId ?? null,
        sectionIds,
      });
    }
  }

  const roles = roleRows.map((r) => r.roleKey);
  const isCrossBranch = roles.some((r) => CROSS_BRANCH_ROLES.has(r));

  // ── Active branch context resolution ────────────────────────────────────
  // Cross-branch users (admin / مدیر عام) choose freely among active org
  // branches (null = all branches). Branch-bound users are pinned to one of
  // their own branches; anything else they send is silently ignored.
  let branchId: string | null = null;
  const activeBranch = (id: string) =>
    db.branch.findUnique({ where: { id }, select: { id: true, isActive: true } });

  if (branchIdFromClient) {
    if (isCrossBranch) {
      const b = await activeBranch(branchIdFromClient);
      if (b && b.isActive) branchId = b.id;
    } else if (ownBranchIds.has(branchIdFromClient)) {
      branchId = branchIdFromClient;
    }
  }

  if (!branchId && !isCrossBranch && ownBranchIds.size > 0) {
    // Pin to the earliest-created bound branch (stable default).
    const own = await db.branch.findMany({
      where: { id: { in: [...ownBranchIds] }, isActive: true },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    branchId = own[0]?.id ?? null;
  }

  // Student-portal linkage: a User whose Guardian link points to students
  // is a parent; a student account links via guardian→students too. A
  // dedicated student account is linked through a guardian row marked as
  // the student's own account.
  let linkedStudentId: string | null = null;
  if (user.guardianId) {
    const selfLink = await db.studentGuardian.findFirst({
      where: { guardianId: user.guardianId, relationship: "خودِ شاگرد" },
      select: { studentId: true },
    });
    linkedStudentId = selfLink?.studentId ?? null;
  }

  return {
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      email: user.email,
      isActive: user.isActive,
      mustChangePassword: user.mustChangePassword,
      guardianId: user.guardianId,
    },
    sessionId,
    roles,
    grants,
    guardianId: user.guardianId,
    linkedStudentId,
    ownBranchIds: [...ownBranchIds],
    isCrossBranch,
    branchId,
    ip,
  };
}
