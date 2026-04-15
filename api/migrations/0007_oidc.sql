-- +goose Up
ALTER TABLE users ADD COLUMN oidc_subject text;
CREATE UNIQUE INDEX idx_users_oidc_subject ON users(oidc_subject) WHERE oidc_subject IS NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;

-- +goose Down
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;
DROP INDEX idx_users_oidc_subject;
ALTER TABLE users DROP COLUMN oidc_subject;
