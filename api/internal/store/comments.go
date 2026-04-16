package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

func (s *Store) CreateComment(ctx context.Context, c *domain.Comment) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO comments (id, task_id, author_id, body) VALUES ($1,$2,$3,$4)`,
		c.ID, c.TaskID, c.AuthorID, c.Body)
	if err != nil {
		return err
	}
	// Re-read created_at
	return s.Pool.QueryRow(ctx, `SELECT created_at FROM comments WHERE id = $1`, c.ID).Scan(&c.CreatedAt)
}

func (s *Store) GetComment(ctx context.Context, id uuid.UUID) (domain.Comment, error) {
	var c domain.Comment
	err := s.Pool.QueryRow(ctx,
		`SELECT id, task_id, author_id, body, created_at, edited_at FROM comments WHERE id = $1`, id).
		Scan(&c.ID, &c.TaskID, &c.AuthorID, &c.Body, &c.CreatedAt, &c.EditedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}

func (s *Store) ListCommentsByTask(ctx context.Context, taskID uuid.UUID) ([]domain.Comment, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, task_id, author_id, body, created_at, edited_at
		 FROM comments WHERE task_id = $1 ORDER BY created_at`, taskID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Comment{}
	for rows.Next() {
		var c domain.Comment
		if err := rows.Scan(&c.ID, &c.TaskID, &c.AuthorID, &c.Body, &c.CreatedAt, &c.EditedAt); err != nil {
			return nil, err
		}
		c.Attachments = []domain.Attachment{}
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) UpdateComment(ctx context.Context, id uuid.UUID, body string) error {
	now := time.Now().UTC()
	_, err := s.Pool.Exec(ctx,
		`UPDATE comments SET body = $2, edited_at = $3 WHERE id = $1`, id, body, now)
	return err
}

func (s *Store) DeleteComment(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM comments WHERE id = $1`, id)
	return err
}
