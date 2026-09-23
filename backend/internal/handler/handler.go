package handler

import (
	"context"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/ai"
	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/config"
	"tingraph/backend/internal/httpx"
	"tingraph/backend/internal/middleware"
)

type Handler struct {
	cfg       config.Config
	db        *pgxpool.Pool
	auth      *auth.Service
	aiService *ai.Service
	aiSlots   chan struct{}
	log       *slog.Logger
}

func New(cfg config.Config, db *pgxpool.Pool, authService *auth.Service, aiService *ai.Service, logger *slog.Logger) *Handler {
	return &Handler{cfg: cfg, db: db, auth: authService, aiService: aiService, aiSlots: make(chan struct{}, 2), log: logger}
}

func (server *Handler) Live(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Handler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()
	if err := server.db.Ping(ctx); err != nil {
		httpx.Problem(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func currentSession(r *http.Request) auth.Session {
	return middleware.CurrentSession(r)
}

func (server *Handler) clientIP(r *http.Request) string {
	if server.cfg.TrustProxy {
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			candidate := strings.TrimSpace(strings.Split(forwarded, ",")[0])
			if net.ParseIP(candidate) != nil {
				return candidate
			}
		}
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

func (server *Handler) limited(ctx context.Context, scope, key string, limit int, window time.Duration) bool {
	allowed, err := server.auth.Allow(ctx, scope, key, limit, window)
	if err != nil {
		server.log.Error("rate limit failed closed", "scope", scope, "error", err)
		return true
	}
	return !allowed
}
