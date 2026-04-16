package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

func (s *Store) CreateBoard(ctx context.Context, b domain.Board) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO boards (id, team_id, name, key, description, type, visibility, public_slug)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
		b.ID, b.TeamID, b.Name, b.Key, b.Description, string(b.Type), string(b.Visibility), b.PublicSlug)
	return err
}

func scanBoard(row pgx.Row, b *domain.Board) error {
	var typ, vis string
	err := row.Scan(&b.ID, &b.TeamID, &b.Name, &b.Key, &b.Description, &typ, &vis,
		&b.PublicSlug, &b.IntakeColumnID, &b.ArchivedAt, &b.CreatedAt)
	if err != nil {
		return err
	}
	b.Type = domain.BoardType(typ)
	b.Visibility = domain.BoardVisibility(vis)
	return nil
}

const boardColumns = `id, team_id, name, key, description, type, visibility, public_slug, intake_column_id, archived_at, created_at`

func (s *Store) GetBoard(ctx context.Context, id uuid.UUID) (domain.Board, error) {
	var b domain.Board
	err := scanBoard(s.Pool.QueryRow(ctx, `SELECT `+boardColumns+` FROM boards WHERE id = $1`, id), &b)
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotFound
	}
	return b, err
}

// GetBoardByPublicSlug returns the board and its team for a given URL slug.
// Used by the unauthenticated desk endpoints; matching is case-insensitive.
func (s *Store) GetBoardByPublicSlug(ctx context.Context, slug string) (domain.Board, error) {
	var b domain.Board
	err := scanBoard(s.Pool.QueryRow(ctx,
		`SELECT `+boardColumns+` FROM boards WHERE lower(public_slug) = lower($1)`, slug), &b)
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotFound
	}
	return b, err
}

