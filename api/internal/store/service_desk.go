package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

// Request templates

func (s *Store) CreateRequestTemplate(ctx context.Context, t domain.RequestTemplate) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO request_templates (id, board_id, name, description, position, default_priority)
		 VALUES ($1,$2,$3,$4,$5,$6)`,
		t.ID, t.BoardID, t.Name, t.Description, t.Position, string(t.DefaultPriority))
	return err
}

func (s *Store) GetRequestTemplate(ctx context.Context, id uuid.UUID) (domain.RequestTemplate, error) {
	var t domain.RequestTemplate
	var pr string
	err := s.Pool.QueryRow(ctx,
		`SELECT id, board_id, name, description, position, default_priority, archived_at, created_at
		 FROM request_templates WHERE id = $1`, id).
		Scan(&t.ID, &t.BoardID, &t.Name, &t.Description, &t.Position, &pr, &t.ArchivedAt, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}
	t.DefaultPriority = domain.Priority(pr)
	t.Fields, err = s.ListRequestFields(ctx, id)
	return t, err
}

// ListRequestTemplates returns all templates for a board, optionally
// filtering out archived ones. Fields are hydrated so a caller gets a
// fully-renderable form in one round trip.
func (s *Store) ListRequestTemplates(ctx context.Context, boardID uuid.UUID, includeArchived bool) ([]domain.RequestTemplate, error) {
	q := `SELECT id, board_id, name, description, position, default_priority, archived_at, created_at
	      FROM request_templates WHERE board_id = $1`
	if !includeArchived {
		q += ` AND archived_at IS NULL`
	}
	q += ` ORDER BY position, created_at`
	rows, err := s.Pool.Query(ctx, q, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.RequestTemplate
	for rows.Next() {
		var t domain.RequestTemplate
		var pr string
		if err := rows.Scan(&t.ID, &t.BoardID, &t.Name, &t.Description, &t.Position,
			&pr, &t.ArchivedAt, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.DefaultPriority = domain.Priority(pr)
		out = append(out, t)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	// Hydrate fields for each template in one round trip.
	if len(out) == 0 {
		return out, nil
	}
	ids := make([]uuid.UUID, len(out))
	for i, t := range out {
		ids[i] = t.ID
		out[i].Fields = []domain.RequestTemplateField{}
	}
	frows, err := s.Pool.Query(ctx,
		`SELECT id, template_id, key, label, type, required, position, options, help_text
		 FROM request_template_fields WHERE template_id = ANY($1) ORDER BY position`, ids)
	if err != nil {
		return nil, err
	}
	defer frows.Close()
	idx := map[uuid.UUID]int{}
	for i, t := range out {
		idx[t.ID] = i
	}
	for frows.Next() {
		f, err := scanField(frows)
		if err != nil {
			return nil, err
		}
		if i, ok := idx[f.TemplateID]; ok {
			out[i].Fields = append(out[i].Fields, f)
		}
	}
	return out, frows.Err()
}

type RequestTemplateUpdate struct {
	Name            *string
	Description     *string
	Position        *float64
	DefaultPriority *domain.Priority
	Archived        *bool
}

func (s *Store) UpdateRequestTemplate(ctx context.Context, id uuid.UUID, u RequestTemplateUpdate) error {
	q := `UPDATE request_templates SET `
	args := []any{id}
	sets := []string{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if u.Name != nil {
		add("name", *u.Name)
	}
	if u.Description != nil {
		add("description", *u.Description)
	}
	if u.Position != nil {
		add("position", *u.Position)
	}
	if u.DefaultPriority != nil {
		add("default_priority", string(*u.DefaultPriority))
	}
	if u.Archived != nil {
		if *u.Archived {
			sets = append(sets, "archived_at = now()")
		} else {
			sets = append(sets, "archived_at = NULL")
		}
	}
	if len(sets) == 0 {
		return nil
	}
	q += joinComma(sets) + ` WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, args...)
	return err
}

func (s *Store) DeleteRequestTemplate(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM request_templates WHERE id = $1`, id)
	return err
}

// Fields

func scanField(rows pgx.Row) (domain.RequestTemplateField, error) {
	var f domain.RequestTemplateField
	var typ string
	var opts []byte
	if err := rows.Scan(&f.ID, &f.TemplateID, &f.Key, &f.Label, &typ, &f.Required,
		&f.Position, &opts, &f.HelpText); err != nil {
		return f, err
	}
	f.Type = domain.RequestFieldType(typ)
	f.Options = []string{}
	if len(opts) > 0 {
		_ = json.Unmarshal(opts, &f.Options)
	}
	return f, nil
}

func (s *Store) CreateRequestField(ctx context.Context, f domain.RequestTemplateField) error {
	opts, err := json.Marshal(f.Options)
	if err != nil {
		return err
	}
	_, err = s.Pool.Exec(ctx,
		`INSERT INTO request_template_fields
		   (id, template_id, key, label, type, required, position, options, help_text)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
		f.ID, f.TemplateID, f.Key, f.Label, string(f.Type), f.Required, f.Position, opts, f.HelpText)
	return err
}

