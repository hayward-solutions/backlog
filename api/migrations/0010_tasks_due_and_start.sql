-- +goose Up
ALTER TABLE tasks RENAME COLUMN deadline_at TO due_at;
ALTER TABLE tasks ADD COLUMN start_at timestamptz;

-- +goose Down
ALTER TABLE tasks DROP COLUMN start_at;
ALTER TABLE tasks RENAME COLUMN due_at TO deadline_at;
