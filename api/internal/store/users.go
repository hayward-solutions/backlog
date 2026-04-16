package store

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/haywardsolutions/backlog/api/internal/domain"
)

var ErrNotFound = errors.New("not found")

func (s *Store) CreateUser(ctx context.Context, u domain.User, passwordHash string) error {
	var pw *string
	if passwordHash != "" {
		pw = &passwordHash
	}
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO users (id, email, password_hash, display_name, is_system_admin, created_at)
		 VALUES ($1,$2,$3,$4,$5, now())`,
		u.ID, u.Email, pw, u.DisplayName, u.IsSystemAdmin)
	return err
}

func (s *Store) CountUsers(ctx context.Context) (int, error) {
	var n int
	err := s.Pool.QueryRow(ctx, `SELECT count(*) FROM users`).Scan(&n)
	return n, err
}

// CountActiveSystemAdmins returns the number of enabled users with the system
// admin flag. Used to prevent operations that would leave the instance with
// zero administrators.
func (s *Store) CountActiveSystemAdmins(ctx context.Context) (int, error) {
	var n int
	err := s.Pool.QueryRow(ctx,
		`SELECT count(*) FROM users WHERE is_system_admin = true AND disabled_at IS NULL`).Scan(&n)
	return n, err
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (domain.User, string, error) {
	var u domain.User
	var hash string
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, password_hash, display_name, is_system_admin, disabled_at, created_at
		 FROM users WHERE email = $1`, email).
		Scan(&u.ID, &u.Email, &hash, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, "", ErrNotFound
	}
	return u, hash, err
}

