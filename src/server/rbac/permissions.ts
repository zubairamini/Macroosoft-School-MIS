// ─────────────────────────────────────────────────────────────────────────────
// Permission catalog, default role matrix, and scope definitions.
// This file is the single source of truth for authorization. The HTTP layer,
// background jobs, exports and searches all consult it.
//
// Principles:
//  - Hiding a menu is NOT authorization. Every endpoint enforces permissions.
//  - Role permissions are combined with scope parameters on the user's role
//    assignment (branch / academic year / class sections / own / guardian).
//  - System configuration (settings.manage) is deliberately separate from
//    business approvals (applications.review) and restricted personal data
//    (students.view_sensitive).
// ─────────────────────────────────────────────────────────────────────────────

export const PERMISSIONS = [
  "dashboard.view",
  "students.view",
  "students.view_sensitive",
  "students.create",
  "students.update",
  "students.export",
  "applications.view",
  "applications.create",
  "applications.update",
  "applications.submit",
  "applications.review",
  "applications.enroll",
  "guardians.view",
  "guardians.manage",
  "academic.view",
  "academic.manage",
  "settings.view",
  "settings.manage",
  "users.view",
  "users.manage",
  "roles.view",
  "audit.view",
  "notifications.view",
  "search.use",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export type ScopeKind =
  | "all"       // whole organization
  | "branch"    // narrowed by UserRole.branchId (null param = all branches)
  | "year"      // narrowed by UserRole.academicYearId
  | "section"   // narrowed by UserRole.sectionIds (teacher assignments)
  | "own"       // the signed-in student's own record
  | "guardian"; // records of children linked to the signed-in guardian

export interface Grant {
  permission: Permission;
  scope: ScopeKind;
}

export interface ResolvedGrant extends Grant {
  /** Narrowing parameters taken from the user's role assignment row. */
  branchId: string | null;      // null = all branches
  academicYearId: string | null; // null = all years
  sectionIds: string[];
}

export const ROLE_KEYS = [
  "admin",
  "manager",
  "academic_manager",
  "registrar",
  "finance_officer",
  "cashier",
  "teacher",
  "librarian",
  "hr_officer",
  "student",
  "parent",
  "auditor",
] as const;

export type RoleKey = (typeof ROLE_KEYS)[number];

export const ROLE_LABELS_DARI: Record<RoleKey, string> = {
  admin: "مدیر سیستم",
  manager: "مدیر مکتب",
  academic_manager: "مدیر تعلیمی",
  registrar: "مسجل",
  finance_officer: "مسئول مالی",
  cashier: "صندوقدار",
  teacher: "استاد",
  librarian: "کتاب‌دار",
  hr_officer: "مسئول منابع بشری",
  student: "شاگرد",
  parent: "ولی",
  auditor: "بازرس",
};

/**
 * Default role → grant matrix.
 * Scope parameters (which branch / year / sections / which child) are
 * resolved per-user from their UserRole assignment rows.
 */
export const ROLE_MATRIX: Record<RoleKey, Grant[]> = {
  admin: [
    // Technical administration. Sensitive business approvals are NOT here.
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "all" },
    { permission: "students.view_sensitive", scope: "all" },
    { permission: "students.create", scope: "all" },
    { permission: "students.update", scope: "all" },
    { permission: "students.export", scope: "all" },
    { permission: "applications.view", scope: "all" },
    { permission: "applications.create", scope: "all" },
    { permission: "applications.update", scope: "all" },
    { permission: "applications.submit", scope: "all" },
    { permission: "applications.enroll", scope: "all" },
    { permission: "guardians.view", scope: "all" },
    { permission: "guardians.manage", scope: "all" },
    { permission: "academic.view", scope: "all" },
    { permission: "academic.manage", scope: "all" },
    { permission: "settings.view", scope: "all" },
    { permission: "settings.manage", scope: "all" },
    { permission: "users.view", scope: "all" },
    { permission: "users.manage", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "audit.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "all" },
    // NOTE: applications.review is intentionally NOT granted to admin by
    // default — technical settings and admission decisions stay separate.
  ],
  manager: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "branch" },
    { permission: "students.view_sensitive", scope: "branch" },
    { permission: "students.export", scope: "branch" },
    { permission: "applications.view", scope: "branch" },
    { permission: "applications.review", scope: "branch" },
    { permission: "applications.enroll", scope: "branch" },
    { permission: "guardians.view", scope: "branch" },
    { permission: "academic.view", scope: "branch" },
    { permission: "academic.manage", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "users.view", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "audit.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
  academic_manager: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "branch" },
    { permission: "students.update", scope: "branch" },
    { permission: "students.export", scope: "branch" },
    { permission: "applications.view", scope: "branch" },
    { permission: "applications.enroll", scope: "branch" },
    { permission: "guardians.view", scope: "branch" },
    { permission: "academic.view", scope: "branch" },
    { permission: "academic.manage", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
  registrar: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "branch" },
    { permission: "students.view_sensitive", scope: "branch" },
    { permission: "students.create", scope: "branch" },
    { permission: "students.update", scope: "branch" },
    { permission: "students.export", scope: "branch" },
    { permission: "applications.view", scope: "branch" },
    { permission: "applications.create", scope: "branch" },
    { permission: "applications.update", scope: "branch" },
    { permission: "applications.submit", scope: "branch" },
    { permission: "applications.enroll", scope: "branch" },
    { permission: "guardians.view", scope: "branch" },
    { permission: "guardians.manage", scope: "branch" },
    { permission: "academic.view", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
  finance_officer: [
    { permission: "dashboard.view", scope: "all" },
    // Basic student visibility for collection; NO sensitive fields.
    { permission: "students.view", scope: "all" },
    { permission: "guardians.view", scope: "all" },
    { permission: "settings.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "all" },
  ],
  cashier: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "all" },
    { permission: "search.use", scope: "all" },
    { permission: "notifications.view", scope: "own" },
  ],
  teacher: [
    { permission: "dashboard.view", scope: "all" },
    // Only students in assigned class sections; no sensitive fields.
    { permission: "students.view", scope: "section" },
    { permission: "academic.view", scope: "branch" },
    { permission: "roles.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "section" },
  ],
  librarian: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "all" },
    { permission: "search.use", scope: "all" },
    { permission: "notifications.view", scope: "own" },
  ],
  hr_officer: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "users.view", scope: "all" },
    { permission: "settings.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "all" },
  ],
  student: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "own" },
    { permission: "notifications.view", scope: "own" },
  ],
  parent: [
    { permission: "dashboard.view", scope: "all" },
    // Only explicitly linked children — enforced by guardian scope checks.
    { permission: "students.view", scope: "guardian" },
    { permission: "notifications.view", scope: "own" },
  ],
  auditor: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "all" },
    { permission: "applications.view", scope: "all" },
    { permission: "guardians.view", scope: "all" },
    { permission: "academic.view", scope: "all" },
    { permission: "settings.view", scope: "all" },
    { permission: "users.view", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "audit.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "all" },
  ],
};

export function grantsForRole(roleKey: string): Grant[] {
  return (ROLE_MATRIX as Record<string, Grant[]>)[roleKey] ?? [];
}

export function isValidRoleKey(key: string): key is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(key);
}
