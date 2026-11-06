// AuthContext: the authenticated request context (user + resolved grants)
// built from the session cookie on every API call.

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
  /** Active branch context chosen in the shell (server-verified). */
  branchId: string | null;
  ip: string | null;
}

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
  for (const row of roleRows) {
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

  // Server-side verification of the requested branch context: only accept
  // branches that actually belong to this organization.
  let branchId: string | null = null;
  if (branchIdFromClient) {
    const branch = await db.branch.findUnique({ where: { id: branchIdFromClient } });
    if (branch && branch.isActive) branchId = branch.id;
  }
  if (!branchId) {
    const primary = await db.branch.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "asc" },
    });
    branchId = primary?.id ?? null;
  }

  // Student-portal linkage: a User whose Guardian link points to students
  // is a parent; a student account links via guardian→students too. A
  // dedicated student account is linked through the first guardian row of
  // a student whose portalAccess user matches. For Phase 1 the student
  // portal account links directly by username stored on the student? No —
  // cleaner: student accounts link via User.guardianId on their OWN
  // guardian record with relationship "self". We resolve linkedStudentId
  // from a guardian row marked as the student's own account.
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
    roles: roleRows.map((r) => r.roleKey),
    grants,
    guardianId: user.guardianId,
    linkedStudentId,
    branchId,
    ip,
  };
}
