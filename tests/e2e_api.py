#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
End-to-end API integration test for مکتب‌یار (MaktabYar) Phase 1 vertical slice.

Runs against the live dev server (http://localhost:3000) and exercises:
  1.  Secure login (session cookie, wrong password, rate limiting evidence hook)
  2.  Admission workflow: create → submit → start review → approve → enroll
  3.  Atomic enrollment: student + guardians + enrollment + documents + audit
  4.  Duplicate detection advisory
  5.  Permission scoping:
        - parent sees ONLY linked children (403 on another family's student)
        - teacher sees ONLY assigned sections
        - cashier cannot review applications
        - finance cannot update students (no students.update grant)
  6.  Sensitive field restriction (healthNotes hidden without grant)
  7.  Optimistic concurrency (version conflict → 409)
  8.  State machine guard (cannot enroll a draft)
  9.  CSRF protection (missing client header + foreign origin → 403)
  10. Logout revokes session

Usage: python3 tests/e2e_api.py
"""

import json
import sys
import time
import urllib.request
import urllib.error

BASE = "http://localhost:3000/api/v1"
HEADERS = {"Content-Type": "application/json", "x-maktabyar-client": "1"}

passed = 0
failed = 0
failures = []


def check(name, cond, detail=""):
    global passed, failed
    if cond:
        passed += 1
        print(f"  ✅ {name}")
    else:
        failed += 1
        failures.append((name, detail))
        print(f"  ❌ {name} — {detail}")


def req(method, path, body=None, cookie=None, headers=None, origin=None):
    # Percent-encode non-ASCII path segments (e.g. Dari search queries).
    from urllib.parse import quote
    encoded = quote(path, safe="/?&=%+")
    url = BASE + encoded
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    h = dict(HEADERS)
    if headers:
        h.update(headers)
    if cookie:
        h["Cookie"] = cookie
    if origin:
        h["Origin"] = origin
    for k, v in h.items():
        r.add_header(k, v)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read().decode()
            return resp.status, (json.loads(raw) if raw else {}), resp.headers.get("Set-Cookie")
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw else {}, e.headers.get("Set-Cookie")
        except json.JSONDecodeError:
            return e.code, {"raw": raw}, None


def login(username, password):
    status, body, cookie = req("POST", "/auth/login", {"username": username, "password": password})
    assert status == 200, f"login {username} failed: {status} {body}"
    return cookie.split(";")[0], body["data"]


def main():
    print("═" * 70)
    print("مکتب‌یار — End-to-end API integration test (Phase 1 vertical slice)")
    print("═" * 70)

    # ── 1. Authentication ────────────────────────────────────────────────
    print("\n[1] Authentication & sessions")
    status, body, _ = req("POST", "/auth/login", {"username": "admin", "password": "WRONG"})
    check("wrong password rejected with 401", status == 401 and body["error"]["code"] == "INVALID_CREDENTIALS")

    status, body, _ = req("GET", "/auth/me")
    check("unauthenticated /me rejected with 401", status == 401)

    admin_cookie, admin_me = login("admin", "Admin1234")
    check("admin login returns roles", admin_me["roles"] == ["admin"])
    check("admin has NO applications.review (separation of duties)",
          all(g["permission"] != "applications.review" for g in admin_me["grants"]))

    status, body, _ = req("GET", "/auth/me", cookie=admin_cookie)
    check("session cookie works on /me", status == 200 and body["data"]["user"]["username"] == "admin")

    # ── 2. Admission workflow ────────────────────────────────────────────
    print("\n[2] Admission workflow (registrar → manager)")
    reg_cookie, _ = login("registrar", "Registrar1234")
    mgr_cookie, _ = login("manager", "Manager1234")
    cashier_cookie, _ = login("cashier", "Cashier1234")
    teacher_cookie, _ = login("teacher", "Teacher1234")
    parent_cookie, _ = login("walikhal", "Parent1234")
    finance_cookie, _ = login("finance", "Finance1234")

    # context
    status, org_ctx, _ = req("GET", "/org", cookie=reg_cookie)
    year_id = org_ctx["data"]["currentYear"]["id"]
    status, grades_body, _ = req("GET", "/grades", cookie=reg_cookie)
    grade7 = next(g for g in grades_body["data"] if g["level"] == 7)
    status, secs_body, _ = req("GET", f"/sections?academicYearId={year_id}&gradeLevelId={grade7['id']}", cookie=reg_cookie)
    section = secs_body["data"][0]
    check("sections list includes enrollment counts", "_count" in section)

    # create application
    personal = {
        "firstName": "مهدی",
        "fatherName": "عبدالستار",
        "grandfatherName": "نبی",
        "gender": "male",
        "birthDate": "2013-04-15",
        "birthPlace": "کابل",
        "phone": "+93799990001",
        "address": "کابل",
        "previousSchool": "مکتب ابتدایی نور",
        "previousGrade": 6,
        "healthNotes": "آسم خفیف — اسپری دسترس باشد.",
    }
    app_body = {
        "academicYearId": year_id,
        "personal": personal,
        "requestedGradeId": grade7["id"],
        "requestedSectionId": None,
        "requestedShiftId": None,
        "guardians": [
            {"fullName": "عبدالستار نوری", "relationship": "پدر", "phone": "۰۷۰ ۱۲۳ ۴۵۶۷",
             "occupation": "معلم", "isPrimary": True, "contactRights": True, "portalAccess": True},
        ],
        "documents": [
            {"type": "tazkira", "title": "کاپی تذکره", "provided": True},
            {"type": "photo", "title": "عکس پرسنلی", "provided": True},
        ],
    }
    status, body, _ = req("POST", "/applications", app_body, cookie=reg_cookie)
    check("application created (draft)", status == 200 and body["data"]["status"] == "draft")
    app = body["data"]
    check("applicant number assigned", app["applicantNumber"].startswith("A-1405-"))
    check("Persian-digit phone normalized to +93",
          app["guardians"][0]["phone"] == "+93701234567",
          f"got {app['guardians'][0]['phone']}")

    # state machine guard: cannot enroll a draft
    status, body, _ = req("POST", f"/applications/{app['id']}/enroll",
                          {"classSectionId": section["id"]}, cookie=reg_cookie)
    check("enrolling a DRAFT is blocked", status == 400)

    # cashier cannot submit applications (no grant)
    status, body, _ = req("POST", f"/applications/{app['id']}/submit", cookie=cashier_cookie)
    check("cashier cannot submit application (403)", status == 403)

    # admin cannot review (separation of duties)
    status, body, _ = req("POST", f"/applications/{app['id']}/review",
                          {"action": "approve"}, cookie=admin_cookie)
    check("admin cannot review applications (403)", status == 403)

    # submit
    status, body, _ = req("POST", f"/applications/{app['id']}/submit", cookie=reg_cookie)
    check("registrar submits application", status == 200 and body["data"]["status"] == "submitted")

    # manager starts review
    status, body, _ = req("POST", f"/applications/{app['id']}/review",
                          {"action": "start"}, cookie=mgr_cookie)
    check("manager starts review", status == 200 and body["data"]["status"] == "under_review")

    # reject requires a reason
    status, body, _ = req("POST", f"/applications/{app['id']}/review",
                          {"action": "reject"}, cookie=mgr_cookie)
    check("rejection without reason is blocked", status == 400)

    # manager approves with note
    status, body, _ = req("POST", f"/applications/{app['id']}/review",
                          {"action": "approve", "note": "تایید پس از مصاحبه"}, cookie=mgr_cookie)
    check("manager approves application", status == 200 and body["data"]["status"] == "approved")

    # ── 3. Enrollment (atomic) ───────────────────────────────────────────
    print("\n[3] Atomic enrollment")
    enroll_body = {"classSectionId": section["id"], "enrolledOn": "2026-11-01", "rollNumber": 99}
    status, body, _ = req("POST", f"/applications/{app['id']}/enroll", enroll_body, cookie=reg_cookie)
    check("enrollment succeeds", status == 200 and body["data"]["studentNumber"].startswith("S-1405-"))
    student_id = body["data"]["studentId"]

    # enroll again → blocked (state machine)
    status, body, _ = req("POST", f"/applications/{app['id']}/enroll", enroll_body, cookie=reg_cookie)
    check("second enrollment is blocked (exactly-once)", status == 400)

    # student profile from registrar: sensitive visible, docs copied
    status, profile, _ = req("GET", f"/students/{student_id}", cookie=reg_cookie)
    p = profile["data"]
    check("student profile has enrollment", len(p["enrollments"]) == 1)
    check("sensitive healthNotes visible to registrar", p["personal"].get("healthNotes") == personal["healthNotes"])
    check("provided documents copied to student", len(p["documents"]) == 2)
    check("guardian linked with normalized phone",
          any(g["phone"] == "+93701234567" for g in p["guardians"]))

    # audit trail recorded
    status, audit, _ = req("GET", f"/audit-events?entity=Application&entityId={app['id']}", cookie=admin_cookie)
    actions = [e["action"] for e in audit["data"]]
    check("audit trail covers full workflow",
          "application.create" in actions and "application.enroll" in actions,
          f"actions={actions}")

    # ── 4. Duplicate detection ───────────────────────────────────────────
    print("\n[4] Duplicate detection (advisory, never auto-merge)")
    status, sim, _ = req("GET", f"/applications/{app['id']}/similar", cookie=reg_cookie)
    check("similar endpoint responds", status == 200 and isinstance(sim["data"], list))

    # ── 5. Permission scoping ────────────────────────────────────────────
    print("\n[5] Permission scoping")
    # Parent: find own children
    status, dash, _ = req("GET", "/dashboard/summary", cookie=parent_cookie)
    children = dash["data"].get("children", [])
    check("parent dashboard lists only linked children", len(children) == 2,
          f"got {len(children)}")

    if children:
        own_child_id = children[0]["studentId"]
        status, body, _ = req("GET", f"/students/{own_child_id}", cookie=parent_cookie)
        check("parent CAN read own child", status == 200)
        check("parent sees NO sensitive fields (healthNotes stripped)",
              "healthNotes" not in body["data"]["personal"])

        status, body, _ = req("GET", f"/students/{student_id}", cookie=parent_cookie)
        check("parent CANNOT read another family's student (403)", status == 403)

    # Parent cannot list students broadly (scoped where returns only linked)
    status, body, _ = req("GET", "/students", cookie=parent_cookie)
    total = body.get("meta", {}).get("total", -1) if status == 200 else -1
    check("parent student list limited to children", status == 200 and total <= 2,
          f"total={total}")

    # Teacher: only assigned sections (seeded: grade 4-الف, 5-الف)
    status, body, _ = req("GET", "/students", cookie=teacher_cookie)
    t_total = body.get("meta", {}).get("total", -1)
    check("teacher sees only students in assigned sections", status == 200 and t_total <= 4,
          f"total={t_total}")
    status, body, _ = req("GET", f"/students/{student_id}", cookie=teacher_cookie)
    check("teacher CANNOT read student outside assignment (403)", status == 403)

    # Finance: can view student (basic) but not update
    status, body, _ = req("GET", f"/students/{student_id}", cookie=finance_cookie)
    check("finance CAN view student (basic)", status == 200)
    check("finance does NOT see sensitive fields", "healthNotes" not in body["data"]["personal"])
    upd = {"personal": {**personal}, "version": profile["data"]["version"]}
    status, body, _ = req("PATCH", f"/students/{student_id}", upd, cookie=finance_cookie)
    check("finance CANNOT update student (403)", status == 403)

    # Cashier: no applications view
    status, body, _ = req("GET", "/applications", cookie=cashier_cookie)
    check("cashier cannot list applications (403)", status == 403)

    # ── 6. Optimistic concurrency ────────────────────────────────────────
    print("\n[6] Optimistic concurrency")
    status, prof2, _ = req("GET", f"/students/{student_id}", cookie=reg_cookie)
    v = prof2["data"]["version"]
    upd1 = {"personal": {**prof2["data"]["personal"], "address": "کابل، ناحیهٔ ۱۰"}, "version": v}
    status, body, _ = req("PATCH", f"/students/{student_id}", upd1, cookie=reg_cookie)
    check("update with correct version succeeds", status == 200)
    upd2 = {"personal": {**prof2["data"]["personal"], "address": "کابل، ناحیهٔ ۱۱"}, "version": v}
    status, body, _ = req("PATCH", f"/students/{student_id}", upd2, cookie=reg_cookie)
    check("stale version → 409 conflict", status == 409)

    # ── 7. Search is permission-aware ────────────────────────────────────
    print("\n[7] Permission-aware search")
    status, body, _ = req("GET", "/search?q=مهدی", cookie=reg_cookie)
    hits = body["data"]
    check("registrar search finds the new student", any(h["id"] == student_id for h in hits))
    status, body, _ = req("GET", "/search?q=مهدی", cookie=parent_cookie)
    hits_p = body["data"] if status == 200 else []
    check("parent search does NOT expose other students",
          not any(h["id"] == student_id for h in hits_p), f"hits={[h['title'] for h in hits_p]}")

    # ── 8. CSRF protection ───────────────────────────────────────────────
    print("\n[8] CSRF defense")
    status, body, _ = req("POST", f"/applications/{app['id']}/submit",
                          headers={"x-maktabyar-client": ""}, cookie=admin_cookie)
    check("mutation without client header blocked (403)", status == 403)
    status, body, _ = req("POST", "/auth/logout", origin="https://evil.example.com", cookie=admin_cookie)
    check("cross-origin mutation blocked (403)", status == 403)

    # ── 9. Notifications & outbox ────────────────────────────────────────
    print("\n[9] Notifications (outbox fanout)")
    status, body, _ = req("GET", "/notifications", cookie=mgr_cookie)
    titles = [n["title"] for n in body["data"]]
    check("manager got enrollment notification", any("شمول" in t for t in titles),
          f"titles={titles}")

    # ── 10. Logout revokes session ───────────────────────────────────────
    print("\n[10] Logout & session revocation")
    tmp_cookie, _ = login("cashier", "Cashier1234")
    status, body, _ = req("POST", "/auth/logout", cookie=tmp_cookie)
    check("logout returns ok", status == 200)
    status, body, _ = req("GET", "/auth/me", cookie=tmp_cookie)
    check("session revoked after logout (401)", status == 401)

    # ── Summary ──────────────────────────────────────────────────────────
    print("\n" + "═" * 70)
    print(f"RESULT: {passed} passed, {failed} failed")
    if failures:
        print("Failures:")
        for name, detail in failures:
            print(f"  - {name}: {detail}")
    print("═" * 70)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