func (s *Store) GetRequestField(ctx context.Context, id uuid.UUID) (domain.RequestTemplateField, error) {
	row := s.Pool.QueryRow(ctx,
		`SELECT id, template_id, key, label, type, required, position, options, help_text
		 FROM request_template_fields WHERE id = $1`, id)
	f, err := scanField(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, ErrNotFound
	}
	return f, err
}

func (s *Store) ListRequestFields(ctx context.Context, templateID uuid.UUID) ([]domain.RequestTemplateField, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, template_id, key, label, type, required, position, options, help_text
		 FROM request_template_fields WHERE template_id = $1 ORDER BY position`, templateID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.RequestTemplateField{}
	for rows.Next() {
		f, err := scanField(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

type RequestFieldUpdate struct {
	Key      *string
	Label    *string
	Type     *domain.RequestFieldType
	Required *bool
	Position *float64
	Options  *[]string
	HelpText *string
}

func (s *Store) UpdateRequestField(ctx context.Context, id uuid.UUID, u RequestFieldUpdate) error {
	q := `UPDATE request_template_fields SET `
	args := []any{id}
	sets := []string{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if u.Key != nil {
		add("key", *u.Key)
	}
	if u.Label != nil {
		add("label", *u.Label)
	}
	if u.Type != nil {
		add("type", string(*u.Type))
	}
	if u.Required != nil {
		add("required", *u.Required)
	}
	if u.Position != nil {
		add("position", *u.Position)
	}
	if u.Options != nil {
		raw, err := json.Marshal(*u.Options)
		if err != nil {
			return err
		}
		add("options", raw)
	}
	if u.HelpText != nil {
		add("help_text", *u.HelpText)
	}
	if len(sets) == 0 {
		return nil
	}
	q += joinComma(sets) + ` WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, args...)
	return err
}

