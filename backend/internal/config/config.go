package config

import (
	"encoding/hex"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Environment       string
	Address           string
	PublicOrigin      *url.URL
	DatabaseURL       string
	UploadsDir        string
	SessionCookieName string
	CookieSecure      bool
	SessionLifetime   time.Duration
	SessionIdle       time.Duration
	RateLimitKey      []byte
	TrustProxy        bool
	GeminiAPIKey      string
	GeminiModel       string
	GoogleClientID    string
	GoogleSecret      string
	SMTP              SMTP
	Billing           Billing
}

type Billing struct {
	MidtransServerKey  string
	MidtransMode       string
	PayPalClientID     string
	PayPalClientSecret string
	PayPalWebhookID    string
	PayPalMode         string
	FXBaseURL          string
}

type SMTP struct {
	Host     string
	Port     int
	Username string
	Password string
	From     string
	TLSMode  string
}

func Load() (Config, error) {
	environment := value("APP_ENV", "development")
	if environment != "development" && environment != "production" {
		return Config{}, errors.New("APP_ENV must be development or production")
	}
	origin, err := url.Parse(required("APP_ORIGIN"))
	if err != nil || origin.Scheme == "" || origin.Host == "" || origin.Path != "" {
		return Config{}, errors.New("APP_ORIGIN must be an origin such as https://tingraph.example")
	}
	if environment == "production" && origin.Scheme != "https" {
		return Config{}, errors.New("APP_ORIGIN must use https in production")
	}

	databaseURL, err := secret("DATABASE_URL")
	if err != nil || databaseURL == "" {
		return Config{}, errors.New("DATABASE_URL or DATABASE_URL_FILE is required")
	}
	rateSecret, err := secret("RATE_LIMIT_SECRET")
	if err != nil || rateSecret == "" {
		return Config{}, errors.New("RATE_LIMIT_SECRET or RATE_LIMIT_SECRET_FILE is required")
	}
	rateKey, err := hex.DecodeString(rateSecret)
	if err != nil || len(rateKey) < 32 {
		return Config{}, errors.New("RATE_LIMIT_SECRET must be at least 32 random bytes encoded as hex")
	}

	secure := environment == "production"
	cookieName := value("SESSION_COOKIE_NAME", "tingraph_session")
	if secure {
		cookieName = value("SESSION_COOKIE_NAME", "__Host-tingraph_session")
		if !strings.HasPrefix(cookieName, "__Host-") {
			return Config{}, errors.New("production SESSION_COOKIE_NAME must start with __Host-")
		}
	}

	smtpPort, err := integer("SMTP_PORT", 587)
	if err != nil {
		return Config{}, err
	}
	smtpPassword, err := secret("SMTP_PASSWORD")
	if err != nil {
		return Config{}, err
	}
	midtransKey, err := secret("MIDTRANS_SERVER_KEY")
	if err != nil {
		return Config{}, err
	}
	payPalSecret, err := secret("PAYPAL_CLIENT_SECRET")
	if err != nil {
		return Config{}, err
	}

	cfg := Config{
		Environment:       environment,
		Address:           value("HTTP_ADDRESS", ":8080"),
		PublicOrigin:      origin,
		DatabaseURL:       databaseURL,
		UploadsDir:        value("UPLOADS_DIR", "/var/lib/tingraph/uploads"),
		SessionCookieName: cookieName,
		CookieSecure:      secure,
		SessionLifetime:   30 * 24 * time.Hour,
		SessionIdle:       7 * 24 * time.Hour,
		RateLimitKey:      rateKey,
		TrustProxy:        boolean("TRUST_PROXY", false),
		GeminiAPIKey:      "",
		GeminiModel:       value("GEMINI_MODEL", "gemini-3.5-flash-lite"),
		GoogleClientID:    value("GOOGLE_CLIENT_ID", ""),
		GoogleSecret:      "",
		SMTP: SMTP{
			Host:     value("SMTP_HOST", ""),
			Port:     smtpPort,
			Username: value("SMTP_USERNAME", ""),
			Password: smtpPassword,
			From:     value("SMTP_FROM", ""),
			TLSMode:  value("SMTP_TLS_MODE", "starttls"),
		},
		Billing: Billing{
			MidtransServerKey: midtransKey,
			MidtransMode:      value("MIDTRANS_MODE", "sandbox"),
			PayPalClientID:    value("PAYPAL_CLIENT_ID", ""), PayPalClientSecret: payPalSecret,
			PayPalWebhookID: value("PAYPAL_WEBHOOK_ID", ""),
			PayPalMode:      value("PAYPAL_MODE", "sandbox"),
			FXBaseURL:       value("FX_BASE_URL", "https://api.frankfurter.dev"),
		},
	}
	cfg.GeminiAPIKey, err = secret("GEMINI_API_KEY")
	if err != nil {
		return Config{}, err
	}
	cfg.GoogleSecret, err = secret("GOOGLE_CLIENT_SECRET")
	if err != nil {
		return Config{}, err
	}

	if environment == "production" && (cfg.SMTP.Host == "" || cfg.SMTP.From == "") {
		return Config{}, errors.New("SMTP_HOST and SMTP_FROM are required in production")
	}
	if (cfg.GoogleClientID == "") != (cfg.GoogleSecret == "") {
		return Config{}, errors.New("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together")
	}
	if cfg.SMTP.TLSMode != "starttls" && cfg.SMTP.TLSMode != "tls" && cfg.SMTP.TLSMode != "none" {
		return Config{}, errors.New("SMTP_TLS_MODE must be starttls, tls, or none")
	}
	if environment == "production" && cfg.SMTP.TLSMode == "none" {
		return Config{}, errors.New("SMTP_TLS_MODE=none is forbidden in production")
	}
	if cfg.Billing.MidtransMode != "sandbox" && cfg.Billing.MidtransMode != "production" {
		return Config{}, errors.New("MIDTRANS_MODE must be sandbox or production")
	}
	if (cfg.Billing.PayPalClientID == "") != (cfg.Billing.PayPalClientSecret == "") ||
		(cfg.Billing.PayPalClientID == "") != (cfg.Billing.PayPalWebhookID == "") {
		return Config{}, errors.New("PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_WEBHOOK_ID must be set together")
	}
	if cfg.Billing.PayPalMode != "sandbox" && cfg.Billing.PayPalMode != "live" {
		return Config{}, errors.New("PAYPAL_MODE must be sandbox or live")
	}
	if environment == "production" && cfg.Billing.PayPalClientID != "" && cfg.Billing.PayPalMode != "live" {
		return Config{}, errors.New("PAYPAL_MODE must be live when payments are enabled in production")
	}
	if cfg.Billing.MidtransServerKey != "" &&
		((environment == "production") != (cfg.Billing.MidtransMode == "production")) {
		return Config{}, errors.New("MIDTRANS_MODE must match APP_ENV when payments are enabled")
	}
	return cfg, nil
}

func MigrationDatabaseURL() (string, error) {
	if value, err := secret("MIGRATIONS_DATABASE_URL"); err != nil || value != "" {
		return value, err
	}
	return secret("DATABASE_URL")
}

func secret(name string) (string, error) {
	if path := strings.TrimSpace(os.Getenv(name + "_FILE")); path != "" {
		contents, err := os.ReadFile(path)
		if err != nil {
			return "", fmt.Errorf("read %s_FILE: %w", name, err)
		}
		return strings.TrimSpace(string(contents)), nil
	}
	return strings.TrimSpace(os.Getenv(name)), nil
}

func required(name string) string {
	return strings.TrimSpace(os.Getenv(name))
}

func value(name, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(name)); value != "" {
		return value
	}
	return fallback
}

func boolean(name string, fallback bool) bool {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	return err == nil && parsed
}

func integer(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("%s must be an integer", name)
	}
	return parsed, nil
}
