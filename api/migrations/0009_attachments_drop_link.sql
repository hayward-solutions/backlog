-- +goose Up
DELETE FROM attachments WHERE kind = 'link';
ALTER TABLE attachments DROP CONSTRAINT attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('file','internal'));

-- +goose Down
ALTER TABLE attachments DROP CONSTRAINT attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('file','link','internal'));
