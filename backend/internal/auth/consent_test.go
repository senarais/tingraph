package auth

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"
)

func TestLegalConsent(t *testing.T) {
	for _, consent := range []LegalConsent{{}, {Accepted: true}, {Version: PolicyVersion}, {Accepted: true, Version: "2020-01-01"}} {
		if !errors.Is(consent.Validate(), ErrConsentRequired) {
			t.Fatalf("invalid consent accepted: %+v", consent)
		}
		// A rejected agreement must not reach hashing, the database or account creation.
		service := Service{}
		if err := service.Register(context.Background(), "user@example.test", "long-enough-test-password", "", "/profile", consent); !errors.Is(err, ErrConsentRequired) {
			t.Fatalf("registration did not reject agreement first: %v", err)
		}
	}
	if err := (LegalConsent{Accepted: true, Version: PolicyVersion}).Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestGoogleConsent(t *testing.T) {
	service := Service{}
	_, err := service.BeginGoogle(context.Background(), httptest.NewRecorder(), "/profile", LegalConsent{Accepted: true, Version: "2020-01-01"})
	if !errors.Is(err, ErrConsentRequired) {
		t.Fatalf("outdated Google agreement was not rejected: %v", err)
	}
	for _, consent := range []LegalConsent{{}, {Accepted: true, Version: PolicyVersion}} {
		_, err := service.BeginGoogle(context.Background(), httptest.NewRecorder(), "/profile", consent)
		if err == nil || errors.Is(err, ErrConsentRequired) {
			t.Fatalf("normal sign-in or current acceptance should reach provider configuration: %v", err)
		}
	}
}
