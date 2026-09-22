package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"tingraph/backend/internal/config"
	"tingraph/backend/internal/database"
)

func main() {
	log.SetFlags(0)
	sourceURL, err := secret("LEGACY_DATABASE_URL")
	if err != nil || sourceURL == "" {
		log.Fatal("LEGACY_DATABASE_URL or LEGACY_DATABASE_URL_FILE is required")
	}
	targetURL, err := config.MigrationDatabaseURL()
	if err != nil || targetURL == "" {
		log.Fatal("MIGRATIONS_DATABASE_URL or DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	result, err := database.ImportLegacy(ctx, sourceURL, targetURL)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf(
		"legacy import complete: users=%d google_accounts=%d diagrams=%d usage_rows=%d skipped_avatars=%d",
		result.Users, result.GoogleAccounts, result.Diagrams, result.UsageRows, result.SkippedAvatars,
	)
	log.Print("email accounts must use forgot password before their first sign-in")
}

func secret(name string) (string, error) {
	if path := strings.TrimSpace(os.Getenv(name + "_FILE")); path != "" {
		contents, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read %s_FILE: %w", name, err)
		}
		return strings.TrimSpace(string(contents)), nil
	}
	return strings.TrimSpace(os.Getenv(name)), nil
}
