-- +goose Up
CREATE TABLE tasks (
    id uuid PRIMARY KEY,
    board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    column_id uuid NOT NULL REFERENCES columns(id),
    epic_id uuid REFERENCES tasks(id),
    is_epic boolean NOT NULL DEFAULT false,
    title text NOT NULL,
    description text NOT NULL DEFAULT '',
    priority text NOT NULL DEFAULT 'med' CHECK (priority IN ('low','med','high','urgent')),
    assignee_id uuid REFERENCES users(id),
    reporter_id uuid NOT NULL REFERENCES users(id),
    estimate_hours numeric(6,2),
    deadline_at timestamptz,
    position numeric(20,10) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz
);
CREATE INDEX idx_tasks_board ON tasks(board_id);
CREATE INDEX idx_tasks_column ON tasks(column_id, position);
CREATE INDEX idx_tasks_epic ON tasks(epic_id);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

CREATE TABLE task_labels (
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    label_id uuid NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, label_id)
);

CREATE TABLE task_events (
    id uuid PRIMARY KEY,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    actor_id uuid NOT NULL REFERENCES users(id),
    kind text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_events_task ON task_events(task_id, created_at);

-- +goose Down
DROP TABLE task_events;
DROP TABLE task_labels;
DROP TABLE tasks;
