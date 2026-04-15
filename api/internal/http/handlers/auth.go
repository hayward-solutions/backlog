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

type AuthHandler struct {
	Store *store.Store
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	u, hash, err := h.Store.GetUserByEmail(r.Context(), body.Email)
	if err != nil {
		httpErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if u.DisabledAt != nil {
		httpErr(w, http.StatusUnauthorized, "account disabled")
		return
	}
	ok, err := auth.VerifyPassword(body.Password, hash)
	if err != nil || !ok {
		httpErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	sess := domain.Session{
		ID:        uuid.Must(uuid.NewV7()),
		UserID:    u.ID,
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour).UTC(),
	}
	if err := h.Store.CreateSession(r.Context(), sess); err != nil {
		httpErr(w, http.StatusInternalServerError, "session create failed")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:     mw.SessionCookie,
		Value:    sess.ID.String(),
		Path:     "/",
		Expires:  sess.ExpiresAt,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	writeJSON(w, http.StatusOK, u)
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	sid, ok := mw.SessionIDFrom(r.Context())
	if ok {
		_ = h.Store.DeleteSession(r.Context(), sid)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     mw.SessionCookie,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0),
		MaxAge:   -1,
		HttpOnly: true,
	})
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	u, ok := mw.UserFrom(r.Context())
	if !ok {
		httpErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	u, ok := mw.UserFrom(r.Context())
	if !ok {
		httpErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	var body struct {
		Email       *string `json:"email,omitempty"`
		DisplayName *string `json:"display_name,omitempty"`
	}
	if err := readJSON(r, &body); err != nil {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	if body.Email != nil {
		lower := strings.ToLower(strings.TrimSpace(*body.Email))
		body.Email = &lower
	}
	if err := h.Store.UpdateUserProfile(r.Context(), u.ID, body.Email, body.DisplayName, nil); err != nil {
		httpErr(w, http.StatusBadRequest, err.Error())
		return
	}
	nu, err := h.Store.GetUser(r.Context(), u.ID)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, nu)
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	u, ok := mw.UserFrom(r.Context())
	if !ok {
		httpErr(w, http.StatusUnauthorized, "unauthenticated")
		return
	}
	var body struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}
	if err := readJSON(r, &body); err != nil || body.NewPassword == "" {
		httpErr(w, http.StatusBadRequest, "bad body")
		return
	}
	_, hash, err := h.Store.GetUserByEmail(r.Context(), u.Email)
	if err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	okPw, err := auth.VerifyPassword(body.CurrentPassword, hash)
	if err != nil || !okPw {
		httpErr(w, http.StatusUnauthorized, "current password incorrect")
		return
	}
	newHash, err := auth.HashPassword(body.NewPassword)
	if err != nil {
		httpErr(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := h.Store.SetUserPassword(r.Context(), u.ID, newHash); err != nil {
		httpErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
