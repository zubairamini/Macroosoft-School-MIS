# Test Results — actual runs (Phase 2: 2026-11-07; Phase 1: 2026-11-06)

All commands were executed against the live sandbox environment; outputs
below are the real results, not claims.

## 0. Phase 2 — scope of this run (2026-11-07)

Implemented in this session: staff register + teaching assignments, weekly
timetable with conflict detection, attendance lifecycle (open → save →
submit → reopen), exams/gradebook with publish lock, report cards,
permission separation for all of the above, Dari/RTL UI for every view, plus
the session-cookie SameSite fix behind proxy gateways.

## 1. Type safety & lint

```
$ bun run typecheck        # tsc --noEmit
(no output — clean)

$ bun run lint             # eslint .
(no output — clean)
```

## 2. Unit tests (`bun test`)

```
$ bun test tests/
 43 pass
 0 fail
 739 expect() calls
Ran 28 tests across 2 files. [170ms]
```

Coverage highlights:

| Suite | Key verified behaviors |
|---|---|
| `tests/jalali.test.ts` | Nowruz 1405 = 2026-03-21; 1404-12-29 = 2026-03-20 (common year); **full 366-day round-trip of leap year 1403**; month lengths (6×31, 5×30); Afghan month order; Persian-digit input parse; impossible-date rejection; **Asia/Kabul UTC+4:30 boundary instants**; digit-script unification; ی/ک search normalization (originals preserved); +93 phone normalization from 5 formats |
| `tests/rbac.test.ts` | 12 roles defined; every matrix permission exists in catalog; **settings.manage separated from applications.review**; parent = guardian-scope only, no create/update; teacher = section scope, no sensitive access; finance/cashier/librarian never see sensitive fields; auditor read-only; unknown role keys rejected; **scrypt hash/verify round-trip**; password policy; token hashing determinism |
| `tests/phase2.test.ts` *(new)* | **teacher can enter grades but never publish/correct**; publishing authority restricted to assessments.manage (manager/academic_manager — not admin); attendance correction is manager-level; **parents/students see only published results of own children**; HR owns the staff register; auditor strictly read-only (no manage/enter/record/correct); finance/cashier/librarian have NO academic access; **Afghan week starts شنبه, periods 1..8 (0 reserved for whole-day attendance)**; **afghanWeekdayIndex maps 4 known dates**; attendance status catalog; **missing grade excluded not zero (9/10 + missing = 90%, not 45%)**; weights honored across differently-scaled assessments; all-missing subject has null average (not zero) |

## 3. End-to-end API integration (`python3 tests/e2e_api.py`)

97 checks against the running dev server — the full Phase-1 vertical slice
**plus the Phase-2 flows**:

```
RESULT: 97 passed, 0 failed
```

New Phase-2 sections in the run:

| Section | Key verified behaviors |
|---|---|
| [11] Staff register | admin lists 8 staff; teacher records carry portal links; parent blocked (403); minimal teacher list; 12 teaching assignments listed |
| [12] Timetable | teacher fetches own 20-slot weekly schedule; section timetable listed; **teacher double-booking rejected 409 with Dari conflict message**; re-posting a cell updates in place; teacher cannot edit timetable (403) |
| [13] Attendance lifecycle | idempotent open-or-return-existing; same session returned on duplicate open; roster = active enrollments; finance cannot record (403); **parent cannot open another section's roster (403)**; invalid status 400; save marks 200; unenrolled student 400; **stale version 409**; submit locks 200; **submitted session immutable 400**; teacher cannot reopen 403; **academic manager reopens with reason 200** |
| [14] Attendance summary | only submitted sessions counted; **per-student statuses conserve to session count (نا-ثبت invariant)**; submitted marks reflected; registrar gets any-student summary (branch scope) |
| [15] Exams & grades | teacher lists own assessments; **detail returns canEnterGrades=true / canPublish=false**; ungraded student exists; missing grade entered 200; **score above maxScore 400**; **teacher cannot publish 403**; academic manager publishes 200; **published grades immutable 400** |
| [16] Report cards & portals | parent sees exactly 2 linked children; **parent reads own child's report card 200**; weighted averages within 0..100; registrar reads report card (branch); **cashier 403**; **parent blocked from another family's child 403**; parent dashboard lists recent published grades; teacher dashboard shows today's classes + open attendance |

Verified scenarios (abridged):

1. **Auth**: wrong password → 401; unauthenticated /me → 401; admin login;
   **admin has NO applications.review grant (separation of duties)**;
   session cookie lifecycle; logout revokes session (401 after).
2. **Admission workflow**: create draft (applicant number `A-1405-…`);
   **Persian-digit phone `۰۷۰ ۱۲۳ ۴۵۶۷` normalized to `+93701234567`**;
   enrolling a DRAFT blocked; **cashier cannot submit (403)**; **admin
   cannot review (403)**; submit → start review → reject-without-reason
   blocked → approve with note.
