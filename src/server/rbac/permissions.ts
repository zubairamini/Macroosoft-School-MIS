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
  // ── Phase 2: staff, timetable, attendance, exams & grades ─────────
  "staff.view",
  "staff.manage",
  "timetable.view",
  "timetable.manage",
  "attendance.view",
  "attendance.record",
  "attendance.correct",
  "assessments.view",
  "assessments.manage",
  "grades.enter",
  "grades.view",
  // ── Phase 3: fees, invoices, payments, expenses, payroll ───────────
  "fees.view",
  "fees.manage",
  "invoices.view",
  "invoices.manage",
  "payments.view",
  "payments.collect",
  "payments.void",
  "expenses.view",
  "expenses.manage",
  "payroll.view",
  "payroll.manage",
  // ── Phase 4: library, announcements, messages ────────────────
  "library.view",
  "library.manage",
  "announcements.view",
  "announcements.manage",
  // ── Phase 5: services, reports, year-end rollover ────────────
  "services.view",
  "services.manage",
  "reports.view",
  "year_end.manage",
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
  "general_manager",
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
  general_manager: "مدیر عام (همه شعبه‌ها)",
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
 * BRANCH ISOLATION (Phase 3 policy):
 *  - Only `admin` and `general_manager` hold "all"-scoped DATA grants and
 *    may work across branches (with an optional branch context switcher).
 *  - Every other role's data grants are branch-scoped and REQUIRE a concrete
 *    UserRole.branchId. The scope engine fails closed when the parameter is
 *    missing — a branch-scoped grant without a branch sees NOTHING.
 *  - Org-level meta permissions (settings.view, roles.view, audit.view) may
 *    stay "all": they expose system metadata, not branch business data.
 */

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
    // Phase 2 — system administration keeps manage rights for structure
    // (staff/timetable), plus read-only oversight of academic records.
    { permission: "staff.view", scope: "all" },
    { permission: "staff.manage", scope: "all" },
    { permission: "timetable.view", scope: "all" },
    { permission: "timetable.manage", scope: "all" },
    { permission: "attendance.view", scope: "all" },
    { permission: "assessments.view", scope: "all" },
    { permission: "grades.view", scope: "all" },
    // Phase 3 — system administration configures finance structures too.
    { permission: "fees.view", scope: "all" },
    { permission: "fees.manage", scope: "all" },
    { permission: "invoices.view", scope: "all" },
    { permission: "invoices.manage", scope: "all" },
    { permission: "payments.view", scope: "all" },
    { permission: "payments.void", scope: "all" },
    { permission: "expenses.view", scope: "all" },
    { permission: "expenses.manage", scope: "all" },
    { permission: "payroll.view", scope: "all" },
    { permission: "payroll.manage", scope: "all" },
    // Phase 4 — system administration configures the library & comms too.
    { permission: "library.view", scope: "all" },
    { permission: "library.manage", scope: "all" },
    { permission: "announcements.view", scope: "all" },
    { permission: "announcements.manage", scope: "all" },
    // Phase 5 — services, registry reports and the year-end rollover.
    { permission: "services.view", scope: "all" },
    { permission: "services.manage", scope: "all" },
    { permission: "reports.view", scope: "all" },
    { permission: "year_end.manage", scope: "all" },
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
  general_manager: [
    // مدیر عام — org-wide business authority across ALL branches. Sees every
    // branch's data, approves finance, and steers admissions; still separate
    // from admin's technical duties (no settings.manage / users.manage).
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "all" },
    { permission: "students.view_sensitive", scope: "all" },
    { permission: "students.update", scope: "all" },
    { permission: "students.export", scope: "all" },
    { permission: "applications.view", scope: "all" },
    { permission: "applications.review", scope: "all" },
    { permission: "applications.enroll", scope: "all" },
    { permission: "guardians.view", scope: "all" },
    { permission: "academic.view", scope: "all" },
    { permission: "academic.manage", scope: "all" },
    { permission: "staff.view", scope: "all" },
    { permission: "timetable.view", scope: "all" },
    { permission: "attendance.view", scope: "all" },
    { permission: "attendance.correct", scope: "all" },
    { permission: "assessments.view", scope: "all" },
    { permission: "assessments.manage", scope: "all" },
    { permission: "grades.view", scope: "all" },
    // Phase 3 — full finance authority across branches.
    { permission: "fees.view", scope: "all" },
    { permission: "fees.manage", scope: "all" },
    { permission: "invoices.view", scope: "all" },
    { permission: "invoices.manage", scope: "all" },
    { permission: "payments.view", scope: "all" },
    { permission: "payments.void", scope: "all" },
    { permission: "expenses.view", scope: "all" },
    { permission: "expenses.manage", scope: "all" },
    { permission: "payroll.view", scope: "all" },
    { permission: "payroll.manage", scope: "all" },
    // Phase 4 — library & communications authority across branches.
    { permission: "library.view", scope: "all" },
    { permission: "library.manage", scope: "all" },
    { permission: "announcements.view", scope: "all" },
    { permission: "announcements.manage", scope: "all" },
    // Phase 5 — services, reports, and the year-end rollover (one of the
    // only two roles allowed to close the academic year org-wide).
    { permission: "services.view", scope: "all" },
    { permission: "services.manage", scope: "all" },
    { permission: "reports.view", scope: "all" },
    { permission: "year_end.manage", scope: "all" },
    { permission: "settings.view", scope: "all" },
    { permission: "users.view", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "audit.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "all" },
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
    // Phase 2 — business approval of academic records (publish/correct).
    { permission: "staff.view", scope: "branch" },
    { permission: "timetable.view", scope: "branch" },
    { permission: "timetable.manage", scope: "branch" },
    { permission: "attendance.view", scope: "branch" },
    { permission: "attendance.correct", scope: "branch" },
    { permission: "assessments.view", scope: "branch" },
    { permission: "assessments.manage", scope: "branch" },
    { permission: "grades.view", scope: "branch" },
    // Phase 3 — read-only financial oversight of the manager's OWN branch.
    { permission: "invoices.view", scope: "branch" },
    { permission: "payments.view", scope: "branch" },
    { permission: "expenses.view", scope: "branch" },
    { permission: "payroll.view", scope: "branch" },
    // Phase 4 — branch announcements & library oversight.
    { permission: "library.view", scope: "branch" },
    { permission: "library.manage", scope: "branch" },
    { permission: "announcements.view", scope: "branch" },
    { permission: "announcements.manage", scope: "branch" },
    // Phase 5 — services & reports of the manager's OWN branch.
    { permission: "services.view", scope: "branch" },
    { permission: "services.manage", scope: "branch" },
    { permission: "reports.view", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "users.view", scope: "branch" },
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
    // Phase 2 — academic manager defines exams/timetable, may substitute
    // grade entry, and approves publishing.
    { permission: "staff.view", scope: "branch" },
    { permission: "timetable.view", scope: "branch" },
    { permission: "timetable.manage", scope: "branch" },
    { permission: "attendance.view", scope: "branch" },
    { permission: "attendance.correct", scope: "branch" },
    { permission: "assessments.view", scope: "branch" },
    { permission: "assessments.manage", scope: "branch" },
    { permission: "grades.enter", scope: "branch" },
    { permission: "grades.view", scope: "branch" },
    // Phase 4 — branch announcements & library visibility.
    { permission: "library.view", scope: "branch" },
    { permission: "announcements.view", scope: "branch" },
    { permission: "announcements.manage", scope: "branch" },
    // Phase 5 — services & registry reports of the OWN branch.
    { permission: "services.view", scope: "branch" },
    { permission: "reports.view", scope: "branch" },
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
    // Phase 2 — registrars consult attendance reports while handling records
    // and print report cards from published results (no grade entry).
    { permission: "attendance.view", scope: "branch" },
    { permission: "grades.view", scope: "branch" },
    // Phase 4 — registrars read branch announcements & the library.
    { permission: "library.view", scope: "branch" },
    { permission: "announcements.view", scope: "branch" },
    // Phase 5 — registry reports of the OWN branch.
    { permission: "services.view", scope: "branch" },
    { permission: "reports.view", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "roles.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
  finance_officer: [
    { permission: "dashboard.view", scope: "all" },
    // Branch-bound basic student visibility for collection; NO sensitive
    // fields (Phase 3 strict isolation: requires UserRole.branchId).
    { permission: "students.view", scope: "branch" },
    { permission: "guardians.view", scope: "branch" },
    // Phase 3 — owns the fee/billing cycle of the branch.
    { permission: "fees.view", scope: "branch" },
    { permission: "fees.manage", scope: "branch" },
    { permission: "invoices.view", scope: "branch" },
    { permission: "invoices.manage", scope: "branch" },
    { permission: "payments.view", scope: "branch" },
    { permission: "payments.collect", scope: "branch" },
    { permission: "payments.void", scope: "branch" },
    { permission: "expenses.view", scope: "branch" },
    { permission: "expenses.manage", scope: "branch" },
    { permission: "payroll.view", scope: "branch" },
    { permission: "payroll.manage", scope: "branch" },
    // Phase 4/5 — announcements + finance registry reports.
    { permission: "announcements.view", scope: "branch" },
    { permission: "reports.view", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
  cashier: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "branch" },
    // Phase 3 — collects payments against invoices of the cashier's branch.
    { permission: "invoices.view", scope: "branch" },
    { permission: "payments.view", scope: "branch" },
    { permission: "payments.collect", scope: "branch" },
    // Phase 4 — branch announcements (staff audience).
    { permission: "announcements.view", scope: "branch" },
    { permission: "search.use", scope: "branch" },
    { permission: "notifications.view", scope: "own" },
  ],
  teacher: [
    { permission: "dashboard.view", scope: "all" },
    // Only students in assigned class sections; no sensitive fields.
    { permission: "students.view", scope: "section" },
    { permission: "academic.view", scope: "branch" },
    // Phase 2 — teacher's own sections only (scope engine narrows by
    // UserRole.sectionIds and/or TeachingAssignment rows).
    { permission: "timetable.view", scope: "section" },
    { permission: "attendance.view", scope: "section" },
    { permission: "attendance.record", scope: "section" },
    { permission: "assessments.view", scope: "section" },
    { permission: "grades.enter", scope: "section" },
    { permission: "grades.view", scope: "section" },
    // Phase 4/5 — branch announcements; reports auto-narrow to own sections.
    { permission: "announcements.view", scope: "branch" },
    { permission: "reports.view", scope: "branch" },
    { permission: "roles.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "section" },
  ],
  librarian: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "branch" },
    // Phase 4 — the librarian OWNS the branch library: catalog, copies,
    // loans and fines (as linked invoices).
    { permission: "library.view", scope: "branch" },
    { permission: "library.manage", scope: "branch" },
    { permission: "announcements.view", scope: "branch" },
    { permission: "search.use", scope: "branch" },
    { permission: "notifications.view", scope: "own" },
  ],
  hr_officer: [
    { permission: "dashboard.view", scope: "all" },
    // Phase 2/3 — HR owns the staff register and staff portal accounts of
    // the HR officer's OWN branch (strict isolation).
    { permission: "staff.view", scope: "branch" },
    { permission: "staff.manage", scope: "branch" },
    { permission: "users.view", scope: "branch" },
    { permission: "users.manage", scope: "branch" },
    { permission: "payroll.view", scope: "branch" },
    // Phase 4 — branch announcements (staff audience).
    { permission: "announcements.view", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
  student: [
    { permission: "dashboard.view", scope: "all" },
    { permission: "students.view", scope: "own" },
    // Phase 2 — own results and own attendance (published only).
    { permission: "attendance.view", scope: "own" },
    { permission: "grades.view", scope: "own" },
    // Phase 4 — announcements addressed to "all" audiences of the branch
    // where the student is enrolled (narrowed by own-scope checks).
    { permission: "announcements.view", scope: "own" },
    { permission: "notifications.view", scope: "own" },
  ],
  parent: [
    { permission: "dashboard.view", scope: "all" },
    // Only explicitly linked children — enforced by guardian scope checks.
    { permission: "students.view", scope: "guardian" },
    // Phase 2 — children's published results and attendance.
    { permission: "attendance.view", scope: "guardian" },
    { permission: "grades.view", scope: "guardian" },
    // Phase 3 — fee invoices of the guardian's own children.
    { permission: "invoices.view", scope: "guardian" },
    // Phase 4 — announcements addressed to guardians ("all"/"guardians"
    // audiences of the branches where their children study).
    { permission: "announcements.view", scope: "guardian" },
    { permission: "notifications.view", scope: "own" },
  ],
  auditor: [
    { permission: "dashboard.view", scope: "all" },
    // Strict branch isolation (Phase 3): read-only oversight of the
    // auditor's OWN branch; org-level meta (audit log) stays org-wide.
    { permission: "students.view", scope: "branch" },
    { permission: "applications.view", scope: "branch" },
    { permission: "guardians.view", scope: "branch" },
    { permission: "academic.view", scope: "branch" },
    // Phase 2 — strictly read-only academic oversight.
    { permission: "staff.view", scope: "branch" },
    { permission: "timetable.view", scope: "branch" },
    { permission: "attendance.view", scope: "branch" },
    { permission: "assessments.view", scope: "branch" },
    { permission: "grades.view", scope: "branch" },
    // Phase 3 — read-only finance oversight within the branch.
    { permission: "fees.view", scope: "branch" },
    { permission: "invoices.view", scope: "branch" },
    { permission: "payments.view", scope: "branch" },
    { permission: "expenses.view", scope: "branch" },
    { permission: "payroll.view", scope: "branch" },
    // Phase 4/5 — read-only library, announcements, services & reports of
    // the auditor's OWN branch.
    { permission: "library.view", scope: "branch" },
    { permission: "announcements.view", scope: "branch" },
    { permission: "services.view", scope: "branch" },
    { permission: "reports.view", scope: "branch" },
    { permission: "settings.view", scope: "all" },
    { permission: "users.view", scope: "branch" },
    { permission: "roles.view", scope: "all" },
    { permission: "audit.view", scope: "all" },
    { permission: "notifications.view", scope: "own" },
    { permission: "search.use", scope: "branch" },
  ],
};

export function grantsForRole(roleKey: string): Grant[] {
  return (ROLE_MATRIX as Record<string, Grant[]>)[roleKey] ?? [];
}

export function isValidRoleKey(key: string): key is RoleKey {
  return (ROLE_KEYS as readonly string[]).includes(key);
}
