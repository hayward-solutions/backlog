-- +goose Up
CREATE TABLE users (
    id uuid PRIMARY KEY,
    email citext UNIQUE NOT NULL,
    password_hash text NOT NULL,
    display_name text NOT NULL,
    is_system_admin boolean NOT NULL DEFAULT false,
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- +goose Down
DROP TABLE sessions;
DROP TABLE users;
