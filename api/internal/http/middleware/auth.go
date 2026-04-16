package middleware

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

// CookieSecure controls whether session/auxiliary cookies include the Secure
// attribute. Set at startup from COOKIE_SECURE env var. Always enable in
// production so session cookies are never sent over plaintext HTTP.
var CookieSecure = false

// NewSessionCookie returns a consistent session cookie template. All auth
// flows (password login, OIDC, logout) must use this so hardening lands in
// one place.
func NewSessionCookie(value string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookie,
		Value:    value,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		Secure:   CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}

// ClearSessionCookie returns an expiring cookie that removes the session.
func ClearSessionCookie() *http.Cookie {
	return &http.Cookie{
		Name:     SessionCookie,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}

type ctxKey int

const (
	ctxUser ctxKey = iota
	ctxSessionID
	ctxTeamRole
)

const SessionCookie = "sid"

func UserFrom(ctx context.Context) (domain.User, bool) {
	u, ok := ctx.Value(ctxUser).(domain.User)
	return u, ok
}

func SessionIDFrom(ctx context.Context) (uuid.UUID, bool) {
	id, ok := ctx.Value(ctxSessionID).(uuid.UUID)
	return id, ok
}

func TeamRoleFrom(ctx context.Context) (domain.Role, bool) {
	r, ok := ctx.Value(ctxTeamRole).(domain.Role)
	return r, ok
}

// OptionalAuth attaches the caller's user/session to the context when a
// valid session cookie is present, but does NOT 401 when it isn't. Used
// by endpoints that need to distinguish "signed-in visitor" from
// "anonymous submitter" (e.g. service-desk public forms that should
// record the user id when available).
func OptionalAuth(s *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(SessionCookie)
			if err == nil {
				if sid, err := uuid.Parse(c.Value); err == nil {
					if sess, err := s.GetSession(r.Context(), sid); err == nil {
						if u, err := s.GetUser(r.Context(), sess.UserID); err == nil && u.DisabledAt == nil {
							ctx := context.WithValue(r.Context(), ctxUser, u)
							ctx = context.WithValue(ctx, ctxSessionID, sid)
							next.ServeHTTP(w, r.WithContext(ctx))
							return
						}
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequireAuth(s *store.Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			c, err := r.Cookie(SessionCookie)
			if err != nil {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}
			sid, err := uuid.Parse(c.Value)
			if err != nil {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}
			sess, err := s.GetSession(r.Context(), sid)
			if err != nil {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}
			u, err := s.GetUser(r.Context(), sess.UserID)
			if err != nil || u.DisabledAt != nil {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), ctxUser, u)
			ctx = context.WithValue(ctx, ctxSessionID, sid)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, ok := UserFrom(r.Context())
		if !ok || !u.IsSystemAdmin {
			http.Error(w, "forbidden", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ResolveTeamRole loads the caller's role for a team and attaches it.
// System admins get RoleOwner implicitly.
func ResolveTeamRole(s *store.Store, teamIDResolver func(*http.Request) (uuid.UUID, error)) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, ok := UserFrom(r.Context())
			if !ok {
				http.Error(w, "unauthenticated", http.StatusUnauthorized)
				return
			}
			teamID, err := teamIDResolver(r)
			if err != nil {
				http.Error(w, "invalid team", http.StatusBadRequest)
				return
			}
			var role domain.Role
			if u.IsSystemAdmin {
				role = domain.RoleOwner
			} else {
				r2, err := s.GetMembership(r.Context(), teamID, u.ID)
				if err != nil {
					if errors.Is(err, store.ErrNotFound) {
						http.Error(w, "forbidden", http.StatusForbidden)
					} else {
						http.Error(w, "server error", http.StatusInternalServerError)
					}
					return
				}
				role = r2
			}
			ctx := context.WithValue(r.Context(), ctxTeamRole, role)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequirePerm(p domain.Permission) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u, _ := UserFrom(r.Context())
			if u.IsSystemAdmin {
				next.ServeHTTP(w, r)
				return
			}
			role, ok := TeamRoleFrom(r.Context())
			if !ok || !domain.Allows(role, p) {
				http.Error(w, "forbidden", http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
