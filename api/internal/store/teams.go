package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

func (s *Store) CreateTeam(ctx context.Context, t domain.Team) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO teams (id, name, slug) VALUES ($1,$2,$3)`,
		t.ID, t.Name, t.Slug)
	return err
}

func (s *Store) GetTeam(ctx context.Context, id uuid.UUID) (domain.Team, error) {
	var t domain.Team
	err := s.Pool.QueryRow(ctx,
		`SELECT id, name, slug, service_desk_enabled, created_at FROM teams WHERE id = $1`, id).
		Scan(&t.ID, &t.Name, &t.Slug, &t.ServiceDeskEnabled, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

func (s *Store) ListAllTeams(ctx context.Context) ([]domain.Team, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, name, slug, service_desk_enabled, created_at FROM teams ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTeams(rows)
}

// ListPublicServiceDeskTeams returns every team that (a) has the service
// desk feature enabled and (b) has at least one non-archived board whose
// visibility is in the supplied set. This is the backing query for the
// public /service-desk landing page. Callers pass {"public"} for anon
// visitors and {"public","internal"} for authenticated ones.
func (s *Store) ListPublicServiceDeskTeams(ctx context.Context, visibilities []string) ([]domain.Team, error) {
	if len(visibilities) == 0 {
		return []domain.Team{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT DISTINCT t.id, t.name, t.slug, t.service_desk_enabled, t.created_at
		 FROM teams t
		 JOIN boards b ON b.team_id = t.id
		 WHERE t.service_desk_enabled = true
		   AND b.type = 'service_desk'
		   AND b.archived_at IS NULL
		   AND b.visibility = ANY($1)
		 ORDER BY t.name`, visibilities)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTeams(rows)
}

