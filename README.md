# Backlog

**Self-hosted task management and service desk for small teams.** One `docker compose up` and you have kanban boards, epics, timelines, a public request portal, and single sign-on — all running on your own infrastructure.

---

## Why Backlog

- **Work the way your team already works.** Drag-drop kanban, sortable task lists, Gantt-style timelines, and progress-tracked epics — all on the same data.
- **Let the rest of the business reach you.** Spin up a service desk with custom intake forms, share a public or internal URL, and turn every submission into a tracked task with a two-way conversation thread.
- **See everything that's on your plate.** The cross-team **My tasks** view pulls together every open card assigned to you across every board you belong to.
- **Stay in sync in real time.** Board updates stream to every open tab via Server-Sent Events — no refresh needed.
- **Plug into your existing identity.** Local email + password works out of the box; flip on OIDC to get SSO from Okta, Google, Entra ID, or anything else that speaks OpenID Connect.
- **Own your data.** Postgres for the database, your own S3 bucket (or the bundled MinIO) for attachments. No SaaS dependency, no seat pricing, no data leaving your network.

---

## Features at a glance

### Boards & planning
- **Kanban** with drag-drop between and within columns, WIP-limit-aware columns, and per-board custom statuses.
- **List view** with per-column search, sortable headers, and filters on status, assignee, reporter, and label.
- **Timeline view** that lays tasks out by start and due date for scheduling.
- **Epics** that roll up child tasks with live progress bars and one-click "+ Task" under any epic.
- **Task drawer** with auto-saving fields, inline status change, copy-link, comments, file attachments, and an immutable activity log.
- **Labels** with custom colors, scoped per team.
- **Cross-team "My tasks"** for everything assigned to you, anywhere.

### Service desk
- **Custom intake forms** per team — text, long text, email, URL, number, date, and select fields with per-field help text and required-flag.
- **Public, internal, or private** visibility — publish a desk to the world, keep it behind sign-in, or keep it fully private.
- **Submitter tracking portal** — every submission gets a one-time tracking link so the requester can check status and reply, even without an account.
- **Two-way conversation** — team members reply from the task drawer; submitters reply from their portal.
- **Rate-limited and abuse-aware** — public submissions are throttled per IP and per desk.

### Collaboration
- **Comments** on every task, with edit and delete.
- **File attachments** with presigned S3 uploads — works with AWS S3 or the bundled MinIO container.
- **Activity log** — every change to title, priority, assignee, dates, epic, column, and more is captured immutably.
- **Real-time board updates** over SSE — drag a card in one window and watch it move in everyone else's.

### Access & admin
- **Team roles**: owner, editor, member, viewer. System admins implicitly own every team.
- **Invite links** that you paste into Slack, email, or anywhere else (no SMTP required).
- **OIDC SSO** with automatic system-admin mapping from a group claim.
- **Admin console** for creating users, managing teams, and resetting passwords.
- **Per-user account settings** — update display name, email, and password.

---

## Quick start

You need Docker and Docker Compose.

```bash
git clone <this repo>
cd backlog
cp .env.example .env
# edit at least ADMIN_EMAIL, ADMIN_PASSWORD, SESSION_SECRET
docker compose up --build
```

Open:

- Web UI — <http://localhost:3000>
- API health — <http://localhost:8080/health>
- MinIO console — <http://localhost:9001> (user/pass from `.env`)

Sign in with the admin credentials you just set. From there:

1. Go to **Users** (top-right menu) and create a teammate.
2. Go to **Teams** and create your first team, making them the owner.
3. Open the team, create a board, and start dragging cards.

To expose a service desk to the rest of your org, open any board's **Settings → Service desk**, toggle it on, pick a slug, and share the URL.

Need more depth? See the docs:

- [Configuration](docs/CONFIGURATION.md) — every environment variable, storage, OIDC, permissions, admin recovery.
- [API reference](docs/API.md) — every endpoint with body shapes.
- [Development](docs/DEVELOPMENT.md) — running without Docker, repo layout, migrations, testing.

---

## Roadmap

Subtasks, SMTP-delivered invites and desk notifications, SQLite support, cross-team epics, WIP-limit enforcement, analytics dashboards, webhooks, API keys, scale-out SSE (Redis pub/sub), full-text search.

---

## License

TBD.
