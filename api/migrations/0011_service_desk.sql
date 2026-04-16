-- +goose Up

-- Teams gain an opt-in service-desk flag. Only owners toggle it; when off,
-- the team cannot create service-desk boards and existing public forms stop
-- accepting submissions.
ALTER TABLE teams ADD COLUMN service_desk_enabled boolean NOT NULL DEFAULT false;

-- Boards grow a type/visibility/public-slug/intake-column so a service desk
-- is just a specially-configured board. Reusing boards lets us get columns,
-- task drawer, comments, attachments, and SSE for free.
ALTER TABLE boards ADD COLUMN type text NOT NULL DEFAULT 'standard'
    CHECK (type IN ('standard','service_desk'));
ALTER TABLE boards ADD COLUMN visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private','internal','public'));
ALTER TABLE boards ADD COLUMN public_slug text;
ALTER TABLE boards ADD COLUMN intake_column_id uuid REFERENCES columns(id) ON DELETE SET NULL;

-- Slugs are the URL identifier for /desk/{slug}. They're globally unique so
-- they can route without disambiguation; citext so matching is case-
-- insensitive. A standard board never has one.
CREATE UNIQUE INDEX uniq_boards_public_slug ON boards(lower(public_slug))
    WHERE public_slug IS NOT NULL;

-- Templates are request forms submitters fill in. Multiple per board (e.g.
-- "Report a bug", "Request access"). Archived templates stay hidden but
-- still resolve for existing submissions.
CREATE TABLE request_templates (
    id uuid PRIMARY KEY,
    board_id uuid NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    name text NOT NULL,
    description text NOT NULL DEFAULT '',
    position numeric(20,10) NOT NULL DEFAULT 0,
    default_priority text NOT NULL DEFAULT 'med'
        CHECK (default_priority IN ('low','med','high','urgent')),
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_request_templates_board ON request_templates(board_id);

-- Fields drive the form UI and (for required ones) gate submission. Options
-- lives in jsonb so select-type fields carry their choices with them.
CREATE TABLE request_template_fields (
    id uuid PRIMARY KEY,
    template_id uuid NOT NULL REFERENCES request_templates(id) ON DELETE CASCADE,
    key text NOT NULL,
    label text NOT NULL,
    type text NOT NULL CHECK (type IN ('text','longtext','select','email','url','number','date')),
    required boolean NOT NULL DEFAULT false,
    position numeric(20,10) NOT NULL DEFAULT 0,
    options jsonb NOT NULL DEFAULT '[]'::jsonb,
    help_text text NOT NULL DEFAULT '',
    UNIQUE (template_id, key)
);
CREATE INDEX idx_request_fields_template ON request_template_fields(template_id, position);

-- Submissions preserve the raw intake payload even after the task gets
-- edited or moved. Tracking token is hashed (same pattern as invites) so
-- the DB dump never exposes live status-lookup URLs.
CREATE TABLE request_submissions (
    id uuid PRIMARY KEY,
    template_id uuid NOT NULL REFERENCES request_templates(id) ON DELETE CASCADE,
    task_id uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    submitter_email citext NOT NULL,
    submitter_name text NOT NULL DEFAULT '',
    submitter_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    values jsonb NOT NULL DEFAULT '{}'::jsonb,
    tracking_hash text UNIQUE NOT NULL,
    ip_hash text NOT NULL DEFAULT '',
    user_agent text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_request_submissions_task ON request_submissions(task_id);
CREATE INDEX idx_request_submissions_template ON request_submissions(template_id);

-- +goose Down
DROP TABLE request_submissions;
DROP TABLE request_template_fields;
DROP TABLE request_templates;
DROP INDEX IF EXISTS uniq_boards_public_slug;
ALTER TABLE boards DROP COLUMN intake_column_id;
ALTER TABLE boards DROP COLUMN public_slug;
ALTER TABLE boards DROP COLUMN visibility;
ALTER TABLE boards DROP COLUMN type;
ALTER TABLE teams DROP COLUMN service_desk_enabled;
