# API Reference

All endpoints are mounted under `/api/v1`. Authentication is a session cookie (`sid`) set by `/auth/login`; send it with `credentials: "include"`. Errors are JSON: `{"error": "..."}` with an appropriate HTTP status.

All IDs are UUIDv7. Timestamps are RFC 3339 UTC.

---

## Auth

| Method | Path | Role | Body / Notes |
|---|---|---|---|
| POST | `/auth/login` | anyone | `{email, password}` → sets cookie, returns user |
| POST | `/auth/logout` | authed | — |
| GET | `/auth/me` | authed | current user |
| PATCH | `/auth/me` | authed | `{display_name?, email?}` |
| POST | `/auth/change-password` | authed | `{current_password, new_password}` (new ≥ 8 chars) |

## Admin (server-wide, system admin only)

| Method | Path | Body |
|---|---|---|
| GET | `/admin/users` | list all users |
| POST | `/admin/users` | `{email, password, display_name, is_system_admin?}` |
| PATCH | `/admin/users/:userID` | `{email?, display_name?, is_system_admin?, disabled?, password?}` |
| POST | `/admin/teams` | `{name, slug, owner_id?}` (defaults to caller) |

## Teams, members, invites

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/teams` | authed | admins see all; others see their memberships |
| GET | `/teams/:id` | ViewTeam | |
| PATCH | `/teams/:id` | DeleteTeam | `{name?, slug?}` |
| DELETE | `/teams/:id` | DeleteTeam | |
| GET | `/teams/:id/members` | ViewTeam | |
| PATCH | `/teams/:id/members/:userID` | ManageMembers | `{role}` — blocks last-owner demote (409) |
| DELETE | `/teams/:id/members/:userID` | ManageMembers | blocks last-owner removal (409) |
| GET | `/teams/:id/invites` | ViewTeam | |
| POST | `/teams/:id/invites` | ManageMembers | `{email, role}` → returns `{token, url}` |
| POST | `/invites/:token/accept` | authed | consumes the token, adds membership |

## Labels

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/teams/:id/labels` | ViewTeam | |
| POST | `/teams/:id/labels` | ManageLabels | `{name, color}` |
| PATCH | `/labels/:id` | ManageLabels | `{name?, color?}` |
| DELETE | `/labels/:id` | ManageLabels | |

## Boards & columns

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/teams/:id/boards` | ViewTeam | |
| POST | `/teams/:id/boards` | ManageBoards | `{name, description?}` — auto-seeds 3 columns |
| GET | `/boards/:id` | ViewTeam | full tree: board + columns + tasks + labels + `your_role` |
| PATCH | `/boards/:id` | ManageBoards | `{name?, description?, archived?}` |
| DELETE | `/boards/:id` | DeleteBoards | |
| POST | `/boards/:id/columns` | ManageBoards | `{name, type, position, wip_limit?}` |
| PATCH | `/columns/:id` | ManageBoards | `{name?, type?, position?, wip_limit?}` |
| DELETE | `/columns/:id` | ManageBoards | blocked if column has tasks |

`type` ∈ `todo | in_progress | done`. Moving a task into a `done` column sets `completed_at`; moving out clears it.

## Tasks

| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/boards/:id/tasks` | ManageTasks | see body below |
| GET | `/tasks/:id` | ViewTeam | |
| PATCH | `/tasks/:id` | ManageTasks | partial update, see below |
| POST | `/tasks/:id/move` | ManageTasks | `{column_id, position}` — emits `moved_column` |
| DELETE | `/tasks/:id` | ManageTasks | |
| GET | `/tasks/:id/events` | ViewTeam | activity log |

### Create body

```json
{
  "title": "…",                // required
  "description": "",
  "column_id": "uuid",         // required
  "priority": "low|med|high|urgent",
  "is_epic": false,
  "epic_id": "uuid|null",
  "assignee_id": "uuid",
  "reporter_id": "uuid",       // defaults to caller
  "estimate_hours": 4,
  "start_at": "2026-01-01T09:00:00Z",
  "due_at": "2026-01-01T12:00:00Z",
  "label_ids": ["uuid", "…"]
}
```

### Patch body

All fields optional. To clear a nullable field, pass the matching `clear_*: true`.

```json
{
  "title": "…",
  "description": "…",
  "priority": "high",
  "assignee_id": "uuid",  "clear_assignee": true,
  "estimate_hours": 4,    "clear_estimate": true,
  "start_at": "…",        "clear_start": true,
  "due_at": "…",          "clear_due": true,
  "epic_id": "uuid",      "clear_epic": true,
  "reporter_id": "uuid",
  "label_ids": ["uuid"]   // replaces the full set
}
```

### Event kinds (append-only)

`created`, `title_changed`, `description_changed`, `priority_changed`, `assigned`, `unassigned`, `estimate_changed`, `start_changed`, `due_changed`, `epic_changed`, `reporter_changed`, `moved_column`, `completed`, `reopened`.

## Realtime

`GET /boards/:id/stream` — Server-Sent Events stream scoped to one board. Event kinds:

- `task.created`, `task.updated`, `task.moved`, `task.deleted`

The web client's current strategy is to refetch `GET /boards/:id` on any event — simple and correct for v1.

## Permission codes

`ViewTeam`, `ManageTasks`, `ManageLabels`, `ManageBoards`, `DeleteBoards`, `ManageMembers`, `DeleteTeam`, `CreateUsers`, `CreateTeams`.

See `api/internal/domain/permissions.go` for the exact role → permission matrix.
