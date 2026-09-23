package router

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/handler"
)

func TestSetupRoutesAndOrigin(t *testing.T) {
	origin, err := url.Parse("https://tingraph.example")
	if err != nil {
		t.Fatal(err)
	}
	routes := Setup(&handler.Handler{}, &auth.Service{}, origin, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for _, test := range []struct {
		name, method, path, origin, body string
		status                           int
	}{
		{"live", http.MethodGet, "/health/live", "", "", http.StatusOK},
		{"registration input", http.MethodPost, "/api/v1/auth/register", origin.String(), "{", http.StatusBadRequest},
		{"missing origin", http.MethodPost, "/api/v1/auth/register", "", "{", http.StatusForbidden},
		{"wrong origin", http.MethodPost, "/api/v1/auth/register", "https://other.example", "{", http.StatusForbidden},
		{"protected diagram", http.MethodGet, "/api/v1/diagrams", "", "", http.StatusUnauthorized},
		{"protected AI", http.MethodPost, "/api/v1/ai", origin.String(), "", http.StatusUnauthorized},
		{"wrong method", http.MethodGet, "/api/v1/auth/register", "", "", http.StatusMethodNotAllowed},
		{"unknown path", http.MethodGet, "/unknown", "", "", http.StatusNotFound},
	} {
		t.Run(test.name, func(t *testing.T) {
			r := httptest.NewRequest(test.method, test.path, strings.NewReader(test.body))
			if test.origin != "" {
				r.Header.Set("Origin", test.origin)
			}
			w := httptest.NewRecorder()
			routes.ServeHTTP(w, r)
			if w.Code != test.status {
				t.Fatalf("status = %d, want %d: %s", w.Code, test.status, w.Body.String())
			}
			if w.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("security middleware was not applied")
			}
		})
	}
}
