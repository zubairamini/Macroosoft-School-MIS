# Architecture — مکتب‌یار

## 1. Shape of the system

```
┌──────────────────────────────────────────────────────────────────┐
│ Browser (web SPA)              Future mobile app                  │
│   Next.js App Router, React 19    same /api/v1 REST contract     │
│   Tailwind 4 + Radix (shadcn)     session or token auth           │
│   TanStack Query over api-client                                  │
└───────────────┬──────────────────────────────────┬───────────────┘
                │  fetch /api/v1 (JSON, HttpOnly   │
                │  session cookie + CSRF headers)  │
┌───────────────▼──────────────────────────────────▼───────────────┐
│ HTTP layer — src/app/api/v1/**/route.ts                          │
│   thin controllers: parse DTO (zod) → call use case → envelope   │
│   every route passes through withApi():                          │
│     1. session resolution  2. origin/CSRF check                  │
│     3. permission enforcement (RBAC scope engine)                │
│     4. uniform Dari error envelope (no stack traces)             │
├──────────────────────────────────────────────────────────────────┤
│ Application/domain layer — src/server/<module>/                  │
│   academic/ (incl. rollover.ts) admissions/ students/            │
│   guardians/ dashboard/ search/ users/ settings/                │
│   notifications/ auth/ rbac/ shared/                             │
│   attendance/ teaching/ assessments/  (Phase 2)                  │
│   finance/  (Phase 3)                                            │
│   library/ communications/  (Phase 4)                            │
│   services/ reports/  (Phase 5)                                  │
│   domain rules + use cases + DTOs (zod). No React, no HTTP.      │
├──────────────────────────────────────────────────────────────────┤
│ Infrastructure — Prisma (src/lib/db.ts) + SQLite (sandbox)       │
│   migrations: prisma/schema.prisma (db:push / migrate)           │
│   audit trail + transactional outbox + doc-number counters       │
└──────────────────────────────────────────────────────────────────┘
```

**Layering rules enforced in review:**

- Domain rules never import React or HTTP types (`src/server/**` imports only
  `@/lib/db`, zod, and each other).
- Controllers contain no business logic — they parse, authorize, delegate,
  serialize.
- ORM rows are never returned raw: every module has an explicit `toJson`
  mapper (e.g. `applicationToJson`) — the API contract is stable and
  database details never leak to clients.
- All multi-record mutations run inside `db.$transaction` with conditional
  updates for exactly-once state transitions.

## 2. Why a modular monolith inside Next.js (and the NestJS path)

The requested target topology (`apps/web`, `apps/api` NestJS, `apps/worker`,
`packages/*`) is the production shape. This sandbox runs one exposed port
and a single Next.js process, so the API is delivered as **route handlers
under `/api/v1`** with the same internal layering. Two properties make the
extraction mechanical rather than a rewrite:

1. **The HTTP layer is already thin and transport-agnostic.** Every endpoint
   is `withApi(opts, handler)` where handler ≈ (req, ctx) → use-case call.
   A NestJS controller is the same shape with decorators.
2. **The web SPA already consumes only the REST API** (`src/lib/api/client.ts`
   + TanStack Query hooks). No Server Actions are used for business
   operations, so the web app needs zero changes when the API moves out.

Extraction steps (documented for Phase 2+):
- Copy `src/server/**` into `apps/api/src` (it has no Next imports —
  `next/headers` usage is isolated to `src/server/auth/session.ts` cookie
  helpers, replaceable with a `SessionStore` port).
- Replace `withApi` with Nest guards (`AuthGuard`, `PermissionsGuard`)
  reading the same `AuthContext`/grants model.
- Reuse `prisma/schema.prisma` unchanged on PostgreSQL.

## 3. Cross-cutting mechanisms

