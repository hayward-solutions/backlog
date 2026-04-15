-- +goose Up
ALTER TABLE boards ADD COLUMN key text;
ALTER TABLE boards ADD COLUMN task_seq int NOT NULL DEFAULT 0;
ALTER TABLE tasks ADD COLUMN key text;

-- Backfill board keys: take the first 3 alphanumeric characters of name, uppercased;
-- fall back to "BL" for names with no usable characters. Resolve collisions within a
-- team by appending an incrementing numeric suffix (e.g. "DEM", "DEM2", "DEM3").
-- +goose StatementBegin
DO $$
DECLARE
    r record;
    base text;
    candidate text;
    suffix int;
BEGIN
    FOR r IN SELECT id, team_id, name FROM boards ORDER BY created_at, id LOOP
        base := upper(regexp_replace(r.name, '[^A-Za-z0-9]', '', 'g'));
        base := substr(base, 1, 3);
        IF base = '' THEN
            base := 'BL';
        END IF;
        candidate := base;
        suffix := 1;
        WHILE EXISTS (SELECT 1 FROM boards WHERE team_id = r.team_id AND key = candidate) LOOP
            suffix := suffix + 1;
            candidate := base || suffix::text;
        END LOOP;
        UPDATE boards SET key = candidate WHERE id = r.id;
    END LOOP;
END$$;
-- +goose StatementEnd

-- Backfill task keys per board in creation order; update each board's task_seq to match.
-- +goose StatementBegin
DO $$
DECLARE
    b record;
    t record;
    n int;
BEGIN
    FOR b IN SELECT id, key FROM boards LOOP
        n := 0;
        FOR t IN SELECT id FROM tasks WHERE board_id = b.id ORDER BY created_at, id LOOP
            n := n + 1;
            UPDATE tasks SET key = b.key || '-' || lpad(n::text, 3, '0') WHERE id = t.id;
        END LOOP;
        UPDATE boards SET task_seq = n WHERE id = b.id;
    END LOOP;
END$$;
-- +goose StatementEnd

ALTER TABLE boards ALTER COLUMN key SET NOT NULL;
ALTER TABLE tasks ALTER COLUMN key SET NOT NULL;

CREATE UNIQUE INDEX uniq_boards_team_key ON boards(team_id, upper(key));
CREATE UNIQUE INDEX uniq_tasks_board_key ON tasks(board_id, key);

-- +goose Down
DROP INDEX IF EXISTS uniq_tasks_board_key;
DROP INDEX IF EXISTS uniq_boards_team_key;
ALTER TABLE tasks DROP COLUMN key;
ALTER TABLE boards DROP COLUMN task_seq;
ALTER TABLE boards DROP COLUMN key;
