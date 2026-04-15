package handlers

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/oauth2"

	"github.com/haywardsolutions/backlog/api/internal/auth"
	"github.com/haywardsolutions/backlog/api/internal/domain"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

const (
	oidcStateCookie = "oidc_state"
	oidcNonceCookie = "oidc_nonce"
	oidcNextCookie  = "oidc_next"
)

// OIDCHandler serves OIDC login/callback if configured; endpoints respond 404
// when OIDC is disabled.
type OIDCHandler struct {
	Store     *store.Store
	Config    *auth.OIDCConfig // may be nil
	PublicURL string           // frontend base URL (for redirect after login)
}

// Config returns whether OIDC is enabled and metadata for the frontend.
func (h *OIDCHandler) ConfigInfo(w http.ResponseWriter, r *http.Request) {
	if h.Config == nil {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":       true,
		"provider_name": h.Config.ProviderName,
	})
}

// Login starts the OIDC authorization-code flow.
func (h *OIDCHandler) Login(w http.ResponseWriter, r *http.Request) {
	if h.Config == nil {
		http.NotFound(w, r)
		return
	}
	state := randString(24)
	nonce := randString(24)
	next := r.URL.Query().Get("next")

	setShortCookie(w, oidcStateCookie, state)
	setShortCookie(w, oidcNonceCookie, nonce)
	if next != "" && strings.HasPrefix(next, "/") {
		setShortCookie(w, oidcNextCookie, next)
	}

	authURL := h.Config.OAuth2.AuthCodeURL(state, oauth2.AccessTypeOnline, oidcNonceParam(nonce))
	http.Redirect(w, r, authURL, http.StatusFound)
}

// Callback completes the OIDC flow: verifies the id_token, upserts the user,
// applies admin group mapping, and creates a session cookie.
func (h *OIDCHandler) Callback(w http.ResponseWriter, r *http.Request) {
	if h.Config == nil {
		http.NotFound(w, r)
		return
	}
	ctx := r.Context()

	// Verify state
	sc, err := r.Cookie(oidcStateCookie)
	if err != nil || sc.Value == "" || sc.Value != r.URL.Query().Get("state") {
		h.fail(w, r, "invalid state")
		return
	}
	clearCookie(w, oidcStateCookie)

	nc, err := r.Cookie(oidcNonceCookie)
	if err != nil || nc.Value == "" {
		h.fail(w, r, "missing nonce")
		return
	}
	clearCookie(w, oidcNonceCookie)

	code := r.URL.Query().Get("code")
	if code == "" {
		h.fail(w, r, "missing code")
		return
	}

	token, err := h.Config.OAuth2.Exchange(ctx, code)
	if err != nil {
		h.fail(w, r, "token exchange failed")
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		h.fail(w, r, "id_token missing")
		return
	}
	idToken, err := h.Config.Verifier.Verify(ctx, rawIDToken)
	if err != nil {
		h.fail(w, r, "id_token invalid")
		return
	}
	if idToken.Nonce != nc.Value {
		h.fail(w, r, "nonce mismatch")
		return
	}

	// Extract claims as a loose map so any claim name is addressable.
	var claims map[string]any
	if err := idToken.Claims(&claims); err != nil {
		h.fail(w, r, "claims parse failed")
		return
	}

	email := strings.TrimSpace(asString(claims[h.Config.EmailClaim]))
	if email == "" {
		// fall back to userinfo
		if ui, err := h.Config.Provider.UserInfo(ctx, oauth2.StaticTokenSource(token)); err == nil {
			var uiClaims map[string]any
			_ = ui.Claims(&uiClaims)
			email = strings.TrimSpace(asString(uiClaims[h.Config.EmailClaim]))
			if email == "" {
				email = strings.TrimSpace(ui.Email)
			}
			// merge groups claim if absent
			if _, ok := claims[h.Config.GroupsClaim]; !ok {
				if g, ok2 := uiClaims[h.Config.GroupsClaim]; ok2 {
					claims[h.Config.GroupsClaim] = g
				}
			}
		}
	}
	if email == "" {
		h.fail(w, r, "email claim missing")
		return
	}
	displayName := strings.TrimSpace(asString(claims[h.Config.NameClaim]))
	if displayName == "" {
		displayName = email
	}

	groups := auth.GroupsFrom(claims[h.Config.GroupsClaim])
	isAdmin := auth.HasGroup(groups, h.Config.AdminGroup)

	u, err := h.Store.UpsertOIDCUser(ctx, idToken.Subject, email, displayName, isAdmin)
	if err != nil {
		h.fail(w, r, "user provisioning failed")
		return
	}
	if u.DisabledAt != nil {
		h.fail(w, r, "account disabled")
		return
	}

	sess := domain.Session{
		ID:        uuid.Must(uuid.NewV7()),
		UserID:    u.ID,
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour).UTC(),
	}
	if err := h.Store.CreateSession(ctx, sess); err != nil {
		h.fail(w, r, "session create failed")
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

	next := "/teams"
	if nextC, err := r.Cookie(oidcNextCookie); err == nil && strings.HasPrefix(nextC.Value, "/") {
		next = nextC.Value
	}
	clearCookie(w, oidcNextCookie)

	http.Redirect(w, r, h.PublicURL+next, http.StatusFound)
}

func (h *OIDCHandler) fail(w http.ResponseWriter, r *http.Request, reason string) {
	target := h.PublicURL + "/login?error=" + url.QueryEscape(reason)
	http.Redirect(w, r, target, http.StatusFound)
}

func setShortCookie(w http.ResponseWriter, name, value string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})
}

func randString(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func oidcNonceParam(nonce string) oauth2.AuthCodeOption {
	return oauth2.SetAuthURLParam("nonce", nonce)
}

func asString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case json.Number:
		return t.String()
	}
	return ""
}
