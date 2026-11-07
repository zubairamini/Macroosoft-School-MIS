# Domain Workflows & Invariants — مکتب‌یار

## 1. Admission state machine

```
              ┌────────────┐
              │   draft    │──── update (registrar, version-checked)
              └─────┬──────┘
        submit      │      cancel
      (registrar)  ▼         ▼
              ┌────────────┐  ┌───────────┐
              │ submitted  │─▶│ cancelled │ (terminal)
              └─────┬──────┘  └───────────┘
     start-review   │  │ reject (reason REQUIRED)
    (manager/...)  ▼  ▼
          ┌──────────────┐   reason REQUIRED
          │ under_review │──────────▶ ┌──────────┐
          └──────┬───────┘           │ rejected │ (terminal)
                 │ approve            └──────────┘
                 ▼
          ┌──────────┐  enroll (atomic)
          │ approved │──────────────▶ ┌──────────┐
          └──────────┘                │ enrolled │ (terminal)
                                      └──────────┘
```

Guards (implemented in `src/server/admissions/index.ts`, E2E-tested):

| Rule | Failure mode |
|---|---|
| Only DRAFT is editable | 400 «فقط درخواست‌های در حالت پیش‌نویس قابل ویرایش هستند» |
| Draft/submitted → cancelled only | 400 with current status named |
| Reject requires a note | 400 field error |
| Only APPROVED can enroll | 400 with current status named |
| Re-enroll an enrolled application | 400 (exactly-once, conditional update) |
| Concurrent transitions | 409 «وضعیت درخواست هم‌زمان تغییر کرده است» |
| Version mismatch on edit | 409 conflict |

## 2. Atomic enrollment (the critical transaction)

`enrollApplication` runs ONE `db.$transaction` that:

1. Counts active enrollments in the target section → **capacity check**
   (over-capacity ⇒ abort).
2. Generates the next student number via the `Counter` table
   (`S-<year>-<NNNN>`) — monotonic, no duplicates by construction.
3. Creates the persistent **Student** identity.
4. Upserts **Guardians** (dedupe by org+phone) and creates
   **StudentGuardian** links with per-child `contactRights`.
5. Creates the yearly **Enrollment** — DB `@@unique([studentId,
   academicYearId])` makes double enrollment structurally impossible.
6. Copies PROVIDED documents into **StudentDocument**.
7. Flips the application to `enrolled` with a conditional
   `updateMany({status: 'approved'})` (exactly-once under concurrency).
8. Writes the **AuditEvent** (before/after, actor, reason).
9. Writes an **OutboxEvent** (`student.enrolled`) for notification fanout.

Any failure rolls back everything — no orphan students, no half-enrollments.

## 3. Student lifecycle

```
active ⇄ inactive (temporarily)
active → transferred (reason REQUIRED, enrollments closed)
active → withdrawn   (reason REQUIRED, enrollments closed)
active → graduated   (year-end, Phase 5)
transferred/withdrawn → active (reactivation, audited)
```

- Status changes with mandatory reasons write both a Student update and an
  Enrollment status update in one transaction, plus audit.
- History is never rewritten: the profile "تاریخچه" tab shows the audit
  trail with reasons.
- No soft delete anywhere: records are closed/transferred, not erased.

## 4. Duplicate protection (advisory only)

`findSimilarApplications` scores candidates on:
- normalized first+father name (ی/ک variants unified),
- exact birth-date match,
- exact phone match.

A candidate is surfaced only with ≥2 independent signals (or name+birthdate
pair). The UI shows a warning panel on the application detail page. **The
system NEVER auto-merges** — merging is a human decision reserved for a
future reviewed workflow.

## 5. Document numbering

`Counter(key = "<kind>:<academicYearName>")` rows are incremented with
`upsert … value: {increment: 1}` inside the owning transaction:
`A-1405-0007` (applicant), `S-1405-0011` (student). Seeds synchronize
counters with pre-created records so runtime generation never collides.

## 6. Academic year & configuration invariants

- Exactly one `isCurrent` year per org (`setCurrentAcademicYear` clears
  others in one transaction).
- A closed year cannot be re-activated.
- Year boundaries accept Jalali input (`۱۴۰۵/۰۱/۰۱`) or ISO; stored ISO
  date-only, compared lexically (`start < end` enforced).
- Class sections are unique per (year, grade, label); branch ≠ class section
  is modelled explicitly (`Branch` vs `ClassSection.label`).
- Grades 1–12 are ensured idempotently (`ensureGradeLevels`).

