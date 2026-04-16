# API Reference

All endpoints are mounted under `/api/v1`. Authentication is a session cookie (`sid`) set by `/auth/login`; send it with `credentials: "include"`. Errors are JSON: `{"error": "..."}` with an appropriate HTTP status.

All IDs are UUIDv7. Timestamps are RFC 3339 UTC.

The public service-desk endpoints under `/api/v1/public/...` do not require a session cookie — anonymous visitors can reach public desks, and signed-in visitors additionally see internal desks.

---

## Auth

| Method | Path | Role | Body / Notes |
|---|---|---|---|
| POST | `/auth/login` | anyone | `{email, password}` → sets cookie, returns user. Rate-limited. |
| POST | `/auth/logout` | authed | — |
| GET | `/auth/me` | authed | current user |
| PATCH | `/auth/me` | authed | `{display_name?, email?}` |
| POST | `/auth/change-password` | authed | `{current_password, new_password}` (new ≥ 8 chars). Rate-limited. |
| GET | `/auth/oidc/config` | anyone | returns `{enabled, provider_name}` so the login UI can render the SSO button |
| GET | `/auth/oidc/login` | anyone | redirects to the IdP |
| GET | `/auth/oidc/callback` | anyone | OIDC callback; completes login and sets cookie |

## Admin (server-wide, system admin only)

| Method | Path | Body / Notes |
|---|---|---|
| GET | `/admin/users` | list all users |
| POST | `/admin/users` | `{email, password, display_name, is_system_admin?}` |
| PATCH | `/admin/users/{userID}` | `{email?, display_name?, is_system_admin?, disabled?, password?}` |
| DELETE | `/admin/users/{userID}` | remove a user |
| GET | `/admin/users/{userID}/memberships` | list every team membership for a user |
| POST | `/admin/teams` | `{name, slug, owner_id?}` (defaults to caller) |

## Current user

| Method | Path | Notes |
|---|---|---|
| GET | `/me/tasks` | cross-team list of open tasks assigned to the caller. Query params control status filter and included fields. |
| POST | `/invites/{token}/accept` | accept a team invite while signed in |

## Teams, members, invites

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/teams` | authed | admins see all; others see their memberships |
| GET | `/teams/{teamID}` | ViewTeam | |
| PATCH | `/teams/{teamID}` | DeleteTeam | `{name?, slug?, service_desk_enabled?}` |
| DELETE | `/teams/{teamID}` | DeleteTeam | |
| GET | `/teams/{teamID}/members` | ViewTeam | |
| POST | `/teams/{teamID}/members` | ManageMembers | `{user_id, role}` — add an existing user directly |
| GET | `/teams/{teamID}/candidates` | ManageMembers | search users available to add; query `?q=` |
| PATCH | `/teams/{teamID}/members/{userID}` | ManageMembers | `{role}` — blocks last-owner demote (409) |
| DELETE | `/teams/{teamID}/members/{userID}` | ManageMembers | blocks last-owner removal (409) |
| GET | `/teams/{teamID}/invites` | ManageMembers | |
| POST | `/teams/{teamID}/invites` | ManageMembers | `{email, role}` → returns `{token, url}` |

## Labels

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/teams/{teamID}/labels` | ViewTeam | |
| POST | `/teams/{teamID}/labels` | ManageLabels | `{name, color}` |
| PATCH | `/labels/{labelID}` | ManageLabels | `{name?, color?}` |
| DELETE | `/labels/{labelID}` | ManageLabels | |

## Boards & columns

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/teams/{teamID}/boards` | ViewTeam | |
| POST | `/teams/{teamID}/boards` | ManageBoards | `{name, description?, type?}` — auto-seeds 3 columns. `type` ∈ `standard | service_desk`. |
| GET | `/boards/{boardID}` | ViewTeam | full tree: board + columns + tasks + labels + `your_role` |
| PATCH | `/boards/{boardID}` | ManageBoards | `{name?, description?, archived?, visibility?, public_slug?, intake_column_id?}` |
| DELETE | `/boards/{boardID}` | DeleteBoards | |
| POST | `/boards/{boardID}/columns` | ManageBoards | `{name, type, position, wip_limit?}` |
| PATCH | `/columns/{columnID}` | ManageBoards | `{name?, type?, position?, wip_limit?}` |
| DELETE | `/columns/{columnID}` | ManageBoards | blocked if column has tasks |

`type` ∈ `todo | in_progress | done`. Moving a task into a `done` column sets `completed_at`; moving out clears it.

## Tasks

| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/boards/{boardID}/tasks` | ManageTasks | see body below |
| GET | `/tasks/{taskID}` | ViewTeam | |
| PATCH | `/tasks/{taskID}` | ManageTasks | partial update, see below |
| POST | `/tasks/{taskID}/move` | ManageTasks | `{column_id, position}` — emits `moved_column` |
| DELETE | `/tasks/{taskID}` | ManageTasks | |
| GET | `/tasks/{taskID}/events` | ViewTeam | activity log |

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

