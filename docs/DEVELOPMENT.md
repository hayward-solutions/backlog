# Development

## Prerequisites

- Go 1.23+
- Node 20+
- Docker (for Postgres and MinIO, or substitute your own)
- `goose` migration tool (optional; API runs migrations on startup)

## Running outside Docker

### Postgres and MinIO

```bash
docker compose up -d db minio minio-createbucket
```

This exposes Postgres on `localhost:5432` and MinIO on `localhost:9000` (S3 API) and `localhost:9001` (web console), and ensures the default `backlog-dev` bucket exists.

### API

```bash
cd api

export POSTGRES_DSN="postgres://backlog:backlog@localhost:5432/backlog?sslmode=disable"
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=change-me
export SESSION_SECRET=$(openssl rand -hex 32)
export APP_ORIGINS=http://localhost:3000

# Attachment storage — point at the local MinIO.
export STORAGE_S3_BUCKET=backlog-dev
export STORAGE_S3_REGION=us-east-1
export STORAGE_S3_ENDPOINT=http://localhost:9000
export STORAGE_S3_PUBLIC_ENDPOINT=http://localhost:9000
export STORAGE_S3_FORCE_PATH_STYLE=true
export AWS_ACCESS_KEY_ID=minioadmin
export AWS_SECRET_ACCESS_KEY=minioadmin

go run ./cmd/server
```

On start the API:

1. Connects to Postgres via `pgxpool`.
2. Runs `goose` migrations from `api/migrations/`.
3. Creates the admin from env if `users` is empty (logs `admin bootstrap skipped` otherwise).
4. Initializes the S3 storage client (presigned upload/download URLs).
5. Listens on `API_PORT` (default `8080`).

### Web

```bash
cd web
npm install
export NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
npm run dev
```

Web runs at <http://localhost:3000> with hot reload.

## Repo layout

```
backlog/
├── docker-compose.yml
├── .env.example
├── README.md
├── docs/
│   ├── API.md
│   ├── CONFIGURATION.md
│   └── DEVELOPMENT.md
├── api/
│   ├── cmd/server/main.go         # wiring, migrations, bootstrap, http
│   ├── migrations/*.sql           # goose migrations
│   └── internal/
│       ├── auth/                  # argon2id, sessions, OIDC config
│       ├── bootstrap/             # admin-from-env
│       ├── domain/                # types, role/permission matrix
│       ├── events/                # in-process SSE hub
│       ├── storage/               # S3 presigned upload/download client
│       ├── http/
│       │   ├── router.go
│       │   ├── middleware/        # auth, team-role resolver, permission gate
│       │   └── handlers/          # auth, admin, teams, boards, tasks,
│       │                          # comments, attachments, service_desk,
│       │                          # oidc, stream
│       └── store/                 # thin pgx repos (no ORM)
└── web/
    ├── app/                       # Next.js App Router
    │   ├── (auth)/login
    │   ├── account                # My account
    │   ├── admin/{users,teams}    # server-wide admin
    │   ├── invite                 # accept invite flow
    │   ├── my-tasks               # cross-team "my tasks"
    │   ├── service-desk/          # public landing, directory,
    │   │   [slug]/{new,track}     # intake form + submitter tracking
    │   │   mine/                  # signed-in submitter portal
    │   │   team/[teamSlug]        # per-team desk listing
    │   ├── teams/[teamId]/...
    │   └── boards/[boardId]/{page,tasks,epics,timeline,templates,settings}
    ├── components/
    │   ├── AppShell.tsx
    │   ├── Sidebar.tsx
    │   ├── TopBar.tsx             # top-right account dropdown
    │   ├── board/                 # Column, Card, TaskDrawer, Comments,
    │   │                          # Attachments, BoardToolbar,
    │   │                          # NewTaskModal, TemplatesEditor
    │   ├── service-desk/          # submitter-facing components
    │   └── ui/                    # shared primitives (Badge, Avatar, …)
    └── lib/
        ├── api.ts                 # typed fetch client + shared types
        └── sse.ts                 # useBoardStream hook
```

