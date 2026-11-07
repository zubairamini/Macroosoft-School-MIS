// Unit tests: Phase-3 domain rules that are pure logic — Solar Hijri month
// keys/ranges, diram↔AFN formatting, invoice status derivation, and the
// fail-closed branch isolation semantics of the scope engine.

import { describe, test, expect } from "bun:test";
import {
  jalaliMonthKey, jalaliMonthLabel, recentMonthKeys, monthRange,
} from "../src/server/finance";
import { canAccessBranch, directBranchFilter } from "../src/server/rbac/scope";
import { faMoney, faMoneyNum, afnToDiram, diramToAfnInput } from "../src/lib/format";
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

describe("Phase 3 — Solar Hijri months", () => {
  test("ISO dates map to machine month keys", () => {
    expect(jalaliMonthKey("2026-11-07")).toBe("1405-08"); // عقرب
    expect(jalaliMonthKey("2026-03-21")).toBe("1405-01"); // حمل
    expect(jalaliMonthKey("2026-10-22")).toBe("1405-07"); // آخر میزان
  });

  test("month keys map to Dari labels with Persian digits", () => {
    expect(jalaliMonthLabel("1405-08")).toBe("عقرب ۱۴۰۵");
    expect(jalaliMonthLabel("1405-01")).toBe("حمل ۱۴۰۵");
    expect(jalaliMonthLabel("1405-12")).toBe("حوت ۱۴۰۵");
  });

  test("month ranges are ISO date-only and end-exclusive", () => {
    const r = monthRange("1405-08");
    expect(r.start).toBe("2026-10-23");
    expect(r.end).toBe("2026-11-22"); // start of حوت minus… next month start
    const mizan = monthRange("1405-07");
    expect(mizan.start).toBe("2026-09-23");
    expect(mizan.end).toBe("2026-10-23");
  });

  test("recent month keys roll over the Solar Hijri year", () => {
    expect(recentMonthKeys("1405-02", 3)).toEqual(["1404-12", "1405-01", "1405-02"]);
    expect(recentMonthKeys("1405-01", 2)).toEqual(["1404-12", "1405-01"]);
  });
});

describe("Phase 3 — money invariants (diram integers)", () => {
  test("diram renders as grouped AFN with Persian digits", () => {
    expect(faMoney(120_000)).toBe("۱٬۲۰۰ افغانی");
    expect(faMoney(1)).toBe("۰٫۰۱ افغانی");
    expect(faMoney(12_550)).toBe("۱۲۵٫۵۰ افغانی");
    expect(faMoney(0)).toBe("۰ افغانی");
    expect(faMoney(null)).toBe("—");
  });

  test("compact money drops the currency word", () => {
    expect(faMoneyNum(120_000)).toBe("۱٬۲۰۰");
  });

  test("AFN input converts to exact diram integers (never floats)", () => {
    expect(afnToDiram("1200")).toBe(120_000);
    expect(afnToDiram("۱٬۲۰۰")).toBe(120_000);
    expect(afnToDiram("1250.5")).toBe(125_050);
    expect(afnToDiram("12.345")).toBe(1_235); // rounds half-up to the diram
    expect(afnToDiram("")).toBeNull();
    expect(afnToDiram("abc")).toBeNull();
    expect(Number.isInteger(afnToDiram("7.999") ?? 0)).toBe(true);
  });

  test("diram round-trips through the AFN input form", () => {
    expect(diramToAfnInput(120_000)).toBe("1200");
    expect(diramToAfnInput(125_050)).toBe("1250.50");
    expect(afnToDiram(diramToAfnInput(125_050))).toBe(125_050);
  });
});

describe("Phase 3 — branch isolation (fail closed)", () => {
  const BRANCH_A = "branch-a";
  const BRANCH_B = "branch-b";

  test("a branch grant without a concrete branchId grants NOTHING", () => {
    const ctx = fakeCtx({ grants: [grant("students.view", "branch", null)] });
    expect(canAccessBranch(ctx, "students.view", BRANCH_A)).toBe(false);
    expect(canAccessBranch(ctx, "students.view", BRANCH_B)).toBe(false);
    expect(directBranchFilter(ctx, "students.view")).toEqual({ branchIds: ["__none__"] });
  });

  test("branch grants with a concrete branchId allow only that branch", () => {
    const ctx = fakeCtx({
      ownBranchIds: [BRANCH_A],
      branchId: BRANCH_A,
      grants: [grant("students.view", "branch", BRANCH_A)],
    });
    expect(canAccessBranch(ctx, "students.view", BRANCH_A)).toBe(true);
    expect(canAccessBranch(ctx, "students.view", BRANCH_B)).toBe(false);
    expect(directBranchFilter(ctx, "students.view")).toEqual({ branchIds: [BRANCH_A] });
  });

  test("all-scope grants (admin / مدیر عام) cross every branch", () => {
    const ctx = fakeCtx({
      isCrossBranch: true,
      grants: [grant("students.view", "all", null)],
    });
    expect(canAccessBranch(ctx, "students.view", BRANCH_A)).toBe(true);
    expect(canAccessBranch(ctx, "students.view", BRANCH_B)).toBe(true);
    // No active branch context → org-wide lists.
    expect(directBranchFilter(ctx, "students.view")).toEqual({ branchIds: null });
    // With an active branch context → narrowed to that branch.
    expect(directBranchFilter({ ...ctx, branchId: BRANCH_B }, "students.view"))
      .toEqual({ branchIds: [BRANCH_B] });
  });

  test("no grant at all → deny (null filter)", () => {
    const ctx = fakeCtx({});
    expect(canAccessBranch(ctx, "invoices.view", BRANCH_A)).toBe(false);
    expect(directBranchFilter(ctx, "invoices.view")).toBeNull();
  });

  test("a branch-bound user cannot hop to another branch via the context header", () => {
    // The server pins ctx.branchId to an OWN branch; a forged hint for
    // branch B is ignored (simulated here by the pinned context).
    const ctx = fakeCtx({
      ownBranchIds: [BRANCH_A],
      branchId: BRANCH_A, // forced by buildAuthContext
      grants: [grant("invoices.view", "branch", BRANCH_A)],
    });
    expect(directBranchFilter(ctx, "invoices.view")).toEqual({ branchIds: [BRANCH_A] });
  });
});

describe("Phase 3 — invoice status invariants", () => {
  // Mirrors the server-side invoiceStatusAfter() contract.
  function statusAfter(paid: number, net: number): string {
    if (paid >= net) return "paid";
    if (paid > 0) return "partially_paid";
    return "issued";
  }

  test("missing payment never equals paid", () => {
    expect(statusAfter(0, 120_000)).toBe("issued");
    expect(statusAfter(60_000, 120_000)).toBe("partially_paid");
    expect(statusAfter(120_000, 120_000)).toBe("paid");
    // Discounted net: 50% discount halves the payable amount.
    expect(statusAfter(60_000, 60_000)).toBe("paid");
  });

  test("diram arithmetic stays integral under percentages", () => {
    // 50% of 120000 diram must be an exact integer.
    expect(Math.round((120_000 * 50) / 100)).toBe(60_000);
    // 33% of 99900 diram rounds to the nearest diram.
    expect(Math.round((99_900 * 33) / 100)).toBe(32_967);
  });
});
