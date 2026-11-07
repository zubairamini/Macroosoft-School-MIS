# Known Limitations & Roadmap — وضعیت صادقانهٔ سیستم

This document states exactly what works, what remains, and what is blocked.
Nothing here is hidden behind marketing language.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, schema, auth, permissions, localization, design system, school setup, admissions, student profiles | ✅ **Delivered & verified** |
| 2 | Staff register, teaching assignments, timetables, attendance, exams & grades, report cards | ✅ **Delivered & verified** |
| 3 | Fees & discounts, invoices, payments/receipts, expenses, payroll, financial reports, **strict branch isolation** | ✅ **Delivered & verified** |
| 4 | Library, announcements/messages, ID cards & printing, guardian/student portal | ✅ **Delivered & verified** (this release) |
| 5 | Services (transport/inventory/guests/events), reports & CSV export, **repeat-safe year-end rollover**, security hardening | ✅ **Delivered & verified** (this release) |

All five phases of the original specification are now implemented. The
remaining items below are honest gaps, not hidden roadmap claims.

## Deliberate sandbox adaptations (not claimed as production topology)

1. **Single Next.js process instead of separate NestJS API + worker.** The
   sandbox exposes one port. The API lives under `/api/v1` with strict
   internal layering so extraction to `apps/api` (NestJS) is mechanical —
   see ARCHITECTURE.md §2. **A future mobile app uses the same /api/v1
   contract; the web SPA already consumes only REST (no Server Actions).**
2. **SQLite instead of PostgreSQL/Redis.** Prisma schema is written for a
   clean PG migration (enum-like strings documented per field; date-only as
   ISO strings). Redis has no role yet — the outbox table already provides
   the reliable queue benefit Redis would add; a worker process drains it
   (in-process drain in the sandbox).
3. **shadcn/Radix component foundation instead of Preline.** The sandbox's
   maintained component system is Radix-based; Preline's interaction JS is
   not part of this runtime. The requested visual identity (emerald/navy/
   amber tokens, borders, 150–250ms transitions, reduced-motion) is fully
   implemented on top of it.
4. **Sessions are cookie-based** (web). Short-lived mobile access tokens +
   refresh are designed but not implemented — no mobile client exists yet.

## Functional limitations in the delivered slice

- **Admission stepper fee-plan step is a recorded placeholder** — the fee
  module consumes the stored choice. The UI says so plainly.
- **User creation offers system roles only**; custom roles and multi-role
  assignment UI remain future work (the data model supports both).
- **Document uploads**: the checklist is recorded, but file storage with
  signed private access is not wired (`StudentDocument.fileUrl` ready).
- **SMS/email delivery**: `POST /messages` and the announcement fanout
  write `MessageLog` rows with status `queued` + outbox events — the actual
  gateway (Afghan SMS provider / SMTP) is a production integration point.
  Nothing is ever marked «sent» locally; the UI states «در صف ارسال».
- **ID-card photos**: the print sheet renders a photo placeholder; real
  photos need the document-upload pipeline above.
- **CSV only for registry exports**: xlsx/pdf pipelines remain future
  work (CSV carries a BOM so Excel opens Dari correctly).
- **Offline attendance sync, conflict workflow** — designed (version
  columns everywhere) but not implemented; nothing claims offline support.
- **MFA for privileged roles, password reset via SMS** — not implemented;
  password reset is admin-mediated with audit trail.
- **Setup wizard** runs on fresh databases (org not configured); the demo
  ships pre-configured so evaluators see a populated system immediately.
- Tests run against the dev server; no CI pipeline is configured here.

## Things explicitly NOT claimed

- This is **not** an official/Ministry-approved system; no official seals;
  ministry-logo slot is a replaceable placeholder (`ministryLogoUrl`).
- Report formats are **not** labeled "official Ministry format".
- Passing marks, holidays, and grading rules are **not** hardcoded as
  ministry requirements — they are configurable settings (the Phase-2
  assessment publishes snapshot {maxScore, weight, type}; full versioned
  policy documents remain future work).
- No online payment integration exists or is advertised.
- Transport is a route/passenger register — **not** GPS tracking or live
  bus maps (nothing of the sort is claimed).
- Backup/restore procedure is documented and drill-verified for SQLite in
  this sandbox (see DEPLOYMENT.md §4); PostgreSQL drills come with the PG
  migration.

## Phase 2 — delivered in this release (2026-11-07)

Staff register (`StaffMember` + portal links + HR ownership), teaching
assignments (one teacher per section+subject+year), weekly timetable with
conflict detection (teacher double-booking impossible), attendance lifecycle
(open → save → submit → audited reopen; «نا-ثبت» never counted as
present/absent), exams & gradebook (missing ≠ zero, publish lock with policy
snapshot), report cards with weighted averages, permission separation
(teacher enters / manager publishes / parent-student see published only),
plus the proxy-aware session cookie fix. 43 unit tests + 97 e2e checks
green.

