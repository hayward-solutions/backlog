# Configuration

This document covers every environment variable, the storage backend, OIDC setup, the role/permission model, and how to recover a lost admin password. See [DEVELOPMENT.md](DEVELOPMENT.md) for running without Docker and [API.md](API.md) for the HTTP surface.

## Architecture

```
┌───────────────┐   ┌────────────────┐   ┌──────────────┐
│ Next.js (web) │◄─►│  Go API (chi)  │◄─►│ Postgres 16  │
│  :3000        │SSE│  :8080         │   │  :5432       │
└───────────────┘   └────────┬───────┘   └──────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  S3 / MinIO    │
                    │  :9000/:9001   │
                    └────────────────┘
```

All four services ship in the bundled `docker-compose.yml`.

---

## Environment variables

All configuration is read from the `.env` file consumed by `docker-compose.yml`. See `.env.example` for a copy-pasteable starting point.

### Database

| Var | Purpose | Default |
|---|---|---|
| `POSTGRES_DSN` | API → Postgres connection string | `postgres://backlog:backlog@db:5432/backlog?sslmode=disable` |
| `POSTGRES_DB` | DB name used by the `db` service | `backlog` |
| `POSTGRES_USER` | DB user used by the `db` service | `backlog` |
| `POSTGRES_PASSWORD` | DB password used by the `db` service | `backlog` |

### API & web

| Var | Purpose | Default |
|---|---|---|
| `SESSION_SECRET` | Reserved for signing; set to 32+ random bytes | — |
| `ADMIN_EMAIL` | First-boot admin bootstrap email | — |
| `ADMIN_PASSWORD` | First-boot admin bootstrap password | — |
| `ADMIN_DISPLAY_NAME` | First-boot admin display name | `Admin` |
| `API_PORT` | API listen port | `8080` |
| `PUBLIC_BASE_URL` | Used to construct invite and tracking links | `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Where the browser calls the API from | `http://localhost:8080` |
| `APP_ORIGINS` | Comma-separated CORS origin allowlist for the API | `http://localhost:3000` |

### Attachment storage (S3 / MinIO)

The bundled compose file runs a MinIO container and auto-creates the bucket. Point at AWS S3 in production by changing the endpoint / credentials.

| Var | Purpose | Default |
|---|---|---|
| `STORAGE_S3_BUCKET` | Bucket name used for attachments | `backlog-dev` |
| `STORAGE_S3_REGION` | S3 region | `us-east-1` |
| `STORAGE_S3_ENDPOINT` | Internal endpoint the API uploads to | `http://minio:9000` |
| `STORAGE_S3_PUBLIC_ENDPOINT` | Endpoint written into presigned URLs the browser follows | `http://localhost:9000` |
| `STORAGE_S3_FORCE_PATH_STYLE` | `true` for MinIO and most S3-compatibles | `true` |
| `AWS_ACCESS_KEY_ID` | Access key | `minioadmin` |
| `AWS_SECRET_ACCESS_KEY` | Secret key | `minioadmin` |
| `MINIO_ROOT_USER` | Root credentials for the MinIO container | `minioadmin` |
| `MINIO_ROOT_PASSWORD` | Root credentials for the MinIO container | `minioadmin` |

### OIDC single sign-on (optional)

Leave all `OIDC_*` unset to disable SSO and keep password-only login.

| Var | Purpose | Default |
|---|---|---|
| `OIDC_ISSUER_URL` | Issuer URL (required to enable SSO) | unset |
| `OIDC_CLIENT_ID` | OAuth client id | unset |
| `OIDC_CLIENT_SECRET` | OAuth client secret | unset |
| `OIDC_REDIRECT_URL` | Callback URL registered with the IdP | `http://localhost:8080/api/v1/auth/oidc/callback` |
| `OIDC_SCOPES` | Space- or comma-separated scopes | `openid profile email` |
| `OIDC_ADMIN_GROUP` | Group claim value that grants system-admin | unset — no auto-admin |
| `OIDC_GROUPS_CLAIM` | Claim name that carries group membership | `groups` |
| `OIDC_EMAIL_CLAIM` | Claim name that carries the user's email | `email` |
| `OIDC_NAME_CLAIM` | Claim name that carries the display name | `name` |
| `OIDC_PROVIDER_NAME` | Label shown on the "Sign in with …" button | `SSO` |

---

## Roles and permissions

Team roles, from least to most privileged: **viewer → member → editor → owner**. **System admins** (`is_system_admin=true` on the user row) implicitly have owner-level access to every team.

| Action | sysadmin | owner | editor | member | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View team, boards, tasks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Comment on tasks, attach files | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create, edit, move, delete tasks | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create and edit labels, boards, columns | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete boards, manage members, delete team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create users, create teams (server-wide) | ✅ | ❌ | ❌ | ❌ | ❌ |

The team invariant `at least one owner` is enforced — demoting or removing the last owner returns `409`.

See `api/internal/domain/permissions.go` for the exact role → permission matrix.

---

## Service desk visibility

Every service desk board has a `visibility` setting:

- **Public** — the intake URL works without sign-in; anyone with the link can submit.
- **Internal** — any authenticated user can submit, but unauthenticated visitors see nothing.
- **Private** — only team members can reach the desk; the public URL 404s.

The public submission endpoint is rate-limited per IP+slug (20 requests burst, 20/minute steady-state).

---

## First-boot admin bootstrap

On startup, the API:

1. Connects to Postgres and runs `goose` migrations from `api/migrations/`.
2. Checks the `users` table.
3. If empty, creates a user from `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` with `is_system_admin=true`.
4. If non-empty, logs `admin bootstrap skipped` and ignores those env vars.

Manage accounts from the UI (top-right menu → **Users**) after the first user exists.

## Resetting a lost admin password

If you lose the only admin password, the blunt fix wipes the users table and lets the bootstrap re-run:

```bash
docker compose exec db psql -U backlog -d backlog -c "DELETE FROM users;"
docker compose restart api
```

This also deletes every other user, membership, and session. For a narrower recovery path (reset one user's password in place) see [DEVELOPMENT.md](DEVELOPMENT.md).

---

## Verification walkthrough

A scripted smoke-test you can run against a fresh install to confirm everything is wired up:

1. Sign in at `/login` as the admin.
2. Open the user menu (top right) → **Users** → create `alice@example.com`.
3. User menu → **Teams** → create a team "Demo" with Alice as owner.
4. Open the team → **Settings** → invite `alice@example.com` as `member`. Copy the one-time invite link.
5. In an incognito window, open the link and accept — Alice lands on the team.
6. Create a board "Sprint 1" → three default columns appear.
7. Board **Settings** → add a label "docs" (pick a color).
8. Back on the board, **+ New task** → title "Write docs", priority high, estimate 4h, due tomorrow, assign Alice, toggle the `docs` label, Create.
9. Drag Backlog → In Progress → Done. Open the task drawer and confirm the activity log shows `created`, `moved_column` ×2, `completed`.
10. Open the board in a second browser signed in as Alice; drag a card and confirm the first window updates within ~1s (SSE).
11. Try to demote yourself from owner while Alice is not an owner → API returns `409 team must have at least one owner`.
12. Board **Settings → Service desk** → enable, set a slug, save. Open `/desk/<slug>` in an incognito window, submit the default form, and confirm a new task appears on the board in the first window.