## Migrations

New migration:

```bash
cd api/migrations
# name it with the next integer prefix — check the tree for the current max
ls
touch 0013_my_change.sql
```

Write both `-- +goose Up` and `-- +goose Down` sections. They run automatically on the next API start. To apply against a local DB manually:

```bash
goose -dir api/migrations postgres "$POSTGRES_DSN" up
```

## Adding a new API endpoint

1. Add a handler method on the appropriate `*Handler` in `api/internal/http/handlers/`.
2. Wire the route in `api/internal/http/router.go`, composing the middleware stack: `RequireAuth`, then `ResolveTeamRole` (if team-scoped), then `RequirePerm(...)`.
3. Add any new store methods in `api/internal/store/`.
4. Mirror the types in `web/lib/api.ts`.

### Team-scoped routes

If the URL contains a resource ID (like `labelID`) rather than `teamID`, write a `ResolveTeamIDFromX` helper in the handler file and pass it to `mw.ResolveTeamRole(s, resolver)` when mounting the route. See `ResolveTeamIDFromLabel` for the pattern.

## Realtime

`events.Hub` is an in-memory pub/sub keyed by `boardID`. Handlers call `hub.Publish(boardID, ...)` **after** the DB transaction commits. The single-process assumption is explicit — horizontal scaling would require Postgres `LISTEN/NOTIFY` or Redis.

## Attachments

Uploads are presigned: the API returns a PUT URL scoped to the target bucket key, the browser uploads directly to S3/MinIO, then the browser `POST`s the attachment id back to bind it to a task. Downloads redirect to a short-lived presigned GET URL. The API never proxies bytes.

`STORAGE_S3_PUBLIC_ENDPOINT` is distinct from `STORAGE_S3_ENDPOINT` because the API calls MinIO internally on the compose network (`http://minio:9000`) but must hand the browser a URL it can reach from the host (`http://localhost:9000`).

## Resetting one user's password

To reset a single user without wiping the whole users table, sign in as any other system admin and call:

```
PATCH /api/v1/admin/users/{userID}   { "password": "new-password" }
```

(The UI at `/admin/users` exposes this as a "Reset password" action.) If you've lost the only admin, the blunt recovery path in [CONFIGURATION.md](CONFIGURATION.md#resetting-a-lost-admin-password) is the fallback.

## Testing

No tests are wired into CI yet. The nominal approach:

- Go: `testcontainers-postgres` for integration tests of the store + handlers.
- Web: Playwright smoke covering login → create board → create task → drag to done.

## Common tasks

Rebuild and restart just one service:

```bash
docker compose up -d --build api
docker compose up -d --build web
```

Tail logs:

```bash
docker compose logs -f api
```

Open a psql shell:

```bash
docker compose exec db psql -U backlog -d backlog
```

Open the MinIO console to inspect uploaded attachments:

```
http://localhost:9001   # credentials from MINIO_ROOT_USER / MINIO_ROOT_PASSWORD
```

Reset the database entirely (deletes the volume, including every uploaded attachment):

```bash
docker compose down -v
docker compose up --build
```

## Troubleshooting

- **`admin bootstrap skipped` on first boot:** a previous run already created users. Either reset the DB or pick a known account.
- **Drag-drop does nothing:** check the browser console for 403s — viewers cannot move tasks.
- **SSE not updating other windows:** confirm `/boards/{boardID}/stream` is a long-lived request in the network panel. Some corporate proxies buffer SSE; disable compression if needed.
- **CORS errors in dev:** confirm the browser is hitting `NEXT_PUBLIC_API_BASE_URL` and that origin is listed in `APP_ORIGINS`.
- **Attachment upload fails with a network error to `minio:9000`:** the browser is trying to follow the internal endpoint. Make sure `STORAGE_S3_PUBLIC_ENDPOINT` points at a host the browser can reach (usually `http://localhost:9000`).
- **Public desk submissions return 429:** the rate limiter fired (20 burst, 20/min steady-state, keyed by IP+slug). Wait a minute or submit from a different IP.
