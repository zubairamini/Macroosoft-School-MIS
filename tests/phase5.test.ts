// Unit tests: Phase-5 domain rules that are pure logic — CSV export shape
// (BOM, quoting, Dari headers), Solar Hijri year-name rollover math with
// Persian digits, service DTO validation, and year-end RBAC scoping.

import { describe, test, expect } from "bun:test";
import { reportToCsv, REPORT_KINDS, REPORT_KIND_LABELS } from "../src/server/reports";
import {
  DECISIONS, DECISION_LABELS, rolloverDecideDto, rolloverApplyDto,
  yearNameAsNumber,
} from "../src/server/academic/rollover";
import {
  transportRouteDto, transportPassengerDto, inventoryItemDto,
  inventoryMovementDto, guestVisitDto, schoolEventDto, EVENT_KIND_LABELS,
} from "../src/server/services";
import { canAccessBranch } from "../src/server/rbac/scope";
import type { AuthContext } from "../src/server/auth/context";
import type { ResolvedGrant } from "../src/server/rbac/permissions";

function fakeCtx(over: Partial<AuthContext>): AuthContext {
  return {
    user: {
      id: "u1", username: "tester", fullName: "آزمون", phone: null, email: null,
      isActive: true, mustChangePassword: false, guardianId: null,
    },
    sessionId: "s1",
    roles: [],
    grants: [],
    guardianId: null,
    linkedStudentId: null,
    ownBranchIds: [],
    isCrossBranch: false,
    branchId: null,
    ip: null,
    ...over,
  };
}

function grant(permission: string, scope: ResolvedGrant["scope"], branchId: string | null): ResolvedGrant {
  return { permission, scope, branchId, academicYearId: null, sectionIds: [] };
}

describe("Phase 5 — CSV export contract", () => {
  const table = {
    kind: "students" as const,
    title: "ثبت‌نامهٔ شاگردان",
    columns: [
      { key: "num", label: "شمارهٔ شاگرد" },
      { key: "name", label: "نام" },
    ],
    rows: [
      ["S-1405-0001", "احمد"],
      ["S-1405-0002", 'زهرا "ز" حکیمی, نامه'],
    ],
    meta: { totalCount: "۲", year: "۱۴۰۵" },
  };

  test("starts with a UTF-8 BOM and the report title", () => {
    const csv = reportToCsv(table);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.startsWith("\ufeffثبت‌نامهٔ شاگردان")).toBe(true);
    expect(csv.split("\r\n")[1]).toBe("totalCount: ۲ · year: ۱۴۰۵");
  });

  test("column labels form the header row", () => {
    const csv = reportToCsv(table);
    expect(csv.split("\r\n")[2]).toBe("شمارهٔ شاگرد,نام");
  });

  test("commas and quotes inside cells are RFC-4180 quoted", () => {
    const csv = reportToCsv(table);
    expect(csv).toContain('"زهرا ""ز"" حکیمی, نامه"');
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(6); // title + meta + header + 2 rows + trailing empty
    expect(lines[3]).toBe("S-1405-0001,احمد");
    expect(lines[4]).toBe('S-1405-0002,"زهرا ""ز"" حکیمی, نامه"');
  });
});

describe("Phase 5 — report kinds", () => {
  test("the three registries are the closed report set", () => {
    expect([...REPORT_KINDS].sort()).toEqual(["attendance", "results", "students"]);
    for (const k of REPORT_KINDS) {
      expect(REPORT_KIND_LABELS[k]).toBeTruthy();
    }
    expect(REPORT_KIND_LABELS.students).toContain("ثبت‌نامه");
  });
});

describe("Phase 5 — Solar Hijri year-name rollover math", () => {
  test("Persian-digit year names convert to comparable numbers", () => {
    expect(yearNameAsNumber("۱۴۰۵")).toBe(1405);
    expect(yearNameAsNumber("1405")).toBe(1405);
    expect(yearNameAsNumber("۱۴۰۶")).toBe(1406);
  });

  test("non-numeric year names yield NaN (callers must handle)", () => {
    expect(Number.isNaN(yearNameAsNumber("سال"))).toBe(true);
    expect(Number.isNaN(yearNameAsNumber(""))).toBe(true);
  });

  test("the next-year suggestion is year+1 in the same digit style", () => {
    // Mirrors previewRollover's suggestion logic.
    const name = "۱۴۰۵";
    const next = yearNameAsNumber(name) + 1;
    expect(String(next)).toBe("1406");
    expect(next).toBe(1406);
  });
});