## 7. Phase 2 — staff, timetable, attendance, exams & grades

### 7.1 Staff register & teaching contract

- `StaffMember` is the employee register; `userId` optionally links a portal
  account (one-to-one, unique). HR (`staff.manage`) owns it.
- `TeachingAssignment` is the binding teaching contract: exactly one teacher
  per (academic year, class section, subject) — DB `@@unique`. Setting a
  second teacher on the same slot is a 409 naming the current holder.
- Terminated staff cannot receive assignments or timetable slots.

### 7.2 Timetable

- `TimetableSlot` (weekday 0=شنبه…6=جمعه, period 1..8; period 0 is reserved
  for whole-day attendance and rejected here).
- **Conflict detection** on upsert, backed by DB uniques:
  `@@unique([classSectionId, weekday, period])` (a section has one lesson per
  cell) and `@@unique([staffId, weekday, period])` (a teacher is in one place
  at a time). The API returns 409 with a Dari message naming the clashing
  teacher, day, period and section.
- Re-posting an existing cell updates it in place (idempotent, no duplicate
  rows possible).

### 7.3 Attendance lifecycle

```
(open) ── save (draft marks, repeatable) ── submit ──▶ submitted (immutable)
  ▲                                                      │
  └──────────── reopen (attendance.correct, reason REQUIRED, audited) ◀┘
```

- At most one session per (section, date, period) — DB `@@unique`; opening
  the same day twice returns the SAME open session (idempotent makeup path);
  opening a submitted day is 409 pointing to the correction route.
- Records exist only for ACTIVE enrollments of that section (400 otherwise).
- **«نا-ثبت» ≠ حاضر ≠ غیرحاضر:** only SUBMITTED sessions enter statistics,
  and a student without a record row inside a submitted session is counted
  as `notRecorded` — never silently present or absent. Per-student counts
  always conserve to the submitted-session count (E2E-tested).
- Submitted sessions are immutable; corrections flow through an audited
  reopen (`attendance.correct`: manager/academic_manager only).

### 7.4 Assessments & grades

```
grading ── publish (assessments.manage) ──▶ published (locked, policy snapshot)
```

- Teachers enter grades (`grades.enter`) for their own sections — via a
  section-scoped grant OR their `TeachingAssignment` rows; academic managers
  may substitute (branch scope).
- **Missing grade ≠ zero:** `score IS NULL` rows (and exam-day absence flags)
  are excluded from every aggregation; a subject with all grades missing has
  NO average (null), not zero. Weighted average =
  `Σ(score/maxScore × weight) / Σ(weight)` over non-missing grades.
- Score > maxScore is rejected (400); score+absence together are rejected.
- **Publishing is approval:** requires `assessments.manage` (manager /
  academic_manager — deliberately NOT admin, NOT teacher), needs ≥1 grade,
  locks the grade table (subsequent writes 400), and snapshots the grading
  policy in force (`{maxScore, weight, type}`) so published results never
  re-compute from later edits.
- Students/parents see grades only after publishing and only their own rows;
  report cards (`/students/{id}/report-card`) show published items with
  weighted subject averages plus a submitted-attendance summary.

## 8. What later phases must preserve (design commitments)

- **Fees (P3):** idempotent generation (rerun-safe), decimal money in
  integer minor units, reversal/refund workflows instead of edits,
  idempotency keys against double-click collections, atomic
  invoice→allocation→receipt→ledger posting.
- **Library (P4):** title vs physical copy; no two active loans of one copy
  (transactional check + unique partial index pattern); charges create
  linked finance transactions.
- **Grade corrections (P3+):** published results stay immutable; corrections
  arrive as approved reversal records referencing the original grade, with
  full policy version history.
- **Year-end (P5):** repeat-safe promotion batches; academic closing never
  erases debt or closes financial periods.

## 9. Phase 4 — Library invariants (implemented)

```
copy.status:  available ──checkout──▶ loaned ──return──▶ available
                 │                       │
                 │                       └──lost──▶ copy lost + fine invoice
                 └──withdrawn (manual, available only)
```

- **One active loan per copy** — enforced by a CONDITIONAL
  `updateMany({status: "available"}) → "loaned"` inside the checkout
  transaction: a concurrent/duplicate checkout updates 0 rows → 409
  «این نسخهٔ کتاب در حال حاضر امانت است». SQLite has no partial unique
  index, so this transactional flip IS the constraint.
