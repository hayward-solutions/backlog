package bootstrap

import (
	"context"
	"log"
	"os"
	"time"

	"github.com/google/uuid"

	"github.com/haywardsolutions/backlog/api/internal/auth"
	"github.com/haywardsolutions/backlog/api/internal/domain"
	"github.com/haywardsolutions/backlog/api/internal/store"
)

func Admin(ctx context.Context, s *store.Store) error {
	n, err := s.CountUsers(ctx)
	if err != nil {
		return err
	}
	if n > 0 {
		log.Printf("admin bootstrap skipped: users already exist")
		return nil
	}
	email := os.Getenv("ADMIN_EMAIL")
	pw := os.Getenv("ADMIN_PASSWORD")
	name := os.Getenv("ADMIN_DISPLAY_NAME")
	if name == "" {
		name = "Admin"
	}
	if email == "" || pw == "" {
		log.Printf("admin bootstrap skipped: ADMIN_EMAIL / ADMIN_PASSWORD not set")
		return nil
	}
	hash, err := auth.HashPassword(pw)
	if err != nil {
		return err
	}
	u := domain.User{
		ID:            uuid.Must(uuid.NewV7()),
		Email:         email,
		DisplayName:   name,
		IsSystemAdmin: true,
		CreatedAt:     time.Now().UTC(),
	}
	if err := s.CreateUser(ctx, u, hash); err != nil {
		return err
	}
	log.Printf("admin bootstrapped: %s (%s)", u.Email, u.ID)
	return nil
}
