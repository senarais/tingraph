package handler

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestRegisterRejectsMissingOrOutdatedConsent(t *testing.T) {
	for _, body := range []string{`{}`, `{"legal_consent":{"accepted":false,"version":"2026-09-30"}}`, `{"legal_consent":{"accepted":true,"version":"2020-01-01"}}`} {
		request := httptest.NewRequest(http.MethodPost, "/api/v1/auth/register", strings.NewReader(body))
		response := httptest.NewRecorder()
		server := Handler{}
		server.Register(response, request)
		if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "agree to the current Terms") {
			t.Fatalf("unaccepted registration: %d %s", response.Code, response.Body.String())
		}
	}
}

func TestGoogleSignupRejectsMissingConsent(t *testing.T) {
	request := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/start?mode=signup&next=%2Feditor%3Ftype%3Derd", nil)
	response := httptest.NewRecorder()
	server := Handler{}
	server.GoogleStart(response, request)
	location, err := url.Parse(response.Header().Get("Location"))
	if err != nil || response.Code != http.StatusFound {
		t.Fatalf("invalid consent redirect: %d %v", response.Code, err)
	}
	query := location.Query()
	if location.Path != "/login" || query.Get("error") != "consent" || query.Get("mode") != "signup" || query.Get("next") != "/editor?type=erd" {
		t.Fatalf("wrong signup agreement redirect: %s", location)
	}
}
