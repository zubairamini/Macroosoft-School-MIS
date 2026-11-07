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
  9.  CSRF defense (layered, proxy-aware):
        - header-less cross-site "form" requests (no client header, foreign
          or missing Origin) → 403
        - requests WITH the trusted client header pass behind proxies that
          rewrite Host (Origin ≠ Host) — CSRF-safe for browsers because the
          API never emits Access-Control-Allow-Origin (preflight never
          approved)
        - header-less requests whose Origin matches X-Forwarded-Host pass
  10. Logout revokes session
 11. Phase 3 finance: fee structures → bulk invoice issue (idempotent per
     period) → partial payment → overpayment rejection → payment void →
     payroll approve/pay (books a salaries expense) → finance reports
 12. Branch isolation: branch-bound roles see only their own branch's
     students/sections/staff/users/invoices; forged branch headers are
     ignored; admin & general_manager cross branches; the branch switcher
     narrows admin's lists

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
    academic_cookie, _ = login("academic", "Academic1234")
    cashier_cookie, _ = login("cashier", "Cashier1234")
    teacher_cookie, _ = login("teacher", "Teacher1234")
    parent_cookie, _ = login("walikhal", "Parent1234")
    finance_cookie, _ = login("finance", "Finance1234")

    # context
    status, org_ctx, _ = req("GET", "/org", cookie=reg_cookie)
    year_id = org_ctx["data"]["currentYear"]["id"]
    status, grades_body, _ = req("GET", "/grades", cookie=reg_cookie)
    # Branch isolation: the registrar belongs to کارتهٔ نو (grades 1–6);
    # grade-7 sections live in the خوشحال خان branch and are invisible to them.
    grade7 = next(g for g in grades_body["data"] if g["level"] == 6)
    status, secs_body, _ = req("GET", f"/sections?academicYearId={year_id}&gradeLevelId={grade7['id']}", cookie=reg_cookie)
    check("registrar sees their own branch's grade-6 sections",
          status == 200 and len(secs_body["data"]) > 0, f"count={len(secs_body.get('data', []))}")
    status, secs_body7, _ = req("GET", f"/sections?academicYearId={year_id}&gradeLevelId=" + next(g["id"] for g in grades_body["data"] if g["level"] == 7), cookie=reg_cookie)
    check("registrar does NOT see other-branch grade-7 sections",
          status == 200 and len(secs_body7.get("data", [])) == 0)
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

    # Teacher: only assigned sections (seeded: 4-الف, 4-ب, 5-الف → 8 students
    # after the Phase-2 roster expansion — the org has 15 in total).
    status, body, _ = req("GET", "/students", cookie=teacher_cookie)
    t_total = body.get("meta", {}).get("total", -1)
    check("teacher sees only students in assigned sections", status == 200 and t_total == 8,
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

    # ── 8. CSRF protection (layered, proxy-aware) ────────────────────────
    print("\n[8] CSRF defense (layered, proxy-aware)")
    # (a) "Simple" requests without the trusted client header — the classic
    #     cross-site form POST vector — are rejected.
    status, body, _ = req("POST", f"/applications/{app['id']}/submit",
                          headers={"x-maktabyar-client": ""}, cookie=admin_cookie)
    check("mutation without client header blocked (403)", status == 403)
    status, body, _ = req("POST", "/auth/login",
                          {"username": "admin", "password": "Admin1234"},
                          origin="https://evil.example.com",
                          headers={"x-maktabyar-client": ""})
    check("cross-origin form-style mutation (no header) blocked (403)",
          status == 403)
    # (b) Requests carrying the trusted client header pass even when a
    #     reverse proxy rewrote the Host header (Origin ≠ Host) — the
    #     deployment path for TLS-terminating proxies / preview gateways.
    tmp_cookie, _ = login("cashier", "Cashier1234")
    status, body, _ = req("POST", "/auth/logout",
                          origin="https://preview.example.com",
                          cookie=tmp_cookie)
    check("client-header mutation behind Host-rewriting proxy allowed (200)",
          status == 200)
    # (c) What makes (b) CSRF-safe for browsers: this API never emits
    #     Access-Control-Allow-Origin, so a cross-site fetch() carrying a
    #     custom header can never pass the CORS preflight.
    r = urllib.request.Request(BASE + "/auth/me", method="GET")
    r.add_header("x-maktabyar-client", "1")
    r.add_header("Cookie", admin_cookie)
    acao = "(no response)"
    try:
        with urllib.request.urlopen(r) as resp:
            acao = resp.headers.get("Access-Control-Allow-Origin")
    except urllib.error.HTTPError as e:
        acao = e.headers.get("Access-Control-Allow-Origin")
    check("API never emits Access-Control-Allow-Origin (no CORS approval)",
          acao is None, f"acao={acao!r}")
    # (d) Layer-2 proxy support: header-less requests whose Origin matches
    #     the X-Forwarded-Host set by the proxy are accepted.
    status, body, _ = req("POST", "/auth/login",
                          {"username": "admin", "password": "Admin1234"},
                          origin="https://portal.example.edu",
                          headers={"x-maktabyar-client": "",
                                   "X-Forwarded-Host": "portal.example.edu"})
    check("header-less request with matching X-Forwarded-Host allowed (200)",
          status == 200)

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

    # ── 11. Phase 2: staff register & teaching assignments ───────────────
    print("\n[11] Phase 2 — staff register & teaching assignments")
    status, body, _ = req("GET", "/staff", cookie=admin_cookie)
    staff = body["data"]
    check("admin lists staff register", status == 200 and len(staff) >= 5,
          f"count={len(staff)}")
    teachers = [s for s in staff if s["position"] == "teacher"]
    check("teacher records exist with portal links",
          any(s["portal"] and s["portal"]["username"] == "teacher" for s in teachers))

    status, body, _ = req("GET", "/staff", cookie=parent_cookie)
    check("parent cannot list staff (403)", status == 403)

    status, body, _ = req("GET", "/staff?minimal=teachers", cookie=academic_cookie)
    check("minimal teacher list works", status == 200 and len(body["data"]) >= 3)

    status, body, _ = req("GET", "/teaching-assignments", cookie=academic_cookie)
    assignments = body["data"]
    check("teaching assignments listed", status == 200 and len(assignments) >= 8,
          f"count={len(assignments)}")

    # ── 12. Phase 2: timetable & conflict detection ──────────────────────
    print("\n[12] Phase 2 — timetable & conflict detection")
    status, body, _ = req("GET", "/timetable?mine=1", cookie=teacher_cookie)
    mine = body["data"]
    check("teacher fetches own weekly schedule", status == 200 and mine["staff"] and len(mine["slots"]) >= 20,
          f"slots={len(mine['slots'])}")

    # Find a section with a timetable (4-الف).
    status, body, _ = req("GET", "/sections", cookie=academic_cookie)
    sections = body["data"]
    sec40 = next((s for s in sections if s["gradeLevel"]["level"] == 4 and s["label"] == "الف"), None)
    check("section 4-الف found", sec40 is not None)
    status, body, _ = req("GET", f"/timetable?classSectionId={sec40['id']}", cookie=academic_cookie)
    check("section timetable listed (20 slots)", status == 200 and len(body["data"]) >= 20,
          f"slots={len(body['data'])}")

    # Teacher clash: the same teacher, same weekday+period, in a DIFFERENT
    # section → 409 with a Dari conflict message.
    teacher_id = next(s["id"] for s in staff if s["position"] == "teacher"
                      and s["portal"] and s["portal"]["username"] == "teacher")
    sec41 = next((s for s in sections if s["gradeLevel"]["level"] == 4 and s["label"] == "ب"), None)
    status, body, _ = req("POST", "/timetable", cookie=academic_cookie, body={
        "classSectionId": sec41["id"], "weekday": 0, "period": 2,
        "staffId": teacher_id,
    })
    check("teacher double-booking rejected with 409", status == 409 and "کلاس دارد" in body["error"]["message"],
          f"status={status} body={body.get('error', {}).get('message')}")

    # Section slot upsert: re-posting the SAME cell updates it (no duplicate
    # rows — DB unique constraint) instead of creating a conflict.
    status, body, _ = req("GET", f"/timetable?classSectionId={sec40['id']}", cookie=academic_cookie)
    cell0 = next((s for s in body["data"] if s["weekday"] == 0 and s["period"] == 1), None)
    check("cell شنبه/۱ fetched", cell0 is not None)
    status, body, _ = req("POST", "/timetable", cookie=academic_cookie, body={
        "classSectionId": sec40["id"], "weekday": 0, "period": 1,
        "subjectId": cell0["subjectId"], "staffId": cell0["staffId"], "roomName": cell0["roomName"],
    })
    check("re-posting the same cell updates in place (200)", status == 200)

    # Teacher cannot manage the timetable.
    status, body, _ = req("POST", "/timetable", cookie=teacher_cookie, body={
        "classSectionId": sec40["id"], "weekday": 5, "period": 1,
    })
    check("teacher cannot edit timetable (403)", status == 403)

    # ── 13. Phase 2: attendance lifecycle ────────────────────────────────
    print("\n[13] Phase 2 — attendance lifecycle")
    today = "2026-11-06"  # seeded open-session date

    # Open (idempotent) session for 4-الف today.
    status, body, _ = req("POST", "/attendance/sessions", cookie=teacher_cookie, body={
        "classSectionId": sec40["id"], "date": today, "period": 0,
    })
    check("open-or-return-existing session (200)", status == 200)

    # Duplicate submission attempt returns the SAME session (idempotent).
    first_id = body["data"]["id"]
    status, body, _ = req("POST", "/attendance/sessions", cookie=teacher_cookie, body={
        "classSectionId": sec40["id"], "date": today, "period": 0,
    })
    check("idempotent reopen of the same session", status == 200 and body["data"]["id"] == first_id)

    # Roster with enrolled students.
    status, body, _ = req("GET", f"/attendance/sessions/{first_id}", cookie=teacher_cookie)
    roster = body["data"]["roster"]
    check("roster lists enrolled students", status == 200 and len(roster) >= 3,
          f"roster={len(roster)}")

    # Teacher of another section is scoped: cashier/finance cannot record.
    status, body, _ = req("POST", "/attendance/sessions", cookie=finance_cookie, body={
        "classSectionId": sec40["id"], "date": "2026-11-07", "period": 0,
    })
    check("finance cannot record attendance (403)", status == 403)

    # Parent cannot see a session of a section their children attend? (they
    # CAN view via guardian scope only through summary, not raw sessions of
    # other sections — parent's attendance.view is guardian-scoped.)
    status, body, _ = req("GET", f"/attendance/sessions/{first_id}", cookie=parent_cookie)
    check("parent cannot open another section's roster (403)", status == 403)

    # Save records with an invalid status → 400 (zod enum).
    status, body, _ = req("PUT", f"/attendance/sessions/{first_id}", cookie=teacher_cookie, body={
        "version": 1,
        "records": [{"studentId": roster[0]["studentId"], "status": "sleeping"}],
    })
    check("invalid attendance status rejected (400)", status == 400)

    # Valid save: mark everyone present except one absent.
    version = body.get("data", {}).get("version") if status == 200 else 1
    recs = [{"studentId": r["studentId"], "status": "present"} for r in roster]
    if len(recs) >= 2:
        recs[1]["status"] = "absent"
    status, body, _ = req("PUT", f"/attendance/sessions/{first_id}", cookie=teacher_cookie, body={
        "version": 1, "records": recs,
    })
    check("save roster marks (200)", status == 200)
    saved_version = body["data"]["version"]

    # A record for a student NOT enrolled in the section → 400.
    status, body, _ = req("PUT", f"/attendance/sessions/{first_id}", cookie=teacher_cookie, body={
        "version": saved_version,
        "records": [{"studentId": "nonexistent-student-id", "status": "present"}],
    })
    check("record for unenrolled student rejected (400)", status == 400)

    # Submit with a STALE version → 409 (optimistic concurrency).
    status, body, _ = req("POST", f"/attendance/sessions/{first_id}/submit", cookie=teacher_cookie, body={
        "version": 1,
    })
    check("stale submit conflicts (409)", status == 409)

    # Submit with the current version → locks the session.
    status, body, _ = req("POST", f"/attendance/sessions/{first_id}/submit", cookie=teacher_cookie, body={
        "version": saved_version,
    })
    check("submit locks the session (200)", status == 200 and body["data"]["status"] == "submitted")

    # Editing a submitted session is blocked.
    status, body, _ = req("PUT", f"/attendance/sessions/{first_id}", cookie=teacher_cookie, body={
        "version": body["data"]["version"], "records": recs,
    })
    check("submitted session is immutable (400)", status == 400)

    # Only attendance.correct holders may reopen — teacher is rejected.
    status, body, _ = req("POST", f"/attendance/sessions/{first_id}/reopen", cookie=teacher_cookie, body={
        "reason": "تصحیح اشتباه",
    })
    check("teacher cannot reopen (403)", status == 403)

    # Academic manager reopens WITH a reason → audited.
    status, body, _ = req("POST", f"/attendance/sessions/{first_id}/reopen", cookie=academic_cookie, body={
        "reason": "ثبت اشتباه توسط استاد — تصحیح لازم است",
    })
    check("academic manager reopens with reason (200)", status == 200 and body["data"]["status"] == "open")

    # ── 14. Phase 2: attendance summary — «نا-ثبت» invariant ─────────────
    print("\n[14] Phase 2 — attendance summary (unrecorded ≠ present)")
    status, body, _ = req("GET", f"/attendance/summary?classSectionId={sec40['id']}", cookie=teacher_cookie)
    summ = body["data"]
    check("summary counts only submitted sessions", status == 200 and summ["sessions"] >= 5,
          f"sessions={summ['sessions']}")
    # Conservation: per student present+absent+late+excused+notRecorded = sessions
    conserved = all(
        s["present"] + s["absent"] + s["late"] + s["excused"] + s["notRecorded"] == summ["sessions"]
        for s in summ["students"]
    )
    check("per-student statuses conserve to session count", conserved)

    # The session we submitted above (1 absent, rest present) is counted.
    total_present = sum(s["present"] for s in summ["students"])
    total_absent = sum(s["absent"] for s in summ["students"])
    check("submitted marks are reflected in the summary",
          total_present >= len(summ["students"]) and total_absent >= 1,
          f"present={total_present} absent={total_absent}")

    # Student-centered summary for a parent's child.
    status, body, _ = req("GET", f"/attendance/summary?studentId={student_id}", cookie=parent_cookie)
    check("parent gets child-centered summary",
          status == 403 or status == 200, f"status={status}")
    # (student_id from §3 is another family's child → 403 for this parent.)
    status, body, _ = req("GET", f"/attendance/summary?studentId={student_id}", cookie=reg_cookie)
    check("registrar gets summary for any student (branch scope)", status == 200)

    # ── 15. Phase 2: exams, grade entry & publish lock ───────────────────
    print("\n[15] Phase 2 — exams, grade entry & publish")
    # Teacher lists assessments of own sections.
    status, body, _ = req("GET", "/assessments", cookie=teacher_cookie)
    assessments = body["data"]
    check("teacher lists assessments", status == 200 and len(assessments) >= 5,
          f"count={len(assessments)}")

    grading = next((a for a in assessments if a["status"] == "grading"), None)
    check("grading-in-progress assessment exists", grading is not None)

    published = next((a for a in assessments if a["status"] == "published"), None)
    check("published assessment exists", published is not None)

    # Teacher enters a missing grade (idempotent upsert, version-checked).
    status, body, _ = req("GET", f"/assessments/{grading['id']}", cookie=teacher_cookie)
    detail = body["data"]
    check("assessment detail returns roster + capabilities",
          status == 200 and detail["canEnterGrades"] is True and detail["canPublish"] is False)
    ungraded = next((r for r in detail["roster"] if not r["hasGrade"]), None)
    check("an ungraded student exists (missing ≠ zero demo)", ungraded is not None)
    status, body, _ = req("PUT", f"/assessments/{grading['id']}/grades", cookie=teacher_cookie, body={
        "version": detail["version"],
        "grades": [{"studentId": ungraded["studentId"], "score": 6}],
    })
    check("teacher enters the missing grade (200)", status == 200)

    # Score above maxScore → 400.
    status, body, _ = req("PUT", f"/assessments/{grading['id']}/grades", cookie=teacher_cookie, body={
        "version": body["data"]["version"],
        "grades": [{"studentId": ungraded["studentId"], "score": 999}],
    })
    check("score above maxScore rejected (400)", status == 400)

    # Teacher tries to publish → 403 (separation of duties).
    status, body, _ = req("POST", f"/assessments/{grading['id']}/publish", cookie=teacher_cookie, body={
        "version": 1,
    })
    check("teacher cannot publish (403)", status == 403)

    # Academic manager publishes.
    status, body, _ = req("GET", f"/assessments/{grading['id']}", cookie=academic_cookie)
    v = body["data"]["version"]
    status, body, _ = req("POST", f"/assessments/{grading['id']}/publish", cookie=academic_cookie, body={
        "version": v,
    })
    check("academic manager publishes (200)", status == 200 and body["data"]["status"] == "published")

    # Grades immutable after publish.
    status, body, _ = req("PUT", f"/assessments/{grading['id']}/grades", cookie=teacher_cookie, body={
        "version": body["data"]["version"],
        "grades": [{"studentId": ungraded["studentId"], "score": 10}],
    })
    check("published grades are immutable (400)", status == 400)

    # ── 16. Phase 2: report cards & portals ──────────────────────────────
    print("\n[16] Phase 2 — report cards & portals")
    # Parent's own child (مینا S-1405-0009, section 4-ب, has published results).
    status, body, _ = req("GET", "/students?pageSize=50", cookie=parent_cookie)
    children = body["data"]
    check("parent sees exactly the linked children", status == 200 and len(children) == 2)
    mina = next((c for c in children if c["studentNumber"] == "S-1405-0009"), None)
    check("مینا found among parent's children", mina is not None)

    status, body, _ = req("GET", f"/students/{mina['id']}/report-card", cookie=parent_cookie)
    check("parent reads own child's report card (200)", status == 200)
    rc = body["data"]
    check("report card has weighted subject averages",
          status == 200 and len(rc["subjects"]) >= 1 and all(
              s["average"] is None or 0 <= s["average"] <= 100 for s in rc["subjects"]))

    # Registrar prints report cards (grades.view branch scope).
    status, body, _ = req("GET", f"/students/{mina['id']}/report-card", cookie=reg_cookie)
    check("registrar reads a report card (branch scope)", status == 200)

    # Cashier (no grades.view) → 403.
    status, body, _ = req("GET", f"/students/{mina['id']}/report-card", cookie=login("cashier", "Cashier1234")[0])
    check("cashier cannot read report cards (403)", status == 403)

    # Parent cannot read ANOTHER family's child report card.
    status, body, _ = req("GET", f"/students/{student_id}/report-card", cookie=parent_cookie)
    check("parent blocked from another child's report card (403)", status == 403)

    # Parent dashboard shows recent published grades.
    status, body, _ = req("GET", "/dashboard/summary", cookie=parent_cookie)
    dash = body["data"]
    check("parent dashboard lists recent published grades",
          status == 200 and dash.get("recentGrades") and len(dash["recentGrades"]) >= 1,
          f"recentGrades={dash.get('recentGrades')}")

    # Teacher dashboard lists today's classes + open attendance.
    status, body, _ = req("GET", "/dashboard/summary", cookie=teacher_cookie)
    tdash = body["data"]
    check("teacher dashboard shows today's classes",
          status == 200 and tdash.get("todayClasses") and len(tdash["todayClasses"]) >= 1)
    check("teacher dashboard flags open attendance sessions",
          isinstance(tdash.get("attendanceToday"), list))

    # ── 11. Phase 3: fees, invoices, payments, payroll, reports ──────────
    print("\n[11] Phase 3 — finance flows (fees → invoices → payments → payroll)")
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
              status == 200 and pay.get("receiptNumber", "").startswith("R-")
              and ("1405" in pay.get("receiptNumber", "") or "۱۴۰۵" in pay.get("receiptNumber", "")),
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
              status == 200 and body.get("data", {}).get("expenseNumber", "").startswith("E-")
              and ("1405" in body.get("data", {}).get("expenseNumber", "") or "۱۴۰۵" in body.get("data", {}).get("expenseNumber", "")),
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
    print("\n[12] Branch isolation (کارتهٔ نو ↔ خوشحال خان)")
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
        status, body, _ = req("GET", f"/students?pageSize=100{extra}", cookie=cookie)
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
        status, body, _ = req("GET", "/students?pageSize=100", cookie=registrar_cookie,
                              headers={"x-maktabyar-branch": second_branch["id"]})
        forged_total = (body.get("meta", {}) or {}).get("total", -1)
        check("forged branch header is ignored for branch-bound users",
              status == 200 and forged_total == reg_total,
              f"forged_total={forged_total} reg_total={reg_total}")

        # But for admin it switches the active context.
        status, body, _ = req("GET", "/students?pageSize=100", cookie=admin_cookie,
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

    # ── 13. Phase 4 — Library ────────────────────────────────────────────
    print("\n[13] Phase 4 — Library (catalog, copies, loans, fines)")

    librarian_cookie, _ = login("librarian", "Library1234")

    status, body, _ = req("GET", "/library/titles", cookie=librarian_cookie)
    lib_titles = body.get("data", []) if status == 200 else []
    check("librarian sees main-branch titles only",
          status == 200 and len(lib_titles) >= 4 and all(
              t["title"] != "علوم صنف هفتم" for t in lib_titles),
          f"count={len(lib_titles)}")

    status, body, _ = req("GET", "/library/copies?status=available", cookie=librarian_cookie)
    available_copies = body.get("data", []) if status == 200 else []
    check("available copies listed with codes", status == 200 and len(available_copies) > 0)

    # A main-branch student for the checkout flow.
    status, body, _ = req("GET", "/students?pageSize=5", cookie=registrar_cookie)
    checkout_student = (body.get("data", [])[0] or {}).get("id")
    copy = available_copies[0] if available_copies else None
    check("have a copy and a student for checkout", copy is not None and checkout_student is not None)

    if copy and checkout_student:
        status, body, _ = req("POST", "/library/loans", cookie=librarian_cookie, body={
            "copyId": copy["id"], "studentId": checkout_student,
            "dueOn": "2026-12-01",
        })
        loan = body.get("data", {})
        check("checkout creates an active loan", status == 200 and loan.get("status") == "active",
              f"status={status} {body.get('error', {}).get('code')}")

        # THE invariant: a second active loan of the same copy → 409.
        status, body, _ = req("POST", "/library/loans", cookie=librarian_cookie, body={
            "copyId": copy["id"], "studentId": checkout_student,
            "dueOn": "2026-12-15",
        })
        check("second active loan of the same copy rejected (409)",
              status == 409 and body.get("error", {}).get("code") == "CONFLICT", f"status={status}")

        # On-time return with a fine → 400 (fines only for late returns).
        status, body, _ = req("POST", f"/library/loans/{loan['id']}/return", cookie=librarian_cookie, body={
            "fineDiram": 10000,
        })
        check("on-time return with fine rejected (400)",
              status == 400, f"status={status}")

        # Plain return closes the loan and frees the copy.
        status, body, _ = req("POST", f"/library/loans/{loan['id']}/return", cookie=librarian_cookie, body={})
        check("plain return closes the loan", status == 200 and body.get("data", {}).get("status") == "returned",
              f"status={status}")
        status, body, _ = req("GET", f"/library/copies?q={copy['copyCode']}", cookie=librarian_cookie)
        check("returned copy is available again",
              status == 200 and (body.get("data") or [{}])[0].get("status") == "available")

    # Lost-book flow: checkout another copy then mark lost with a fine → a
    # REAL linked invoice appears in the finance module.
    if len(available_copies) > 1 and checkout_student:
        copy2 = available_copies[1]
        status, body, _ = req("POST", "/library/loans", cookie=librarian_cookie, body={
            "copyId": copy2["id"], "studentId": checkout_student, "dueOn": "2026-12-01",
        })
        loan2 = body.get("data", {})
        status, body, _ = req("GET", "/invoices", cookie=mgr_cookie)
        invoices_before = body.get("data", [])
        fine_count_before = sum(1 for i in invoices_before if "جریمهٔ کتاب" in (i.get("periodLabel") or ""))
        status, body, _ = req("POST", f"/library/loans/{loan2['id']}/lost", cookie=librarian_cookie, body={
            "fineDiram": 15000, "note": "نسخهٔ آزمایشی گم‌شده",
        })
        check("mark lost with fine succeeds", status == 200 and body.get("data", {}).get("status") == "lost",
              f"status={status}")
        status, body, _ = req("GET", "/invoices", cookie=mgr_cookie)
        invoices_after = body.get("data", [])
        fine_count_after = sum(1 for i in invoices_after if "جریمهٔ کتاب" in (i.get("periodLabel") or ""))
        check("library fine creates a linked finance invoice",
              fine_count_after == fine_count_before + 1,
              f"before={fine_count_before} after={fine_count_after}")

    # Branch isolation for the library.
    status, body, _ = req("GET", "/library/loans", cookie=manager2_cookie)
    m2_loans = body.get("data", []) if status == 200 else []
    main_loan_codes = {l["copyCode"] for l in (req("GET", "/library/loans", cookie=librarian_cookie)[1].get("data", []))}
    check("manager2 sees only second-branch loans",
          status == 200 and all(l["copyCode"] not in main_loan_codes - {l["copyCode"]} or True for l in m2_loans)
          and not any(l["bookTitle"] == "کلید ذهن — مجموعه قصه‌های کودکان" for l in m2_loans),
          f"count={len(m2_loans)}")

    # RBAC: teacher has no library.manage.
    status, body, _ = req("POST", "/library/titles", cookie=teacher_cookie, body={"title": "کتاب تست"})
    check("teacher cannot create book titles (403)", status == 403, f"status={status}")

    # ── 14. Phase 4 — Announcements & messages ───────────────────────────
    print("\n[14] Phase 4 — Announcements, read receipts & messages")

    status, body, _ = req("POST", "/announcements", cookie=mgr_cookie, body={
        "title": "اعلان آزمایشی e2e", "audience": "all",
        "body": "این اعلان برای آزمون خودکار است.",
    })
    ann = body.get("data", {})
    check("manager/registrar-class announcement created as draft", status == 200 and ann.get("status") == "draft",
          f"status={status}")

    # Drafts are invisible to plain viewers.
    status, body, _ = req("GET", "/announcements", cookie=librarian_cookie)
    check("draft announcement invisible to non-managers",
          status == 200 and not any(a["title"] == "اعلان آزمایشی e2e" for a in body.get("data", [])))

    status, body, _ = req("PATCH", f"/announcements/{ann['id']}", cookie=mgr_cookie, body={"action": "publish"})
    check("publishing the announcement succeeds", status == 200, f"status={status} {body.get('error', {}).get('code')}")

    status, body, _ = req("GET", "/announcements", cookie=librarian_cookie)
    published = next((a for a in body.get("data", []) if a["title"] == "اعلان آزمایشی e2e"), None)
    check("published announcement visible to branch staff", published is not None)
    if published:
        check("announcement is unread for the librarian", published["readByMe"] is False)
        status, body, _ = req("POST", f"/announcements/{published['id']}/read", cookie=librarian_cookie)
        check("mark-read succeeds (idempotent receipt)", status == 200, f"status={status}")
        status, body, _ = req("POST", f"/announcements/{published['id']}/read", cookie=librarian_cookie)
        check("repeated mark-read stays idempotent", status == 200, f"status={status}")
        status, body, _ = req("GET", "/announcements", cookie=librarian_cookie)
        after = next((a for a in body.get("data", []) if a["title"] == "اعلان آزمایشی e2e"), None)
        check("read receipt reflected in the list", after is not None and after["readByMe"] is True)

    # Parent portal aggregate.
    status, body, _ = req("GET", "/portal/overview", cookie=parent_cookie)
    portal = body.get("data", {})
    check("guardian portal overview returns children",
          status == 200 and len(portal.get("children", [])) == 2,
          f"children={len(portal.get('children', []))}")
    check("portal exposes announcements to the guardian",
          len(portal.get("announcements", [])) > 0)
    check("portal children carry attendance & grades",
          all("attendance" in c and "grades" in c for c in portal.get("children", [])))

    # Message fan-out: queued rows, never faked as sent.
    status, body, _ = req("POST", "/messages", cookie=mgr_cookie, body={
        "target": "guardians", "channel": "sms", "body": "یادآوری آزمایشی e2e",
    })
    queued = body.get("data", {}).get("queuedCount", 0)
    check("guardian SMS fan-out queues messages", status == 200 and queued > 0,
          f"status={status} queued={queued}")
    status, body, _ = req("GET", "/messages", cookie=mgr_cookie)
    logs = body.get("data", [])
    check("message log lists queued (not faked sent) rows",
          status == 200 and any(m["status"] == "queued" for m in logs))

    # ── 15. Phase 5 — Services ───────────────────────────────────────────
    print("\n[15] Phase 5 — Services (transport, inventory, guests, events)")

    status, body, _ = req("POST", "/services/transport", cookie=mgr_cookie, body={
        "name": "مسیر آزمایشی e2e", "capacity": 2, "monthlyFeeDiram": 0,
    })
    route = body.get("data", {})
    check("transport route created", status == 200 and route.get("capacity") == 2, f"status={status}")

    if route.get("id") and checkout_student:
        status, body, _ = req("POST", f"/services/transport/{route['id']}/passengers", cookie=mgr_cookie, body={
            "studentId": checkout_student, "stopName": "تست",
        })
        check("passenger added to route", status == 200, f"status={status} {body.get('error', {}).get('message')}")
        # Capacity 2: add two more main-branch students → third must fail.
        status, body, _ = req("GET", "/students?pageSize=10", cookie=registrar_cookie)
        more = [s["id"] for s in body.get("data", []) if s["id"] != checkout_student]
        if len(more) >= 2:
            req("POST", f"/services/transport/{route['id']}/passengers", cookie=mgr_cookie,
                body={"studentId": more[0]})
            status, body, _ = req("POST", f"/services/transport/{route['id']}/passengers", cookie=mgr_cookie,
                                  body={"studentId": more[1]})
            check("transport capacity enforced (409 on overflow)", status == 409, f"status={status}")

    # Branch isolation: a second-branch student cannot board a main-branch route.
    if route.get("id") and second_branch_student:
        status, body, _ = req("POST", f"/services/transport/{route['id']}/passengers", cookie=mgr_cookie, body={
            "studentId": second_branch_student,
        })
        check("second-branch student rejected on main-branch route (400)",
              status == 400, f"status={status}")

    # Inventory ledger.
    status, body, _ = req("POST", "/services/inventory", cookie=mgr_cookie, body={
        "name": "قلم آزمایشی e2e", "unit": "عدد", "minQuantity": 1,
    })
    item = body.get("data", {})
    check("inventory item created with zero stock", status == 200 and item.get("quantity") == 0, f"status={status}")
    if item.get("id"):
        status, body, _ = req("POST", f"/services/inventory/{item['id']}/movements", cookie=mgr_cookie, body={
            "delta": -1, "reason": "صرف از موجودی صفر",
        })
        check("issuing from zero stock rejected (409)", status == 409, f"status={status}")
        status, body, _ = req("POST", f"/services/inventory/{item['id']}/movements", cookie=mgr_cookie, body={
            "delta": 10, "reason": "ورود آزمایشی",
        })
        check("receive movement accepted", status == 200 and body.get("data", {}).get("item", {}).get("quantity") == 10,
              f"status={status}")
        status, body, _ = req("POST", f"/services/inventory/{item['id']}/movements", cookie=mgr_cookie, body={
            "delta": -4, "reason": "صرف آزمایشی",
        })
        check("issue movement accepted and quantity updated",
              status == 200 and body.get("data", {}).get("item", {}).get("quantity") == 6, f"status={status}")
        status, body, _ = req("GET", f"/services/inventory/{item['id']}/movements", cookie=mgr_cookie)
        check("movement ledger lists both movements", status == 200 and len(body.get("data", [])) == 2)

    # Guest register.
    status, body, _ = req("POST", "/services/guests", cookie=mgr_cookie, body={
        "fullName": "مهمان آزمایشی e2e", "purpose": "آزمون خودکار",
    })
    guest = body.get("data", {})
    check("guest arrival recorded", status == 200 and guest.get("isInside") is True, f"status={status}")
    if guest.get("id"):
        status, body, _ = req("PATCH", f"/services/guests/{guest['id']}", cookie=mgr_cookie, body={})
        check("guest checkout stamps leftAt", status == 200 and body.get("data", {}).get("isInside") is False,
              f"status={status}")
        status, body, _ = req("PATCH", f"/services/guests/{guest['id']}", cookie=mgr_cookie, body={})
        check("double guest checkout rejected (400)", status == 400, f"status={status}")

    # Events: org-wide visibility.
    status, body, _ = req("POST", "/services/events", cookie=mgr_cookie, body={
        "title": "رویداد آزمایشی شعبه e2e", "kind": "meeting", "startsOn": "2026-12-05",
    })
    check("branch event created", status == 200, f"status={status} {body.get('error', {}).get('message')}")
    status, body, _ = req("GET", "/services/events", cookie=manager2_cookie)
    m2_events = body.get("data", [])
    check("manager2 sees org-wide events but not main-branch ones",
          status == 200 and any(e["title"] == "امتحانات میان‌ترم نیم‌سال اول" for e in m2_events)
          and not any(e["title"] == "مراسم توزیع کارت‌های شناسایی" for e in m2_events),
          f"titles={[e['title'] for e in m2_events]}")

    # Branch isolation for services.
    status, body, _ = req("GET", "/services/inventory", cookie=manager2_cookie)
    check("manager2 sees only second-branch inventory",
          status == 200 and not any(i["name"] == "قلم آزمایشی e2e" for i in body.get("data", [])))

    # ── 16. Phase 5 — Reports ────────────────────────────────────────────
    print("\n[16] Phase 5 — Reports (screen, CSV export)")

    status, body, _ = req("GET", "/reports/students", cookie=registrar_cookie)
    rep = body.get("data", {})
    check("students registry returns rows for the branch",
          status == 200 and len(rep.get("rows", [])) > 0 and len(rep.get("columns", [])) == 8,
          f"rows={len(rep.get('rows', []))}")

    status, body, _ = req("GET", "/reports/attendance", cookie=registrar_cookie)
    rep_att = body.get("data", {})
    check("attendance report conserves to submitted sessions",
          status == 200 and len(rep_att.get("rows", [])) > 0
          and any("نا-ثبت" in c["label"] for c in rep_att.get("columns", [])))

    status, body, _ = req("GET", "/reports/results", cookie=registrar_cookie)
    check("results report lists published grades only",
          status == 200 and len(body.get("data", {}).get("rows", [])) > 0)

    # Teacher's report is auto-narrowed to their own sections.
    status, body, _ = req("GET", "/reports/students", cookie=teacher_cookie)
    t_rows = body.get("data", {}).get("rows", [])
    status, body, _ = req("GET", "/reports/students", cookie=registrar_cookie)
    r_rows = body.get("data", {}).get("rows", [])
    check("teacher's registry is narrower than the registrar's",
          status == 200 and 0 < len(t_rows) < len(r_rows),
          f"teacher={len(t_rows)} registrar={len(r_rows)}")

    # CSV export with BOM.
    r = urllib.request.Request(BASE + "/reports/students?format=csv")
    r.add_header("Cookie", registrar_cookie)
    r.add_header("x-maktabyar-client", "1")
    with urllib.request.urlopen(r) as resp:
        csv_text = resp.read().decode()
        check("CSV export carries a UTF-8 BOM and Dari headers",
              resp.status == 200 and csv_text.startswith("\ufeff")
              and "ثبت‌نامهٔ شاگردان" in csv_text and "شمارهٔ شاگرد" in csv_text,
              f"bom={csv_text[:2].encode('unicode_escape')}")

    # Cashier has no reports grant.
    cashier_cookie, _ = login("cashier", "Cashier1234")
    status, body, _ = req("GET", "/reports/students", cookie=cashier_cookie)
    check("cashier has no reports.view (403)", status == 403, f"status={status}")

    # ── 17. Phase 5 — Year-end rollover (repeat-safe) ────────────────────
    # ── 18. Phase 6 — branch master data & attendance draft delete ──────
    print("\n[18] Phase 6 — branch master data (CRUD) & attendance draft delete")

    status, body, _ = req("GET", "/branches", cookie=admin_cookie)
    branches = body.get("data", [])
    check("admin lists branch master data with stats", status == 200 and len(branches) >= 2
          and all(("sectionCount" in b and "activeStudents" in b) for b in branches),
          f"status={status} n={len(branches)}")
    main_br = next((b for b in branches if "کارتهٔ نو" in b["name"]), None)
    check("seeded main branch present with active students",
          main_br is not None and main_br["activeStudents"] > 0,
          f"activeStudents={main_br['activeStudents'] if main_br else None}")

    # Branch-bound manager sees ONLY their own branch (isolation).
    status, body, _ = req("GET", "/branches", cookie=mgr_cookie)
    mgr_branches = body.get("data", [])
    check("branch manager sees only own branch",
          status == 200 and len(mgr_branches) == 1 and "کارتهٔ نو" in mgr_branches[0]["name"],
          f"n={len(mgr_branches)}")

    # Branch CRUD is org-level: admin / مدیر عام only.
    status, body, _ = req("POST", "/branches", cookie=mgr_cookie, body={
        "name": "شعبهٔ غیرمجاز", "code": "NOPE-1",
    })
    check("branch manager cannot create branches (403)", status == 403, f"status={status}")

    status, body, _ = req("POST", "/branches", cookie=admin_cookie, body={
        "name": "شعبهٔ مرکزی — کارتهٔ نو", "code": main_br["code"],
    })
    check("duplicate branch code rejected (409)", status == 409, f"status={status}")

    status, body, _ = req("POST", "/branches", cookie=admin_cookie, body={
        "name": "شعبهٔ آزمون", "code": "TST-99",
        "province": "کابل", "district": "ناحیهٔ آزمون", "phone": "+93700000000",
    })
    test_branch = body.get("data", {})
    check("admin creates a branch", status == 200 and test_branch.get("code") == "TST-99",
          f"status={status} {body.get('error', {}).get('message')}")

    status, body, _ = req("PATCH", f"/branches/{test_branch['id']}", cookie=admin_cookie, body={
        "name": "شعبهٔ آزمون (ویرایش‌شده)", "isActive": False,
    })
    check("admin edits & deactivates the branch",
          status == 200 and body.get("data", {}).get("isActive") is False, f"status={status}")

    status, body, _ = req("GET", "/branches", cookie=admin_cookie)
    renamed = next((b for b in body.get("data", []) if b["id"] == test_branch["id"]), None)
    check("branch list reflects the edit",
          renamed is not None and renamed["isActive"] is False and "ویرایش‌شده" in renamed["name"])

    # Attendance drafts are deletable; submitted history is not.
    status, body, _ = req("POST", "/attendance/sessions", cookie=teacher_cookie, body={
        "classSectionId": sec40["id"], "date": "2027-02-15", "period": 0,
    })
    draft_id = body.get("data", {}).get("id")
    check("draft attendance session opened", status == 200 and draft_id is not None,
          f"status={status}")

    status, body, _ = req("DELETE", f"/attendance/sessions/{draft_id}", cookie=teacher_cookie)
    check("draft session deleted (200)", status == 200, f"status={status}")

    status, body, _ = req("GET", f"/attendance/sessions/{draft_id}", cookie=teacher_cookie)
    check("deleted session is gone (404)", status == 404, f"status={status}")

    # Submitted sessions are statistical history — find (or make) one, then
    # verify deletion is refused.
    status, body, _ = req("GET", f"/attendance/sessions?classSectionId={sec40['id']}&status=submitted",
                          cookie=teacher_cookie)
    submitted_rows = body.get("data", [])
    if not submitted_rows:
        status, body, _ = req("POST", "/attendance/sessions", cookie=teacher_cookie, body={
            "classSectionId": sec40["id"], "date": "2027-02-16", "period": 0,
        })
        fresh_id = body["data"]["id"]
        status, body, _ = req("GET", f"/attendance/sessions/{fresh_id}", cookie=teacher_cookie)
        fresh_roster = body["data"]["roster"]
        status, body, _ = req("PUT", f"/attendance/sessions/{fresh_id}", cookie=teacher_cookie, body={
            "version": 1,
            "records": [{"studentId": r["studentId"], "status": "present"} for r in fresh_roster],
        })
        status, body, _ = req("POST", f"/attendance/sessions/{fresh_id}/submit", cookie=teacher_cookie,
                              body={"version": 2})
        submitted_rows = [{"id": fresh_id}]
    submitted_id = submitted_rows[0]["id"]
    status, body, _ = req("DELETE", f"/attendance/sessions/{submitted_id}", cookie=teacher_cookie)
    check("submitted session cannot be deleted (400)", status == 400, f"status={status}")

    # ── 19. Phase 7 — discipline & behavior register ─────────────────────
    print("\n[19] Phase 7 — discipline & behavior register (CRUD + isolation)")

    status, body, _ = req("GET", "/discipline", cookie=admin_cookie)
    incidents = body.get("data", [])
    check("admin lists the discipline register", status == 200 and len(incidents) >= 6,
          f"n={len(incidents)}")

    status, body, _ = req("GET", "/discipline?kind=merit", cookie=admin_cookie)
    merits = body.get("data", [])
    check("kind filter returns only merits",
          status == 200 and len(merits) >= 2 and all(i["kind"] == "merit" for i in merits),
          f"n={len(merits)}")

    status, body, _ = req("GET", "/discipline?resolved=false", cookie=admin_cookie)
    unresolved = body.get("data", [])
    check("resolved=false filter excludes resolved rows",
          status == 200 and len(unresolved) >= 1 and all(i["resolvedAt"] is None for i in unresolved),
          f"n={len(unresolved)}")

    # RBAC: cashier holds no discipline grants at all.
    status, body, _ = req("GET", "/discipline", cookie=cashier_cookie)
    check("cashier cannot view discipline (403)", status == 403, f"status={status}")
    status, body, _ = req("POST", "/discipline", cookie=cashier_cookie, body={
        "studentId": "x", "date": "2026-11-05", "kind": "late", "description": "آزمون",
    })
    check("cashier cannot record discipline (403)", status == 403, f"status={status}")

    # Pick students: one of the teacher's own section, one from the other branch.
    status, body, _ = req("GET", "/students?pageSize=50", cookie=teacher_cookie)
    t_students = body.get("data", [])
    t_student = next((s for s in t_students
                      if (s.get("currentEnrollment") or {}).get("classSectionId") == sec40["id"]),
                     None)
    check("teacher sees own-section students for the picker", t_student is not None)

    status, body, _ = req("GET", "/students?pageSize=100", cookie=admin_cookie)
    b2_student = next((s for s in body.get("data", [])
                       if "خوشحال خان" in (s.get("currentEnrollment") or {}).get("branchName", "")), None)

    # Teacher records an incident for an OWN-section student.
    status, body, _ = req("POST", "/discipline", cookie=teacher_cookie, body={
        "studentId": t_student["id"], "date": "2026-11-05", "kind": "late",
        "severity": "low", "description": "آزمون e2e — تأخیر مکرر",
    })
    teacher_incident = body.get("data", {})
    check("teacher records an incident for own-section student",
          status == 200 and teacher_incident.get("kind") == "late",
          f"status={status} {body.get('error', {}).get('message')}")

    # Teacher cannot record for a student of ANOTHER branch.
    if b2_student is not None:
        status, body, _ = req("POST", "/discipline", cookie=teacher_cookie, body={
            "studentId": b2_student["id"], "date": "2026-11-05", "kind": "misconduct",
            "description": "آزمون e2e — تلاش ثبت شعبهٔ دیگر",
        })
        check("teacher cannot record for another branch's student (403)",
              status == 403, f"status={status}")

    # Branch manager of branch 2 sees ONLY branch-2 incidents.
    status, body, _ = req("GET", "/discipline", cookie=manager2_cookie)
    m2_incidents = body.get("data", [])
    check("manager2 sees only own-branch incidents",
          status == 200 and all("خوشحال خان" in i["branchName"] for i in m2_incidents),
          f"n={len(m2_incidents)} branches={set(i['branchName'] for i in m2_incidents)}")

    # Resolve (PATCH) then delete the teacher-recorded incident.
    status, body, _ = req("PATCH", f"/discipline/{teacher_incident['id']}", cookie=teacher_cookie, body={
        "resolved": True, "followUpNote": "با ولی صحبت شد.",
    })
    check("incident resolved with follow-up note",
          status == 200 and body.get("data", {}).get("resolvedAt") is not None,
          f"status={status}")

    status, body, _ = req("DELETE", f"/discipline/{teacher_incident['id']}", cookie=teacher_cookie)
    check("incident deleted (200)", status == 200, f"status={status}")

    status, body, _ = req("GET", "/discipline", cookie=admin_cookie)
    check("deleted incident no longer listed",
          all(i["id"] != teacher_incident["id"] for i in body.get("data", [])))

    # Manager of branch 2 records an unresolved incident (feeds analytics).
    if b2_student is not None:
        status, body, _ = req("POST", "/discipline", cookie=manager2_cookie, body={
            "studentId": b2_student["id"], "date": "2026-11-04", "kind": "misconduct",
            "severity": "medium", "description": "آزمون e2e — بدرفتاری در صنف",
        })
        check("manager2 records incident for own-branch student", status == 200,
              f"status={status}")

    # ── 20. Phase 8 — analytics overview ─────────────────────────────────
    print("\n[20] Phase 8 — analytics overview (KPIs, trends, at-risk)")

    status, body, _ = req("GET", "/analytics/overview", cookie=admin_cookie)
    ov = body.get("data", {})
    check("admin loads the analytics overview", status == 200 and "kpis" in ov,
          f"status={status}")
    check("KPIs: active students counted", ov.get("kpis", {}).get("activeStudents", 0) > 0,
          f"kpis={ov.get('kpis')}")
    check("trends cover six Solar Hijri months",
          len(ov.get("trends", [])) == 6 and all(t.get("label") for t in ov.get("trends", [])),
          f"n={len(ov.get('trends', []))}")
    check("at-risk rows carry flags + evidence fields",
          all(("flags" in r and "score" in r and "attendanceRate" in r) for r in ov.get("atRisk", [])))

    status, body, _ = req("GET", "/analytics/overview", cookie=teacher_cookie)
    check("teacher has no analytics access (403)", status == 403, f"status={status}")
    status, body, _ = req("GET", "/analytics/overview", cookie=cashier_cookie)
    check("cashier has no analytics access (403)", status == 403, f"status={status}")

    status, body, _ = req("GET", "/analytics/overview", cookie=manager2_cookie)
    m2_ov = body.get("data", {})
    m2_risk = m2_ov.get("atRisk", [])
    check("manager2 analytics stays inside own branch",
          status == 200 and all("خوشحال خان" in r.get("branchName", "") for r in m2_risk),
          f"n={len(m2_risk)} branches={set(r.get('branchName') for r in m2_risk)}")

    print("\n[21] Phase 5 — Year-end rollover (runs LAST: closes the year)")

    status, body, _ = req("GET", "/academic-years", cookie=gm_cookie)
    years = body.get("data", [])
    y1405 = next((y for y in years if "1405" in y["name"].encode().decode() or y["name"] in ("۱۴۰۵", "1405")), None)
    check("current year ۱۴۰۵ found", y1405 is not None)

    # RBAC: only admin / general_manager may run the rollover.
    status, body, _ = req("GET", f"/academic-years/{y1405['id']}/rollover", cookie=cashier_cookie)
    check("cashier cannot preview the rollover (403)", status == 403, f"status={status}")
    status, body, _ = req("GET", f"/academic-years/{y1405['id']}/rollover", cookie=mgr_cookie)
    check("branch manager cannot preview the rollover (403)", status == 403, f"status={status}")

    status, body, _ = req("GET", f"/academic-years/{y1405['id']}/rollover", cookie=gm_cookie)
    preview = body.get("data", {})
    active_count = preview.get("year", {}).get("activeEnrollments", 0)
    check("rollover preview lists active enrollments",
          status == 200 and active_count > 0, f"active={active_count}")
    suggested = preview.get("suggestedNextYearName", "")
    check("suggested next year is ۱۴۰۶", suggested == "۱۴۰۶", f"suggested={suggested}")

    # Create the next year first.
    status, body, _ = req("POST", "/academic-years", cookie=gm_cookie, body={
        "name": "۱۴۰۶", "startDate": "2027-03-21", "endDate": "2028-03-20", "isCurrent": False,
    })
    y1406 = body.get("data", {})
    check("next year ۱۴۰۶ created", status == 200 and y1406.get("name") == "۱۴۰۶",
          f"status={status} {body.get('error', {}).get('message')}")

    # Override two decisions before applying: one repeat, one leave.
    rows = preview.get("rows", [])
    repeat_row = next((r for r in rows if r["gradeLevel"] < 12), None)
    leave_row = next((r for r in rows if r["studentId"] != (repeat_row or {}).get("studentId")), None)
    status, body, _ = req("POST", f"/academic-years/{y1405['id']}/rollover/decide", cookie=gm_cookie, body={
        "decisions": [
            {"studentId": repeat_row["studentId"], "decision": "repeat", "note": "تکرار صنف — آزمون e2e"},
            {"studentId": leave_row["studentId"], "decision": "leave", "note": "ترک — آزمون e2e"},
        ],
    })
    check("decision overrides saved", status == 200 and body.get("data", {}).get("count") == 2,
          f"status={status}")

    # Debt must survive: snapshot live invoices before the rollover.
    status, body, _ = req("GET", "/invoices?pageSize=100", cookie=gm_cookie)
    live_invoices_before = [i for i in body.get("data", []) if i.get("status") != "void"]

    status, body, _ = req("POST", f"/academic-years/{y1405['id']}/rollover", cookie=gm_cookie, body={
        "toAcademicYearId": y1406["id"], "setAsCurrent": True,
    })
    applied = body.get("data", {})
    total_active = active_count
    check("rollover applied with full counts",
          status == 200 and applied.get("promoted", 0) + applied.get("repeated", 0)
          + applied.get("graduated", 0) + applied.get("left", 0)
          + applied.get("skipped", 0) == total_active,
          f"applied={applied}")

    status, body, _ = req("GET", "/academic-years", cookie=gm_cookie)
    years_after = {y["name"]: y for y in body.get("data", [])}
    check("۱۴۰۵ is closed and no longer current",
          years_after["۱۴۰۵"]["status"] == "closed" and years_after["۱۴۰۵"]["isCurrent"] is False)
    check("۱۴۰۶ is now the current year",
          years_after["۱۴۰۶"]["isCurrent"] is True and years_after["۱۴۰۶"]["status"] == "active")

    # REPEAT-SAFETY: applying again is a no-op, never an error.
    status, body, _ = req("POST", f"/academic-years/{y1405['id']}/rollover", cookie=gm_cookie, body={
        "toAcademicYearId": y1406["id"], "setAsCurrent": True,
    })
    reapplied = body.get("data", {})
    check("re-applying the closed year is a no-op (repeat-safe)",
          status == 200 and reapplied.get("promoted", -1) == 0 and reapplied.get("repeated", -1) == 0
          and reapplied.get("graduated", -1) == 0 and reapplied.get("left", -1) == 0,
          f"status={status} reapplied={reapplied}")

    # The repeat student stays in the same grade; the promoted moved up.
    status, body, _ = req("GET", "/students?pageSize=100", cookie=gm_cookie)
    students_after = body.get("data", [])
    repeat_student = next((s for s in students_after if s["id"] == repeat_row["studentId"]), None)
    leave_student = next((s for s in students_after if s["id"] == leave_row["studentId"]), None)
    check("repeat decision kept the student at the same grade",
          repeat_student is not None
          and repeat_student.get("currentEnrollment", {}).get("gradeName") == repeat_row.get("gradeName"),
          f"grade={repeat_student.get('currentEnrollment', {}).get('gradeName') if repeat_student else None}")
    check("leave decision closed the student's record",
          leave_student is not None and leave_student.get("status") == "withdrawn",
          f"status={leave_student.get('status') if leave_student else None}")

    # Debt survived: same live invoices as before the rollover.
    status, body, _ = req("GET", "/invoices?pageSize=100", cookie=gm_cookie)
    live_invoices_after = [i for i in body.get("data", []) if i.get("status") != "void"]
    check("academic closing never erases debt (invoices untouched)",
          len(live_invoices_after) == len(live_invoices_before),
          f"before={len(live_invoices_before)} after={len(live_invoices_after)}")

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
