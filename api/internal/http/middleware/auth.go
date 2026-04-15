package middleware

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

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
