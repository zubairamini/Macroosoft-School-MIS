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