- **Fines are finance records, not duplicated money:** a late return or a
  lost copy issues a REAL Invoice (`periodKey = "fine:<loanId>"`) inside
  the same transaction — payments, voiding, audit and reports come for
  free from the Phase-3 module. On-time returns reject fines (400).
- **Branch isolation:** catalog, copies and loans all carry `branchId`;
  the borrower must hold an ACTIVE enrollment in the branch of the book.
- **Numbering:** copy codes `B-<yearName>-<NNNN>` from the monotonic
  Counter table inside the owning transaction.

## 10. Phase 4 — Announcements & messages (implemented)

```
draft ──publish──▶ published ──unpublish──▶ draft
         │
         └─▶ invisible to non-managers until published
```

- Announcements target a branch (optionally ONE class section) and an
  audience: `all | staff | guardians`.
- **Read receipts:** one `AnnouncementRead` row per user per announcement
  (DB unique) — `markRead` is idempotent (upsert, no error on repeat).
- **Guardian visibility:** guardians see `all`/`guardians` announcements of
  the branches where their children study, plus section-narrowed ones for
  their children's sections. Students see `all`-audience announcements of
  their own enrollment branch.
- **Messages are recorded, never faked:** `POST /messages` writes
  `MessageLog` rows with status `queued` plus an outbox event. No SMS/email
  gateway is wired in this deployment — nothing is marked «sent» locally
  (see KNOWN-LIMITATIONS).

## 11. Phase 5 — Services invariants (implemented)

- **Transport:** capacity enforced transactionally — adding a passenger
  counts ACTIVE passengers inside the transaction; overflow → 409. A
  student must be actively enrolled in the route's branch. Stopped
  passengers are history (re-adding reactivates the same row).
- **Inventory (انبار) is an append-only ledger:** every receive/issue
  appends an `InventoryMovement` row and updates `item.quantity` with a
  CONDITIONAL `updateMany({quantity: {gte: -delta}})` — issuing below zero
  updates 0 rows → 409. Movements are never edited or deleted.
- **Guest register:** arrival is an instant; checkout stamps `leftAt`;
  records are closed, never deleted; double checkout → 400.
- **Events:** `branchId = null` means org-wide (visible to every branch);
  branch events are isolated. `endsOn ≥ startsOn` enforced by the DTO.

## 12. Phase 5 — Year-end rollover (implemented)

```
preview ──▶ decide (overrides) ──▶ apply ──▶ year closed, next year current
                                    │
                                    └── re-apply = no-op (repeat-safe)
```

- **A decided batch, not a blind copy:** every active enrollment of the
  closing year gets ONE `PromotionDecision`
  (`promote | repeat | graduate | leave`, default: grade 12 → graduate,
  everyone else → promote). Human overrides land via `/rollover/decide`
  before applying. Promoting FROM grade 12 is rejected (400).
- **Repeat-safe by construction:** `Enrollment`'s
  `@@unique([studentId, academicYearId])` makes double enrollment
  structurally impossible; decisions carry `appliedAt`, so re-running
  `apply` skips finished rows. Applying an already-closed year returns
  200 with zero new rows — never an error, never a duplicate.
- **Debt survives:** apply touches ONLY enrollments, decisions, the year
  row and (optionally) `isCurrent`. Invoices, payments, payroll and
  expenses are not modified — verified by E2E (invoice count unchanged
  across a rollover).
- **Sections are not auto-created:** promoted enrollments land without a
  class section; assigning sections is the new year's setup task.
- **Permission:** `year_end.manage` — admin and general_manager only
  (E2E: branch manager and cashier get 403).
- **Year-name math is digit-style aware:** «۱۴۰۵» (Persian digits) rolls
  to «۱۴۰۶», Latin "1405" rolls to "1406" (`yearNameAsNumber`).

## 13. Phase 5 — Reports contract (implemented)

- Reports return a GENERIC TABLE `{ title, columns[], rows[][], meta }`
  with values pre-formatted in Dari (Jalali dates, Persian digits).
- The same contract feeds the screen table, the print sheet
  (`@media print` CSS) and the CSV export (`?format=csv`, UTF-8 BOM so
  Excel reads Dari correctly; title + meta lead the file).
- Scoping reuses the RBAC scope engine: branch roles see their branch,
  teachers auto-narrow to their assigned sections (E2E-verified),
  guardians/students have no `reports.view` by design.
- «نا-ثبت ≠ حاضر»: attendance reports only count SUBMITTED sessions; a
  student without a record row is listed as not-recorded — never present.