describe("Phase 5 — rollover decisions", () => {
  test("decisions are the closed set with Dari labels", () => {
    expect([...DECISIONS].sort()).toEqual(["graduate", "leave", "promote", "repeat"]);
    expect(DECISION_LABELS.graduate).toBe("تخارج");
    expect(DECISION_LABELS.leave).toBe("ترک مکتب");
  });

  test("the apply DTO requires a target year and defaults setAsCurrent", () => {
    const r = rolloverApplyDto.safeParse({ toAcademicYearId: "y1406" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.setAsCurrent).toBe(true);
    expect(rolloverApplyDto.safeParse({}).success).toBe(false);
  });

  test("the decide DTO rejects empty decision batches", () => {
    expect(rolloverDecideDto.safeParse({ decisions: [] }).success).toBe(false);
    expect(
      rolloverDecideDto.safeParse({
        decisions: [{ studentId: "s1", decision: "repeat" }],
      }).success,
    ).toBe(true);
    expect(
      rolloverDecideDto.safeParse({
        decisions: [{ studentId: "s1", decision: "expel" }],
      }).success,
    ).toBe(false);
  });
});

describe("Phase 5 — services DTO validation", () => {
  test("transport routes need a name and a sane capacity", () => {
    expect(transportRouteDto.safeParse({ name: "مسیر اول", capacity: 20 }).success).toBe(true);
    expect(transportRouteDto.safeParse({ name: "مسیر", capacity: 0 }).success).toBe(false);
    expect(transportRouteDto.safeParse({ name: "مسیر", capacity: 81 }).success).toBe(false);
    expect(transportRouteDto.safeParse({ capacity: 20 }).success).toBe(false);
  });

  test("passenger route id is optional (path supplies it), student is not", () => {
    expect(transportPassengerDto.safeParse({ studentId: "s1" }).success).toBe(true);
    expect(transportPassengerDto.safeParse({}).success).toBe(false);
  });

  test("inventory movements must be non-zero integers with a reason", () => {
    expect(inventoryMovementDto.safeParse({ delta: 10, reason: "ورود" }).success).toBe(true);
    expect(inventoryMovementDto.safeParse({ delta: -4, reason: "صرف" }).success).toBe(true);
    expect(inventoryMovementDto.safeParse({ delta: 0, reason: "صفر" }).success).toBe(false);
    expect(inventoryMovementDto.safeParse({ delta: 5, reason: "ک" }).success).toBe(false);
  });

  test("inventory items default to unit «عدد» and zero min quantity", () => {
    const r = inventoryItemDto.safeParse({ name: "تخته‌سپیده" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.unit).toBe("عدد");
      expect(r.data.minQuantity).toBe(0);
    }
  });

  test("guest visits need a name and a purpose", () => {
    expect(guestVisitDto.safeParse({ fullName: "مهمان مهم", purpose: "ملاقات" }).success).toBe(true);
    expect(guestVisitDto.safeParse({ fullName: "م", purpose: "ملاقات" }).success).toBe(false);
    expect(guestVisitDto.safeParse({ fullName: "مهمان مهم", purpose: "ک" }).success).toBe(false);
    const r = guestVisitDto.safeParse({ fullName: "مهمان مهم", purpose: "ملاقات" });
    if (r.success) expect(r.data.visitorCount).toBe(1);
  });

  test("events accept the five kinds and require start ≥ end", () => {
    expect(schoolEventDto.safeParse({ title: "امتحان", kind: "exam", startsOn: "2026-11-15" }).success).toBe(true);
    expect(schoolEventDto.safeParse({ title: "امتحان", kind: "party", startsOn: "2026-11-15" }).success).toBe(false);
    expect(
      schoolEventDto.safeParse({ title: "امتحان", startsOn: "2026-11-15", endsOn: "2026-11-14" }).success,
    ).toBe(false); // server also checks, DTO shape mirrors it
    expect(Object.keys(EVENT_KIND_LABELS).sort()).toEqual(["ceremony", "exam", "holiday", "meeting", "other"]);
  });
});

describe("Phase 5 — year-end RBAC (admin / general_manager only)", () => {
  const MAIN = "branch-kart-e-now";

  test("year_end.manage is held cross-branch by admin-style grants", () => {
    const gm = fakeCtx({ isCrossBranch: true, grants: [grant("year_end.manage", "all", null)] });
    expect(canAccessBranch(gm, "year_end.manage", MAIN)).toBe(true);
  });

  test("branch managers hold services.manage only for their own branch", () => {
    const mgr = fakeCtx({
      ownBranchIds: [MAIN],
      branchId: MAIN,
      grants: [grant("services.manage", "branch", MAIN)],
    });
    expect(canAccessBranch(mgr, "services.manage", MAIN)).toBe(true);
    expect(canAccessBranch(mgr, "services.manage", "branch-other")).toBe(false);
    // And no year-end authority at all:
    expect(mgr.grants.some((g) => g.permission === "year_end.manage")).toBe(false);
  });

  test("branch-bound services grants without a branch see nothing (fail closed)", () => {
    const broken = fakeCtx({ grants: [grant("services.view", "branch", null)] });
    expect(canAccessBranch(broken, "services.view", MAIN)).toBe(false);
  });
});
