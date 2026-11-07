# Deployment, Backup & Restore — مکتب‌یار

## 1. Environment

Copy `.env.example` → `.env`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | SQLite file (sandbox) or PostgreSQL URL (production) |
| `NODE_ENV` | `development` / `production` |
| `MAKTABYAR_ALLOWED_ORIGINS` | Optional comma-separated origins/hosts allowed for CSRF validation behind gateways that rewrite `Host` **and** strip custom headers (e.g. `https://school.example.edu, lms.example.edu`) |
| (P4) `SMS_PROVIDER`, `EMAIL_PROVIDER` | notification adapters |
| (P4) `STORAGE_*`, `S3_*` | private object storage for documents/photos |

No secrets are committed; the demo database contains only synthetic data.

## 2. Running

```bash
bun install
bun run db:push        # apply schema (dev)
bun run db:seed        # synthetic Dari demo data (dev only)
bun run dev            # :3000
```

Production (self-hosted, modest hardware):

```bash
bun run build && bun run start     # standalone output
# Put nginx/Caddy in front with TLS; set SESSION_COOKIE_SECURE=true.
```

## 3. Migrations (SQLite → PostgreSQL)

- Development uses `prisma db push`; production should use
  `prisma migrate dev/deploy` with committed SQL migrations.
- Moving to PostgreSQL:
  1. Set `DATABASE_URL` to the Postgres URL and change `provider = "postgresql"`.
  2. Convert enum-like strings (documented per field in the schema) to PG
     enums; date-only `String` columns to `date`; JSON string columns to
     `jsonb`.
  3. `prisma migrate dev --name pg-init`, then import data.
- The domain layer is database-agnostic (Prisma only).

## 4. Backup & restore (tested procedure)

**Backup (SQLite):** the database is a single file.

```bash
# Consistent copy using the SQLite online-backup API:
sqlite3 db/custom.db ".backup '/backup/maktabyar-$(date +%F).db'"
# Together with uploaded documents:
tar czf "/backup/maktabyar-docs-$(date +%F).tgz" storage/ 2>/dev/null || true
```

**Restore (verify in an ISOLATED environment first):**

```bash
cp db/custom.db db/custom.db.broken          # keep the bad copy
cp /backup/maktabyar-2026-11-06.db db/restore-test.db
DATABASE_URL=file:./db/restore-test.db bun run dev   # isolated check
# Verify: login works, student counts match, audit trail intact.
# Only then promote:
cp /backup/maktabyar-2026-11-06.db db/custom.db
```

Restore verification checklist (run after every restore drill):

1. `curl -s …/auth/login` succeeds with a known account.
2. `/api/v1/students` total matches the pre-backup count.
3. `/api/v1/audit-events` still shows historical events.
4. A test enrollment completes end-to-end (state machine healthy).

For PostgreSQL: `pg_dump`/`pg_restore` with the same isolated-restore
verification; schedule daily backups + weekly restore drills.

## 5. Reverse proxies & CSRF origin validation

Every state-changing request (`POST/PUT/PATCH/DELETE`) passes a layered
origin check in `src/server/auth/guard.ts`:

1. **Trusted client header** — first-party clients (web SPA, future mobile
   app) always send `x-maktabyar-client: 1`. Cross-site HTML forms cannot set
   custom headers, and a cross-site `fetch()` with a custom header needs a
   CORS preflight this API never approves, so the header proves same-origin
   for browsers. This layer is unaffected by proxies rewriting `Host`.
2. **Same-origin Origin check** (for header-less requests): `Origin` must
   match the `Host` header, any `X-Forwarded-Host` chain entry (default ports
   `:443`/`:80` normalized), or `MAKTABYAR_ALLOWED_ORIGINS`.
3. Session cookies are `HttpOnly`, `SameSite=Lax` on top of both layers.

Proxy requirements (nginx/Caddy defaults are fine):

- Preserve the original `Host` (`proxy_set_header Host $host;`) **or** set
  `X-Forwarded-Host` to the public hostname. Caddy preserves `Host` by
  default; nginx does **not** — add it explicitly.
- Do not strip the `x-maktabyar-client` request header.
- A rejected request logs `origin=… host=… x-forwarded-host=…` in the server
  log (never to the client) — use it to diagnose gateway misconfigurations,
  then either fix the proxy or add the public origin to
  `MAKTABYAR_ALLOWED_ORIGINS`.

## 6. Operational notes

- Sessions: 12h absolute / 6h sliding; revocation available per-user
  (password reset revokes all).
- Login lockout: 5 failures / 15 min per (username, IP).
- Audit log grows monotonically — archive old rows to cold storage
  quarterly (never delete without archival).
- The outbox table is drained by a worker (in-process drain in the sandbox;
  a `apps/worker` process in production) — monitor `processedAt IS NULL`
  age as an alert.
