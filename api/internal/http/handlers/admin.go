package handlers

import (
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"

	"github.com/haywardsolutions/backlog/api/internal/auth"
	"github.com/haywardsolutions/backlog/api/internal/domain"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

// pgForeignKeyViolation is the SQLSTATE for a foreign_key_violation. We
// surface this distinct error so "delete user who still has tasks/comments"
// becomes a 409 with a useful hint rather than an opaque 500.
const pgForeignKeyViolation = "23503"

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == pgForeignKeyViolation
}

type AdminHandler struct {
	Store *store.Store
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Store.ListUsers(r.Context())
	if err != nil {
		internalErr(w, r, err, "failed to list users")
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func (h *AdminHandler) CreateUser(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email         string `json:"email"`
		Password      string `json:"password"`
		DisplayName   string `json:"display_name"`
		IsSystemAdmin bool   `json:"is_system_admin"`
	}
	if err := readJSON(r, &body); err != nil || body.Email == "" || body.Password == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if err := auth.ValidatePassword(body.Password); err != nil {
		httpErr(w, http.StatusBadRequest, err.Error())
		return
	}
	hash, err := auth.HashPassword(body.Password)
	if err != nil {
		httpErr(w, http.StatusBadRequest, err.Error())
		return
	}
	u := domain.User{
		ID:            uuid.Must(uuid.NewV7()),
		Email:         strings.ToLower(body.Email),
		DisplayName:   body.DisplayName,
		IsSystemAdmin: body.IsSystemAdmin,
		CreatedAt:     time.Now().UTC(),
	}
	if err := h.Store.CreateUser(r.Context(), u, hash); err != nil {
		internalErr(w, r, err, "failed to create user")
		return
	}
	if actor, ok := mw.UserFrom(r.Context()); ok {
		log.Printf("audit admin.create_user actor=%s target=%s admin=%t", actor.ID, u.ID, u.IsSystemAdmin)
	}
	writeJSON(w, http.StatusCreated, u)
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id, err := urlUUID(r, "userID")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	var body struct {
		Disabled      *bool   `json:"disabled,omitempty"`
		Password      *string `json:"password,omitempty"`
		Email         *string `json:"email,omitempty"`
		DisplayName   *string `json:"display_name,omitempty"`
		IsSystemAdmin *bool   `json:"is_system_admin,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Email != nil {
		lower := strings.ToLower(strings.TrimSpace(*body.Email))
		body.Email = &lower
	}
	// Last-admin protection: reject any change that would drop the last
	// active system admin (is_system_admin=false or disabled=true applied
	// to the only remaining admin).
	target, err := h.Store.GetUser(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	demotingAdmin := body.IsSystemAdmin != nil && !*body.IsSystemAdmin && target.IsSystemAdmin
	disablingAdmin := body.Disabled != nil && *body.Disabled && target.IsSystemAdmin && target.DisabledAt == nil
	if demotingAdmin || disablingAdmin {
		n, err := h.Store.CountActiveSystemAdmins(r.Context())
		if err != nil {
			internalErr(w, r, err, "failed to check admin count")
			return
		}
		if n <= 1 {
			httpErr(w, http.StatusConflict, "cannot remove the last active system administrator")
			return
		}
	}

	if body.Email != nil || body.DisplayName != nil || body.IsSystemAdmin != nil {
		if err := h.Store.UpdateUserProfile(r.Context(), id, body.Email, body.DisplayName, body.IsSystemAdmin); err != nil {
			internalErr(w, r, err, "failed to update user profile")
			return
		}
	}
	if body.Disabled != nil {
		if err := h.Store.SetUserDisabled(r.Context(), id, *body.Disabled); err != nil {
			internalErr(w, r, err, "failed to update user status")
			return
		}
	}
	if body.Password != nil {
		if err := auth.ValidatePassword(*body.Password); err != nil {
			httpErr(w, http.StatusBadRequest, err.Error())
			return
		}
		hash, err := auth.HashPassword(*body.Password)
		if err != nil {
			httpErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := h.Store.SetUserPassword(r.Context(), id, hash); err != nil {
			internalErr(w, r, err, "failed to set password")
			return
		}
	}
	u, err := h.Store.GetUser(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if actor, ok := mw.UserFrom(r.Context()); ok {
		log.Printf("audit admin.update_user actor=%s target=%s fields_email=%t fields_display=%t fields_admin=%t fields_disabled=%t fields_password=%t",
			actor.ID, id,
			body.Email != nil, body.DisplayName != nil, body.IsSystemAdmin != nil,
			body.Disabled != nil, body.Password != nil)
	}
	writeJSON(w, http.StatusOK, u)
}

// DeleteUser hard-deletes a user. Sessions and team memberships cascade; any
// remaining reference (tasks they reported, comments they wrote, attachments
// they uploaded, etc.) produces a FK violation, which we surface as 409 with
// a "disable instead" hint. Rejects self-delete and the last active system
// admin to prevent instance lockout.
func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id, err := urlUUID(r, "userID")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	actor, _ := mw.UserFrom(r.Context())
	if actor.ID == id {
		httpErr(w, http.StatusConflict, "cannot delete your own account")
		return
	}
	target, err := h.Store.GetUser(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	if target.IsSystemAdmin && target.DisabledAt == nil {
		n, err := h.Store.CountActiveSystemAdmins(r.Context())
		if err != nil {
			internalErr(w, r, err, "failed to check admin count")
			return
		}
		if n <= 1 {
			httpErr(w, http.StatusConflict, "cannot remove the last active system administrator")
			return
		}
	}
	if err := h.Store.DeleteUser(r.Context(), id); err != nil {
		if isForeignKeyViolation(err) {
			httpErr(w, http.StatusConflict,
				"user has tasks, comments, or other content on the server; disable them instead")
			return
		}
		internalErr(w, r, err, "failed to delete user")
		return
	}
	log.Printf("audit admin.delete_user actor=%s target=%s", actor.ID, id)
	w.WriteHeader(http.StatusNoContent)
}

// ListUserMemberships returns every team the target user belongs to. Used by
// the admin "manage teams" drawer so admins can review and edit team
// assignments without visiting each team's settings page.
func (h *AdminHandler) ListUserMemberships(w http.ResponseWriter, r *http.Request) {
	id, err := urlUUID(r, "userID")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	ms, err := h.Store.ListUserMemberships(r.Context(), id)
	if err != nil {
		internalErr(w, r, err, "failed to list memberships")
		return
	}
	if ms == nil {
		ms = []store.UserMembership{}
	}
	writeJSON(w, http.StatusOK, ms)
}

func (h *AdminHandler) CreateTeam(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name    string    `json:"name"`
		Slug    string    `json:"slug"`
		OwnerID uuid.UUID `json:"owner_id"`
	}
	if err := readJSON(r, &body); err != nil || body.Name == "" || body.Slug == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	t := domain.Team{
		ID:        uuid.Must(uuid.NewV7()),
		Name:      body.Name,
		Slug:      body.Slug,
		CreatedAt: time.Now().UTC(),
	}
	if err := h.Store.CreateTeam(r.Context(), t); err != nil {
		internalErr(w, r, err, "failed to create team")
		return
	}
	ownerID := body.OwnerID
	if ownerID == uuid.Nil {
		if u, ok := mw.UserFrom(r.Context()); ok {
			ownerID = u.ID
		}
	}
	if ownerID != uuid.Nil {
		if err := h.Store.AddMember(r.Context(), t.ID, ownerID, domain.RoleOwner); err != nil {
			internalErr(w, r, err, "failed to add owner")
			return
		}
	}
	writeJSON(w, http.StatusCreated, t)
}
