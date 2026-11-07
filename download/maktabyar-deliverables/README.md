# مکتب‌یار (MaktabYar) — School Management Information System for Afghanistan

نظام مدیریت معلومات مکتب برای افغانستان — به زبان دری، کاملاً راست‌چین، با تقویم
شمسی افغانی، ارقام فارسی و اجازه‌های دقیق نقش‌محور.

> **وضعیت:** **هر هشت مرحلهٔ توسعه (Phases 1–8) تکمیل و آزمایش شده است** —
> مرحلهٔ اول: ورود امن ← تنظیم مکتب ← شمولیت ← پروفایل شاگرد؛
> مرحلهٔ دوم: کادر مکتب ← تخصیص تدریس ← برنامهٔ صنفی ← حاضری ← امتحانات و
> نتایج ← کارت نتیجه؛ مرحلهٔ سوم: فیس‌ها ← فاکتورها ← رسیدهای پرداخت ← مصارف ←
> معاشات ← گزارش‌های مالی؛ مرحلهٔ چهارم: کتابخانه ← اعلانات و پیام‌ها ←
> کارت‌های شناسایی ← پورتال اولیا/شاگرد؛ مرحلهٔ پنجم: خدمات مکتب (ترانسپورت،
> انبار، مهمان‌ها، رویدادها) ← گزارش‌ها و صدور CSV ← **سال‌گذرانی تکرار-امن**؛
> مرحلهٔ ششم: **دادهٔ پایهٔ شعبه‌های مکتب (CRUD کامل)** ← حذف پیش‌نویس حاضری ←
> فورم فشردهٔ کاربر با نقش/شعبه/شعبه‌های تخصیصی؛ مرحلهٔ هفتم: **دفتر انضباط و
> رفتار** (وقایع + اقدامات مثبت، پیگیری و حل، CRUD کامل با نظارت)؛ مرحلهٔ
> هشتم: **تحلیل‌ها** (KPIها، روند شش‌ماههٔ شمسی، شاگردان در معرض خطر) —
> همراه با **تفکیک سخت‌گیرانهٔ داده‌ها بین شعبه‌ها** (کاربر کارتهٔ نو داده‌های
> خوشحال خان را نمی‌بیند؛ فقط مدیر سیستم و مدیر عام به همهٔ شعبه‌ها دسترسی
> دارند). جزئیات در [KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md).

## Quick start (sandbox)

```bash
bun install            # dependencies
bun run db:push        # create SQLite schema (demo)
bun run db:seed        # synthetic Dari demo data
bun run dev            # start on :3000  (or: next dev -p 3000)
```

Demo logins (all fictional, synthetic data):

| نقش | نام کاربری | رمز | چرا مهم است |
|---|---|---|---|
| مدیر سیستم | `admin` | `Admin1234` | تنظیمات، کاربران، نظارت — **بدون** اجازهٔ تایید شمولیت؛ همهٔ شعبه‌ها |
| مدیر عام | `gm` | `General1234` | **همهٔ شعبه‌ها** — تایید شمولیت، امور مالی و معاشات بدون وظایف فنی |
| مدیر مکتب (کارتهٔ نو) | `manager` | `Manager1234` | تایید/رد درخواست‌ها؛ **فقط شعبهٔ خود** |
| مدیر مکتب (خوشحال خان) | `manager2` | `Manager1234` | اثبات تفکیک شعبه‌ها — داده‌های کارتهٔ نو را نمی‌بیند |
| مدیر تعلیمی | `academic` | `Academic1234` | ساختار تعلیمی |
| مسجل | `registrar` | `Registrar1234` | ثبت درخواست، ارائه، شمول شاگرد — **فقط شعبهٔ خود** |
| استاد | `teacher` | `Teacher1234` | شعبه‌های تخصیصی (۴-الف/ب، ۵-الف): ثبت حاضری و نمرات — **بدون** اجازهٔ انتشار |
| استاد (خوشحال خان) | `teacher2` | `Teacher1234` | صنف ۷-الف در شعبهٔ دوم |
| مسئول مالی | `finance` | `Finance1234` | فیس، فاکتور، وصولی، مصارف، معاشات — **فقط شعبهٔ خود** |
| صندوقدار | `cashier` | `Cashier1234` | ثبت پرداخت بدون باطل‌کردن رسید |
| ولی | `walikhal` | `Parent1234` | **فقط دو فرزند پیوند‌شدهٔ خود** |
| شاگرد | `shagerd` | `Student1234` | فقط رکورد خود |
| کتاب‌دار / منابع بشری / بازرس | `librarian` / `hr` / `auditor` | `…1234` | دیدن ماتریس اجازه‌ها |

## Verification

```bash
bun run typecheck        # tsc --noEmit → clean
bun run lint             # eslint → clean
bun run test             # 134 unit tests (jalali, RBAC, phase-2..8 rules)
bun run test:e2e         # 232 API integration tests against the dev server
curl localhost:3000/api/v1/openapi   # OpenAPI 3.0 spec
```

Actual results are archived in [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md).

## What works (verified)

- **Secure login**: scrypt password hashing, HttpOnly session cookies
  (SHA-256 hashed tokens in DB; SameSite adapts: Lax on plain HTTP,
  None+Secure behind HTTPS proxies/preview gateways), 12h sliding sessions,
  login rate limiting (5 failures / 15 min per username+IP), session
  revocation, audit trail.
