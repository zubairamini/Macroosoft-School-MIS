// Unit tests: Phase-7 domain rules — discipline DTO validation (kinds,
// severities, actions, dates) and the role matrix policy (teachers act on
// their own sections; managers on their own branch; admin / مدیر عام cross).

import { describe, test, expect } from "bun:test";
import {
  incidentCreateDto, incidentUpdateDto,
  INCIDENT_KINDS, INCIDENT_KIND_LABELS, SEVERITIES, ACTIONS_TAKEN,
} from "../src/server/discipline";
import { grantsForRole, ROLE_MATRIX } from "../src/server/rbac/permissions";

describe("Phase 7 — discipline DTO validation", () => {
  const base = {
    studentId: "stu-1",
    date: "2026-11-05",
    kind: "late" as const,
    description: "با تأخیر آمد",
  };

  test("create defaults: severity low, action none, unresolved", () => {
    const dto = incidentCreateDto.parse(base);
    expect(dto.severity).toBe("low");
    expect(dto.actionTaken).toBe("none");
    expect(dto.resolved).toBe(false);
  });

  test("merit entries and every severity pass", () => {
    for (const severity of SEVERITIES) {
      const dto = incidentCreateDto.parse({ ...base, kind: "merit", severity });
      expect(dto.kind).toBe("merit");
    }
  });

  test("unknown kinds and severities are rejected", () => {
    expect(() => incidentCreateDto.parse({ ...base, kind: "riot" })).toThrow();
    expect(() => incidentCreateDto.parse({ ...base, severity: "extreme" })).toThrow();
    expect(() => incidentCreateDto.parse({ ...base, actionTaken: "expulsion" })).toThrow();
  });

  test("description must be meaningful (≥ 3 chars)", () => {
    expect(() => incidentCreateDto.parse({ ...base, description: "—" })).toThrow();
  });

  test("dates accept ISO and Solar Hijri input", () => {
    const iso = incidentCreateDto.parse(base);
    expect(iso.date).toBe("2026-11-05");
    const jalali = incidentCreateDto.parse({ ...base, date: "۱۴۰۵/۰۸/۱۴" });
    expect(jalali.date).toBe("2026-11-05");
  });

  test("update DTO is partial (resolve-only payloads pass)", () => {
    const dto = incidentUpdateDto.parse({ resolved: true });
    expect(dto.resolved).toBe(true);
    expect(dto.kind).toBeUndefined();
  });

  test("every catalogued kind has a Dari label", () => {
    for (const kind of INCIDENT_KINDS) {
      expect(INCIDENT_KIND_LABELS[kind].length).toBeGreaterThan(1);
    }
    expect(ACTIONS_TAKEN).toContain("parent_notified");
  });
});

describe("Phase 7 — discipline RBAC policy", () => {
  test("admin and general_manager hold all-scoped discipline grants", () => {
    for (const role of ["admin", "general_manager"]) {
      const grants = grantsForRole(role);
      expect(grants.some((g) => g.permission === "discipline.view" && g.scope === "all")).toBe(true);
      expect(grants.some((g) => g.permission === "discipline.manage" && g.scope === "all")).toBe(true);
    }
  });

  test("managers and academic managers are branch-scoped", () => {
    for (const role of ["manager", "academic_manager"]) {
      const grants = grantsForRole(role);
      expect(grants.some((g) => g.permission === "discipline.manage" && g.scope === "branch")).toBe(true);
    }
  });

  test("teachers are section-scoped (own students only)", () => {
    const grants = grantsForRole("teacher");
    expect(grants.some((g) => g.permission === "discipline.manage" && g.scope === "section")).toBe(true);
    expect(grants.some((g) => g.permission === "discipline.view" && g.scope === "all")).toBe(false);
  });

  test("no role without a business stake holds discipline grants", () => {
    for (const role of ["cashier", "finance_officer", "librarian", "hr_officer", "student", "parent"]) {
      const grants = grantsForRole(role);
      expect(grants.some((g) => g.permission.startsWith("discipline."))).toBe(false);
    }
  });

  test("auditors get read-only branch visibility", () => {
    const grants = grantsForRole("auditor");
    expect(grants.some((g) => g.permission === "discipline.view" && g.scope === "branch")).toBe(true);
    expect(grants.some((g) => g.permission === "discipline.manage")).toBe(false);
  });

  test("the full matrix contains no discipline grants with unknown scope kinds", () => {
    const valid = new Set(["all", "branch", "year", "section", "own", "guardian"]);
    for (const grants of Object.values(ROLE_MATRIX)) {
      for (const g of grants) expect(valid.has(g.scope)).toBe(true);
    }
  });
});
