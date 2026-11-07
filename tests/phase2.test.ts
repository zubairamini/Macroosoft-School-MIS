// Unit tests: Phase-2 domain rules that are pure logic — permission
// separation for academic records, timetable weekday semantics, grade
// aggregation math (missing ≠ zero), and attendance status sets.

import { describe, test, expect } from "bun:test";
import { grantsForRole } from "../src/server/rbac/permissions";
import {
  WEEKDAYS_DARI, PERIODS,
} from "../src/server/teaching";
import {
  ATTENDANCE_STATUSES, ATTENDANCE_STATUS_LABELS,
} from "../src/server/attendance";
import {
  ASSESSMENT_TYPES, ASSESSMENT_TYPE_LABELS,
} from "../src/server/assessments";
import { afghanWeekdayIndex } from "../src/server/shared/jalali";

describe("Phase 2 — permission separation", () => {
  test("teacher can enter grades but never publish or correct attendance", () => {
    const teacher = grantsForRole("teacher");
    expect(teacher.some((g) => g.permission === "grades.enter")).toBe(true);
    expect(teacher.some((g) => g.permission === "grades.enter" && g.scope === "section")).toBe(true);
    expect(teacher.some((g) => g.permission === "assessments.manage")).toBe(false);
    expect(teacher.some((g) => g.permission === "attendance.correct")).toBe(false);
    expect(teacher.some((g) => g.permission === "staff.manage")).toBe(false);
    expect(teacher.some((g) => g.permission === "timetable.manage")).toBe(false);
  });

  test("publishing authority is restricted to assessments.manage holders", () => {
    // manager/academic_manager publish; admin sees grades but does not
    // publish (kept technical), teacher never publishes.
    expect(grantsForRole("manager").some((g) => g.permission === "assessments.manage")).toBe(true);
    expect(grantsForRole("academic_manager").some((g) => g.permission === "assessments.manage")).toBe(true);
    expect(grantsForRole("admin").some((g) => g.permission === "assessments.manage")).toBe(false);
    expect(grantsForRole("teacher").some((g) => g.permission === "assessments.manage")).toBe(false);
    expect(grantsForRole("registrar").some((g) => g.permission === "assessments.manage")).toBe(false);
  });

  test("attendance correction is a manager-level capability", () => {
    expect(grantsForRole("manager").some((g) => g.permission === "attendance.correct")).toBe(true);
    expect(grantsForRole("academic_manager").some((g) => g.permission === "attendance.correct")).toBe(true);
    expect(grantsForRole("teacher").some((g) => g.permission === "attendance.correct")).toBe(false);
    expect(grantsForRole("registrar").some((g) => g.permission === "attendance.record")).toBe(false);
  });

  test("parents and students see only published results of their own children", () => {
    const parent = grantsForRole("parent");
    expect(parent.find((g) => g.permission === "grades.view")?.scope).toBe("guardian");
    expect(parent.find((g) => g.permission === "attendance.view")?.scope).toBe("guardian");
    const student = grantsForRole("student");
    expect(student.find((g) => g.permission === "grades.view")?.scope).toBe("own");
    expect(student.some((g) => g.permission === "grades.enter")).toBe(false);
    expect(student.some((g) => g.permission === "assessments.view")).toBe(false);
  });

  test("HR owns the staff register; auditor is strictly read-only", () => {
    expect(grantsForRole("hr_officer").some((g) => g.permission === "staff.manage")).toBe(true);
    expect(grantsForRole("hr_officer").some((g) => g.permission === "users.manage")).toBe(true);
    const auditor = grantsForRole("auditor");
    expect(auditor.some((g) => g.permission === "grades.view")).toBe(true);
    for (const g of auditor) {
      expect(g.permission.endsWith(".manage")).toBe(false);
      expect(g.permission.endsWith(".enter")).toBe(false);
      expect(g.permission.endsWith(".record")).toBe(false);
      expect(g.permission.endsWith(".correct")).toBe(false);
    }
  });

  test("finance and cashier have no academic-record access at all", () => {
    for (const role of ["finance_officer", "cashier", "librarian"] as const) {
      const grants = grantsForRole(role);
      expect(grants.some((g) => g.permission === "grades.view")).toBe(false);
      expect(grants.some((g) => g.permission === "attendance.view")).toBe(false);
      expect(grants.some((g) => g.permission === "assessments.view")).toBe(false);
    }
  });
});

