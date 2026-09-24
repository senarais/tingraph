package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"tingraph/backend/internal/auth"
)

func TestRequireAdmin(t *testing.T) {
	called := false
	handler := RequireAdmin(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		called = true
		w.WriteHeader(http.StatusNoContent)
	}))
	for _, test := range []struct {
		role string
		want int
	}{
		{"user", http.StatusForbidden},
		{"admin", http.StatusNoContent},
	} {
		called = false
		req := httptest.NewRequest(http.MethodGet, "/api/v1/admin/overview", nil)
		req = req.WithContext(context.WithValue(req.Context(), sessionKey{}, auth.Session{
			User: auth.User{Role: test.role},
		}))
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, req)
		if response.Code != test.want || called != (test.role == "admin") {
			t.Fatalf("role %s: status %d, handler called %t", test.role, response.Code, called)
		}
	}
}