func (s *Store) GetTeamBySlug(ctx context.Context, slug string) (domain.Team, error) {
	var t domain.Team
	err := s.Pool.QueryRow(ctx,
		`SELECT id, name, slug, service_desk_enabled, created_at
		 FROM teams WHERE lower(slug) = lower($1)`, slug).
		Scan(&t.ID, &t.Name, &t.Slug, &t.ServiceDeskEnabled, &t.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	return t, err
}

// ListPublicDesksForTeam returns the subset of a team's service-desk boards
// the caller is allowed to discover. Archived boards and any board whose
// visibility isn't in the allowed set are excluded. Templates are not
// hydrated — the intake form itself still renders from /public/desks/{slug}.
func (s *Store) ListPublicDesksForTeam(ctx context.Context, teamID uuid.UUID, visibilities []string) ([]domain.Board, error) {
	if len(visibilities) == 0 {
		return []domain.Board{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT `+boardColumns+` FROM boards
		 WHERE team_id = $1
		   AND type = 'service_desk'
		   AND archived_at IS NULL
		   AND visibility = ANY($2)
		 ORDER BY name`, teamID, visibilities)
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

func (s *Store) ListTeamsForUser(ctx context.Context, userID uuid.UUID) ([]domain.Team, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT t.id, t.name, t.slug, t.service_desk_enabled, t.created_at
		 FROM teams t JOIN team_memberships m ON m.team_id = t.id
		 WHERE m.user_id = $1 ORDER BY t.created_at`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanTeams(rows)
}

func scanTeams(rows pgx.Rows) ([]domain.Team, error) {
	var out []domain.Team
	for rows.Next() {
		var t domain.Team
		if err := rows.Scan(&t.ID, &t.Name, &t.Slug, &t.ServiceDeskEnabled, &t.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// TeamUpdate carries optional patch fields. Nil means "leave alone" — this
// keeps PATCH semantics close to the wire contract without needing a second
// read.
type TeamUpdate struct {
	Name               *string
	ServiceDeskEnabled *bool
}

func (s *Store) UpdateTeam(ctx context.Context, id uuid.UUID, u TeamUpdate) error {
	q := `UPDATE teams SET `
	args := []any{id}
	sets := []string{}
	add := func(col string, v any) {
		args = append(args, v)
		sets = append(sets, col+" = $"+itoa(len(args)))
	}
	if u.Name != nil {
		add("name", *u.Name)
	}
	if u.ServiceDeskEnabled != nil {
		add("service_desk_enabled", *u.ServiceDeskEnabled)
	}
	if len(sets) == 0 {
		return nil
	}
	q += joinComma(sets) + ` WHERE id = $1`
	_, err := s.Pool.Exec(ctx, q, args...)
	return err
}

func (s *Store) DeleteTeam(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM teams WHERE id = $1`, id)
	return err
}

// Memberships

func (s *Store) AddMember(ctx context.Context, teamID, userID uuid.UUID, role domain.Role) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1,$2,$3)
		 ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
		teamID, userID, string(role))
	return err
}

func (s *Store) GetMembership(ctx context.Context, teamID, userID uuid.UUID) (domain.Role, error) {
	var r string
	err := s.Pool.QueryRow(ctx,
		`SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2`,
		teamID, userID).Scan(&r)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return domain.Role(r), err
}

func (s *Store) ListMembers(ctx context.Context, teamID uuid.UUID) ([]domain.Member, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT u.id, u.email, u.display_name, u.is_system_admin, u.disabled_at, u.created_at, m.role
		 FROM team_memberships m JOIN users u ON u.id = m.user_id
		 WHERE m.team_id = $1 ORDER BY u.display_name`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Member
	for rows.Next() {
		var m domain.Member
		var r string
		if err := rows.Scan(&m.User.ID, &m.User.Email, &m.User.DisplayName, &m.User.IsSystemAdmin, &m.User.DisabledAt, &m.User.CreatedAt, &r); err != nil {
			return nil, err
		}
		m.Role = domain.Role(r)
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) CountOwners(ctx context.Context, teamID uuid.UUID) (int, error) {
	var n int
	err := s.Pool.QueryRow(ctx,
		`SELECT count(*) FROM team_memberships WHERE team_id = $1 AND role = 'owner'`, teamID).Scan(&n)
	return n, err
}

func (s *Store) UpdateMemberRole(ctx context.Context, teamID, userID uuid.UUID, role domain.Role) error {
	_, err := s.Pool.Exec(ctx,
		`UPDATE team_memberships SET role = $3 WHERE team_id = $1 AND user_id = $2`,
		teamID, userID, string(role))
	return err
}

func (s *Store) RemoveMember(ctx context.Context, teamID, userID uuid.UUID) error {
	_, err := s.Pool.Exec(ctx,
		`DELETE FROM team_memberships WHERE team_id = $1 AND user_id = $2`, teamID, userID)
	return err
}

// Invites

func (s *Store) CreateInvite(ctx context.Context, inv domain.Invite, tokenHash string) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO invites (id, team_id, email, role, token_hash, invited_by, expires_at)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		inv.ID, inv.TeamID, inv.Email, string(inv.Role), tokenHash, inv.InvitedBy, inv.ExpiresAt)
	return err
}

func (s *Store) GetInviteByTokenHash(ctx context.Context, tokenHash string) (domain.Invite, error) {
	var inv domain.Invite
	var r string
	err := s.Pool.QueryRow(ctx,
		`SELECT id, team_id, email, role, invited_by, expires_at, accepted_at, created_at
		 FROM invites WHERE token_hash = $1`, tokenHash).
		Scan(&inv.ID, &inv.TeamID, &inv.Email, &r, &inv.InvitedBy, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return inv, ErrNotFound
	}
	inv.Role = domain.Role(r)
	return inv, err
}

func (s *Store) AcceptInvite(ctx context.Context, id uuid.UUID) error {
	now := time.Now().UTC()
	_, err := s.Pool.Exec(ctx, `UPDATE invites SET accepted_at = $2 WHERE id = $1`, id, now)
	return err
}

func (s *Store) ListInvites(ctx context.Context, teamID uuid.UUID) ([]domain.Invite, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, team_id, email, role, invited_by, expires_at, accepted_at, created_at
		 FROM invites WHERE team_id = $1 ORDER BY created_at DESC`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.Invite
	for rows.Next() {
		var inv domain.Invite
		var r string
		if err := rows.Scan(&inv.ID, &inv.TeamID, &inv.Email, &r, &inv.InvitedBy, &inv.ExpiresAt, &inv.AcceptedAt, &inv.CreatedAt); err != nil {
			return nil, err
		}
		inv.Role = domain.Role(r)
		out = append(out, inv)
	}
	return out, rows.Err()
}
