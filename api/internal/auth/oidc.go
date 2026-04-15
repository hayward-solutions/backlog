package auth

import (
	"context"
	"errors"
	"fmt"
	"os"
	"strings"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// OIDCConfig holds runtime OIDC settings. Nil means OIDC is disabled.
type OIDCConfig struct {
	Provider     *oidc.Provider
	OAuth2       *oauth2.Config
	Verifier     *oidc.IDTokenVerifier
	AdminGroup   string // required group for IsSystemAdmin (empty = no auto-admin)
	GroupsClaim  string // claim name that holds groups (default "groups")
	EmailClaim   string // claim name for email (default "email")
	NameClaim    string // claim name for display name (default "name")
	RedirectURL  string
	ProviderName string // shown on the login button
}

// LoadOIDCFromEnv returns a configured OIDC client or (nil, nil) if not
// configured. Any partial configuration returns an error.
func LoadOIDCFromEnv(ctx context.Context) (*OIDCConfig, error) {
	issuer := os.Getenv("OIDC_ISSUER_URL")
	clientID := os.Getenv("OIDC_CLIENT_ID")
	clientSecret := os.Getenv("OIDC_CLIENT_SECRET")
	redirect := os.Getenv("OIDC_REDIRECT_URL")

	if issuer == "" && clientID == "" && clientSecret == "" && redirect == "" {
		return nil, nil // not configured
	}
	if issuer == "" || clientID == "" || clientSecret == "" || redirect == "" {
		return nil, errors.New("OIDC partially configured: OIDC_ISSUER_URL, OIDC_CLIENT_ID, OIDC_CLIENT_SECRET, OIDC_REDIRECT_URL are all required")
	}

	provider, err := oidc.NewProvider(ctx, issuer)
	if err != nil {
		return nil, fmt.Errorf("oidc provider discovery: %w", err)
	}

	scopesEnv := os.Getenv("OIDC_SCOPES")
	var scopes []string
	if scopesEnv == "" {
		scopes = []string{oidc.ScopeOpenID, "profile", "email", "groups"}
	} else {
		for _, s := range strings.Split(scopesEnv, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				scopes = append(scopes, s)
			}
		}
	}

	cfg := &OIDCConfig{
		Provider: provider,
		OAuth2: &oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  redirect,
			Scopes:       scopes,
		},
		Verifier:     provider.Verifier(&oidc.Config{ClientID: clientID}),
		AdminGroup:   os.Getenv("OIDC_ADMIN_GROUP"),
		GroupsClaim:  envOr("OIDC_GROUPS_CLAIM", "groups"),
		EmailClaim:   envOr("OIDC_EMAIL_CLAIM", "email"),
		NameClaim:    envOr("OIDC_NAME_CLAIM", "name"),
		RedirectURL:  redirect,
		ProviderName: envOr("OIDC_PROVIDER_NAME", "SSO"),
	}
	return cfg, nil
}

// GroupsFrom extracts a list of group strings from a raw claim value.
// The claim may be a []string, []any of strings, or a single string.
func GroupsFrom(v any) []string {
	switch t := v.(type) {
	case []string:
		return t
	case []any:
		out := make([]string, 0, len(t))
		for _, e := range t {
			if s, ok := e.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case string:
		if t == "" {
			return nil
		}
		return []string{t}
	}
	return nil
}

// HasGroup reports whether the supplied group list contains target.
func HasGroup(groups []string, target string) bool {
	if target == "" {
		return false
	}
	for _, g := range groups {
		if g == target {
			return true
		}
	}
	return false
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}