func (s *Store) DeleteRequestField(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM request_template_fields WHERE id = $1`, id)
	return err
}

// Submissions

// CreateSubmission inserts the raw intake alongside the just-created task. Run
// inside a caller-managed transaction so the task and its provenance record
// land together.
func (s *Store) CreateSubmission(ctx context.Context, tx pgx.Tx, sub domain.RequestSubmission, trackingHash, ipHash, userAgent string) error {
	vals, err := json.Marshal(sub.Values)
	if err != nil {
		return err
	}
	q := `INSERT INTO request_submissions
		  (id, template_id, task_id, submitter_email, submitter_name, submitter_user_id, values, tracking_hash, ip_hash, user_agent)
	      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`
	args := []any{sub.ID, sub.TemplateID, sub.TaskID, sub.SubmitterEmail, sub.SubmitterName,
		sub.SubmitterUserID, vals, trackingHash, ipHash, userAgent}
	if tx != nil {
		_, err = tx.Exec(ctx, q, args...)
	} else {
		_, err = s.Pool.Exec(ctx, q, args...)
	}
	return err
}

func (s *Store) GetSubmissionByTrackingHash(ctx context.Context, hash string) (domain.RequestSubmission, error) {
	var sub domain.RequestSubmission
	var vals []byte
	err := s.Pool.QueryRow(ctx,
		`SELECT id, template_id, task_id, submitter_email, submitter_name, submitter_user_id, values, created_at
		 FROM request_submissions WHERE tracking_hash = $1`, hash).
		Scan(&sub.ID, &sub.TemplateID, &sub.TaskID, &sub.SubmitterEmail, &sub.SubmitterName,
			&sub.SubmitterUserID, &vals, &sub.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return sub, ErrNotFound
	}
	if err != nil {
		return sub, err
	}
	sub.Values = map[string]string{}
	if len(vals) > 0 {
		_ = json.Unmarshal(vals, &sub.Values)
	}
	return sub, nil
}

// GetSubmissionForTask loads the raw submission (if any) linked to a task.
// Returns ErrNotFound when the task wasn't created via the service desk.
func (s *Store) GetSubmissionForTask(ctx context.Context, taskID uuid.UUID) (domain.RequestSubmission, error) {
	var sub domain.RequestSubmission
	var vals []byte
	err := s.Pool.QueryRow(ctx,
		`SELECT id, template_id, task_id, submitter_email, submitter_name, submitter_user_id, values, created_at
		 FROM request_submissions WHERE task_id = $1`, taskID).
		Scan(&sub.ID, &sub.TemplateID, &sub.TaskID, &sub.SubmitterEmail, &sub.SubmitterName,
			&sub.SubmitterUserID, &vals, &sub.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return sub, ErrNotFound
	}
	if err != nil {
		return sub, err
	}
	sub.Values = map[string]string{}
	if len(vals) > 0 {
		_ = json.Unmarshal(vals, &sub.Values)
	}
	return sub, nil
}

// UserSubmissionSummary is one row on the signed-in "my requests" list.
// It joins the submission with just enough board/task/column info so the
// listing page can render without further round-trips.
type UserSubmissionSummary struct {
	SubmissionID uuid.UUID         `json:"submission_id"`
	DeskSlug     string            `json:"desk_slug"`
	DeskName     string            `json:"desk_name"`
	TaskKey      string            `json:"task_key"`
	Title        string            `json:"title"`
	Status       string            `json:"status"`
	StatusKind   domain.ColumnType `json:"status_kind"`
	Completed    bool              `json:"completed"`
	SubmittedAt  time.Time         `json:"submitted_at"`
}

// ListSubmissionsByUser returns every submission the given user made, newest
// first. Submissions whose board has since been archived, or whose desk lost
// its public slug, are filtered out — we can't link to a page that wouldn't
// resolve anyway.
func (s *Store) ListSubmissionsByUser(ctx context.Context, userID uuid.UUID) ([]UserSubmissionSummary, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT rs.id, b.public_slug, b.name, t.key, t.title,
		        c.name, c.type, t.completed_at IS NOT NULL, rs.created_at
		 FROM request_submissions rs
		 JOIN tasks t ON t.id = rs.task_id
		 JOIN boards b ON b.id = t.board_id
		 JOIN columns c ON c.id = t.column_id
		 WHERE rs.submitter_user_id = $1
		   AND b.archived_at IS NULL
		   AND b.public_slug IS NOT NULL
		 ORDER BY rs.created_at DESC`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []UserSubmissionSummary{}
	for rows.Next() {
		var r UserSubmissionSummary
		var slug *string
		var kind string
		if err := rows.Scan(&r.SubmissionID, &slug, &r.DeskName, &r.TaskKey,
			&r.Title, &r.Status, &kind, &r.Completed, &r.SubmittedAt); err != nil {
			return nil, err
		}
		if slug != nil {
			r.DeskSlug = *slug
		}
		r.StatusKind = domain.ColumnType(kind)
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetSubmissionForUser loads a submission only if the given user was the
// original submitter. Used to gate the authenticated tracking route so users
// can see their own historical requests without the original token. Returns
// ErrNotFound for mismatches or missing rows — callers should treat that as
// "not available" rather than surfacing the distinction.
func (s *Store) GetSubmissionForUser(ctx context.Context, userID, submissionID uuid.UUID) (domain.RequestSubmission, error) {
	var sub domain.RequestSubmission
	var vals []byte
	err := s.Pool.QueryRow(ctx,
		`SELECT id, template_id, task_id, submitter_email, submitter_name, submitter_user_id, values, created_at
		 FROM request_submissions
		 WHERE id = $1 AND submitter_user_id = $2`, submissionID, userID).
		Scan(&sub.ID, &sub.TemplateID, &sub.TaskID, &sub.SubmitterEmail, &sub.SubmitterName,
			&sub.SubmitterUserID, &vals, &sub.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return sub, ErrNotFound
	}
	if err != nil {
		return sub, err
	}
	sub.Values = map[string]string{}
	if len(vals) > 0 {
		_ = json.Unmarshal(vals, &sub.Values)
	}
	return sub, nil
}

// Desk messages (submitter<->team portal thread)

// CreateDeskMessage inserts one message onto a submission's thread.
func (s *Store) CreateDeskMessage(ctx context.Context, m domain.DeskMessage) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO desk_messages (id, submission_id, from_submitter, author_user_id, body)
		 VALUES ($1,$2,$3,$4,$5)`,
		m.ID, m.SubmissionID, m.FromSubmitter, m.AuthorUserID, m.Body)
	return err
}

// ListDeskMessages loads every message on a submission's thread in
// chronological order. Author display name is joined in for team messages so
// the tracking page doesn't need a second round-trip per message.
func (s *Store) ListDeskMessages(ctx context.Context, submissionID uuid.UUID) ([]domain.DeskMessage, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT m.id, m.submission_id, m.from_submitter, m.author_user_id,
		        COALESCE(u.display_name, u.email, '') AS author_name,
		        m.body, m.created_at
		 FROM desk_messages m
		 LEFT JOIN users u ON u.id = m.author_user_id
		 WHERE m.submission_id = $1
		 ORDER BY m.created_at ASC`, submissionID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.DeskMessage
	for rows.Next() {
		var m domain.DeskMessage
		if err := rows.Scan(&m.ID, &m.SubmissionID, &m.FromSubmitter, &m.AuthorUserID,
			&m.AuthorName, &m.Body, &m.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