func (s *Store) GetUser(ctx context.Context, id uuid.UUID) (domain.User, error) {
	var u domain.User
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
		 FROM users WHERE id = $1`, id).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

func (s *Store) ListUsers(ctx context.Context) ([]domain.User, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
		 FROM users ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// GetUsersByIDs returns the users matching the supplied ids. Used where the
// caller has a bag of foreign-key ids (e.g. assignees and reporters across a
// multi-board view) and wants to resolve display names in one round-trip.
func (s *Store) GetUsersByIDs(ctx context.Context, ids []uuid.UUID) ([]domain.User, error) {
	if len(ids) == 0 {
		return []domain.User{}, nil
	}
	rows, err := s.Pool.Query(ctx,
		`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
		 FROM users WHERE id = ANY($1::uuid[])`, ids)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []domain.User{}
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

func (s *Store) SetUserDisabled(ctx context.Context, id uuid.UUID, disabled bool) error {
	var ts *time.Time
	if disabled {
		now := time.Now().UTC()
		ts = &now
	}
	_, err := s.Pool.Exec(ctx, `UPDATE users SET disabled_at = $2 WHERE id = $1`, id, ts)
	return err
}

func (s *Store) UpdateUserProfile(ctx context.Context, id uuid.UUID, email, displayName *string, isSystemAdmin *bool) error {
	if email == nil && displayName == nil && isSystemAdmin == nil {
		return nil
	}
	sets := ""
	args := []any{id}
	if email != nil {
		args = append(args, *email)
		sets += ", email = $" + strconv.Itoa(len(args))
	}
	if displayName != nil {
		args = append(args, *displayName)
		sets += ", display_name = $" + strconv.Itoa(len(args))
	}
	if isSystemAdmin != nil {
		args = append(args, *isSystemAdmin)
		sets += ", is_system_admin = $" + strconv.Itoa(len(args))
	}
	sql := `UPDATE users SET ` + sets[2:] + ` WHERE id = $1`
	_, err := s.Pool.Exec(ctx, sql, args...)
	return err
}

func (s *Store) SetUserPassword(ctx context.Context, id uuid.UUID, hash string) error {
	_, err := s.Pool.Exec(ctx, `UPDATE users SET password_hash = $2 WHERE id = $1`, id, hash)
	return err
}

// DeleteUser hard-deletes the user row. Sessions and team memberships cascade,
// but other references (tasks.reporter_id, comments.author_id, etc.) are
// declared NOT NULL without ON DELETE behaviour, so Postgres will return a
// 23503 foreign_key_violation when the user still has content. The handler
// turns that into a 409 so the admin can fall back to disabling.
func (s *Store) DeleteUser(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, id)
	return err
}

// SearchUsers returns active users whose display name or email contains q
// (case-insensitive), excluding any user in exclude. Used by the team
// "add existing member" picker. Capped at a small limit to keep responses
// compact and discourage mass user enumeration.
func (s *Store) SearchUsers(ctx context.Context, q string, exclude []uuid.UUID, limit int) ([]domain.User, error) {
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	if exclude == nil {
		// pgx serializes a nil slice as NULL, which poisons the
		// `NOT (id = ANY(NULL))` check (NULL -> everything filtered out).
		// Guarantee a non-nil empty slice so the filter is a no-op.
		exclude = []uuid.UUID{}
	}
	q = strings.TrimSpace(q)
	rows, err := s.Pool.Query(ctx,
		`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
		 FROM users
		 WHERE disabled_at IS NULL
		   AND ($1 = '' OR display_name ILIKE '%' || $1 || '%' OR email ILIKE '%' || $1 || '%')
		   AND NOT (id = ANY($2::uuid[]))
		 ORDER BY display_name
		 LIMIT $3`,
		q, exclude, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, u)
	}
	return out, rows.Err()
}

// ListUserMemberships returns every team this user belongs to, with their
// role. Used by the admin "manage teams" drawer so admins can see and edit
// a user's team assignments in one place.
func (s *Store) ListUserMemberships(ctx context.Context, userID uuid.UUID) ([]UserMembership, error) {
	rows, err := s.Pool.Query(ctx,
		`SELECT t.id, t.name, t.slug, m.role
		 FROM team_memberships m JOIN teams t ON t.id = m.team_id
		 WHERE m.user_id = $1 ORDER BY t.name`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []UserMembership
	for rows.Next() {
		var um UserMembership
		var r string
		if err := rows.Scan(&um.TeamID, &um.TeamName, &um.TeamSlug, &r); err != nil {
			return nil, err
		}
		um.Role = domain.Role(r)
		out = append(out, um)
	}
	return out, rows.Err()
}

// UserMembership is a flat projection of a user's team row for the admin
// UI. Kept out of the domain package because it's specific to one admin
// view; everywhere else we already return domain.Member or domain.Team.
type UserMembership struct {
	TeamID   uuid.UUID   `json:"team_id"`
	TeamName string      `json:"team_name"`
	TeamSlug string      `json:"team_slug"`
	Role     domain.Role `json:"role"`
}

// GetUserByOIDCSubject returns the user mapped to an OIDC subject, if any.
func (s *Store) GetUserByOIDCSubject(ctx context.Context, subject string) (domain.User, error) {
	var u domain.User
	err := s.Pool.QueryRow(ctx,
		`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
		 FROM users WHERE oidc_subject = $1`, subject).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return u, ErrNotFound
	}
	return u, err
}

// UpsertOIDCUser creates or updates a user identified by OIDC subject.
// If a user with the same email already exists, it links the subject to them.
// isSystemAdmin is applied on every call so group membership stays authoritative.
func (s *Store) UpsertOIDCUser(ctx context.Context, subject, email, displayName string, isSystemAdmin bool) (domain.User, error) {
	var u domain.User
	email = strings.ToLower(strings.TrimSpace(email))
	err := s.WithTx(ctx, func(tx pgx.Tx) error {
		// 1) subject already linked?
		err := tx.QueryRow(ctx,
			`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
			 FROM users WHERE oidc_subject = $1`, subject).
			Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt)
		if err == nil {
			_, err = tx.Exec(ctx,
				`UPDATE users SET email = $2, display_name = $3, is_system_admin = $4 WHERE id = $1`,
				u.ID, email, displayName, isSystemAdmin)
			if err != nil {
				return err
			}
			u.Email = email
			u.DisplayName = displayName
			u.IsSystemAdmin = isSystemAdmin
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		// 2) link by email if present
		err = tx.QueryRow(ctx,
			`SELECT id, email, display_name, is_system_admin, disabled_at, created_at
			 FROM users WHERE email = $1`, email).
			Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsSystemAdmin, &u.DisabledAt, &u.CreatedAt)
		if err == nil {
			_, err = tx.Exec(ctx,
				`UPDATE users SET oidc_subject = $2, display_name = $3, is_system_admin = $4 WHERE id = $1`,
				u.ID, subject, displayName, isSystemAdmin)
			if err != nil {
				return err
			}
			u.DisplayName = displayName
			u.IsSystemAdmin = isSystemAdmin
			return nil
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		// 3) create fresh user
		u = domain.User{
			ID:            uuid.Must(uuid.NewV7()),
			Email:         email,
			DisplayName:   displayName,
			IsSystemAdmin: isSystemAdmin,
			CreatedAt:     time.Now().UTC(),
		}
		_, err = tx.Exec(ctx,
			`INSERT INTO users (id, email, display_name, is_system_admin, oidc_subject, created_at)
			 VALUES ($1,$2,$3,$4,$5, now())`,
			u.ID, u.Email, u.DisplayName, u.IsSystemAdmin, subject)
		return err
	})
	return u, err
}

// Sessions

func (s *Store) CreateSession(ctx context.Context, sess domain.Session) error {
	_, err := s.Pool.Exec(ctx,
		`INSERT INTO sessions (id, user_id, expires_at) VALUES ($1,$2,$3)`,
		sess.ID, sess.UserID, sess.ExpiresAt)
	return err
}

func (s *Store) GetSession(ctx context.Context, id uuid.UUID) (domain.Session, error) {
	var sess domain.Session
	err := s.Pool.QueryRow(ctx,
		`SELECT id, user_id, expires_at FROM sessions WHERE id = $1 AND expires_at > now()`, id).
		Scan(&sess.ID, &sess.UserID, &sess.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return sess, ErrNotFound
	}
	return sess, err
}

func (s *Store) DeleteSession(ctx context.Context, id uuid.UUID) error {
	_, err := s.Pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}
