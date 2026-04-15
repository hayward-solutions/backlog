-- +goose Up
CREATE EXTENSION IF NOT EXISTS citext;

-- Placeholder init migration. Schema tables land in later migrations per milestone.
-- This exists so goose has at least one migration to run in M1.
CREATE TABLE IF NOT EXISTS schema_marker (
    id int PRIMARY KEY,
    note text NOT NULL
);
INSERT INTO schema_marker (id, note) VALUES (1, 'backlog v1 init') ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS schema_marker;
