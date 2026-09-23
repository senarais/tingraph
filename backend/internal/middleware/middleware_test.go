package middleware

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestOriginAllowsOnlyWebhookPOSTWithoutBrowserOrigin(t *testing.T) {
	origin, err := url.Parse("https://tingraph.example")
	if err != nil {
		t.Fatal(err)
	}
	wrapped := Origin(origin, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	for _, test := range []struct {
		path   string
		status int
	}{
		{"/api/v1/billing/webhook/midtrans", http.StatusNoContent},
		{"/api/v1/billing/webhook/paypal", http.StatusNoContent},
		{"/api/v1/billing/checkout", http.StatusForbidden},
	} {
		r := httptest.NewRequest(http.MethodPost, test.path, nil)
		w := httptest.NewRecorder()
		wrapped.ServeHTTP(w, r)
		if w.Code != test.status {
			t.Errorf("%s: status %d, want %d", test.path, w.Code, test.status)
		}
	}
}
