package billing

import (
	"context"
	"crypto/sha512"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"tingraph/backend/internal/config"
)

type roundTrip func(*http.Request) (*http.Response, error)

func (f roundTrip) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestPricesAndCheckoutHosts(t *testing.T) {
	service := New(nil, config.Billing{MidtransServerKey: "test", MidtransMode: "sandbox", FXBaseURL: "https://api.frankfurter.dev"}, nil)
	date := time.Now().UTC().Format("2006-01-02")
	service.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://api.frankfurter.dev/v2/rates?base=USD&quotes=IDR" {
			t.Fatalf("unexpected FX endpoint: %s", r.URL)
		}
		body := fmt.Sprintf(`[{"date":%q,"base":"USD","quote":"IDR","rate":17844}]`, date)
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	quote, err := service.Quote(context.Background())
	if err != nil || quote.IDR != 89220 {
		t.Fatalf("unexpected daily quote: %+v, %v", quote, err)
	}
	if _, err := service.Checkout(context.Background(), "user-123", "midtrans", 1); !errors.Is(err, ErrPriceChanged) {
		t.Fatal("checkout accepted a price different from what the buyer saw")
	}
	// A stale rate must fail closed; it must not silently charge an outdated IDR price.
	service.rates.day, date = "", "2020-01-01"
	if _, err := service.Quote(context.Background()); err == nil {
		t.Fatal("stale FX rate was accepted")
	}
	for _, raw := range []string{
		"http://app.sandbox.midtrans.com/pay", "https://app.sandbox.midtrans.com.evil.test/pay", "https://app.sandbox.midtrans.com:444/pay",
		"https://www.paypal.com.evil.test/pay", "https://evil.test@www.paypal.com/pay",
	} {
		if _, err := checkoutLink(raw, "midtrans"); err == nil {
			t.Fatalf("unsafe redirect accepted: %s", raw)
		}
	}
	if _, err := checkoutLink("https://app.sandbox.midtrans.com/snap/v2/vtweb/test", "midtrans"); err != nil {
		t.Fatal(err)
	}
}

func TestPayPalCaptureMustMatchTheOrder(t *testing.T) {
	order := Order{ID: "order-1", ProviderID: "paypal-order-1", Currency: "USD", Amount: monthlyUSD}
	var result payPalOrder
	if err := json.Unmarshal([]byte(`{"id":"paypal-order-1","status":"COMPLETED","purchase_units":[{"reference_id":"order-1","invoice_id":"order-1","amount":{"currency_code":"USD","value":"5.00"},"payments":{"captures":[{"id":"capture-1","status":"COMPLETED","amount":{"currency_code":"USD","value":"5.00"}}]}}]}`), &result); err != nil {
		t.Fatal(err)
	}
	if _, err := (&Service{}).validateCapture(order, result); err != nil {
		t.Fatal(err)
	}
	result.PurchaseUnits[0].Payments.Captures[0].Amount.Value = "0.05"
	if _, err := (&Service{}).validateCapture(order, result); err == nil {
		t.Fatal("underpaid capture was accepted")
	}
}

func TestMidtransWebhookRejectsForgedSignature(t *testing.T) {
	origin, _ := url.Parse("https://tingraph.example")
	service := New(nil, config.Billing{MidtransServerKey: "secret", MidtransMode: "sandbox"}, origin)
	if err := service.HandleMidtrans(context.Background(), []byte(`{"order_id":"12345678-1234-1234-1234-123456789abc","status_code":"200","gross_amount":"89220.00","signature_key":"bad"}`)); !errors.Is(err, ErrInvalidWebhook) {
		t.Fatal("forged Midtrans webhook was accepted")
	}
}

func TestMidtransSignatureAndIDRAmounts(t *testing.T) {
	notification := midtransStatus{OrderID: "12345678-1234-1234-1234-123456789abc", StatusCode: "200", GrossAmount: "89220.00"}
	signed := sha512.Sum512([]byte(notification.OrderID + notification.StatusCode + notification.GrossAmount + "server-key"))
	notification.SignatureKey = fmt.Sprintf("%x", signed)
	if !validMidtransSignature(notification, "server-key") {
		t.Fatal("valid signed notification rejected")
	}
	notification.GrossAmount = "1.00"
	if validMidtransSignature(notification, "server-key") {
		t.Fatal("tampered amount was accepted")
	}
	for _, value := range []string{"1.01", "0.00", "1e4", "-500.00"} {
		if _, err := parseIDR(value); err == nil {
			t.Errorf("invalid IDR amount accepted: %s", value)
		}
	}
	if amount, err := parseIDR("89220.00"); err != nil || amount != 89220 {
		t.Fatalf("incorrect IDR amount: %d, %v", amount, err)
	}
}

