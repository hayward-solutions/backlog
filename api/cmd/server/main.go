package main

import (
	"context"
	"database/sql"
	"log"
	nethttp "net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"

	"github.com/haywardsolutions/backlog/api/internal/auth"
	"github.com/haywardsolutions/backlog/api/internal/bootstrap"
	"github.com/haywardsolutions/backlog/api/internal/events"
	apphttp "github.com/haywardsolutions/backlog/api/internal/http"
	mw "github.com/haywardsolutions/backlog/api/internal/http/middleware"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

func main() {
	dsn := mustEnv("POSTGRES_DSN")
	port := envOr("API_PORT", "8080")
	migrationsDir := envOr("MIGRATIONS_DIR", "./migrations")

	// Security config. COOKIE_SECURE=true required in production so session
	// cookies never go over plaintext HTTP. APP_ORIGINS is a comma-separated
	// allowlist used by the CORS middleware — empty disables cross-origin.
	mw.CookieSecure = envBool("COOKIE_SECURE", false)
	allowedOrigins := splitAndTrim(envOr("APP_ORIGINS", ""))

	// Migrations via database/sql + pgx stdlib driver.
	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		log.Fatalf("db open: %v", err)
	}
	if err := waitForDB(sqlDB, 30*time.Second); err != nil {
		log.Fatalf("db wait: %v", err)
	}
	if err := goose.SetDialect("postgres"); err != nil {
		log.Fatalf("goose dialect: %v", err)
	}
	if err := goose.Up(sqlDB, migrationsDir); err != nil {
		log.Fatalf("migrations: %v", err)
	}
	_ = sqlDB.Close()
	log.Printf("migrations applied")

	// Runtime pool for app queries.
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		log.Fatalf("pool: %v", err)
	}
	defer pool.Close()

	s := store.New(pool)
	hub := events.NewHub()

	if err := bootstrap.Admin(context.Background(), s); err != nil {
		log.Fatalf("bootstrap: %v", err)
	}

	oidcCfg, err := auth.LoadOIDCFromEnv(context.Background())
	if err != nil {
		log.Fatalf("oidc: %v", err)
	}
	if oidcCfg != nil {
		log.Printf("oidc enabled (provider=%s, admin_group=%q, groups_claim=%q)",
			oidcCfg.ProviderName, oidcCfg.AdminGroup, oidcCfg.GroupsClaim)
	}
	publicBaseURL := envOr("PUBLIC_BASE_URL", "")

	srv := &nethttp.Server{
		Addr:              ":" + port,
		Handler:           apphttp.NewRouter(s, hub, oidcCfg, publicBaseURL, allowedOrigins),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("api listening on :%s", port)
		if err := srv.ListenAndServe(); err != nil && err != nethttp.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	log.Printf("shutting down")
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}

func waitForDB(db *sql.DB, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	var lastErr error
	for time.Now().Before(deadline) {
		if err := db.Ping(); err == nil {
			return nil
		} else {
			lastErr = err
		}
		time.Sleep(500 * time.Millisecond)
	}
	return lastErr
}

func mustEnv(k string) string {
	v := os.Getenv(k)
	if v == "" {
		log.Fatalf("env %s required", k)
	}
	return v
}

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func envBool(k string, d bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(k)))
	switch v {
	case "":
		return d
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}

func splitAndTrim(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}
