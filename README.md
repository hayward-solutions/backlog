# Backlog

A self-hosted kanban and task-management tool for small teams. Go API + Next.js web + Postgres, shipped as a single `docker compose` stack.

```
┌───────────────┐   ┌───────────────┐   ┌──────────────┐
│ Next.js (web) │◄─►│  Go API (chi) │◄─►│ Postgres 16  │
│  :3000        │SSE│  :8080        │   │  :5432       │
└───────────────┘   └───────────────┘   └──────────────┘
```

- **Teams** group members, boards, and labels.
- **Boards** are kanban boards with custom columns (todo / in_progress / done).
- **Tasks** support priority, assignee, reporter, estimate, deadline, labels, and an immutable activity log.
- **Epics** are tasks that group other tasks; completion % is derived from child done/total.
- **Realtime** updates flow over per-board Server-Sent Events.

---

## Quickstart

```bash
cp .env.example .env
# edit ADMIN_PASSWORD, ADMIN_EMAIL, SESSION_SECRET
docker compose up --build
```

- Web:  <http://localhost:3000>
- API:  <http://localhost:8080/health>
- Postgres: `localhost:5432` (exposed for dev convenience)

On first boot the API creates an admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. If any user already exists, the bootstrap is a no-op and the env is ignored — manage accounts from the UI after that.

---

## Features

### Boards, tasks, epics
- Kanban board view with drag-drop between/within columns (`@dnd-kit`).
- Tasks list view with sort, per-column search, and filters (status / assignee / reporter / label).
- Epics view with progress bars, expandable child-task rows, and one-click "+ Task" under an epic.
- Task drawer with inline edit, activity log, auto-saving label chips, and inline label creation.
- Role-gated Settings page per board (details, columns, labels, danger zone).

### Users, teams, invites
- Local email + password auth (argon2id), session-cookie, 30-day expiry.
- Team roles: **owner** / **editor** / **member** / **viewer**. System admins implicitly own every team.
- Copy-paste invite tokens (no SMTP in v1).
- Top-right account dropdown → **My account**, **Users** (admin), **Teams** (admin), **Sign out**.
- `/admin/users` — create/edit/disable/reset-password across the whole server.
- `/admin/teams` — list/create teams server-wide.
- `/account` — update display name, email, change password.

### Realtime
- `GET /api/v1/boards/:id/stream` (SSE) — all board mutations publish after DB commit; the web client invalidates the board query on each event.

See [docs/API.md](docs/API.md) for the endpoint reference and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for local dev without Docker.

---

## Permissions

| Action | sysadmin | owner | editor | member | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| View team / boards / tasks | ✅ | ✅ | ✅ | ✅ | ✅ |
| Create / edit / move / delete tasks | ✅ | ✅ | ✅ | ✅ | ❌ |
| Create / edit labels, boards, columns | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete boards, manage members, delete team | ✅ | ✅ | ❌ | ❌ | ❌ |
| Server-wide: create / edit users, create teams | ✅ | ❌ | ❌ | ❌ | ❌ |

The team invariant `at least one owner` is enforced — demoting or removing the last owner returns `409`.

---

## Environment

All configuration lives in the `.env` file consumed by `docker-compose.yml`.

| Var | Purpose | Default |
|---|---|---|
| `POSTGRES_DSN` | API → Postgres connection | `postgres://backlog:backlog@db:5432/backlog?sslmode=disable` |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | DB init | `backlog` / `backlog` / `backlog` |
| `SESSION_SECRET` | Reserved for signing (32+ bytes recommended) | — |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_DISPLAY_NAME` | First-boot admin bootstrap | — |
| `API_PORT` | API listen port | `8080` |
| `PUBLIC_BASE_URL` | Used to construct invite links | `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Where the browser calls the API | `http://localhost:8080` |

---

## Verification walkthrough

1. Sign in at `/login` as the admin.
2. Open the user menu (top right) → **Users** → create `alice@example.com`.
3. User menu → **Teams** → create a team "Demo" with Alice as owner.
4. Open the team → **Settings** → invite `alice@example.com` as `member`. Copy the one-time invite link.
5. In an incognito window, open the link and accept — Alice lands on the team.
6. Create a board "Sprint 1" → three default columns appear.
7. Board **Settings** → add a label "docs" (pick a color).
8. Back on the board, **+ New task** → title "Write docs", priority high, estimate 4h, deadline tomorrow, assign Alice, toggle the `docs` label, Create.
9. Drag Backlog → In Progress → Done. Open the task drawer and confirm the activity log shows `created`, `moved_column` ×2, `completed`.
10. Open the board in a second browser signed in as Alice; drag a card and confirm the first window updates within ~1s (SSE).
11. Try to demote yourself from owner while Alice is not an owner → API returns `409 team must have at least one owner`.

---

## Resetting the admin password

If you lose the only admin password:

```bash
docker compose exec db psql -U backlog -d backlog -c "DELETE FROM users;"
docker compose restart api
```

The next start detects zero users and re-runs the bootstrap from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. This also wipes all other data — see [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) for a narrower recovery path.

---

## Roadmap (v2)

Comments, attachments, subtasks, OIDC / OAuth, SMTP-delivered invites, SQLite support, cross-team epics, WIP-limit enforcement, analytics dashboards, webhooks, API keys, scale-out SSE (Redis pub/sub), full-text search.

---

## License

TBD.
