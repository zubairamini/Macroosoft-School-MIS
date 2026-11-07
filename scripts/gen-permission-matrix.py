#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Regenerate docs/PERMISSION-MATRIX.md from src/server/rbac/permissions.ts
(the single source of truth), so the doc can never drift."""

import re

src = open("/home/z/my-project/src/server/rbac/permissions.ts", encoding="utf-8").read()

# Parse PERMISSIONS list
perm_block = re.search(r"export const PERMISSIONS = \[(.*?)\] as const;", src, re.S).group(1)
permissions = re.findall(r'"([^"]+)"', perm_block)

# Parse ROLE_MATRIX
matrix_block = re.search(r"export const ROLE_MATRIX: Record<RoleKey, Grant\[\]> = \{(.*?)\n\};", src, re.S).group(1)
role_blocks = re.findall(r'(?:^|\n)  (\w+): \[(.*?)\n  \],', matrix_block, re.S)
roles = []
grants = {}
for name, body in role_blocks:
    roles.append(name)
    entries = re.findall(r'\{ permission: "([^"]+)", scope: "([^"]+)" \}', body)
    grants[name] = dict(entries)

# Parse labels
label_block = re.search(r"export const ROLE_LABELS_DARI: Record<RoleKey, string> = \{(.*?)\};", src, re.S).group(1)
labels = dict(re.findall(r'(\w+): "([^"]+)"', label_block))

SCOPE_SHORT = {"all": "A", "branch": "B", "year": "Y", "section": "S", "own": "O", "guardian": "G"}

col_roles = ["admin", "general_manager", "manager", "academic_manager", "registrar",
             "finance_officer", "cashier", "teacher", "librarian", "hr_officer",
             "student", "parent", "auditor"]

lines = []
lines.append("# Permission Matrix — ماتریس اجازه‌ها")
lines.append("")
lines.append("> ⚠️ This table is GENERATED from `src/server/rbac/permissions.ts` by")
lines.append("> `scripts/gen-permission-matrix.py` — regenerate it after changing the")
lines.append("> matrix; do not hand-edit.")
lines.append("")
lines.append("Single source of truth: `src/server/rbac/permissions.ts`")
lines.append("(`PERMISSIONS`, `ROLE_MATRIX`, `ROLE_LABELS_DARI`). Also served inside the")
lines.append("OpenAPI document (`/api/v1/openapi` → `components.x-role-matrix`) and")
lines.append("rendered in the UI at `#/settings/roles`.")
lines.append("")
lines.append("## Principles")
lines.append("")
lines.append("1. **Hiding a menu is not authorization.** Every endpoint enforces its")
lines.append("   permission server-side; the same check applies to search results,")
lines.append("   exports, and background jobs.")
lines.append("2. **Configuration ≠ approval ≠ restricted data.** `settings.manage`")
lines.append("   (admin) is deliberately separate from `applications.review`")
lines.append("   (manager/مدیر عام) and from `students.view_sensitive`.")
lines.append("3. **Scopes narrow grants per user.** A role grants (permission, scope);")
lines.append("   the user's role-assignment row supplies parameters (branchId,")
lines.append("   academicYearId, sectionIds, guardian link, own-record link).")
lines.append("4. **Branch isolation (Phase 3):** a `branch`-scoped grant WITHOUT a")
lines.append("   concrete `UserRole.branchId` grants NOTHING (fail closed). Only")
lines.append("   `admin` and `general_manager` hold `all`-scoped data grants.")
lines.append("5. Multi-role accounts take the union of grants.")
lines.append("")
lines.append("## Scope kinds")
lines.append("")
lines.append("| Scope | Meaning | Parameters |")
lines.append("|---|---|---|")
lines.append("| `all` | whole organization (only admin / مدیر عام for data) | — |")
lines.append("| `branch` | one school branch — **requires** `UserRole.branchId` | `UserRole.branchId` |")
lines.append("| `year` | one academic year | `UserRole.academicYearId` |")
lines.append("| `section` | assigned class sections | `UserRole.sectionIds` (JSON array) |")
lines.append("| `own` | the signed-in student's own record | `User.guardianId` self-link |")
lines.append("| `guardian` | explicitly linked children | `StudentGuardian` rows with `contactRights` |")
lines.append("")
lines.append("## Matrix (default roles) — " + str(len(col_roles)) + " roles × " + str(len(permissions)) + " permissions")
lines.append("")
lines.append("Legend: `A`=all · `B`=branch (needs branchId) · `S`=section · `G`=guardian · `O`=own · `Y`=year · — = not granted.")
lines.append("")
header = "| Permission | " + " | ".join(col_roles) + " |"
sep = "|---|" + "---|" * len(col_roles)
lines.append(header)
lines.append(sep)

# Group permissions by their section comments for readability
for perm in permissions:
    row = []
    for role in col_roles:
        scope = grants.get(role, {}).get(perm)
        row.append(SCOPE_SHORT.get(scope, "—") if scope else "—")
    lines.append(f"| {perm} | " + " | ".join(row) + " |")

lines.append("")
lines.append("## Role labels (Dari)")
lines.append("")
lines.append("| Role key | Dari label |")
lines.append("|---|---|")
for role in col_roles:
    lines.append(f"| `{role}` | {labels.get(role, role)} |")
lines.append("")

open("/home/z/my-project/docs/PERMISSION-MATRIX.md", "w", encoding="utf-8").write("\n".join(lines))
print(f"✅ PERMISSION-MATRIX.md regenerated: {len(col_roles)} roles × {len(permissions)} permissions")