### Remaining Phase-2 polish (not blocking)

- Timetable draft/publish versions (current model is directly editable with
  conflict checks; a staged "draft week" review flow is a refinement).
- Custom roles UI + saved column preferences + export jobs (data model
  ready).
- Period-level (پریودی) attendance UI — the API accepts periods 1..8 and the
  schema enforces uniqueness per (section, date, period); the shipped UI
  records whole-day sessions (period 0).

## Phase 3 — delivered in this release (2026-11-07)

Fee structures (per grade/branch/period — monthly, termly, one-time),
student discounts (percent or fixed; the largest active discount is
snapshotted at issue time), **idempotent bulk invoice issue** (one live
invoice per student per period; re-issue skips), payments with sequential
receipts (overpayment rejected transactionally; missing payment ≠ paid),
void-with-reason corrections (payments, invoices, expenses — no deletes,
everything audited), expenses ledger with categories, **payroll runs**
(generated from staff base salaries, adjustable while draft, approve → pay
which automatically books a «معاشات» expense), and finance reports
(monthly KPIs, six-month income-vs-expense series, top debtors).

**Branch isolation** (the headline policy): every user is bound to a branch
via `UserRole.branchId`; branch-scoped grants without a concrete branch now
fail closed (before: "all branches"). Only `admin` and the new
`general_manager` (مدیر عام) role cross branch boundaries — with a branch
switcher in the top bar («همه شعبه‌ها» + each branch). A forged
`x-maktabyar-branch` header from a branch-bound user is ignored
server-side. Isolation is enforced on every list endpoint (students,
applications, staff, sections, timetable, attendance, assessments, users,
invoices, payments, expenses, payroll) and on single-record access paths.

Money is stored as integer diram (100 diram = 1 AFN) — never floats.
63 unit tests + 140 e2e checks green.

### Remaining Phase-3 polish (not blocking)

- Double-entry accounting (journal entries that must balance) — the current
  ledger is a cash-book view (payments + expenses), which is what Afghan
  private schools asked for first; a full chart of accounts remains open.
- SMS/e-receipt delivery for parents (queued `MessageLog` rows + outbox
  events are written since Phase 4; the actual gateway wiring is a
  production integration point).
- Fee installment plans (N installments per invoice) — currently one
  invoice = one net amount with arbitrary partial payments.

## Phase 4 — delivered in this release (2026-11-07)

**Library**: catalog (title vs physical copy), bulk copy numbering
(`B-۱۴۰۵-NNNN`), loans with the one-active-loan-per-copy invariant
(transactional conditional flip → 409 on double checkout), overdue
tracking, and **fines issued as real linked finance invoices**
(`periodKey "fine:<loanId>"` — payments/voiding/audit come free from
Phase 3). **Announcements**: branch/section-scoped with audience
(`all|staff|guardians`), draft→publish gate, idempotent per-user read
receipts; guardians see announcements of their children's branches.
**Messages**: group sends to guardians/staff are recorded in a queued
`MessageLog` + outbox events (gateway = production integration).
**Portal**: one aggregate endpoint serving the guardian/student view —
children with enrollment, attendance snapshot, published subject averages,
outstanding balance, latest announcements. **ID cards**: printable A4
sheet per class section (print CSS + photo placeholders).

## Phase 5 — delivered in this release (2026-11-07)

**Services**: transport routes with transactional capacity checks and
branch-bound passengers; inventory as an append-only movement ledger
(negative stock impossible); guest register with checkout; event calendar
with org-wide (branchId null) vs branch events. **Reports**: students
registry, attendance (with «نا-ثبت» conservation) and published results —
screen preview, print sheet and **CSV export with UTF-8 BOM**; scopes reuse
the RBAC engine (teachers auto-narrow to their sections).
**Year-end rollover**: preview → per-student decision overrides
(promote/repeat/graduate/leave) → apply. Repeat-safe by construction
(structural enrollment uniqueness + `appliedAt`); re-running the batch on a
closed year is a no-op. Academic closing never erases debt or closes
financial periods (E2E-verified). `year_end.manage` is admin/
general_manager only. 99 unit tests + 200 e2e checks green.

## Recommended next steps (post-Phase-5 polish)

1. **Wire a real SMS/email gateway** to the existing outbox + MessageLog
   queue (the production integration point for communications).
2. **Document/file uploads with signed private access** (`fileUrl` fields
   already exist) — unlocks real ID-card photos and document verification.
3. **Custom roles UI + export jobs** (data model ready).
4. **PostgreSQL migration** (schema is written for it) + production
   deployment drill.
5. **Grade-correction workflow**: approved reversal records referencing
   published grades (published results stay immutable — by design).