describe("Phase 2 — timetable semantics", () => {
  test("Afghan week starts Saturday (شنبه) and ends Friday (جمعه)", () => {
    expect(WEEKDAYS_DARI).toHaveLength(7);
    expect(WEEKDAYS_DARI[0]).toBe("شنبه");
    expect(WEEKDAYS_DARI[6]).toBe("جمعه");
    expect(WEEKDAYS_DARI).not.toContain("یکشنبه‌جمعه");
  });

  test("periods are 1..8 (0 reserved for whole-day attendance)", () => {
    expect(PERIODS[0]).toBe(1);
    expect(PERIODS[PERIODS.length - 1]).toBe(8);
    expect(PERIODS).not.toContain(0);
  });

  test("afghanWeekdayIndex maps ISO dates correctly", () => {
    // 2026-11-07 is a Saturday → index 0 (شنبه)
    expect(afghanWeekdayIndex("2026-11-07")).toBe(0);
    // 2026-11-06 is a Friday → index 6 (جمعه)
    expect(afghanWeekdayIndex("2026-11-06")).toBe(6);
    // 2026-11-01 is a Sunday → index 1 (یکشنبه)
    expect(afghanWeekdayIndex("2026-11-01")).toBe(1);
    // 2026-11-04 Wednesday → index 4 (چهارشنبه)
    expect(afghanWeekdayIndex("2026-11-04")).toBe(4);
  });
});

describe("Phase 2 — attendance & assessment catalogs", () => {
  test("attendance statuses are exactly present/absent/late/excused", () => {
    expect([...ATTENDANCE_STATUSES]).toEqual(["present", "absent", "late", "excused"]);
    expect(ATTENDANCE_STATUS_LABELS.present).toBe("حاضر");
    expect(ATTENDANCE_STATUS_LABELS.excused).toBe("رخصت");
  });

  test("assessment types cover quiz..project with Dari labels", () => {
    expect([...ASSESSMENT_TYPES]).toContain("midterm");
    expect(ASSESSMENT_TYPE_LABELS.final).toBe("امتحان نهایی");
    expect(ASSESSMENT_TYPE_LABELS.quiz).toBe("کوئیز");
  });
});

describe("Phase 2 — grade aggregation math (missing ≠ zero)", () => {
  // Mirrors the reportCard weighted-average formula:
  //   average = Σ(score/max × weight) / Σ(weight) over NON-MISSING grades.
  function subjectAverage(items: Array<{ score: number | null; maxScore: number; weight: number }>): number | null {
    let weightedSum = 0;
    let weightSum = 0;
    for (const it of items) {
      if (it.score !== null) {
        weightedSum += (it.score / it.maxScore) * it.weight;
        weightSum += it.weight;
      }
    }
    return weightSum > 0 ? Math.round((weightedSum / weightSum) * 10000) / 100 : null;
  }

  test("a missing grade is excluded, not counted as zero", () => {
    // Two quizzes, max 10 each, weight 1: 9 and MISSING.
    // Zero-treatment would give 45%; correct treatment gives 90%.
    const avg = subjectAverage([
      { score: 9, maxScore: 10, weight: 1 },
      { score: null, maxScore: 10, weight: 1 },
    ]);
    expect(avg).toBe(90);
  });

  test("weights are honored across differently-scaled assessments", () => {
    // Midterm 36/40 (weight 2) + quiz 9/10 (weight 1):
    // (0.9×2 + 0.9×1)/3 = 0.9 → 90%
    const avg = subjectAverage([
      { score: 36, maxScore: 40, weight: 2 },
      { score: 9, maxScore: 10, weight: 1 },
    ]);
    expect(avg).toBe(90);
  });

  test("all-missing subject has NO average (null), not zero", () => {
    expect(subjectAverage([
      { score: null, maxScore: 10, weight: 1 },
      { score: null, maxScore: 20, weight: 2 },
    ])).toBeNull();
  });

  test("exam-day absence does not poison the average", () => {
    // Absent students simply have no score for that assessment — their
    // average comes from the remaining items.
    const avg = subjectAverage([{ score: 8, maxScore: 10, weight: 1 }]);
    expect(avg).toBe(80);
  });
});
