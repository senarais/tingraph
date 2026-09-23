package middleware

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/httpx"
)

type sessionKey struct{}

func Security(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func Origin(publicOrigin *url.URL, next http.Handler) http.Handler {
	expected := canonicalOrigin(publicOrigin)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		webhook := r.Method == http.MethodPost && (r.URL.Path == "/api/v1/billing/webhook/midtrans" || r.URL.Path == "/api/v1/billing/webhook/paypal")
		if !webhook && (r.Method == http.MethodPost || r.Method == http.MethodPut || r.Method == http.MethodPatch || r.Method == http.MethodDelete) {
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

func Recover(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if cause := recover(); cause != nil {
				logger.Error("request panic", "method", r.Method, "path", r.URL.Path, "cause", cause, "stack", string(debug.Stack()))
				httpx.Problem(w, http.StatusInternalServerError, "internal server error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func RequireSession(service *auth.Service, logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		session, err := service.Authenticate(r.Context(), service.CookieToken(r))
		if err != nil {
			if !errors.Is(err, auth.ErrUnauthenticated) {
				logger.Error("session lookup failed", "error", err)
			}
			httpx.Problem(w, http.StatusUnauthorized, "sign in required")
			return
		}
		if r.Method != http.MethodGet && r.Method != http.MethodHead && !service.CheckCSRF(session, r.Header.Get("X-CSRF-Token")) {
			httpx.Problem(w, http.StatusForbidden, "invalid CSRF token")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), sessionKey{}, session)))
	})
}

func CurrentSession(r *http.Request) auth.Session {
	return r.Context().Value(sessionKey{}).(auth.Session)
}

func canonicalOrigin(value *url.URL) string {
	if value == nil {
		return ""
	}
	return strings.ToLower(value.Scheme) + "://" + strings.ToLower(value.Host)
}
