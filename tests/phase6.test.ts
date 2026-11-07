// Unit tests: Phase-6 domain rules — branch master-data DTO validation and
// the org-level RBAC policy (branches.manage held ONLY by admin and
// مدیر عام), plus the user-assignment DTO contract (branch + sections).

import { describe, test, expect } from "bun:test";
import { branchDto } from "../src/server/academic";
import { userCreateDto } from "../src/server/users";
import { grantsForRole, ROLE_MATRIX } from "../src/server/rbac/permissions";

describe("Phase 6 — branch master data DTO", () => {
  test("a valid branch passes (defaults isActive)", () => {
    const dto = branchDto.parse({ name: "شعبهٔ سوم", code: "KRT-03" });
    expect(dto.isActive).toBe(true);
    expect(dto.name).toBe("شعبهٔ سوم");
  });

  test("name and code are required with sane lengths", () => {
    expect(() => branchDto.parse({ name: "ش", code: "A" })).toThrow(); // name < 2
    expect(() => branchDto.parse({ name: "شعبهٔ سوم", code: "" })).toThrow(); // code < 1
    expect(() => branchDto.parse({ name: "x".repeat(81), code: "A" })).toThrow(); // name > 80
  });

  test("phone is normalized (Persian digits → +93 form)", () => {
    const dto = branchDto.parse({ name: "شعبهٔ سوم", code: "KRT-03", phone: "۰۷۰ ۰۰۰ ۰۰۰۰" });
    expect(typeof dto.phone).toBe("string");
    expect(dto.phone).not.toContain(" ");
  });
});

describe("Phase 6 — branch CRUD RBAC (org-level master data)", () => {
  test("branches.manage is held ONLY by admin and general_manager", () => {
    for (const [role, grants] of Object.entries(ROLE_MATRIX)) {
      const holds = grants.some((g) => g.permission === "branches.manage");
      if (role === "admin" || role === "general_manager") {
        expect(holds).toBe(true);
      } else {
        expect(holds).toBe(false);
      }
    }
  });

  test("branch managers keep academic.manage but NOT branches.manage", () => {
    const manager = grantsForRole("manager");
    expect(manager.some((g) => g.permission === "academic.manage")).toBe(true);
    expect(manager.some((g) => g.permission === "branches.manage")).toBe(false);
  });

  test("list access (academic.view) is broader than manage access", () => {
    const viewers = Object.entries(ROLE_MATRIX).filter(([role]) => role !== "student" && role !== "parent");
    for (const [role] of viewers) {
      if (["manager", "academic_manager", "registrar", "auditor", "teacher"].includes(role)) {
        expect(grantsForRole(role).some((g) => g.permission === "academic.view")).toBe(true);
      }
    }
  });
});

describe("Phase 6 — user assignment DTO carries branch + sections", () => {
  test("create accepts branchId and teacher section ids", () => {
    const dto = userCreateDto.parse({
      username: "ahmad.teacher", fullName: "احمد کریمی", password: "Password1",
      roleKey: "teacher", branchId: "br1", sectionIds: ["s1", "s2"],
    });
    expect(dto.branchId).toBe("br1");
    expect(dto.sectionIds).toEqual(["s1", "s2"]);
  });

  test("invalid role keys are rejected", () => {
    expect(() => userCreateDto.parse({
      username: "x.teacher", fullName: "احمد کریمی", password: "Password1", roleKey: "sultan",
    })).toThrow();
  });

  test("sectionIds defaults to an empty list", () => {
    const dto = userCreateDto.parse({
      username: "fin.user", fullName: "مسئول مالی", password: "Password1", roleKey: "finance_officer",
    });
    expect(dto.sectionIds).toEqual([]);
  });
});
