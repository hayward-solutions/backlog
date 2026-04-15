# Development

## Prerequisites

- Go 1.23+
- Node 20+
- Docker (for Postgres, or a local Postgres 16)
- `goose` migration tool (optional; API runs migrations on startup)

## Running outside Docker

### Postgres only

```bash
docker compose up -d db
```

Exposes Postgres on `localhost:5432`.

### API

```bash
cd api
export POSTGRES_DSN="postgres://backlog:backlog@localhost:5432/backlog?sslmode=disable"
export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=change-me
export SESSION_SECRET=$(openssl rand -hex 32)
go run ./cmd/server
```

On start the API:
1. Connects to Postgres via `pgxpool`.
2. Runs `goose` migrations from `api/migrations/`.
3. Creates the admin from env if `users` is empty (logged as `admin bootstrap skipped` otherwise).
4. Listens on `API_PORT` (default `8080`).

### Web

```bash
cd web
npm install
export NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
npm run dev
```

Web runs at <http://localhost:3000>. Hot reload is on.

## Repo layout

```
backlog/
├── docker-compose.yml
├── .env.example
├── README.md
├── docs/
│   ├── API.md
│   └── DEVELOPMENT.md
├── api/
│   ├── cmd/server/main.go         # wiring, migrations, bootstrap, http
│   ├── migrations/*.sql           # goose migrations
│   └── internal/
│       ├── auth/                  # argon2id, sessions
│       ├── bootstrap/             # admin-from-env
│       ├── domain/                # types, role/permission matrix
│       ├── events/                # in-process SSE hub
│       ├── http/
│       │   ├── router.go
│       │   ├── middleware/        # auth, team-role resolver, permission gate
│       │   └── handlers/          # one file per resource
│       └── store/                 # thin pgx repos (no ORM)
└── web/
    ├── app/                       # Next.js App Router
    │   ├── (auth)/login
    │   ├── account                # My account
    │   ├── admin/{users,teams}    # server-wide admin
    │   ├── teams/[teamId]/...
    │   └── boards/[boardId]/{page,tasks,epics,settings}
    ├── components/
    │   ├── Nav.tsx                # top-right account dropdown
    │   └── board/                 # Column, TaskDrawer, BoardToolbar, NewTaskModal
    └── lib/
        ├── api.ts                 # typed fetch client + shared types
        └── sse.ts                 # useBoardStream hook
```

## Migrations

New migration:

```bash
cd api/migrations
# name it with the next integer prefix
touch 0006_my_change.sql
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

Reset the database entirely (deletes the volume):

```bash
docker compose down -v
docker compose up --build
```

## Troubleshooting

- **`admin bootstrap skipped` on first boot:** a previous run already created users. Either reset the DB or pick a known account.
- **Drag-drop does nothing:** check the browser console for 403s — viewers cannot move tasks.
- **SSE not updating other windows:** confirm `/boards/:id/stream` is a long-lived request in the network panel. Some corporate proxies buffer SSE; disable compression if needed.
- **CORS errors in dev:** `corsForDev` in `router.go` echoes the request `Origin`; make sure the browser is actually hitting `NEXT_PUBLIC_API_BASE_URL`.
