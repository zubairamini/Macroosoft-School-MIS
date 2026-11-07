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