- **RBAC**: 13 default roles, 54 permissions × 6 scope kinds
  (`all / branch / year / section / own / guardian`), enforced server-side on
  every endpoint, search result, and export path. Hiding a menu is never
  authorization — the API re-checks.
- **Branch isolation (P3)**: every user is bound to a branch; branch-scoped
  grants without a branch fail closed. Only `admin` and the مدیر عام see
  all branches — with a top-bar branch switcher. Forged
  `x-maktabyar-branch` headers from branch-bound users are ignored.
- **Admission workflow**: 6-step Dari stepper → draft → submitted →
  under_review → approved/rejected → **atomic enrollment**
  (student + guardians + links + enrollment + documents + audit + outbox in
  ONE transaction). Duplicate detection warns — never auto-merges.
- **Student profiles**: tabs (overview / enrollment / guardians / documents /
  attendance / results / audit history), Jalali dates, version-checked edits, lifecycle changes with
  mandatory reasons, sensitive fields only for `students.view_sensitive`.
- **Staff & teaching (P2)**: staff register with portal-account links, HR
  ownership, teaching assignments (one teacher per section+subject+year).
- **Timetable (P2)**: weekly grid (شنبه…جمعه × نفریزه‌های ۱–۸) with automatic
  conflict detection — a teacher can never be double-booked; teachers view
  their own schedule.
- **Attendance (P2)**: open → quick-mark roster (حاضر/غیرحاضر/ناوقت/رخصت) →
  save → submit (locks) → audited reopen for corrections. «نا-ثبت» is never
  counted as present or absent; only submitted sessions enter statistics.
- **Exams & grades (P2)**: assessments with weights, gradebook grid,
  **missing grade ≠ zero**, publish lock with policy snapshot; report cards
  with weighted subject averages; parents/students see published results
  only.
- **Fees & finance (P3)**: fee plans per grade/branch/period, student
  discounts (largest active snapshotted at issue), **idempotent bulk invoice
  issue** (re-issue skips), payments with sequential receipts —
  overpayment rejected, **missing payment ≠ paid**, void-with-reason
  corrections (audited, never deleted), expenses ledger with categories,
  payroll runs (draft → approve → pay; paying books a «معاشات» expense
  automatically), finance reports (monthly KPIs, 6-month income vs expense,
  top debtors). Money is integer diram — never floats.
- **Library (P4)**: catalog (title vs physical copy), bulk copy numbering,
  loans with the one-active-loan-per-copy invariant (double checkout → 409),
  overdue tracking, and **fines issued as linked finance invoices** — the
  money lives in one module only.
- **Announcements & messages (P4)**: branch/section-scoped announcements
  (all/staff/guardians audiences), draft → publish gate, idempotent read
  receipts; group SMS/email sends are RECORDED in a queued message log +
  outbox (the gateway itself is a production integration point — nothing is
  faked as sent).
- **Guardian/student portal (P4)**: one aggregate view — children with
  enrollment, attendance snapshot, published subject averages, outstanding
  fee balance and the latest announcements.
- **ID cards (P4)**: printable A4 sheet per class section (print CSS; photo
  placeholders until the upload pipeline is wired).
- **Services (P5)**: transport routes with transactional capacity checks;
  inventory as an append-only movement ledger (negative stock impossible);
  guest register with checkout; event calendar with org-wide + branch
  events.
- **Reports (P5)**: students registry, attendance (with «نا-ثبت»
  conservation) and published results — screen preview, print sheet and
  **CSV export with UTF-8 BOM**; scopes reuse the RBAC engine (teachers
  auto-narrow to their sections).
- **Year-end rollover (P5)**: preview → per-student decisions
  (promote/repeat/graduate/leave) → apply. **Repeat-safe** (structural
  enrollment uniqueness; re-running on a closed year is a no-op). Academic
  closing never erases debt or closes financial periods. Only admin and
  مدیر عام hold `year_end.manage`.
- **Dari & RTL**: full interface in Afghan Dari, `dir="rtl" lang="fa-AF"`,
  self-hosted Vazirmatn, Afghan Solar-Hijri months (حمل…حوت), Asia/Kabul
  timezone for instants, date-only fields immune to timezone shifts,
  Persian/Arabic/Latin digit input, ی/ک search normalization, +93 phone
  normalization, LTR isolation for codes.
- **REST API `/api/v1`** (83 endpoints) + OpenAPI 3.0 — the same contract a
  future mobile app consumes. No business logic in Server Actions.
- **Audit trail & outbox**: every mutation recorded with actor/action/entity/
  before/after/reason; transactional outbox fans out notifications.

## Documentation

| Document | Contents |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Layers, module boundaries, NestJS extraction path |
| [docs/PERMISSION-MATRIX.md](docs/PERMISSION-MATRIX.md) | Full role × permission × scope matrix |
| [docs/DOMAIN-WORKFLOWS.md](docs/DOMAIN-WORKFLOWS.md) | Admission state machine, invariants |
| [docs/LOCALIZATION.md](docs/LOCALIZATION.md) | Dari terms, Jalali rules, digit/phone handling |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Env vars, backup/restore, PostgreSQL migration |
| [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md) | Actual test output (evidence) |
| [docs/KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md) | What remains, phase plan, honest gaps |

## License & identity

Product name «مکتب‌یار», original logo mark (public/icon.svg), synthetic demo
data only. This system is **not** an official government or Ministry system;
no official seals are used — ministry/logo slots are explicit replaceable
placeholders.
