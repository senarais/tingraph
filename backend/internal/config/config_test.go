package config

import "testing"

func TestLoadRejectsUnknownEnvironment(t *testing.T) {
	t.Setenv("APP_ENV", "prodution")
	if _, err := Load(); err == nil {
		t.Fatal("unknown APP_ENV was accepted")
	}
}

func TestProductionRejectsTestPayments(t *testing.T) {
	for _, key := range []string{
		"DATABASE_URL_FILE", "RATE_LIMIT_SECRET_FILE", "PAYPAL_CLIENT_SECRET_FILE",
		"MIDTRANS_SERVER_KEY_FILE",
	} {
		t.Setenv(key, "")
	}
	t.Setenv("APP_ENV", "production")
	t.Setenv("APP_ORIGIN", "https://tingraph.example")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("RATE_LIMIT_SECRET", "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
	t.Setenv("SMTP_HOST", "smtp.example")
	t.Setenv("SMTP_FROM", "hello@tingraph.example")
	t.Setenv("PAYPAL_CLIENT_ID", "sandbox-id")
	t.Setenv("PAYPAL_CLIENT_SECRET", "sandbox-secret")
	t.Setenv("PAYPAL_WEBHOOK_ID", "webhook-id")
	t.Setenv("PAYPAL_MODE", "sandbox")
	if _, err := Load(); err == nil {
		t.Fatal("sandbox PayPal checkout was allowed in production")
	}
	t.Setenv("PAYPAL_MODE", "live")
	t.Setenv("MIDTRANS_SERVER_KEY", "sandbox-key")
	t.Setenv("MIDTRANS_MODE", "sandbox")
	if _, err := Load(); err == nil {
		t.Fatal("sandbox Midtrans checkout was allowed in production")
	}
	t.Setenv("APP_ENV", "development")
	t.Setenv("MIDTRANS_MODE", "production")
	if _, err := Load(); err == nil {
		t.Fatal("production Midtrans checkout was allowed in development")
	}
}