3. **Atomic enrollment**: succeeds; **second enrollment blocked
   (exactly-once)**; profile has enrollment; **healthNotes visible to
   registrar**; provided documents copied; guardian linked with normalized
   phone; audit trail covers create→enroll.
4. **Duplicate detection**: similar-records endpoint responds (advisory).
5. **Permission scoping**: parent dashboard lists exactly 2 linked
   children; parent reads own child; **parent sees no sensitive fields**;
   **parent CANNOT read another family's student (403)**; parent list total
   ≤ children; **teacher sees only assigned-section students**; teacher
   blocked outside assignment (403); finance views basic student (no
   sensitive); **finance cannot update student (403)**; cashier cannot
   list applications (403).
6. **Optimistic concurrency**: correct-version update succeeds; **stale
   version → 409**.
7. **Permission-aware search**: registrar finds the new student; **parent
   search does not expose other students**.
8. **CSRF defense**: mutation without client header → 403; **cross-origin
   Origin → 403**.
9. **Outbox fanout**: manager received the enrollment notification.
10. **Session revocation** after logout.

## 4. Browser verification (agent-browser, Chromium)

Golden path exercised through the real UI:

- Login screen renders (Dari, RTL, `dir=rtl lang=fa-AF`, Vazirmatn active).
- Registrar dashboard: 12 nav groups (future-phase modules marked «بعدی»),
  global search, notifications, breadcrumbs, KPI cards with live counts.
- Students list: 12 rows of real data, server-side pagination, saved
  filters UI; row click → profile.
- Student profile: tabs; **Jalali birth date renders «۵ حمل ۱۳۹۳»**;
  sensitive panel visible for registrar; status actions with reason
  dialogs.
- **Parent portal: exactly 2 children**; navigating to another family's
  student URL → Dari 403 empty state («مشاهدهٔ این شاگرد مجاز نیست»).
- **Full 6-step admission stepper**: personal (Jalali input ۱۳۹۷/۰۲/۱۰
  accepted) → guardian (Persian-digit phone, portal access) → documents →
  grade 3 selection → fee-plan placeholder → review acknowledgments →
  **draft saved as `A-1405-0008`** → submitted from UI → status badge
  updated live.
- Settings: permission matrix table renders (24 permission rows × 12
  roles); audit trail renders (25 events incl. `application.enroll`).
- Mobile (375×812): **no horizontal scroll**; nav drawer slides from the
  **right** (RTL-correct).
- Console: no errors after fixing a nested-`<li>` hydration warning in
  breadcrumbs.

## 5. Post-delivery fix — CSRF origin check behind reverse proxies (2026-11-07)

**Symptom:** logging in through the hosted preview URL always failed with
«شما اجازهٔ انجام این عمل را ندارید» — `POST /api/v1/auth/login` returned
403 although the same request worked locally.

**Root cause (two stacked bugs):**

1. `passesOriginCheck` in `src/server/auth/guard.ts` compared the browser's
   `Origin` only against the `Host` header. Behind the preview gateway the
   `Host` seen by Next.js differs from the public hostname, so every
   state-changing request (login POST) was rejected.
2. `apiErrorMessage` in `src/lib/api/hooks.ts` remapped **every** 403 to
   «شما اجازهٔ انجام این عمل را ندارید», masking the real
   CSRF/origin message «درخواست از یک منبع نامعتبر ارسال شده است».

**Fix (layered, proxy-aware, no security regression):**

- Trusted client header `x-maktabyar-client: 1` is now the primary CSRF
  defense: cross-site HTML forms cannot set custom headers, and a
  cross-site `fetch()` with a custom header requires a CORS preflight this
  API never approves (verified: no `Access-Control-Allow-Origin` is ever
  emitted). Survives proxies that rewrite `Host`.
- Header-less requests must carry an Origin matching `Host`, any
  `X-Forwarded-Host` chain entry (default ports normalized), or the new
  `MAKTABYAR_ALLOWED_ORIGINS` env allowlist.
- Client now surfaces the server's Dari message verbatim.
- Rejections log `origin/host/x-forwarded-host` server-side for diagnosis.

**Verification (all real runs):** unit tests 28/28 pass; `tsc --noEmit`
clean; e2e suite extended from 44 to **47 checks — 47/47 pass**, including
all six demo-role logins, session cookie flow (login → me → logout → 401),
full admin API smoke (12 users / 33 sections / 14 audit events), and the
five CSRF scenarios (form-style cross-site blocked; proxy-rewritten Host
allowed; no CORS approval ever; X-Forwarded-Host matching). Browser login
as admin via the UI confirmed: `#/dashboard` renders with full Dari RTL
navigation, `GET /api/v1/dashboard/summary → 200`.

## 6. Reproduction

```bash
bun run typecheck && bun run lint
bun run test            # 28 unit tests
bun run test:e2e        # 47 API checks (requires dev server on :3000)
```

Note: `tests/e2e_api.py` mutates the demo database (creates a test
application/student). Re-run `bun run db:seed` afterwards for a clean demo
state — this was done before delivery.
