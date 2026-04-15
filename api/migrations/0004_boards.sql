-- +goose Up
CREATE TABLE boards (
    id uuid PRIMARY KEY,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_boards_team ON boards(team_id);

CREATE TABLE columns (
    id uuid PRIMARY KEY,
    board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name text NOT NULL,
    position numeric(20,10) NOT NULL,
    type text NOT NULL CHECK (type IN ('todo','in_progress','done')),
    wip_limit int
);
CREATE INDEX idx_columns_board ON columns(board_id, position);

CREATE TABLE labels (
    id uuid PRIMARY KEY,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    name text NOT NULL,
    color text NOT NULL DEFAULT '#888888',
    UNIQUE (team_id, name)
);

-- +goose Down
DROP TABLE labels;
DROP TABLE columns;
DROP TABLE boards;
