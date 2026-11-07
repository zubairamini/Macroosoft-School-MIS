# Known Limitations & Roadmap — وضعیت صادقانهٔ سیستم

This document states exactly what works, what remains, and what is blocked.
Nothing here is hidden behind marketing language.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, schema, auth, permissions, localization, design system, school setup, admissions, student profiles | ✅ **Delivered & verified** (this release) |
| 2 | Staff register, teaching assignments, timetables, attendance, exams & grades, report cards | ✅ **Delivered & verified** (this release) |
| 3 | Fees, accounting, expenses, payroll, financial reports | 🔜 Not started (module toggle exists) |
| 4 | Textbooks, library, cards/documents/printing, communications, portals | 🔜 Not started |
| 5 | Optional services, year-end closing, performance, security hardening | 🔜 Not started |

Sidebar entries for future phases are visible, marked «بعدی», and route to
roadmap pages that say precisely what remains — no fake screens.

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
  module (Phase 3) will consume the stored choice. The UI says so plainly.
- **User creation offers system roles only**; custom roles and multi-role
  assignment UI remain future work (the data model supports both).
- **No branch switcher control yet** — branch context is displayed in the
  top bar; authorization treats unnarrowed branch grants as all-branches.
- **Document uploads**: the checklist is recorded, but file storage with
  signed private access is Phase 4 (schema ready: `StudentDocument.fileUrl`).
- **Exports** (xlsx/pdf) are permission-gated in the UI but the generation
  pipeline (background jobs) is Phase 3/4 — the UI states this instead of
  faking a download.
- **Print templates, ID cards, QR verification** — Phase 4, not present.
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
- Transport maps are not GPS tracking (module not built at all).
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

## Recommended next steps (Phase 3 opening moves)

1. Extract `apps/api` (NestJS) + `apps/worker`; keep the same schema.
2. Fee plans + idempotent invoice generation + cash collection with
   idempotency keys + printable receipts.
3. Double-entry accounting: journal entries must balance; posted sets are
   immutable, corrections via approved reversals.
4. Payroll (module toggle exists).
5. Custom roles UI + export jobs (carry-over from Phase 2 polish).
