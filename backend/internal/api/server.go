package api

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/ai"
	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/config"
	"tingraph/backend/internal/httpx"
)

type Server struct {
	cfg       config.Config
	db        *pgxpool.Pool
	auth      *auth.Service
	aiService *ai.Service
	aiSlots   chan struct{}
	log       *slog.Logger
}

type sessionKey struct{}

func New(cfg config.Config, db *pgxpool.Pool, authService *auth.Service, aiService *ai.Service, logger *slog.Logger) *Server {
	return &Server{cfg: cfg, db: db, auth: authService, aiService: aiService, aiSlots: make(chan struct{}, 2), log: logger}
}

func (server *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health/live", server.live)
	mux.HandleFunc("GET /health/ready", server.ready)
	mux.HandleFunc("GET /api/v1/auth/session", server.session)
	mux.HandleFunc("POST /api/v1/auth/register", server.register)
	mux.HandleFunc("POST /api/v1/auth/verify-email", server.verifyEmail)
	mux.HandleFunc("POST /api/v1/auth/login", server.login)
	mux.Handle("POST /api/v1/auth/logout", server.requireSession(http.HandlerFunc(server.logout)))
	mux.HandleFunc("POST /api/v1/auth/password/forgot", server.forgotPassword)
	mux.HandleFunc("POST /api/v1/auth/password/reset", server.resetPassword)
	mux.HandleFunc("GET /api/v1/auth/google/start", server.googleStart)
	mux.HandleFunc("GET /api/v1/auth/google/callback", server.googleCallback)
	server.registerApplicationRoutes(mux)
	return server.recover(server.security(server.origin(mux)))
}

func (server *Server) live(w http.ResponseWriter, _ *http.Request) {
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (server *Server) ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), time.Second)
	defer cancel()
	if err := server.db.Ping(ctx); err != nil {
		httpx.Problem(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func (server *Server) security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func (server *Server) origin(next http.Handler) http.Handler {
	expected := canonicalOrigin(server.cfg.PublicOrigin)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch || r.Method == http.MethodDelete {
			origin := r.Header.Get("Origin")
			parsed, err := url.Parse(origin)
			if err != nil || origin == "" || canonicalOrigin(parsed) != expected {
				httpx.Problem(w, http.StatusForbidden, "request origin is not allowed")
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (server *Server) recover(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if cause := recover(); cause != nil {
				server.log.Error("request panic", "method", r.Method, "path", r.URL.Path, "cause", cause, "stack", string(debug.Stack()))
				httpx.Problem(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func (server *Server) requireSession(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := server.auth.Authenticate(r.Context(), server.auth.CookieToken(r))
		if err != nil {
			if !errors.Is(err, auth.ErrUnauthenticated) {
				server.log.Error("session lookup failed", "error", err)
			}
			httpx.Problem(w, http.StatusUnauthorized, "sign in required")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && !server.auth.CheckCSRF(session, r.Header.Get("X-CSRF-Token")) {
			httpx.Problem(w, http.StatusForbidden, "invalid CSRF token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, session)))
	})
}

func currentSession(r *http.Request) auth.Session {
	return r.Context().Value(sessionKey{}).(auth.Session)
}

func (server *Server) clientIP(r *http.Request) string {
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

func canonicalOrigin(value *url.URL) string {
	if value == nil {
		return ""
	}
	return strings.ToLower(value.Scheme) + "://" + strings.ToLower(value.Host)
}

func (server *Server) limited(ctx context.Context, scope, key string, limit int, window time.Duration) bool {
	allowed, err := server.auth.Allow(ctx, scope, key, limit, window)
	if err != nil {
		server.log.Error("rate limit failed closed", "scope", scope, "error", err)
		return true
	}
	return !allowed
}
