package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"tingraph/backend/internal/config"
	"tingraph/backend/internal/database"
)

func main() {
	log.SetFlags(0)
	databaseURL, err := config.MigrationDatabaseURL()
	if err != nil || databaseURL == "" {
		log.Fatal("MIGRATIONS_DATABASE_URL or DATABASE_URL is required")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := database.Migrate(ctx, databaseURL); err != nil {
		log.Fatal(err)
	}
	log.Print("database migrations are current")
}
