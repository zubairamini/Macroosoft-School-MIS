// Unit tests: Phase-8 domain rules — the at-risk classification policy
// (attendance / academics / finance flags) and the Solar Hijri month
// bucketing used by the trend charts, plus the analytics RBAC policy.

import { describe, test, expect } from "bun:test";
import {
  classifyRisk, recentJalaliMonths, AT_RISK_POLICY,
} from "../src/server/analytics";
import { grantsForRole } from "../src/server/rbac/permissions";

describe("Phase 8 — at-risk classification policy", () => {
  test("healthy student: no flags, score 0", () => {
    const r = classifyRisk({
      recordedDays: 20, attendedDays: 19,
      weightedSum: 8500, weightSum: 100, // 85%
      overdueBalanceDiram: 0,
    });
    expect(r.flags).toEqual([]);
    expect(r.score).toBe(0);
    expect(r.attendanceRate).toBe(0.95);
    expect(r.averagePct).toBe(85);
  });

  test("attendance flags below 80% with enough recorded days", () => {
    const r = classifyRisk({
      recordedDays: 10, attendedDays: 6, // 60%
      weightedSum: 0, weightSum: 0,
      overdueBalanceDiram: 0,
    });
    expect(r.flags).toEqual(["attendance"]);
  });

  test("small attendance samples never flag (< 5 recorded days)", () => {
    const r = classifyRisk({
      recordedDays: AT_RISK_POLICY.minRecordedDays - 1, attendedDays: 0,
      weightedSum: 0, weightSum: 0, overdueBalanceDiram: 0,
    });
    expect(r.attendanceRate).toBeNull();
    expect(r.flags).toEqual([]);
  });

  test("academics flags below the 40% pass threshold", () => {
    const r = classifyRisk({
      recordedDays: 20, attendedDays: 20,
      weightedSum: 3000, weightSum: 100, // 30%
      overdueBalanceDiram: 0,
    });
    expect(r.flags).toEqual(["academics"]);
    expect(r.averagePct).toBe(30);
  });

  test("finance flags on overdue balance only", () => {
    const r = classifyRisk({
      recordedDays: 20, attendedDays: 20,
      weightedSum: 9000, weightSum: 100,
      overdueBalanceDiram: 500000,
    });
    expect(r.flags).toEqual(["finance"]);
    expect(r.overdueBalanceDiram).toBe(500000);
  });

  test("all three flags → score 3 (top of the list)", () => {
    const r = classifyRisk({
      recordedDays: 10, attendedDays: 5, // 50%
      weightedSum: 2000, weightSum: 100, // 20%
      overdueBalanceDiram: 1000,
    });
    expect(r.flags).toEqual(["attendance", "academics", "finance"]);
    expect(r.score).toBe(3);
  });

  test("no grades yet → average is null, never zero", () => {
    const r = classifyRisk({
      recordedDays: 20, attendedDays: 20,
      weightedSum: 0, weightSum: 0,
      overdueBalanceDiram: 0,
    });
    expect(r.averagePct).toBeNull();
    expect(r.flags).toEqual([]);
  });
});

describe("Phase 8 — Solar Hijri trend buckets", () => {
  test("six ordered, contiguous, inclusive month buckets", () => {
    const months = recentJalaliMonths("2026-11-08"); // ۱۷ عقرب ۱۴۰۵
    expect(months.length).toBe(6);
    for (let i = 1; i < months.length; i++) {
      expect(months[i].fromIso > months[i - 1].fromIso).toBe(true);
      expect(months[i].fromIso > months[i - 1].toIso).toBe(true);
    }
    // Last bucket contains the reference day.
    const last = months[months.length - 1];
    expect(last.fromIso <= "2026-11-08" && "2026-11-08" <= last.toIso).toBe(true);
    expect(last.label).toContain("عقرب");
    expect(last.label).toContain("۱۴۰۵");
  });

  test("labels use Persian digits and Afghan month names", () => {
    const months = recentJalaliMonths("2026-04-25"); // ۵ ثور ۱۴۰۵
    expect(months[months.length - 1].label).toContain("ثور");
    for (const m of months) {
      expect(m.label).toMatch(/[۰-۹]/);
      expect(m.key).toMatch(/^14\d\d-\d\d$/);
    }
  });

  test("year boundaries roll over correctly (جدی falls in the previous year)", () => {
    const months = recentJalaliMonths("2027-01-15"); // ۲۵ جدی ۱۴۰۵
    const first = months[0]; // 5 months back → عقرب/قوس/جدی… of ۱۴۰۵
    expect(first.label).toContain("۱۴۰۵");
    expect(months[months.length - 1].label).toContain("جدی");
  });
});

describe("Phase 8 — analytics RBAC policy", () => {
  test("admin and general_manager see org-wide analytics", () => {
    for (const role of ["admin", "general_manager"]) {
      expect(grantsForRole(role).some((g) => g.permission === "analytics.view" && g.scope === "all")).toBe(true);
    }
  });

  test("managers, academic managers and auditors are branch-scoped", () => {
    for (const role of ["manager", "academic_manager", "auditor"]) {
      expect(grantsForRole(role).some((g) => g.permission === "analytics.view" && g.scope === "branch")).toBe(true);
    }
  });

  test("teachers, cashiers, parents and students have NO analytics access", () => {
    for (const role of ["teacher", "cashier", "student", "parent", "librarian", "registrar", "finance_officer", "hr_officer"]) {
      expect(grantsForRole(role).some((g) => g.permission === "analytics.view")).toBe(false);
    }
  });
});