// GetBoardsByIDs returns boards matching the supplied ids in one query.
// Unknown ids are silently skipped — callers that need "all or nothing"
// semantics should check the response length themselves.
func (s *Store) GetBoardsByIDs(ctx context.Context, ids []uuid.UUID) ([]domain.Board, error) {
	if len(ids) == 0 {
		return []domain.Board{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT `+boardColumns+` FROM boards WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Board{}
	for rows.Next() {
		var b domain.Board
		if err := scanBoard(rows, &b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) ListBoards(ctx context.Context, teamID uuid.UUID) ([]domain.Board, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT `+boardColumns+` FROM boards WHERE team_id = $1 ORDER BY created_at`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Board
	for rows.Next() {
		var b domain.Board
		if err := scanBoard(rows, &b); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

// AllocateBoardKey returns an unused board key within the given team. If
// preferred is non-empty it is normalised and tried first (with numeric suffix
// fallback on collision); otherwise a key is derived from name.
func (s *Store) AllocateBoardKey(ctx context.Context, teamID uuid.UUID, preferred, name string) (string, error) {
	base := normaliseBoardKey(preferred)
	if base == "" {
		base = normaliseBoardKey(name)
	}
	if base == "" {
		base = "BL"
	}
	// Cap the base so suffixed candidates stay readable.
	if len(base) > 6 {
		base = base[:6]
	}
	candidate := base
	for suffix := 2; ; suffix++ {
		var n int
		if err := s.Pool.QueryRow(ctx,
			`SELECT count(*) FROM boards WHERE team_id = $1 AND upper(key) = upper($2)`,
			teamID, candidate).Scan(&n); err != nil {
			return "", err
		}
		if n == 0 {
			return candidate, nil
		}
		candidate = base + itoa(suffix)
	}
}

// normaliseBoardKey strips non-alphanumerics, uppercases and truncates to a
// reasonable prefix. Returns "" if nothing usable remains.
func normaliseBoardKey(s string) string {
	out := make([]byte, 0, 6)
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z':
			out = append(out, byte(r-'a'+'A'))
		case r >= 'A' && r <= 'Z':
			out = append(out, byte(r))
		case r >= '0' && r <= '9' && len(out) > 0:
			out = append(out, byte(r))
		}
		if len(out) >= 6 {
			break
		}
	}
	if len(out) < 2 {
		return ""
	}
	return string(out)
}

// BoardUpdate carries optional patch fields. Nil pointers are skipped so
// callers only have to set the keys they want to change. Slug gets special
// handling: ClearSlug=true sets it to NULL (closes a public desk).
type BoardUpdate struct {
	Name           *string
	Description    *string
	Archived       *bool
	Visibility     *domain.BoardVisibility
	PublicSlug     *string
	ClearSlug      bool
	IntakeColumnID *uuid.UUID
	ClearIntake    bool
}

func (s *Store) UpdateBoard(ctx context.Context, id uuid.UUID, u BoardUpdate) error {
	q := `UPDATE boards SET `
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
	if u.Archived != nil {
		if *u.Archived {
			sets = append(sets, "archived_at = now()")
		} else {
			sets = append(sets, "archived_at = NULL")
		}
	}
	if u.Visibility != nil {
		add("visibility", string(*u.Visibility))
	}
	if u.ClearSlug {
		sets = append(sets, "public_slug = NULL")
	} else if u.PublicSlug != nil {
		add("public_slug", *u.PublicSlug)
	}
	if u.ClearIntake {
		sets = append(sets, "intake_column_id = NULL")
	} else if u.IntakeColumnID != nil {
		add("intake_column_id", *u.IntakeColumnID)
	}
	if len(sets) == 0 {
		return nil
	}
	q += joinComma(sets) + ` WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, args...)
	return err
}

func (s *Store) DeleteBoard(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM boards WHERE id = $1`, id)
	return err
}

// Columns

func (s *Store) CreateColumn(ctx context.Context, tx pgx.Tx, c domain.Column) error {
	var err error
	q := `INSERT INTO columns (id, board_id, name, position, type, wip_limit) VALUES ($1,$2,$3,$4,$5,$6)`
	if tx != nil {
		_, err = tx.Exec(ctx, q, c.ID, c.BoardID, c.Name, c.Position, string(c.Type), c.WIPLimit)
	} else {
		_, err = s.Pool.Exec(ctx, q, c.ID, c.BoardID, c.Name, c.Position, string(c.Type), c.WIPLimit)
	}
	return err
}

func (s *Store) GetColumn(ctx context.Context, id uuid.UUID) (domain.Column, error) {
	var c domain.Column
	var t string
	err := s.Pool.QueryRow(ctx,
		`SELECT id, board_id, name, position, type, wip_limit FROM columns WHERE id = $1`, id).
		Scan(&c.ID, &c.BoardID, &c.Name, &c.Position, &t, &c.WIPLimit)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	c.Type = domain.ColumnType(t)
	return c, err
}

func (s *Store) ListColumns(ctx context.Context, boardID uuid.UUID) ([]domain.Column, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, board_id, name, position, type, wip_limit
		 FROM columns WHERE board_id = $1 ORDER BY position`, boardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Column
	for rows.Next() {
		var c domain.Column
		var t string
		if err := rows.Scan(&c.ID, &c.BoardID, &c.Name, &c.Position, &t, &c.WIPLimit); err != nil {
			return nil, err
		}
		c.Type = domain.ColumnType(t)
		out = append(out, c)
	}
	return out, rows.Err()
}

// GetColumnsByIDs returns the columns with the given ids. Used by the
// my-tasks aggregation endpoint — each task's column is needed to render
// status, and batching avoids a per-task round-trip.
func (s *Store) GetColumnsByIDs(ctx context.Context, ids []uuid.UUID) ([]domain.Column, error) {
	if len(ids) == 0 {
		return []domain.Column{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT id, board_id, name, position, type, wip_limit
		 FROM columns WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Column{}
	for rows.Next() {
		var c domain.Column
		var t string
		if err := rows.Scan(&c.ID, &c.BoardID, &c.Name, &c.Position, &t, &c.WIPLimit); err != nil {
			return nil, err
		}
		c.Type = domain.ColumnType(t)
		out = append(out, c)
	}
	return out, rows.Err()
}

func (s *Store) UpdateColumn(ctx context.Context, c domain.Column) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE columns SET name=$2, position=$3, type=$4, wip_limit=$5 WHERE id=$1`,
		c.ID, c.Name, c.Position, string(c.Type), c.WIPLimit)
	return err
}

func (s *Store) DeleteColumn(ctx context.Context, id uuid.UUID) error {
	var n int
	if err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM tasks WHERE column_id = $1`, id).Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return errors.New("column not empty")
	}
	_, err := s.Pool.Exec(ctx, `DELETE FROM columns WHERE id = $1`, id)
	return err
}

// Labels

func (s *Store) CreateLabel(ctx context.Context, l domain.Label) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO labels (id, team_id, name, color) VALUES ($1,$2,$3,$4)`,
		l.ID, l.TeamID, l.Name, l.Color)
	return err
}

func (s *Store) GetLabel(ctx context.Context, id uuid.UUID) (domain.Label, error) {
	var l domain.Label
	err := s.Pool.QueryRow(ctx,
		`SELECT id, team_id, name, color FROM labels WHERE id = $1`, id).
		Scan(&l.ID, &l.TeamID, &l.Name, &l.Color)
	if errors.Is(err, pgx.ErrNoRows) {
		return l, ErrNotFound
	}
	return l, err
}

func (s *Store) ListLabels(ctx context.Context, teamID uuid.UUID) ([]domain.Label, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, team_id, name, color FROM labels WHERE team_id = $1 ORDER BY name`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Label
	for rows.Next() {
		var l domain.Label
		if err := rows.Scan(&l.ID, &l.TeamID, &l.Name, &l.Color); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

// GetLabelsByIDs returns labels matching the supplied ids. Used by the
// my-tasks aggregator to resolve labels across teams in one shot.
func (s *Store) GetLabelsByIDs(ctx context.Context, ids []uuid.UUID) ([]domain.Label, error) {
	if len(ids) == 0 {
		return []domain.Label{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT id, team_id, name, color FROM labels WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.Label{}
	for rows.Next() {
		var l domain.Label
		if err := rows.Scan(&l.ID, &l.TeamID, &l.Name, &l.Color); err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) UpdateLabel(ctx context.Context, id uuid.UUID, name, color string) error {
	_, err := s.Pool.Exec(ctx, `UPDATE labels SET name=$2, color=$3 WHERE id=$1`, id, name, color)
	return err
}

func (s *Store) DeleteLabel(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM labels WHERE id = $1`, id)
	return err
}
