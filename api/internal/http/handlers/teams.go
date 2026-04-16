package handlers

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/domain"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

type TeamHandler struct {
	Store *store.Store
}

func ResolveTeamIDFromURL(r *http.Request) (uuid.UUID, error) {
	return uuid.Parse(chi.URLParam(r, "teamID"))
}

func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	u, _ := mw.UserFrom(r.Context())
	var (
		teams []domain.Team
		err   error
	)
	if u.IsSystemAdmin {
		teams, err = h.Store.ListAllTeams(r.Context())
	} else {
		teams, err = h.Store.ListTeamsForUser(r.Context(), u.ID)
	}
	if err != nil {
		internalErr(w, r, err, "failed to list teams")
		return
	}
	writeJSON(w, http.StatusOK, teams)
}

func (h *TeamHandler) Get(w http.ResponseWriter, r *http.Request) {
	id, err := urlUUID(r, "teamID")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad id")
		return
	}
	t, err := h.Store.GetTeam(r.Context(), id)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not found")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (h *TeamHandler) Update(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "teamID")
	var body struct {
		Name               *string `json:"name,omitempty"`
		ServiceDeskEnabled *bool   `json:"service_desk_enabled,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Name != nil && *body.Name == "" {
		httpErr(w, http.StatusBadRequest, "name must not be empty")
		return
	}
	if err := h.Store.UpdateTeam(r.Context(), id, store.TeamUpdate{
		Name:               body.Name,
		ServiceDeskEnabled: body.ServiceDeskEnabled,
	}); err != nil {
		internalErr(w, r, err, "failed to update team")
		return
	}
	t, _ := h.Store.GetTeam(r.Context(), id)
	writeJSON(w, http.StatusOK, t)
}

func (h *TeamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "teamID")
	if err := h.Store.DeleteTeam(r.Context(), id); err != nil {
		internalErr(w, r, err, "failed to delete team")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Members

func (h *TeamHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	id, _ := urlUUID(r, "teamID")
	m, err := h.Store.ListMembers(r.Context(), id)
	if err != nil {
		internalErr(w, r, err, "failed to list members")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (h *TeamHandler) UpdateMember(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	userID, err := urlUUID(r, "userID")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "bad user id")
		return
	}
	var body struct {
		Role domain.Role `json:"role"`
	}
	if err := readJSON(r, &body); err != nil || !body.Role.Valid() {
		httpErr(w, http.StatusBadRequest, "bad role")
		return
	}
	// Last-owner guard
	current, err := h.Store.GetMembership(r.Context(), teamID, userID)
	if err != nil {
		httpErr(w, http.StatusNotFound, "not a member")
		return
	}
	if current == domain.RoleOwner && body.Role != domain.RoleOwner {
		owners, _ := h.Store.CountOwners(r.Context(), teamID)
		if owners <= 1 {
			httpErr(w, http.StatusConflict, "team must have at least one owner")
			return
		}
	}
	if err := h.Store.UpdateMemberRole(r.Context(), teamID, userID, body.Role); err != nil {
		internalErr(w, r, err, "failed to update member role")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *TeamHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	userID, _ := urlUUID(r, "userID")
	current, err := h.Store.GetMembership(r.Context(), teamID, userID)
	if err != nil {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if current == domain.RoleOwner {
		owners, _ := h.Store.CountOwners(r.Context(), teamID)
		if owners <= 1 {
			httpErr(w, http.StatusConflict, "team must have at least one owner")
			return
		}
	}
	if err := h.Store.RemoveMember(r.Context(), teamID, userID); err != nil {
		internalErr(w, r, err, "failed to remove member")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// Invites

func (h *TeamHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	u, _ := mw.UserFrom(r.Context())
	var body struct {
		Email string      `json:"email"`
		Role  domain.Role `json:"role"`
	}
	if err := readJSON(r, &body); err != nil || body.Email == "" || !body.Role.Valid() {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	// generate raw token
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		httpErr(w, http.StatusInternalServerError, "rand")
		return
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	inv := domain.Invite{
		ID:        uuid.Must(uuid.NewV7()),
		TeamID:    teamID,
		Email:     strings.ToLower(body.Email),
		Role:      body.Role,
		InvitedBy: u.ID,
		ExpiresAt: time.Now().Add(7 * 24 * time.Hour).UTC(),
		CreatedAt: time.Now().UTC(),
	}
	if err := h.Store.CreateInvite(r.Context(), inv, hash); err != nil {
		internalErr(w, r, err, "failed to create invite")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"invite": inv,
		"token":  token, // raw token returned once; acceptor uses this
	})
}

func (h *TeamHandler) ListInvites(w http.ResponseWriter, r *http.Request) {
	teamID, _ := urlUUID(r, "teamID")
	inv, err := h.Store.ListInvites(r.Context(), teamID)
	if err != nil {
		internalErr(w, r, err, "failed to list invites")
		return
	}
	writeJSON(w, http.StatusOK, inv)
}

func (h *TeamHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	token := chi.URLParam(r, "token")
	sum := sha256.Sum256([]byte(token))
	hash := hex.EncodeToString(sum[:])
	inv, err := h.Store.GetInviteByTokenHash(r.Context(), hash)
	if err != nil {
		httpErr(w, http.StatusNotFound, "invalid invite")
		return
	}
	if inv.AcceptedAt != nil {
		httpErr(w, http.StatusConflict, "already accepted")
		return
	}
	if time.Now().After(inv.ExpiresAt) {
		httpErr(w, http.StatusGone, "invite expired")
		return
	}
	u, _ := mw.UserFrom(r.Context())
	// The invited email must match the authenticated user. Otherwise any
	// holder of the raw token could join as someone else's role.
	if !strings.EqualFold(strings.TrimSpace(u.Email), strings.TrimSpace(inv.Email)) {
		httpErr(w, http.StatusForbidden, "invite email mismatch")
		return
	}
	if err := h.Store.AddMember(r.Context(), inv.TeamID, u.ID, inv.Role); err != nil {
		internalErr(w, r, err, "failed to add member")
		return
	}
	if err := h.Store.AcceptInvite(r.Context(), inv.ID); err != nil {
		internalErr(w, r, err, "failed to accept invite")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"team_id": inv.TeamID, "role": inv.Role})
}