func TestHostedCheckoutRequests(t *testing.T) {
	origin, _ := url.Parse("https://tingraph.example")
	midtrans := New(nil, config.Billing{MidtransServerKey: "SB-Mid-server-secret", MidtransMode: "sandbox"}, origin)
	midtrans.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		user, password, ok := r.BasicAuth()
		if !ok || user != "SB-Mid-server-secret" || password != "" || r.URL.String() != "https://app.sandbox.midtrans.com/snap/v1/transactions" {
			t.Fatal("Midtrans request has incorrect credentials or endpoint")
		}
		var payload struct {
			TransactionDetails struct {
				Amount  int64  `json:"gross_amount"`
				OrderID string `json:"order_id"`
			} `json:"transaction_details"`
			Callbacks struct {
				Finish string `json:"finish"`
			} `json:"callbacks"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.TransactionDetails.Amount != 89220 ||
			payload.TransactionDetails.OrderID != "order-123" || !strings.Contains(payload.Callbacks.Finish, "provider=midtrans") {
			t.Fatal("Midtrans order amount, reference, or return URL is incorrect")
		}
		return &http.Response{StatusCode: 201, Body: io.NopCloser(strings.NewReader(`{"token":"snap-token","redirect_url":"https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token"}`))}, nil
	})
	if id, link, err := midtrans.createMidtrans(context.Background(), "order-123", 89220); err != nil || id != "order-123" || link != "https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token" {
		t.Fatalf("Midtrans Snap session rejected: %q, %q, %v", id, link, err)
	}

	paypal := New(nil, config.Billing{PayPalClientID: "client", PayPalClientSecret: "secret", PayPalMode: "sandbox"}, origin)
	paypal.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/oauth2/token" {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"access_token":"fake"}`))}, nil
		}
		if r.URL.Path != "/v2/checkout/orders" || r.Header.Get("Authorization") != "Bearer fake" || r.Header.Get("PayPal-Request-Id") != "order-123" {
			t.Fatal("PayPal order request is missing authentication or idempotency")
		}
		var payload struct {
			PurchaseUnits []struct {
				Amount struct {
					Value string `json:"value"`
				} `json:"amount"`
			} `json:"purchase_units"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || len(payload.PurchaseUnits) != 1 || payload.PurchaseUnits[0].Amount.Value != "5.00" {
			t.Fatal("PayPal order amount is not USD 5")
		}
		return &http.Response{StatusCode: 201, Body: io.NopCloser(strings.NewReader(`{"id":"paypal-123","status":"PAYER_ACTION_REQUIRED","links":[{"href":"https://www.sandbox.paypal.com/checkoutnow?token=paypal-123","rel":"payer-action"}]}`))}, nil
	})
	if id, link, err := paypal.createPayPal(context.Background(), "order-123"); err != nil || id != "paypal-123" || !strings.HasPrefix(link, "https://www.sandbox.paypal.com/") {
		t.Fatalf("PayPal order rejected: %q, %q, %v", id, link, err)
	}
}

func TestPayPalWebhookRequiresProviderVerification(t *testing.T) {
	service := New(nil, config.Billing{
		PayPalClientID: "client", PayPalClientSecret: "secret",
		PayPalWebhookID: "webhook", PayPalMode: "sandbox",
	}, nil)
	service.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.Path == "/v1/oauth2/token" {
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"access_token":"fake"}`))}, nil
		}
		if r.URL.Path != "/v1/notifications/verify-webhook-signature" {
			t.Fatal("unexpected PayPal request")
		}
		var payload struct {
			WebhookID string `json:"webhook_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil || payload.WebhookID != "webhook" {
			t.Fatal("PayPal verification did not use the configured webhook ID")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"verification_status":"FAILURE"}`))}, nil
	})
	headers := http.Header{
		"Paypal-Auth-Algo": {"SHA256withRSA"}, "Paypal-Cert-Url": {"https://api-m.sandbox.paypal.com/cert"},
		"Paypal-Transmission-Id": {"id"}, "Paypal-Transmission-Sig": {"sig"}, "Paypal-Transmission-Time": {"2026-09-23T00:00:00Z"},
	}
	err := service.HandlePayPal(context.Background(), headers, []byte(`{"event_type":"PAYMENT.CAPTURE.COMPLETED","resource":{"invoice_id":"order-123"}}`))
	if err == nil {
		t.Fatal("unverified PayPal webhook was accepted")
	}
}

func TestMidtransConfirmationRejectsWrongAmount(t *testing.T) {
	service := New(nil, config.Billing{MidtransServerKey: "key", MidtransMode: "sandbox"}, nil)
	const id = "12345678-1234-1234-1234-123456789abc"
	service.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		if r.URL.String() != "https://api.sandbox.midtrans.com/v2/"+id+"/status" {
			t.Fatal("unexpected status endpoint")
		}
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"order_id":"` + id + `","transaction_id":"tx-123","transaction_status":"settlement","status_code":"200","currency":"IDR","gross_amount":"10.00"}`))}, nil
	})
	order := Order{ID: id, Provider: "midtrans", ProviderID: id, Currency: "IDR", Amount: 89220}
	if err := service.confirmMidtrans(context.Background(), order); err == nil {
		t.Fatal("underpaid Midtrans transaction was credited")
	}
}

func TestMidtransPendingAndFraudChallengeDoNotGrantPremium(t *testing.T) {
	const id = "12345678-1234-1234-1234-123456789abc"
	order := Order{ID: id, Provider: "midtrans", ProviderID: id, Currency: "IDR", Amount: 89220}
	for _, test := range []struct {
		status string
		fraud  string
	}{
		{status: "pending"},
		{status: "capture", fraud: "challenge"},
	} {
		service := New(nil, config.Billing{MidtransServerKey: "key", MidtransMode: "sandbox"}, nil)
		service.client.Transport = roundTrip(func(*http.Request) (*http.Response, error) {
			body := fmt.Sprintf(`{"order_id":%q,"transaction_id":"tx-123","transaction_status":%q,"status_code":"200","fraud_status":%q,"gross_amount":"89220.00"}`, id, test.status, test.fraud)
			return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(body))}, nil
		})
		if err := service.confirmMidtrans(context.Background(), order); err != nil {
			t.Fatalf("%s should remain unpaid without database settlement: %v", test.status, err)
		}
	}
}
