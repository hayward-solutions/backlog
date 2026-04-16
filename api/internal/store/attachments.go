package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

func (s *Store) CreateAttachment(ctx context.Context, a *domain.Attachment) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO attachments
		   (id, team_id, uploader_id, kind, title, storage_key, filename, content_type, size_bytes, url, target_type, target_id)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
		a.ID, a.TeamID, a.UploaderID, string(a.Kind), a.Title, a.StorageKey,
		a.Filename, a.ContentType, a.SizeBytes, a.URL, a.TargetType, a.TargetID)
	if err != nil {
		return err
	}
	return s.Pool.QueryRow(ctx, `SELECT created_at FROM attachments WHERE id = $1`, a.ID).Scan(&a.CreatedAt)
}

func (s *Store) GetAttachment(ctx context.Context, id uuid.UUID) (domain.Attachment, error) {
	var a domain.Attachment
	var kind string
	err := s.Pool.QueryRow(ctx,
		`SELECT id, team_id, uploader_id, kind, title, storage_key, filename, content_type, size_bytes, url, target_type, target_id, created_at
		 FROM attachments WHERE id = $1`, id).
		Scan(&a.ID, &a.TeamID, &a.UploaderID, &kind, &a.Title, &a.StorageKey, &a.Filename,
			&a.ContentType, &a.SizeBytes, &a.URL, &a.TargetType, &a.TargetID, &a.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, ErrNotFound
	}
	a.Kind = domain.AttachmentKind(kind)
	return a, err
}

func (s *Store) DeleteAttachment(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM attachments WHERE id = $1`, id)
	return err
}

// AddAttachmentRef links an attachment to a parent (task or comment).
func (s *Store) AddAttachmentRef(ctx context.Context, attachmentID uuid.UUID, parentType string, parentID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO attachment_refs (attachment_id, parent_type, parent_id) VALUES ($1,$2,$3)
		 ON CONFLICT DO NOTHING`, attachmentID, parentType, parentID)
	return err
}

func (s *Store) RemoveAttachmentRef(ctx context.Context, attachmentID uuid.UUID, parentType string, parentID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM attachment_refs WHERE attachment_id = $1 AND parent_type = $2 AND parent_id = $3`,
		attachmentID, parentType, parentID)
	return err
}

// ListAttachmentsForParent returns all attachments linked to a single parent.
func (s *Store) ListAttachmentsForParent(ctx context.Context, parentType string, parentID uuid.UUID) ([]domain.Attachment, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT a.id, a.team_id, a.uploader_id, a.kind, a.title, a.storage_key, a.filename,
		        a.content_type, a.size_bytes, a.url, a.target_type, a.target_id, a.created_at
		   FROM attachments a
		   JOIN attachment_refs r ON r.attachment_id = a.id
		  WHERE r.parent_type = $1 AND r.parent_id = $2
		  ORDER BY a.created_at`, parentType, parentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Attachment{}
	for rows.Next() {
		var a domain.Attachment
		var kind string
		if err := rows.Scan(&a.ID, &a.TeamID, &a.UploaderID, &kind, &a.Title, &a.StorageKey, &a.Filename,
			&a.ContentType, &a.SizeBytes, &a.URL, &a.TargetType, &a.TargetID, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.Kind = domain.AttachmentKind(kind)
		out = append(out, a)
	}
	return out, rows.Err()
}

// ListAttachmentsForComments batches attachments for a set of comment IDs.
func (s *Store) ListAttachmentsForComments(ctx context.Context, commentIDs []uuid.UUID) (map[uuid.UUID][]domain.Attachment, error) {
	out := map[uuid.UUID][]domain.Attachment{}
	if len(commentIDs) == 0 {
		return out, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT r.parent_id, a.id, a.team_id, a.uploader_id, a.kind, a.title, a.storage_key, a.filename,
		        a.content_type, a.size_bytes, a.url, a.target_type, a.target_id, a.created_at
		   FROM attachments a
		   JOIN attachment_refs r ON r.attachment_id = a.id
		  WHERE r.parent_type = 'comment' AND r.parent_id = ANY($1)
		  ORDER BY a.created_at`, commentIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var parentID uuid.UUID
		var a domain.Attachment
		var kind string
		if err := rows.Scan(&parentID, &a.ID, &a.TeamID, &a.UploaderID, &kind, &a.Title, &a.StorageKey, &a.Filename,
			&a.ContentType, &a.SizeBytes, &a.URL, &a.TargetType, &a.TargetID, &a.CreatedAt); err != nil {
			return nil, err
		}
		a.Kind = domain.AttachmentKind(kind)
		out[parentID] = append(out[parentID], a)
	}
	return out, rows.Err()
}

// ResolveTeamIDFromAttachment / Comment helpers for permission middleware.
func (s *Store) GetAttachmentTeam(ctx context.Context, id uuid.UUID) (uuid.UUID, error) {
	var tid uuid.UUID
	err := s.Pool.QueryRow(ctx, `SELECT team_id FROM attachments WHERE id = $1`, id).Scan(&tid)
	if errors.Is(err, pgx.ErrNoRows) {
		return tid, ErrNotFound
	}
	return tid, err
}

func (s *Store) GetCommentTeam(ctx context.Context, id uuid.UUID) (uuid.UUID, uuid.UUID, error) {
	// returns (teamID, authorID)
	var tid, aid uuid.UUID
	err := s.Pool.QueryRow(ctx,
		`SELECT b.team_id, c.author_id
		   FROM comments c
		   JOIN tasks t ON t.id = c.task_id
		   JOIN boards b ON b.id = t.board_id
		  WHERE c.id = $1`, id).Scan(&tid, &aid)
	if errors.Is(err, pgx.ErrNoRows) {
		return tid, aid, ErrNotFound
	}
	return tid, aid, err
}
