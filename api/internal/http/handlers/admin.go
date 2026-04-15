package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/auth"
	"github.com/haywardsolutions/backlog/api/internal/domain"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type AdminHandler struct {
	Store *store.Store
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.Store.ListUsers(r.Context())
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
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
		httpErr(w, http.StatusBadRequest, err.Error())
		return
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
	if body.Email != nil || body.DisplayName != nil || body.IsSystemAdmin != nil {
		if err := h.Store.UpdateUserProfile(r.Context(), id, body.Email, body.DisplayName, body.IsSystemAdmin); err != nil {
			httpErr(w, http.StatusBadRequest, err.Error())
			return
		}
	}
	if body.Disabled != nil {
		if err := h.Store.SetUserDisabled(r.Context(), id, *body.Disabled); err != nil {
			httpErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	if body.Password != nil {
		hash, err := auth.HashPassword(*body.Password)
		if err != nil {
			httpErr(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := h.Store.SetUserPassword(r.Context(), id, hash); err != nil {
			httpErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	u, err := h.Store.GetUser(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, u)
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
		httpErr(w, http.StatusBadRequest, err.Error())
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
			httpErr(w, http.StatusInternalServerError, err.Error())
			return
		}
	}
	writeJSON(w, http.StatusCreated, t)
}
