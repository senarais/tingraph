package router

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/config"
	"tingraph/backend/internal/handler"
)

// Run against a disposable migrated database using ADMIN_TEST_DATABASE_URL (tingraph_app).
func TestAdminLifecycle(t *testing.T) {
	dsn := os.Getenv("ADMIN_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("requires disposable migrated database")
	}
	ctx := context.Background()
	db, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	origin, _ := url.Parse("http://localhost:8080")
	cfg := config.Config{
		PublicOrigin: origin, SessionCookieName: "tingraph_session",
		SessionLifetime: 24 * time.Hour, SessionIdle: 7 * time.Hour,
		RateLimitKey: []byte("0123456789abcdef0123456789abcdef"),
	}
	service, err := auth.NewService(db, cfg)
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	routes := Setup(handler.New(cfg, db, service, nil, nil, log), service, origin, log)
	hash, err := service.HashPassword("a-sufficiently-long-secret")
	if err != nil {
		t.Fatal(err)
	}
	var adminID, memberID string
	if err := db.QueryRow(ctx, `insert into auth.users (email, email_verified_at, role)
		values ('admin-test@example.invalid', now(), 'admin') returning id::text`).Scan(&adminID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `insert into auth.password_credentials (user_id, password_hash) values ($1, $2)`, adminID, hash); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(ctx, `insert into auth.users (email, email_verified_at)
		values ('member-test@example.invalid', now()) returning id::text`).Scan(&memberID); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `insert into auth.password_credentials (user_id, password_hash) values ($1, $2)`, memberID, hash); err != nil {
		t.Fatal(err)
	}
	adminToken, adminSession, err := service.Login(ctx, "admin-test@example.invalid", "a-sufficiently-long-secret", "127.0.0.1", "test")
	if err != nil {
		t.Fatal(err)
	}
	memberToken, _, err := service.Login(ctx, "member-test@example.invalid", "a-sufficiently-long-secret", "127.0.0.1", "test")
	if err != nil {
		t.Fatal(err)
	}
	call := func(method, path, token, csrf, body string, want int) []byte {
		t.Helper()
		r := httptest.NewRequest(method, path, strings.NewReader(body))
		r.AddCookie(&http.Cookie{Name: cfg.SessionCookieName, Value: token})
		if method != http.MethodGet {
			r.Header.Set("Origin", origin.String())
			r.Header.Set("X-CSRF-Token", csrf)
		}
		w := httptest.NewRecorder()
		routes.ServeHTTP(w, r)
		if w.Code != want {
			t.Fatalf("%s %s: status %d, want %d: %s", method, path, w.Code, want, w.Body.String())
		}
		return w.Body.Bytes()
	}
	call("GET", "/api/v1/admin/overview", memberToken, "", "", 403)
	call("POST", "/api/v1/admin/users", adminToken, "", `{}`, 403)
	csrf := service.CSRFToken(adminSession.TokenHash)
	body := call("POST", "/api/v1/admin/users", adminToken, csrf,
		`{"email":"new-test@example.invalid","name":"New test","password":"a-sufficiently-long-secret","verified":true}`, 201)
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(body, &created); err != nil {
		t.Fatal(err)
	}
	call("PATCH", "/api/v1/admin/users/"+created.ID, adminToken, csrf,
		`{"email":"new-test@example.invalid","role":"user","verified":true,"disabled":false,"tier":"premium","profile":{"full_name":"Premium user"}}`, 200)
	body = call("GET", "/api/v1/admin/users/"+created.ID, adminToken, "", "", 200)
	var detail struct {
		User struct {
			Tier         string     `json:"tier"`
			PremiumUntil *time.Time `json:"premium_until"`
		} `json:"user"`
	}
	if err := json.Unmarshal(body, &detail); err != nil {
		t.Fatal(err)
	}
	if detail.User.Tier != "premium" || detail.User.PremiumUntil == nil {
		t.Fatalf("premium plan not saved: %s", body)
	}
	var orderID string
	if err := db.QueryRow(ctx, `insert into ops.payment_orders
		(user_id, provider, currency, amount, rate_date, provider_id)
		values ($1, 'midtrans', 'IDR', 50000, current_date, 'provider-check') returning id::text`, created.ID).Scan(&orderID); err != nil {
		t.Fatal(err)
	}
	var settled bool
	if err := db.QueryRow(ctx, `select ops.settle_payment($1, 'midtrans', 'provider-check',
		'payment-check', 'IDR', 50000, false)`, orderID).Scan(&settled); err != nil || !settled {
		t.Fatalf("payment settlement: %v (settled %v)", err, settled)
	}
	body = call("GET", "/api/v1/admin/overview", adminToken, "", "", 200)
	var overview struct {
		Revenue []struct {
			Amount int64 `json:"amount"`
		} `json:"revenue"`
	}
	if err := json.Unmarshal(body, &overview); err != nil || len(overview.Revenue) != 1 || overview.Revenue[0].Amount != 50000 {
		t.Fatalf("revenue summary: %s, %v", body, err)
	}
	call("GET", "/api/v1/admin/orders?user="+created.ID, adminToken, "", "", 200)
	call("DELETE", "/api/v1/admin/users/"+created.ID, adminToken, csrf, "", 409)
	call("DELETE", "/api/v1/admin/users/"+adminID, adminToken, csrf, "", 400)
	call("DELETE", "/api/v1/admin/users/"+memberID, adminToken, csrf, "", 204)
}
