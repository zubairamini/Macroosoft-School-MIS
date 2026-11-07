// Unit tests: Phase-4 domain rules that are pure logic — library DTO
// validation with Dari messages, copy/loan status labels, the loan-state
// machine, announcement audience/DTO rules, and branch isolation for the
// new library/communications permissions.

import { describe, test, expect } from "bun:test";
import {
  bookTitleDto, bookCopiesDto, loanCheckoutDto, loanLostDto, copyUpdateDto,
  COPY_STATUSES, COPY_STATUS_LABELS, LOAN_STATUS_LABELS,
} from "../src/server/library";
import {
  announcementDto, messageSendDto, AUDIENCES, AUDIENCE_LABELS,
} from "../src/server/communications";
import { canAccessBranch, directBranchFilter } from "../src/server/rbac/scope";
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

describe("Phase 4 — library DTO validation (Dari messages)", () => {
  test("a valid title parses with defaulted gradeLevels and textbook flag", () => {
    const r = bookTitleDto.safeParse({ title: "ریاضی صنف پنجم" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.gradeLevels).toEqual([]);
      expect(r.data.isTextbook).toBe(false);
    }
  });

  test("short titles are rejected with a Dari message", () => {
    const r = bookTitleDto.safeParse({ title: "ک" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("نام کتاب را وارد کنید.");
    }
  });

  test("bulk copy counts are bounded (1..200)", () => {
    expect(bookCopiesDto.safeParse({ titleId: "t1", count: 0 }).success).toBe(false);
    expect(bookCopiesDto.safeParse({ titleId: "t1", count: 201 }).success).toBe(false);
    expect(bookCopiesDto.safeParse({ titleId: "t1", count: 25 }).success).toBe(true);
  });

  test("copy status transitions only accept available/withdrawn", () => {
    expect(copyUpdateDto.safeParse({ status: "available" }).success).toBe(true);
    expect(copyUpdateDto.safeParse({ status: "withdrawn" }).success).toBe(true);
    expect(copyUpdateDto.safeParse({ status: "loaned" }).success).toBe(false);
    expect(copyUpdateDto.safeParse({ status: "lost" }).success).toBe(false);
  });

  test("lost-book fines must be non-negative integers in diram", () => {
    expect(loanLostDto.safeParse({ fineDiram: 0 }).success).toBe(true);
    expect(loanLostDto.safeParse({ fineDiram: 25000 }).success).toBe(true);
    expect(loanLostDto.safeParse({ fineDiram: -5 }).success).toBe(false);
    expect(loanLostDto.safeParse({ fineDiram: 100_000_001 }).success).toBe(false);
  });

  test("checkout requires copy, student and a future ISO due date", () => {
    expect(loanCheckoutDto.safeParse({ copyId: "c1", studentId: "s1", dueOn: "2026-12-01" }).success).toBe(true);
    expect(loanCheckoutDto.safeParse({ copyId: "c1", studentId: "s1" }).success).toBe(false);
    expect(loanCheckoutDto.safeParse({ copyId: "c1", studentId: "s1", dueOn: "not-a-date" }).success).toBe(false);
  });
});

describe("Phase 4 — library status vocabulary", () => {
  test("every copy status has a Dari label", () => {
    for (const s of COPY_STATUSES) {
      expect(COPY_STATUS_LABELS[s]).toBeTruthy();
      expect(COPY_STATUS_LABELS[s]).not.toBe(s);
    }
  });

  test("loan statuses are the closed set {active, returned, lost}", () => {
    expect(Object.keys(LOAN_STATUS_LABELS).sort()).toEqual(["active", "lost", "returned"]);
  });
});

describe("Phase 4 — loan state machine (pure mirror of the server rules)", () => {
  type LoanStatus = "active" | "returned" | "lost";
  // Mirrors returnLoan/markLoanLost guards in src/server/library.
  function canReturn(status: LoanStatus): boolean {
    return status === "active";
  }
  function canFine(status: LoanStatus, today: string, dueOn: string): boolean {
    return status === "active" && today > dueOn; // late only
  }

  test("only active loans can be returned or marked lost", () => {
    expect(canReturn("active")).toBe(true);
    expect(canReturn("returned")).toBe(false);
    expect(canReturn("lost")).toBe(false);
  });

  test("fines apply only to LATE active loans", () => {
    expect(canFine("active", "2026-11-10", "2026-10-10")).toBe(true);
    expect(canFine("active", "2026-11-10", "2026-11-10")).toBe(false); // due TODAY
    expect(canFine("active", "2026-11-10", "2026-12-10")).toBe(false);
    expect(canFine("returned", "2026-11-10", "2026-10-10")).toBe(false);
  });
});

describe("Phase 4 — announcements & messages DTOs", () => {
  test("audience is a closed set with Dari labels", () => {
    expect([...AUDIENCES].sort()).toEqual(["all", "guardians", "staff"]);
    expect(AUDIENCE_LABELS.all).toContain("همه");
    expect(AUDIENCE_LABELS.guardians).toContain("اولیا");
    expect(AUDIENCE_LABELS.staff).toContain("کادر");
  });

  test("announcement requires a meaningful title and body", () => {
    expect(announcementDto.safeParse({ title: "اعلان", body: "متن کافی نیست" }).success).toBe(true);
    expect(announcementDto.safeParse({ title: "ا", body: "متن کافی" }).success).toBe(false);
    expect(announcementDto.safeParse({ title: "اعلان", body: "ک" }).success).toBe(false);
    expect(announcementDto.safeParse({ title: "اعلان", body: "متن", audience: "everyone" }).success).toBe(false);
  });

  test("message sends target guardians/staff over sms/email only", () => {
    expect(messageSendDto.safeParse({ target: "guardians", channel: "sms", body: "پیام" }).success).toBe(true);
    expect(messageSendDto.safeParse({ target: "staff", channel: "email", body: "پیام" }).success).toBe(true);
    expect(messageSendDto.safeParse({ target: "students", channel: "sms", body: "پیام" }).success).toBe(false);
    expect(messageSendDto.safeParse({ target: "guardians", channel: "push", body: "پیام" }).success).toBe(false);
  });
});

describe("Phase 4 — branch isolation for library & communications", () => {
  const MAIN = "branch-kart-e-now";
  const OTHER = "branch-khoshal-khan";

  test("librarian of one branch cannot act on another branch's library", () => {
    const ctx = fakeCtx({
      ownBranchIds: [MAIN],
      branchId: MAIN,
      grants: [
        grant("library.view", "branch", MAIN),
        grant("library.manage", "branch", MAIN),
      ],
    });
    expect(canAccessBranch(ctx, "library.manage", MAIN)).toBe(true);
    expect(canAccessBranch(ctx, "library.manage", OTHER)).toBe(false);
    expect(directBranchFilter(ctx, "library.view")).toEqual({ branchIds: [MAIN] });
  });

  test("a library grant without a concrete branchId grants NOTHING (fail closed)", () => {
    const ctx = fakeCtx({ grants: [grant("library.view", "branch", null)] });
    expect(canAccessBranch(ctx, "library.view", MAIN)).toBe(false);
    expect(directBranchFilter(ctx, "library.view")).toEqual({ branchIds: ["__none__"] });
  });

  test("admin / general_manager cross library branches, narrowed by context", () => {
    const ctx = fakeCtx({
      isCrossBranch: true,
      grants: [grant("library.manage", "all", null)],
    });
    expect(canAccessBranch(ctx, "library.manage", MAIN)).toBe(true);
    expect(canAccessBranch(ctx, "library.manage", OTHER)).toBe(true);
    expect(directBranchFilter({ ...ctx, branchId: OTHER }, "library.manage"))
      .toEqual({ branchIds: [OTHER] });
  });

  test("announcements.manage is branch-scoped for managers", () => {
    const ctx = fakeCtx({
      ownBranchIds: [MAIN],
      branchId: MAIN,
      grants: [grant("announcements.manage", "branch", MAIN)],
    });
    expect(canAccessBranch(ctx, "announcements.manage", MAIN)).toBe(true);
    expect(canAccessBranch(ctx, "announcements.manage", OTHER)).toBe(false);
  });
});