| Mechanism | Where | Contract |
|---|---|---|
| Sessions | `server/auth/session.ts` | 32-byte opaque token in HttpOnly cookie; SHA-256 in DB; 12h absolute + 6h sliding; revocable |
| Passwords | `server/auth/password.ts` | scrypt N=16384, per-user salt, `timingSafeEqual` verify |
| Rate limiting | `server/auth/rate-limit.ts` | 5 failures / 15 min per (username, IP) → 429 |
| CSRF | `server/auth/guard.ts` | same-origin `Origin` check + `x-maktabyar-client` header on mutations |
| RBAC | `server/rbac/permissions.ts` + `scope.ts` | matrix is single source of truth; grants resolved per user with branch/year/section/guardian params |
| Audit | `server/shared/audit.ts` | actor, action, entity, before/after JSON, reason, IP — written in the same transaction as the mutation |
| Outbox | `server/shared/audit.ts` + `notifications/drainOutbox` | committed transactions enqueue events; worker drains (sandbox drains in-process on login) |
| Numbering | `nextDocNumber` | atomic upsert-increment counters (`A-1405-0001`, `S-1405-0001`) inside transactions |
| Concurrency | version columns | optimistic checks → 409 with Dari message; conditional `updateMany` for state transitions |
| Validation | zod DTOs per module | field-level Dari messages in the error envelope |

## 4. Data model highlights

Full schema: `prisma/schema.prisma`. Key invariants:

- `Student` (persistent identity) is separate from `Enrollment`
  (per-year record); `@@unique([studentId, academicYearId])` makes duplicate
  enrollment structurally impossible — and is what makes the Phase-5
  year-end rollover repeat-safe.
- `Application.personal/guardians/documents` are JSON snapshots at admission
  time; the enrollment transaction copies them into normalized
  `Student`/`Guardian`/`StudentGuardian`/`StudentDocument` rows.
- Date-only values are ISO `YYYY-MM-DD` strings — never `DateTime` — so no
  timezone can shift a birthday. Instants (audit, sessions) are UTC.
- Enum-like strings are validated by zod at the boundary; documented for
  PostgreSQL `enum` conversion.
- No soft deletes: corrections are new records (status changes, reversals)
  referencing history. See DOMAIN-WORKFLOWS.md.
- **Phase 4**: `BookTitle` (catalog) vs `BookCopy` (physical) vs `BookLoan`
  (one active loan per copy — transactional conditional flip, since SQLite
  lacks partial unique indexes); fines link to real `Invoice` rows
  (`periodKey "fine:<loanId>"`). `Announcement` + `AnnouncementRead`
  (unique per user/announcement); `MessageLog` (queued — never faked).
- **Phase 5**: `TransportRoute`/`TransportPassenger` (transactional capacity),
  `InventoryItem` + append-only `InventoryMovement` (negative stock
  impossible), `GuestVisit` (arrival/departure instants), `SchoolEvent`
  (branchId null = org-wide), and `PromotionDecision`
  (`@@unique([academicYearId, studentId])`, `appliedAt` for repeat-safe
  batches).
- Every Phase-4/5 business row carries `branchId` for the strict branch
  isolation policy (only admin / general_manager cross branches).

## 5. Frontend architecture

- Single-route SPA at `/` (sandbox constraint): `src/app/page.tsx` gates
  auth → first-run setup → shell; views switch on a hash router
  (`src/app-shell/router.ts`) with real URLs (`#/students/:id`).
- All server state through TanStack Query hooks (`src/lib/api/hooks.ts`) —
  permission-aware 403s surface as Dari errors; retries skip 401/403/404.
- RTL everywhere via logical CSS properties (`ps-/pe-/ms-/me-/start/end`);
  `.ltr-iso` isolates codes/phones/numbers.
- Design tokens in `globals.css` map exactly to the requested palette
  (#047857 primary, #0F172A headings, #F8FAFC background, #CBD5E1 borders,
  restrained amber) with AA contrast; `prefers-reduced-motion` collapses all
  animation.
- Sidebar navigation = the module groups; unauthorized groups hidden.
  All five phases are implemented — the roadmap pages remain only for
  honest "not built" notices. Every visible button either works or states
  exactly why not.
- Print surfaces (ID cards, reports) render dedicated `#cards-print-area`
  / `#report-print-area` sheets with `@media print` CSS; CSV export goes
  through the authenticated client (`api.getRaw`) with a UTF-8 BOM.
