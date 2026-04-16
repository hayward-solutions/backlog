-- +goose Up

-- Submitter <-> team conversation thread for a desk submission. Deliberately
-- separate from the `comments` table so we never have to audit whether an
-- internal comment was accidentally exposed on the public tracking page.
--
-- author_user_id is nullable: messages from unauthenticated public submitters
-- have no user row. When the submitter replies while signed in, we still
-- record them via from_submitter=true — the portal view is the source of
-- truth for attribution.
CREATE TABLE desk_messages (
    id uuid PRIMARY KEY,
    submission_id uuid NOT NULL REFERENCES request_submissions(id) ON DELETE CASCADE,
    from_submitter boolean NOT NULL,
    author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_desk_messages_submission ON desk_messages(submission_id, created_at);

-- +goose Down
DROP TABLE desk_messages;
