-- +goose Up
CREATE TABLE comments (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id),
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    edited_at timestamptz
);
CREATE INDEX idx_comments_task ON comments(task_id, created_at);

CREATE TABLE attachments (
    id uuid PRIMARY KEY,
    team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    uploader_id uuid NOT NULL REFERENCES users(id),
    kind text NOT NULL CHECK (kind IN ('file','link','internal')),
    title text NOT NULL DEFAULT '',
    storage_key text,
    filename text,
    content_type text,
    size_bytes bigint,
    url text,
    target_type text CHECK (target_type IN ('task','board')),
    target_id uuid,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_team ON attachments(team_id);

CREATE TABLE attachment_refs (
    attachment_id uuid NOT NULL REFERENCES attachments(id) ON DELETE CASCADE,
    parent_type text NOT NULL CHECK (parent_type IN ('task','comment')),
    parent_id uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (attachment_id, parent_type, parent_id)
);
CREATE INDEX idx_attref_parent ON attachment_refs(parent_type, parent_id);

-- +goose Down
DROP TABLE attachment_refs;
DROP TABLE attachments;
DROP TABLE comments;
