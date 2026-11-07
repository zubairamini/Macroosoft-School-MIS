#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Insert Phase-3 finance + branch-isolation sections into tests/e2e_api.py."""

path = "/home/z/my-project/tests/e2e_api.py"
src = open(path, encoding="utf-8").read()

marker = """    # ── Summary ──────────────────────────────────────────────────────────"""

new_section = '''    # ── 11. Phase 3: fees, invoices, payments, payroll, reports ──────────
    print("\\n[11] Phase 3 — finance flows (fees → invoices → payments → payroll)")
    finance_cookie, _ = login("finance", "Finance1234")

    status, body, _ = req("GET", "/fees", cookie=finance_cookie)
    fees = body.get("data", []) if status == 200 else []
    check("finance officer lists fee structures", status == 200 and len(fees) >= 2,
          f"status={status} count={len(fees)}")
    check("second-branch fee structure hidden from main-branch finance officer",
          not any("خوشحال خان" in (f.get("branchName") or "") for f in fees),
          f"branches={[f.get('branchName') for f in fees]}")
    monthly_main = next((f for f in fees if f.get("periodKind") == "monthly"
                         and "کارتهٔ نو" in (f.get("branchName") or "")), None)
    check("main-branch monthly fee structure visible", monthly_main is not None)

    # Issue invoices for an untouched month (سنبله ۱۴۰۵ = 1405-06).
    status, body, _ = req("POST", "/invoices", cookie=finance_cookie, body={
        "feeStructureId": monthly_main["id"] if monthly_main else "",
        "periodKey": "1405-06",
        "periodLabel": "شهریهٔ ماهٔ سنبله ۱۴۰۵",
        "dueDate": "2026-09-05",
    })
    issue = body.get("data", {})
    check("bulk invoice issue for سنبله ۱۴۰۵ succeeds",
          status == 200 and issue.get("createdCount", 0) > 0,
          f"status={status} body={body.get('error', issue)}")

    # Re-issue for the same period → everything skipped (idempotent per student).
    status, body, _ = req("POST", "/invoices", cookie=finance_cookie, body={
        "feeStructureId": monthly_main["id"] if monthly_main else "",
        "periodKey": "1405-06",
        "periodLabel": "شهریهٔ ماهٔ سنبله ۱۴۰۵",
    })
    reissue = body.get("data", {})
    check("re-issue for the same period skips existing invoices",
          status == 200 and reissue.get("createdCount") == 0 and reissue.get("skippedCount", 0) > 0,
          f"body={reissue}")

    status, body, _ = req("GET", "/invoices?periodKey=1405-06&outstanding=true", cookie=finance_cookie)
    outstanding = body.get("data", []) if status == 200 else []
    check("new invoices appear as outstanding (issued, unpaid)",
          status == 200 and len(outstanding) >= issue.get("createdCount", 0),
          f"count={len(outstanding)}")
    check("discount snapshot applied to the staff child (S-1405-0003)",
          any(inv.get("discountDiram", 0) > 0 for inv in outstanding),
          "no invoice carried a discount")

    # Collect a partial payment on the first outstanding invoice.
    target = outstanding[0] if outstanding else None
    check("an unpaid invoice with a balance exists", target is not None and target["balanceDiram"] > 0)
    if target:
        half = target["balanceDiram"] // 2
        status, body, _ = req("POST", "/payments", cookie=finance_cookie, body={
            "invoiceId": target["id"], "amountDiram": half, "method": "cash",
        })
        pay = body.get("data", {})
        check("partial payment recorded with a sequential receipt",
              status == 200 and pay.get("receiptNumber", "").startswith("R-1405-"),
              f"status={status} body={body.get('error', pay)}")
        payment_id = pay.get("id")

        # Overpayment rejected (مبلغ بیش از بقیه).
        status, body, _ = req("POST", "/payments", cookie=finance_cookie, body={
            "invoiceId": target["id"], "amountDiram": target["balanceDiram"] + 1, "method": "cash",
        })
        check("overpayment rejected with 400", status == 400,
              f"status={status}")

        # Invoice now partially paid.
        status, body, _ = req("GET", f"/invoices/{target['id']}", cookie=finance_cookie)
        inv = body.get("data", {})
        check("invoice moved to «بخشی پرداخت‌شده»",
              status == 200 and inv.get("status") == "partially_paid",
              f"status={inv.get('status')}")

        # Void the payment → balance restored, invoice back to issued.
        status, body, _ = req("PATCH", f"/payments/{payment_id}", cookie=finance_cookie, body={
            "reason": "اصلاح آزمایشی در تست e2e",
        })
        check("payment voided with a reason", status == 200, f"status={status}")
        status, body, _ = req("GET", f"/invoices/{target['id']}", cookie=finance_cookie)
        inv = body.get("data", {})
        check("voiding restores the full balance (invoice re-issued state)",
              status == 200 and inv.get("status") == "issued" and inv.get("paidDiram") == 0,
              f"status={inv.get('status')} paid={inv.get('paidDiram')}")

        # Cashier may collect but NOT void.
        cashier_cookie, _ = login("cashier", "Cashier1234")
        status, body, _ = req("POST", "/payments", cookie=cashier_cookie, body={
            "invoiceId": target["id"], "amountDiram": 10_000, "method": "cash",
        })
        check("cashier can record a payment", status == 200, f"status={status}")
        cashier_payment_id = body.get("data", {}).get("id")
        if cashier_payment_id:
            status, body, _ = req("PATCH", f"/payments/{cashier_payment_id}", cookie=cashier_cookie, body={
                "reason": "تلاش غیرمجاز صندوقدار",
            })
            check("cashier cannot void payments (403)", status == 403, f"status={status}")
            # Clean up: finance voids the cashier test payment.
            req("PATCH", f"/payments/{cashier_payment_id}", cookie=finance_cookie, body={
                "reason": "پاک‌سازی پس از تست صندوقدار",
            })

    # Payroll: the seeded عقرب run for the main branch is APPROVED → pay it.
    status, body, _ = req("GET", "/payroll?status=approved", cookie=finance_cookie)
    runs = body.get("data", []) if status == 200 else []
    check("payroll runs list is branch-scoped (no خوشحال خان runs)",
          status == 200 and not any("خوشحال خان" in (r.get("branchName") or "") for r in runs),
          f"branches={[r.get('branchName') for r in runs]}")
    if runs:
        run = runs[0]
        status, body, _ = req("PATCH", f"/payroll/{run['id']}", cookie=finance_cookie, body={
            "action": "pay",
        })
        check("paying an approved payroll run books a salaries expense",
              status == 200 and body.get("data", {}).get("expenseNumber", "").startswith("E-1405-"),
              f"status={status} body={body.get('error', body.get('data'))}")
        status, body, _ = req("GET", "/expenses?category=salaries", cookie=finance_cookie)
        sal_exp = body.get("data", []) if status == 200 else []
        check("salaries expense visible in the expenses ledger",
              status == 200 and any("معاشات" in (e.get("payee") or "") for e in sal_exp),
              f"count={len(sal_exp)}")
        # Paying twice is rejected.
        status, body, _ = req("PATCH", f"/payroll/{run['id']}", cookie=finance_cookie, body={
            "action": "pay",
        })
        check("paying an already-paid run is rejected", status == 400, f"status={status}")

    # Finance reports.
    status, body, _ = req("GET", "/finance/reports", cookie=finance_cookie)
    rep = body.get("data", {})
    check("finance reports render with a six-month series",
          status == 200 and len(rep.get("series", [])) == 6,
          f"status={status} series={len(rep.get('series', []))}")
    check("finance report shows outstanding balances",
          status == 200 and rep.get("outstanding", {}).get("totalDiram", 0) > 0,
          f"outstanding={rep.get('outstanding')}")

    # ── 12. Branch isolation ────────────────────────────────────────────
    print("\\n[12] Branch isolation (کارتهٔ نو ↔ خوشحال خان)")
    admin_cookie, admin_me = login("admin", "Admin1234")
    gm_cookie, gm_me = login("gm", "General1234")
    registrar_cookie, _ = login("registrar", "Registrar1234")
    manager2_cookie, _ = login("manager2", "Manager1234")

    check("admin me carries isCrossBranch=true", admin_me.get("isCrossBranch") is True)
    check("registrar me carries exactly one own branch",
          login("registrar", "Registrar1234")[1].get("isCrossBranch") is False
          and len(login("registrar", "Registrar1234")[1].get("ownBranchIds", [])) == 1)

    status, body, _ = req("GET", "/branches", cookie=admin_cookie)
    branches = body.get("data", []) if status == 200 else []
    check("admin sees both branches", status == 200 and len(branches) == 2, f"count={len(branches)}")
    main_branch = next((b for b in branches if "کارتهٔ نو" in b["name"]), None)
    second_branch = next((b for b in branches if "خوشحال خان" in b["name"]), None)
    check("branch codes resolve (MAIN / KHK)",
          main_branch and second_branch and main_branch["code"] == "MAIN" and second_branch["code"] == "KHK")

    status, body, _ = req("GET", "/branches", cookie=registrar_cookie)
    reg_branches = body.get("data", []) if status == 200 else []
    check("registrar sees only their own branch", len(reg_branches) == 1 and "کارتهٔ نو" in reg_branches[0]["name"],
          f"branches={[b['name'] for b in reg_branches]}")

    status, body, _ = req("GET", "/org", cookie=registrar_cookie)
    reg_org_branches = body.get("data", {}).get("branches", [])
    check("org context exposes only the own branch to branch-bound users",
          len(reg_org_branches) == 1, f"count={len(reg_org_branches)}")

    # Student lists partition strictly by branch.
    def student_page(cookie, extra=""):
        status, body, _ = req("GET", f"/students?pageSize=200{extra}", cookie=cookie)
        data = body.get("data", [])
        meta = body.get("meta", {}) or {}
        return data, meta.get("total", len(data))

    reg_students, reg_total = student_page(registrar_cookie)
    m2_students, m2_total = student_page(manager2_cookie)
    admin_students, admin_total = student_page(admin_cookie)

    check("registrar (کارتهٔ نو) sees only main-branch students",
          reg_total > 0 and all(
              (s.get("currentEnrollment") or {}).get("branchName") is None
              or "کارتهٔ نو" in ((s.get("currentEnrollment") or {}).get("branchName") or "")
              for s in reg_students),
          f"total={reg_total}")
    check("manager2 (خوشحال خان) sees only second-branch students",
          m2_total > 0 and all(
              "خوشحال خان" in ((s.get("currentEnrollment") or {}).get("branchName") or "")
              for s in m2_students),
          f"total={m2_total}")
    check("branch student partitions add up to the admin total",
          reg_total + m2_total == admin_total,
          f"reg={reg_total} m2={m2_total} admin={admin_total}")
    check("general_manager sees every student like admin",
          student_page(gm_cookie)[1] == admin_total)

    # Cross-record access is denied even with a guessed id.
    if m2_students:
        second_branch_student = m2_students[0]["id"]
        status, body, _ = req("GET", f"/students/{second_branch_student}", cookie=registrar_cookie)
        check("registrar cannot open a second-branch student profile (403)",
              status == 403, f"status={status}")
        status, body, _ = req("GET", f"/students/{second_branch_student}", cookie=gm_cookie)
        check("general_manager CAN open the same profile", status == 200, f"status={status}")

    # A forged branch-context header cannot widen a branch-bound user's scope.
    if second_branch:
        status, body, _ = req("GET", "/students?pageSize=200", cookie=registrar_cookie,
                              headers={"x-maktabyar-branch": second_branch["id"]})
        forged_total = (body.get("meta", {}) or {}).get("total", -1)
        check("forged branch header is ignored for branch-bound users",
              status == 200 and forged_total == reg_total,
              f"forged_total={forged_total} reg_total={reg_total}")

        # But for admin it switches the active context.
        status, body, _ = req("GET", "/students?pageSize=200", cookie=admin_cookie,
                              headers={"x-maktabyar-branch": second_branch["id"]})
        switched_total = (body.get("meta", {}) or {}).get("total", -1)
        check("admin branch switcher narrows the student list",
              status == 200 and switched_total == m2_total,
              f"switched_total={switched_total} m2_total={m2_total}")

    # Sections, staff and users are branch-scoped too.
    status, body, _ = req("GET", "/sections", cookie=registrar_cookie)
    reg_sections = body.get("data", []) if status == 200 else []
    check("registrar sees only main-branch class sections",
          status == 200 and len(reg_sections) > 0 and all(
              "کارتهٔ نو" in (s.get("branch", {}) or {}).get("name", "") for s in reg_sections),
          f"count={len(reg_sections)}")
    status, body, _ = req("GET", "/staff", cookie=manager2_cookie)
    m2_staff = body.get("data", []) if status == 200 else []
    check("manager2 sees only second-branch staff",
          status == 200 and len(m2_staff) == 3 and not any("خالد حسینی" in s["fullName"] for s in m2_staff),
          f"staff={[s['fullName'] for s in m2_staff]}")
    status, body, _ = req("GET", "/users", cookie=manager2_cookie)
    m2_users = body.get("data", []) if status == 200 else []
    check("manager2 sees only users bound to the second branch",
          status == 200 and all(
              all("خوشحال خان" in (r.get("branchName") or "") for r in u["roles"] if r.get("branchName"))
              for u in m2_users),
          f"users={[u['username'] for u in m2_users]}")

    # Manager2's finance view is read-only within their branch.
    status, body, _ = req("GET", "/invoices?outstanding=true", cookie=manager2_cookie)
    m2_inv = body.get("data", []) if status == 200 else []
    check("manager2 sees only second-branch invoices",
          status == 200 and all("خوشحال خان" in (i.get("branchName") or "") for i in m2_inv),
          f"count={len(m2_inv)}")
    if m2_inv:
        status, body, _ = req("PATCH", f"/invoices/{m2_inv[0]['id']}", cookie=manager2_cookie, body={
            "reason": "تلاش مدیر شعبه برای باطل‌کردن",
        })
        check("manager cannot void invoices (read-only finance, 403)", status == 403, f"status={status}")

    # Parent portal: invoices limited to the guardian's own children.
    status, body, _ = req("GET", "/dashboard/summary", cookie=parent_cookie)
    children_ids = {c["studentId"] for c in (body.get("data", {}).get("children") or [])}
    status, body, _ = req("GET", "/invoices", cookie=parent_cookie)
    parent_inv = body.get("data", []) if status == 200 else []
    check("parent sees invoices of their own children only",
          status == 200 and len(parent_inv) > 0 and all(i["studentId"] in children_ids for i in parent_inv),
          f"count={len(parent_inv)} children={len(children_ids)}")

'''

assert marker in src, "summary marker not found"
src = src.replace(marker, new_section + marker, 1)

# Update the docstring header to describe the new sections.
src = src.replace(
    """  10. Logout revokes session""",
    """  10. Logout revokes session
 11. Phase 3 finance: fee structures → bulk invoice issue (idempotent per
     period) → partial payment → overpayment rejection → payment void →
     payroll approve/pay (books a salaries expense) → finance reports
 12. Branch isolation: branch-bound roles see only their own branch's
     students/sections/staff/users/invoices; forged branch headers are
     ignored; admin & general_manager cross branches; the branch switcher
     narrows admin's lists""",
    1,
)

open(path, "w", encoding="utf-8").write(src)
print("✅ e2e_api.py extended with Phase 3 + branch isolation sections")
