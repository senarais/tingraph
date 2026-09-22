package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"tingraph/backend/internal/ai"
	"tingraph/backend/internal/api"
	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/config"
	"tingraph/backend/internal/database"
	mailworker "tingraph/backend/internal/mail"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)
	cfg, err := config.Load()
	if err != nil {
		logger.Error("configuration is invalid", "error", err)
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database startup failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	if err := os.MkdirAll(filepath.Join(cfg.UploadsDir, "avatars"), 0o750); err != nil {
		logger.Error("uploads directory startup failed", "error", err)
		os.Exit(1)
	}
	authService, err := auth.NewService(db, cfg)
	if err != nil {
		logger.Error("auth startup failed", "error", err)
		os.Exit(1)
	}
	googleCtx, cancelGoogle := context.WithTimeout(ctx, 10*time.Second)
	err = authService.ConfigureGoogle(googleCtx)
	cancelGoogle()
	if err != nil {
		logger.Error("Google OIDC startup failed", "error", err)
		os.Exit(1)
	}
	aiService, err := ai.New(db, cfg.GeminiAPIKey, cfg.GeminiModel)
	if err != nil {
		logger.Error("AI startup failed", "error", err)
		os.Exit(1)
	}
	go mailworker.NewWorker(db, cfg.SMTP, logger).Run(ctx)
	go database.RunCleanup(ctx, db, logger)

	httpServer := &http.Server{
		Addr:              cfg.Address,
		Handler:           api.New(cfg, db, authService, aiService, logger).Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      90 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    32 << 10,
	}
	failed := make(chan error, 1)
	go func() {
		logger.Info("API listening", "address", cfg.Address)
		failed <- httpServer.ListenAndServe()
	}()

	select {
	case err := <-failed:
		if !errors.Is(err, http.ErrServerClosed) {
			logger.Error("API server failed", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
		defer cancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			logger.Error("API shutdown failed", "error", err)
			os.Exit(1)
		}
	}
}
