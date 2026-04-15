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
		`INSERT INTO boards (id, team_id, name, key, description) VALUES ($1,$2,$3,$4,$5)`,
		b.ID, b.TeamID, b.Name, b.Key, b.Description)
	return err
}

func (s *Store) GetBoard(ctx context.Context, id uuid.UUID) (domain.Board, error) {
	var b domain.Board
	err := s.Pool.QueryRow(ctx,
		`SELECT id, team_id, name, key, description, archived_at, created_at FROM boards WHERE id = $1`, id).
		Scan(&b.ID, &b.TeamID, &b.Name, &b.Key, &b.Description, &b.ArchivedAt, &b.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return b, ErrNotFound
	}
	return b, err
}

func (s *Store) ListBoards(ctx context.Context, teamID uuid.UUID) ([]domain.Board, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, team_id, name, key, description, archived_at, created_at
		 FROM boards WHERE team_id = $1 ORDER BY created_at`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Board
	for rows.Next() {
		var b domain.Board
		if err := rows.Scan(&b.ID, &b.TeamID, &b.Name, &b.Key, &b.Description, &b.ArchivedAt, &b.CreatedAt); err != nil {
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

func (s *Store) UpdateBoard(ctx context.Context, id uuid.UUID, name, description string, archived bool) error {
	if archived {
		_, err := s.Pool.Exec(ctx,
			`UPDATE boards SET name=$2, description=$3, archived_at=now() WHERE id=$1`, id, name, description)
		return err
	}
	_, err := s.Pool.Exec(ctx,
		`UPDATE boards SET name=$2, description=$3, archived_at=NULL WHERE id=$1`, id, name, description)
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

func (s *Store) UpdateLabel(ctx context.Context, id uuid.UUID, name, color string) error {
	_, err := s.Pool.Exec(ctx, `UPDATE labels SET name=$2, color=$3 WHERE id=$1`, id, name, color)
	return err
}

func (s *Store) DeleteLabel(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM labels WHERE id = $1`, id)
	return err
}
