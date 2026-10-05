package billing

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/config"
	"tingraph/backend/internal/database"
)

// Run against a disposable database: BILLING_TEST_DATABASE_URL=... go test ./internal/billing -run Database -race.
func TestSubscriptionLifecycleDatabase(t *testing.T) {
	dsn := os.Getenv("BILLING_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set BILLING_TEST_DATABASE_URL for the disposable PostgreSQL check")
	}
	ctx := context.Background()
	parsed, err := pgx.ParseConfig(dsn)
	if err != nil || !strings.HasPrefix(parsed.Database, "tingraph_billing_check") {
		t.Fatal("billing check needs its own tingraph_billing_check database")
	}
	owner, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer owner.Close()
	if _, err := owner.Exec(ctx, `do $$ begin if not exists(select 1 from pg_roles where rolname = 'tingraph_app') then create role tingraph_app nologin; end if; end $$`); err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(ctx, dsn); err != nil {
		t.Fatal(err)
	}
	appConfig, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		t.Fatal(err)
	}
	appConfig.AfterConnect = func(ctx context.Context, conn *pgx.Conn) error {
		_, err := conn.Exec(ctx, "set role tingraph_app")
		return err
	}
	app, err := pgxpool.NewWithConfig(ctx, appConfig)
	if err != nil {
		t.Fatal(err)
	}
	defer app.Close()
	var userID string
	if err := owner.QueryRow(ctx, `insert into auth.users(email) values (gen_random_uuid()::text || '@billing-check.test') returning id::text`).Scan(&userID); err != nil {
		t.Fatal(err)
	}
	code := "CHECK" + strings.ToUpper(strings.ReplaceAll(userID, "-", "")[:12])
	midCode := "MID" + code
	defer func() {
		for _, query := range []string{
			`update ops.payment_orders set subscription_id = null where user_id = $1`,
			`delete from ops.card_subscriptions where user_id = $1`,
			`delete from ops.payment_orders where user_id = $1`,
			`delete from auth.users where id = $1`,
		} {
			if _, err := owner.Exec(ctx, query, userID); err != nil {
				t.Error("fixture cleanup", err)
			}
		}
		_, _ = owner.Exec(ctx, `delete from ops.discount_codes where code in ($1, $2)`, code, midCode)
	}()
	if _, err := owner.Exec(ctx, `insert into ops.discount_codes(code, percent, max_uses) values ($1, 20, 1)`, code); err != nil {
		t.Fatal(err)
	}
	origin, _ := url.Parse("https://tingraph.example")
	service := New(app, config.Billing{CardPaymentProvider: "paypal", PayPalCardProductID: "PROD-CHECK", PayPalClientID: "client", PayPalClientSecret: "secret", PayPalWebhookID: "webhook", PayPalFeeBPS: 499, PayPalFixedCents: 49, ProductTaxBPS: 1000}, origin)
	first, err := service.Price(ctx, "card", code)
	if err != nil {
		t.Fatal(err)
	}
	var mu sync.Mutex
	var remote paypalSubscription
	payments := []map[string]any{}
	planChecked, cancellationCalls := false, 0
	service.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		mu.Lock()
		defer mu.Unlock()
		respond := func(status int, value any) (*http.Response, error) {
			body, _ := json.Marshal(value)
			return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(string(body)))}, nil
		}
		switch {
		case r.URL.Path == "/v1/oauth2/token":
			return respond(200, map[string]any{"access_token": "test", "expires_in": 3600})
		case r.URL.Path == "/v1/notifications/verify-webhook-signature":
			return respond(200, map[string]string{"verification_status": "SUCCESS"})
		case r.URL.Path == "/v1/billing/plans":
			if r.Header.Get("PayPal-Request-Id") == "" || len(r.Header.Get("PayPal-Request-Id")) > 38 {
				t.Error("plan idempotency key missing or too long")
			}
			var request struct {
				ProductID string `json:"product_id"`
				Cycles    []struct {
					Frequency struct {
						Unit  string `json:"interval_unit"`
						Count int    `json:"interval_count"`
					} `json:"frequency"`
					Tenure   string `json:"tenure_type"`
					Total    int    `json:"total_cycles"`
					Sequence int    `json:"sequence"`
					Pricing  struct {
						Fixed struct {
							Value    string `json:"value"`
							Currency string `json:"currency_code"`
						} `json:"fixed_price"`
					} `json:"pricing_scheme"`
				} `json:"billing_cycles"`
				Preferences struct {
					Outstanding bool `json:"auto_bill_outstanding"`
					Threshold   int  `json:"payment_failure_threshold"`
				} `json:"payment_preferences"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Error(err)
			}
			if request.ProductID != "PROD-CHECK" || len(request.Cycles) != 2 || request.Preferences.Outstanding || request.Preferences.Threshold != 1 {
				t.Error("incorrect recurring plan")
			}
			for i, cycle := range request.Cycles {
				expected := first.Amount
				if i == 1 {
					expected = first.RenewalAmount
				}
				if cycle.Frequency.Unit != "DAY" || cycle.Frequency.Count != 30 || cycle.Sequence != i+1 || cycle.Pricing.Fixed.Currency != "USD" || cycle.Pricing.Fixed.Value != usd(expected) {
					t.Error("wrong cycle amount/frequency")
				}
			}
			if request.Cycles[0].Tenure != "TRIAL" || request.Cycles[0].Total != 1 || request.Cycles[1].Tenure != "REGULAR" || request.Cycles[1].Total != 0 {
				t.Error("discount escaped the first period")
			}
			planChecked = true
			return respond(201, map[string]string{"id": "P-CHECK", "status": "ACTIVE"})
		case r.URL.Path == "/v1/billing/subscriptions":
			var request struct {
				PlanID   string `json:"plan_id"`
				CustomID string `json:"custom_id"`
			}
			if err := json.NewDecoder(r.Body).Decode(&request); err != nil {
				t.Error(err)
			}
			remote.ID, remote.PlanID, remote.CustomID, remote.Status = "I-CHECK", request.PlanID, request.CustomID, "APPROVAL_PENDING"
			return respond(201, map[string]any{"id": remote.ID, "plan_id": remote.PlanID, "custom_id": remote.CustomID, "status": remote.Status, "links": []map[string]string{{"rel": "approve", "href": "https://www.sandbox.paypal.com/webapps/billing/subscriptions?ba_token=check"}}})
		case strings.HasSuffix(r.URL.Path, "/transactions"):
			if r.URL.Query().Get("start_time") == "" || r.URL.Query().Get("end_time") == "" {
				t.Error("transaction date range missing")
			}
			return respond(200, map[string]any{"transactions": payments, "total_items": len(payments)})
		case strings.HasSuffix(r.URL.Path, "/cancel"):
			cancellationCalls++
			remote.Status = "CANCELLED"
			return respond(204, nil)
		case r.URL.Path == "/v1/billing/subscriptions/I-CHECK":
			return respond(200, remote)
		default:
			t.Errorf("unexpected provider request %s", r.URL)
			return respond(500, nil)
		}
	})
	checkout, err := service.Checkout(ctx, userID, CheckoutRequest{Method: "card", Provider: "paypal", Amount: first.Amount, RenewalAmount: first.RenewalAmount, Code: code, TimeZone: "UTC", RecurringConsent: true, RecurringConsentVersion: auth.PolicyVersion})
	if err != nil || !planChecked {
		t.Fatal("subscription checkout failed", err)
	}
	if _, err := service.Checkout(ctx, userID, CheckoutRequest{Method: "card", Provider: "paypal", Amount: first.RenewalAmount, RenewalAmount: first.RenewalAmount, TimeZone: "UTC", RecurringConsent: true, RecurringConsentVersion: auth.PolicyVersion}); !errors.Is(err, ErrSubscriptionExists) {
		t.Fatal("duplicate live subscription accepted", err)
	}
	mu.Lock()
	remote.Status = "ACTIVE"
	mu.Unlock()
	if err := service.SyncPayment(ctx, checkout.ID, userID); err != nil {
		t.Fatal(err)
	}
	var tier string
	if err := owner.QueryRow(ctx, `select tier from app.profiles where id = $1`, userID).Scan(&tier); err != nil || tier != "free" {
		t.Fatal("activation without a payment granted Premium", err)
	}
	now := time.Now().UTC().Truncate(time.Second)
	if _, err := owner.Exec(ctx, `update ops.card_subscriptions set created_at = $2 where id = $1`, checkout.ID, now.Add(-61*24*time.Hour)); err != nil {
		t.Fatal(err)
	}
	payment := func(id string, amount int64, at time.Time) map[string]any {
		return map[string]any{"id": id, "status": "COMPLETED", "time": at.Format(time.RFC3339), "amount_with_breakdown": map[string]any{"gross_amount": map[string]string{"value": usd(amount), "currency_code": "USD"}}}
	}
	mu.Lock()
	// Deliberately return newest first; webhook arrival/order must not decide discounted pricing.
	payments = []map[string]any{payment("SALE-3", first.RenewalAmount, now), payment("SALE-2", first.RenewalAmount, now.Add(-30*24*time.Hour)), payment("SALE-1", first.Amount, now.Add(-60*24*time.Hour))}
	mu.Unlock()
	var workers sync.WaitGroup
	for i := 0; i < 4; i++ {
		workers.Add(1)
		go func() {
			defer workers.Done()
			if err := service.SyncPayment(ctx, checkout.ID, userID); err != nil {
				t.Error("concurrent reconciliation", err)
			}
		}()
	}
	workers.Wait()
	var count int
	var until time.Time
	if err := owner.QueryRow(ctx, `select count(*) from ops.payment_orders where user_id = $1 and status = 'paid'`, userID).Scan(&count); err != nil || count != 3 {
		t.Fatal("duplicate or missing credit", count, err)
	}
	if err := owner.QueryRow(ctx, `select premium_until from app.profiles where id = $1`, userID).Scan(&until); err != nil {
		t.Fatal(err)
	}
	if err := service.SyncPayment(ctx, checkout.ID, userID); err != nil {
		t.Fatal(err)
	}
	var unchanged time.Time
	if err := owner.QueryRow(ctx, `select premium_until from app.profiles where id = $1`, userID).Scan(&unchanged); err != nil || !until.Equal(unchanged) {
		t.Fatal("replay extended Premium", err)
	}
	if _, err := service.Price(ctx, "card", code); !errors.Is(err, ErrDiscount) {
		t.Fatal("renewals released/reused the first-period coupon", err)
	}
	mu.Lock()
	payments[0] = payment("SALE-3", first.RenewalAmount-1, now)
	mu.Unlock()
	if err := service.SyncPayment(ctx, checkout.ID, userID); err == nil {
		t.Fatal("wrong recurring amount accepted")
	}
	mu.Lock()
	payments[0] = payment("SALE-3", first.RenewalAmount, now)
	mu.Unlock()
	if err := service.CancelSubscription(ctx, checkout.ID, "00000000-0000-0000-0000-000000000001"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("other user cancelled a subscription", err)
	}
	if err := service.SyncPayment(ctx, checkout.ID, "00000000-0000-0000-0000-000000000001"); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatal("other user accessed a payment", err)
	}
	// Switching only the card provider must not disable existing PayPal subscriptions/cancellation.
	service.cfg.CardPaymentProvider = "midtrans"
	if err := service.CancelSubscription(ctx, checkout.ID, userID); err != nil {
		t.Fatal(err)
	}
	if cancellationCalls != 1 {
		t.Fatal("provider cancellation missing")
	}
	if err := owner.QueryRow(ctx, `select premium_until from app.profiles where id = $1`, userID).Scan(&unchanged); err != nil || !until.Equal(unchanged) {
		t.Fatal("cancellation shortened paid coverage", err)
	}
	headers := http.Header{"Paypal-Auth-Algo": {"SHA256withRSA"}, "Paypal-Cert-Url": {"https://api-m.sandbox.paypal.com/cert"}, "Paypal-Transmission-Id": {"check"}, "Paypal-Transmission-Sig": {"check"}, "Paypal-Transmission-Time": {now.Format(time.RFC3339)}}
	event, _ := json.Marshal(map[string]any{"event_type": "PAYMENT.SALE.REVERSED", "resource": map[string]any{"id": "SALE-3", "billing_agreement_id": "I-CHECK", "amount": map[string]string{"total": usd(first.RenewalAmount), "currency": "USD"}}})
	if err := service.HandlePayPal(ctx, headers, event); err != nil {
		t.Fatal("verified reversal failed", err)
	}
	if err := service.HandlePayPal(ctx, headers, event); err != nil {
		t.Fatal("duplicate reversal failed", err)
	}
	if err := owner.QueryRow(ctx, `select count(*) from ops.payment_orders where user_id = $1 and status = 'paid'`, userID).Scan(&count); err != nil || count != 2 {
		t.Fatal("reversal/replay credited wrong periods", count, err)
	}
	var changed bool
	if err := app.QueryRow(ctx, `select ops.settle_subscription_payment($1, 'EARLY-REFUND', $2, $3, true)`, checkout.ID, first.RenewalAmount, now).Scan(&changed); err != nil || !changed {
		t.Fatal("refund before completion failed", err)
	}
	if err := app.QueryRow(ctx, `select ops.settle_subscription_payment($1, 'EARLY-REFUND', $2, $3, false)`, checkout.ID, first.RenewalAmount, now).Scan(&changed); err != nil || changed {
		t.Fatal("delayed completion resurrected a refunded payment", err)
	}
	// Re-open only this isolated provider fixture to exercise PayPal's pending-approval restriction.
	if _, err := owner.Exec(ctx, `update ops.card_subscriptions set status = 'APPROVAL_PENDING', cancel_requested = false where id = $1`, checkout.ID); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	remote.Status = "APPROVAL_PENDING"
	mu.Unlock()
	if err := service.CancelSubscription(ctx, checkout.ID, userID); err != nil {
		t.Fatal(err)
	}
	if cancellationCalls != 1 {
		t.Fatal("pending subscription was sent to the unsupported cancel API")
	}
	mu.Lock()
	remote.Status = "ACTIVE"
	mu.Unlock()
	if err := service.SyncPayment(ctx, checkout.ID, userID); err != nil {
		t.Fatal("durable stop request did not survive activation", err)
	}
	sub, err := service.subscription(ctx, checkout.ID)
	if err != nil || sub.Status != "CANCELLED" || !sub.CancelRequested || cancellationCalls != 2 {
		t.Fatal("pending stop request was lost", sub, err)
	}
	// A never-opened Snap token has no Core transaction. A 404 must not release
	// its coupon until the separate Snap-session cancellation is confirmed.
	service.cfg.MidtransServerKey, service.cfg.MidtransMode = "key", "sandbox"
	service.cfg.CardFeeBPS, service.cfg.CardFixedIDR = 290, 2000
	service.rates = rates{day: time.Now().UTC().Format("2006-01-02"), amount: 89220, rateDate: time.Now().UTC()}
	if _, err := owner.Exec(ctx, `insert into ops.discount_codes(code, percent, max_uses) values ($1, 20, 1)`, midCode); err != nil {
		t.Fatal(err)
	}
	blocked := true
	service.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		body, status := `{"status_code":"404"}`, 404
		if r.URL.Path == "/snap/v1/transactions" {
			body, status = `{"token":"SNAP-CHECK","redirect_url":"https://app.sandbox.midtrans.com/snap/v2/vtweb/SNAP-CHECK"}`, 201
		}
		if strings.HasSuffix(r.URL.Path, "/cancel") {
			if r.Header.Get("Authorization") != "key" {
				t.Error("Snap-session cancellation needs the documented Server Key header")
			}
			body, status = `{"canceled_at":"`+now.Format(time.RFC3339)+`"}`, 200
			if blocked {
				body, status = `{"error_messages":["Transaction is on progress"]}`, 400
			}
		}
		return &http.Response{StatusCode: status, Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	midPrice, err := service.Price(ctx, "card", midCode)
	if err != nil {
		t.Fatal(err)
	}
	mid, err := service.Checkout(ctx, userID, CheckoutRequest{Method: "card", Provider: "midtrans", Amount: midPrice.Amount, Code: midCode, TimeZone: "UTC"})
	if err != nil {
		t.Fatal("one-time card checkout", err)
	}
	if _, err := owner.Exec(ctx, `update ops.payment_orders set expires_at = now() - interval '1 hour' where id = $1`, mid.ID); err != nil {
		t.Fatal(err)
	}
	if err := service.expireOne(ctx, mid.ID); err == nil {
		t.Fatal("unconfirmed Snap closure was accepted")
	}
	if _, err := service.Price(ctx, "card", midCode); !errors.Is(err, ErrDiscount) {
		t.Fatal("a 404 released a still-payable card coupon", err)
	}
	blocked = false
	if err := service.expireOne(ctx, mid.ID); err != nil {
		t.Fatal("confirmed Snap cancellation", err)
	}
	if _, err := service.Price(ctx, "card", midCode); err != nil {
		t.Fatal("confirmed closed card session retained its coupon", err)
	}
}
