// Unit tests: RBAC matrix integrity + scope engine logic +
// password hashing + audit/outbox writers (db integration on a scratch DB).

import { describe, test, expect, beforeAll } from "bun:test";
import {
  ROLE_MATRIX, ROLE_KEYS, PERMISSIONS, grantsForRole, isValidRoleKey,
} from "../src/server/rbac/permissions";

describe("RBAC matrix integrity", () => {
  test("all 13 default roles are defined", () => {
    expect(ROLE_KEYS).toHaveLength(13);
    for (const key of ROLE_KEYS) {
      expect(ROLE_MATRIX[key].length).toBeGreaterThan(0);
    }
  });

  test("every permission referenced in the matrix exists in the catalog", () => {
    const catalog = new Set<string>(PERMISSIONS);
    for (const grants of Object.values(ROLE_MATRIX)) {
      for (const g of grants) {
        expect(catalog.has(g.permission)).toBe(true);
      }
    }
  });

  test("settings.manage is separated from business approvals", () => {
    // System administrators configure the system but do NOT approve
    // admissions by default; managers approve but do NOT manage settings.
    const admin = grantsForRole("admin");
    const manager = grantsForRole("manager");
    expect(admin.some((g) => g.permission === "settings.manage")).toBe(true);
    expect(admin.some((g) => g.permission === "applications.review")).toBe(false);
    expect(manager.some((g) => g.permission === "applications.review")).toBe(true);
    expect(manager.some((g) => g.permission === "settings.manage")).toBe(false);
  });

  test("parent scope is guardian-only and has no create/update grants", () => {
    const parent = grantsForRole("parent");
    const studentGrant = parent.find((g) => g.permission === "students.view");
    expect(studentGrant?.scope).toBe("guardian");
    expect(parent.some((g) => g.permission === "students.create")).toBe(false);
    expect(parent.some((g) => g.permission === "students.update")).toBe(false);
    expect(parent.some((g) => g.permission === "applications.view")).toBe(false);
  });

  test("teacher scope is section-narrowed without sensitive access", () => {
    const teacher = grantsForRole("teacher");
    expect(teacher.find((g) => g.permission === "students.view")?.scope).toBe("section");
    expect(teacher.some((g) => g.permission === "students.view_sensitive")).toBe(false);
    expect(teacher.some((g) => g.permission === "students.update")).toBe(false);
  });

  test("finance/cashier can view basic students but never sensitive fields", () => {
    for (const role of ["finance_officer", "cashier", "librarian"]) {
      const grants = grantsForRole(role);
      expect(grants.some((g) => g.permission === "students.view")).toBe(true);
      expect(grants.some((g) => g.permission === "students.view_sensitive")).toBe(false);
    }
  });

  test("registrar is the admissions workhorse", () => {
    const reg = grantsForRole("registrar");
    for (const p of ["applications.create", "applications.submit", "applications.enroll", "students.create"]) {
      expect(reg.some((g) => g.permission === p)).toBe(true);
    }
  });

  test("auditor is read-only", () => {
    const aud = grantsForRole("auditor");
    expect(aud.some((g) => g.permission === "audit.view")).toBe(true);
    const writeish = ["students.create", "students.update", "applications.create",
      "applications.submit", "applications.review", "applications.enroll",
      "settings.manage", "users.manage"];
    for (const p of writeish) {
      expect(aud.some((g) => g.permission === p)).toBe(false);
    }
  });

  test("custom role keys are rejected by the system matrix", () => {
    expect(isValidRoleKey("admin")).toBe(true);
    expect(isValidRoleKey("general_manager")).toBe(true);
    expect(isValidRoleKey("super_admin")).toBe(false);
    expect(grantsForRole("unknown-role")).toEqual([]);
  });
});

