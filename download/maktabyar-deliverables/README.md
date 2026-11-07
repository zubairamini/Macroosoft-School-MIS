# مکتب‌یار (MaktabYar) — School Management Information System for Afghanistan

نظام مدیریت معلومات مکتب برای افغانستان — به زبان دری، کاملاً راست‌چین، با تقویم
شمسی افغانی، ارقام فارسی و اجازه‌های دقیق نقش‌محور.

> **وضعیت:** مرحلهٔ اول (Phase 1) از پنج مرحلهٔ توسعه تکمیل و آزمایش شده است —
> slice عمودی کامل: ورود امن ← تنظیم مکتب ← درخواست شمولیت ← شمول ← پروفایل
> شاگرد با اجازه‌های دقیق. جزئیات در [KNOWN-LIMITATIONS.md](docs/KNOWN-LIMITATIONS.md).

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
| مدیر سیستم | `admin` | `Admin1234` | تنظیمات، کاربران، نظارت — **بدون** اجازهٔ تایید شمولیت |
| مدیر مکتب | `manager` | `Manager1234` | تایید/رد درخواست‌های شمولیت |
| مدیر تعلیمی | `academic` | `Academic1234` | ساختار تعلیمی |
| مسجل | `registrar` | `Registrar1234` | ثبت درخواست، ارائه، شمول شاگرد |
| استاد | `teacher` | `Teacher1234` | فقط شعبه‌های تخصیص‌یافته (صنف ۴-الف و ۵-الف) |
| مسئول مالی | `finance` | `Finance1234` | دیدن پایهٔ شاگرد بدون معلومات محدود |
| صندوقدار | `cashier` | `Cashier1234` | بدون دسترسی به شمولیت‌ها |
| ولی | `walikhal` | `Parent1234` | **فقط دو فرزند پیوند‌شدهٔ خود** |
| شاگرد | `shagerd` | `Student1234` | فقط رکورد خود |
| کتاب‌دار / منابع بشری / بازرس | `librarian` / `hr` / `auditor` | `…1234` | دیدن ماتریس اجازه‌ها |

## Verification

```bash
bun run typecheck        # tsc --noEmit → clean
bun run lint             # eslint → clean
bun run test             # 28 unit tests (jalali boundaries, RBAC, auth)
bun run test:e2e         # 44 API integration tests against the dev server
curl localhost:3000/api/v1/openapi   # OpenAPI 3.0 spec (30 paths)
```

Actual results are archived in [docs/TEST-RESULTS.md](docs/TEST-RESULTS.md).

## What works (verified)

- **Secure login**: scrypt password hashing, HttpOnly SameSite session cookies
  (SHA-256 hashed tokens in DB), 12h sliding sessions, login rate limiting
  (5 failures / 15 min per username+IP), session revocation, audit trail.
- **RBAC**: 12 default roles, 24 permissions × 6 scope kinds
  (`all / branch / year / section / own / guardian`), enforced server-side on
  every endpoint, search result, and export path. Hiding a menu is never
  authorization — the API re-checks.
- **Admission workflow**: 6-step Dari stepper → draft → submitted →
  under_review → approved/rejected → **atomic enrollment**
  (student + guardians + links + enrollment + documents + audit + outbox in
  ONE transaction). Duplicate detection warns — never auto-merges.
- **Student profiles**: tabs (overview / enrollment / guardians / documents /
  audit history), Jalali dates, version-checked edits, lifecycle changes with
  mandatory reasons, sensitive fields only for `students.view_sensitive`.
- **Dari & RTL**: full interface in Afghan Dari, `dir="rtl" lang="fa-AF"`,
  self-hosted Vazirmatn, Afghan Solar-Hijri months (حمل…حوت), Asia/Kabul
  timezone for instants, date-only fields immune to timezone shifts,
  Persian/Arabic/Latin digit input, ی/ک search normalization, +93 phone
  normalization, LTR isolation for codes.
- **REST API `/api/v1`** (30 endpoints) + OpenAPI 3.0 — the same contract a
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
