# Test Results — actual runs (2026-11-06)

All commands were executed against the live sandbox environment; outputs
below are the real results, not claims.

## 1. Type safety & lint

```
$ npx tsc --noEmit -p tsconfig.json
(no output — clean)

$ bun run lint
$ eslint .
(no output — clean)
```

## 2. Unit tests (`bun test`)

```
$ bun test tests/
 28 pass
 0 fail
 579 expect() calls
Ran 28 tests across 2 files. [170ms]
```

Coverage highlights:

| Suite | Key verified behaviors |
|---|---|
| `tests/jalali.test.ts` | Nowruz 1405 = 2026-03-21; 1404-12-29 = 2026-03-20 (common year); **full 366-day round-trip of leap year 1403**; month lengths (6×31, 5×30); Afghan month order; Persian-digit input parse; impossible-date rejection; **Asia/Kabul UTC+4:30 boundary instants**; digit-script unification; ی/ک search normalization (originals preserved); +93 phone normalization from 5 formats |
| `tests/rbac.test.ts` | 12 roles defined; every matrix permission exists in catalog; **settings.manage separated from applications.review**; parent = guardian-scope only, no create/update; teacher = section scope, no sensitive access; finance/cashier/librarian never see sensitive fields; auditor read-only; unknown role keys rejected; **scrypt hash/verify round-trip**; password policy; token hashing determinism |

## 3. End-to-end API integration (`python3 tests/e2e_api.py`)

44 checks against the running dev server — the full Phase-1 vertical slice:

```
RESULT: 44 passed, 0 failed
```

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

## 5. Reproduction

```bash
bun run typecheck && bun run lint
bun run test            # 28 unit tests
bun run test:e2e        # 44 API tests (requires dev server on :3000)
```

Note: `tests/e2e_api.py` mutates the demo database (creates a test
application/student). Re-run `bun run db:seed` afterwards for a clean demo
state — this was done before delivery.