## Comments

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/tasks/{taskID}/comments` | ViewTeam | |
| POST | `/tasks/{taskID}/comments` | Comment | `{body}` |
| PATCH | `/comments/{commentID}` | Comment | `{body}` — author-only in practice |
| DELETE | `/comments/{commentID}` | Comment | |

## Attachments

Uploads are two-step: `POST` to create the attachment record (returns a presigned PUT URL), then the browser PUTs the file to the URL. After the upload completes, attach it to a task.

| Method | Path | Perm | Notes |
|---|---|---|---|
| POST | `/teams/{teamID}/attachments` | Comment | `{filename, content_type, size}` → returns `{id, upload_url, ...}` |
| GET | `/tasks/{taskID}/attachments` | ViewTeam | list attachments on a task |
| POST | `/tasks/{taskID}/attachments` | Comment | `{attachment_id}` — binds an uploaded attachment to a task |
| DELETE | `/tasks/{taskID}/attachments/{attachmentID}` | Comment | detach from a task |
| GET | `/attachments/{attachmentID}` | ViewTeam | metadata |
| GET | `/attachments/{attachmentID}/download` | ViewTeam | redirects to a short-lived presigned GET URL |
| DELETE | `/attachments/{attachmentID}` | Comment | delete the attachment record and object |

## Service desk

### Template management (authed, per board)

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/boards/{boardID}/request-templates` | ViewTeam | `?include_archived=1` includes archived |
| POST | `/boards/{boardID}/request-templates` | ManageBoards | `{name, description?, position?, default_priority?}` — seeds a required `summary` field |
| GET | `/request-templates/{templateID}` | ViewTeam | |
| PATCH | `/request-templates/{templateID}` | ManageBoards | `{name?, description?, position?, default_priority?, archived?}` |
| DELETE | `/request-templates/{templateID}` | ManageBoards | |
| POST | `/request-templates/{templateID}/fields` | ManageBoards | `{key, label, type, required?, position?, options?, help_text?}` |
| PATCH | `/request-fields/{fieldID}` | ManageBoards | partial update |
| DELETE | `/request-fields/{fieldID}` | ManageBoards | |

Field `type` ∈ `text | longtext | select | email | url | number | date`.

### Task-side submission panel

| Method | Path | Perm | Notes |
|---|---|---|---|
| GET | `/tasks/{taskID}/submission` | ViewTeam | raw intake payload, or 404 if the task wasn't created via a desk |
| GET | `/tasks/{taskID}/desk-messages` | ViewTeam | portal conversation thread |
| POST | `/tasks/{taskID}/desk-messages` | Comment | `{body}` — posts as the team member |

### Signed-in submitter portal

| Method | Path | Notes |
|---|---|---|
| GET | `/desks/my-submissions` | every submission the caller made while signed in |
| GET | `/desks/my-submissions/{submissionID}` | one submission + its thread |
| POST | `/desks/my-submissions/{submissionID}/messages` | `{body}` — submitter reply |

### Public intake (no auth required)

| Method | Path | Notes |
|---|---|---|
| GET | `/public/service-desk/teams` | directory of teams with at least one public desk; signed-in callers also see internal ones |
| GET | `/public/service-desk/teams/{teamSlug}` | list of desks visible to the caller for one team |
| GET | `/public/desks/{slug}` | desk metadata + templates for rendering the intake form |
| POST | `/public/desks/{slug}/submissions` | submit a form → returns `{tracking_token, tracking_url}`. Rate-limited per IP+slug. |
| GET | `/public/desks/{slug}/track/{token}` | status + thread for one submission |
| POST | `/public/desks/{slug}/track/{token}/messages` | `{body}` — submitter reply without signing in |

## Realtime

`GET /boards/{boardID}/stream` — Server-Sent Events scoped to one board. Event kinds:

- `task.created`, `task.updated`, `task.moved`, `task.deleted`

The web client's current strategy is to refetch `GET /boards/{boardID}` on any event — simple and correct for v1.

## Permission codes

`ViewTeam`, `Comment`, `ManageTasks`, `ManageLabels`, `ManageBoards`, `DeleteBoards`, `ManageMembers`, `DeleteTeam`, `GlobalAdmin`.

See `api/internal/domain/permissions.go` for the exact role → permission matrix, and [CONFIGURATION.md](CONFIGURATION.md#roles-and-permissions) for the human-readable table.