describe("Branch isolation (Phase 3 policy)", () => {
  const BRANCH_DATA_PERMISSIONS = [
    "students.view", "applications.view", "guardians.view", "academic.view",
    "staff.view", "timetable.view", "attendance.view", "grades.view",
    "invoices.view", "payments.view", "expenses.view", "payroll.view",
  ] as const;

  test("only admin and general_manager hold all-scope data grants", () => {
    for (const role of ROLE_KEYS) {
      const grants = grantsForRole(role);
      const crossBranch = role === "admin" || role === "general_manager";
      for (const permission of BRANCH_DATA_PERMISSIONS) {
        const has = grants.some((g) => g.permission === permission && g.scope === "all");
        expect(has).toBe(
          crossBranch && grants.some((g) => g.permission === permission),
        );
      }
    }
  });

  test("org-level meta permissions are never branch-scoped", () => {
    // Meta/system permissions (settings view, role catalog, audit log,
    // dashboard, own notifications) stay org-wide or own — never mixed
    // into the branch isolation machinery.
    const META = ["settings.view", "settings.manage", "roles.view", "audit.view", "dashboard.view", "notifications.view"];
    for (const role of ROLE_KEYS) {
      for (const g of grantsForRole(role)) {
        if (g.scope === "branch") {
          expect(META).not.toContain(g.permission);
        }
      }
    }
  });

  test("general_manager sees every branch but keeps technical duties with admin", () => {
    const gm = grantsForRole("general_manager");
    expect(gm.some((g) => g.permission === "students.view" && g.scope === "all")).toBe(true);
    expect(gm.some((g) => g.permission === "applications.review" && g.scope === "all")).toBe(true);
    expect(gm.some((g) => g.permission === "invoices.manage" && g.scope === "all")).toBe(true);
    expect(gm.some((g) => g.permission === "payroll.manage" && g.scope === "all")).toBe(true);
    // Technical duties stay with admin.
    expect(gm.some((g) => g.permission === "settings.manage")).toBe(false);
    expect(gm.some((g) => g.permission === "users.manage")).toBe(false);
  });

  test("finance roles get the Phase-3 finance permissions", () => {
    const finance = grantsForRole("finance_officer");
    for (const p of ["fees.manage", "invoices.manage", "payments.collect", "payments.void", "expenses.manage", "payroll.manage"]) {
      expect(finance.some((g) => g.permission === p && g.scope === "branch")).toBe(true);
    }
    const cashier = grantsForRole("cashier");
    expect(cashier.some((g) => g.permission === "payments.collect" && g.scope === "branch")).toBe(true);
    expect(cashier.some((g) => g.permission === "invoices.manage")).toBe(false);
    expect(cashier.some((g) => g.permission === "payments.void")).toBe(false);
    const manager = grantsForRole("manager");
    expect(manager.some((g) => g.permission === "invoices.view" && g.scope === "branch")).toBe(true);
    expect(manager.some((g) => g.permission === "fees.manage")).toBe(false);
    const parent = grantsForRole("parent");
    expect(parent.some((g) => g.permission === "invoices.view" && g.scope === "guardian")).toBe(true);
    expect(parent.some((g) => g.permission === "payments.view")).toBe(false);
  });

  test("audit/meta permissions may stay org-wide without crossing branch data", () => {
    // auditor keeps the org-wide audit log but its data views are branch-scoped.
    const auditor = grantsForRole("auditor");
    expect(auditor.some((g) => g.permission === "audit.view" && g.scope === "all")).toBe(true);
    expect(auditor.find((g) => g.permission === "students.view")?.scope).toBe("branch");
    expect(auditor.find((g) => g.permission === "invoices.view")?.scope).toBe("branch");
  });
});

describe("Password hashing (scrypt)", () => {
  test("hash and verify round-trip", async () => {
    const { hashPassword, verifyPassword, passwordPolicyError } = await import("../src/server/auth/password");
    const hash = hashPassword("Admin1234");
    expect(hash.startsWith("scrypt:16384:8:1:")).toBe(true);
    expect(verifyPassword("Admin1234", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(verifyPassword("Admin1234", "garbage")).toBe(false);
  });

  test("policy enforces length and character classes", async () => {
    const { passwordPolicyError } = await import("../src/server/auth/password");
    expect(passwordPolicyError("short")).not.toBeNull();
    expect(passwordPolicyError("12345678")).not.toBeNull();
    expect(passwordPolicyError("abcdefgh")).not.toBeNull();
    expect(passwordPolicyError("Admin1234")).toBeNull();
  });
});

describe("Session token security", () => {
  test("tokens are 32-byte URL-safe and hash deterministically", async () => {
    const { generateToken, hashToken } = await import("../src/server/auth/session");
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(t1)).toBe(hashToken(t1));
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });
});
