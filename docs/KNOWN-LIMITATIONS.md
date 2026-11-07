# Known Limitations & Roadmap — وضعیت صادقانهٔ سیستم

This document states exactly what works, what remains, and what is blocked.
Nothing here is hidden behind marketing language.

## Phase status

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, schema, auth, permissions, localization, design system, school setup, admissions, student profiles | ✅ **Delivered & verified** (this release) |
| 2 | Teachers, subjects, timetables, attendance, exams, results | 🔜 Not started (data model hooks present) |
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
  assignment UI are Phase 2 (the data model supports both).
- **No branch switcher control yet** — branch context is displayed in the
  top bar; authorization treats unnarrowed branch grants as all-branches.
- **Document uploads**: the checklist is recorded, but file storage with
  signed private access is Phase 4 (schema ready: `StudentDocument.fileUrl`).
- **Exports** (xlsx/pdf) are permission-gated in the UI but the generation
  pipeline (background jobs) is Phase 2/4 — the UI states this instead of
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
  ministry requirements — they are configurable settings (versioned policy
  tables arrive with Phase 2 exams).
- No online payment integration exists or is advertised.
- Transport maps are not GPS tracking (module not built at all).
- Backup/restore procedure is documented and drill-verified for SQLite in
  this sandbox (see DEPLOYMENT.md §4); PostgreSQL drills come with the PG
  migration.

## Recommended next steps (Phase 2 opening moves)

1. Extract `apps/api` (NestJS) + `apps/worker`; keep the same schema.
2. Teacher/employee profiles + `TeacherAssignment` + timetable with
   conflict detection (draft/publish versions).
3. Attendance: daily/period sessions, roster entry, absent≠unrecorded,
   `@@unique(session, student)`, corrections with reasons.
4. Exams/marks: assessment types, weighted components, marks-entry grid,
   review → approval → publication with policy snapshots.
5. Custom roles UI + saved column preferences + export jobs.
