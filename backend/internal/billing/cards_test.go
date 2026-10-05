package billing

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/config"
)

func TestCardProviderQuoteAndConsent(t *testing.T) {
	service := New(nil, config.Billing{CardPaymentProvider: "midtrans", MidtransServerKey: "key", CardFeeBPS: 290, CardFixedIDR: 2000}, nil)
	service.rates = rates{day: time.Now().UTC().Format("2006-01-02"), amount: 89220, rateDate: time.Now().UTC()}
	price, err := service.Price(context.Background(), "card", "")
	if err != nil || price.Recurring || price.Provider != "midtrans" || price.Currency != "IDR" || price.Amount != grossFor(89220, 290, 2000) {
		t.Fatalf("incorrect one-time card quote: %+v %v", price, err)
	}
	service.cfg = config.Billing{CardPaymentProvider: "paypal", PayPalClientID: "client", PayPalClientSecret: "secret", PayPalWebhookID: "webhook", PayPalCardProductID: "PROD-TEST", PayPalFeeBPS: 499, PayPalFixedCents: 49, ProductTaxBPS: 1000}
	price, err = service.Price(context.Background(), "card", "")
	if err != nil || !price.Recurring || price.Provider != "paypal" || price.Currency != "USD" || price.Amount != price.RenewalAmount || price.Amount != grossFor(550, 499, 49) {
		t.Fatalf("incorrect recurring card quote: %+v %v", price, err)
	}
	input := CheckoutRequest{Method: "card", Provider: "paypal", Amount: price.Amount, RenewalAmount: price.RenewalAmount, TimeZone: "UTC"}
	if _, err := service.Checkout(context.Background(), "user", input); !errors.Is(err, ErrRecurringConsent) {
		t.Fatal("subscription accepted without renewal consent", err)
	}
	input.RecurringConsent, input.RecurringConsentVersion = true, "old-policy"
	if _, err := service.Checkout(context.Background(), "user", input); !errors.Is(err, ErrRecurringConsent) {
		t.Fatal("subscription accepted stale consent", err)
	}
	input.RecurringConsentVersion, input.Provider = auth.PolicyVersion, "midtrans"
	if _, err := service.Checkout(context.Background(), "user", input); !errors.Is(err, ErrPriceChanged) {
		t.Fatal("provider switch did not invalidate checkout", err)
	}
	input.Provider, input.RenewalAmount = "paypal", price.RenewalAmount-1
	if _, err := service.Checkout(context.Background(), "user", input); !errors.Is(err, ErrPriceChanged) {
		t.Fatal("changed renewal price was accepted", err)
	}
	service.cfg.PayPalCardProductID = ""
	if _, err := service.Price(context.Background(), "card", ""); !errors.Is(err, ErrUnavailable) {
		t.Fatal("recurring card checkout enabled without a product", err)
	}
}

func TestMidtransCardIsHostedSecureAndOneTime(t *testing.T) {
	origin, _ := url.Parse("https://tingraph.example")
	service := New(nil, config.Billing{MidtransServerKey: "key", MidtransMode: "sandbox"}, origin)
	redirect := "https://app.sandbox.midtrans.com/snap/v2/vtweb/token"
	service.client.Transport = roundTrip(func(r *http.Request) (*http.Response, error) {
		user, password, ok := r.BasicAuth()
		if !ok || user != "key" || password != "" || r.URL.String() != "https://app.sandbox.midtrans.com/snap/v1/transactions" {
			t.Fatal("wrong Snap credentials or endpoint")
		}
		var body struct {
			Enabled []string `json:"enabled_payments"`
			Card    struct {
				Secure bool `json:"secure"`
				Save   bool `json:"save_card"`
			} `json:"credit_card"`
			Callbacks struct {
				Finish string `json:"finish"`
			} `json:"callbacks"`
			Recurring json.RawMessage `json:"recurring"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if len(body.Enabled) != 1 || body.Enabled[0] != "credit_card" || !body.Card.Secure || body.Card.Save || len(body.Recurring) != 0 || !strings.Contains(body.Callbacks.Finish, "provider=midtrans") {
			t.Fatal("card checkout is not secure one-time Snap")
		}
		encoded, _ := json.Marshal(map[string]string{"token": "token", "redirect_url": redirect})
		return &http.Response{StatusCode: 201, Body: io.NopCloser(strings.NewReader(string(encoded)))}, nil
	})
	if id, link, token, err := service.createMidtransCard(context.Background(), "order", 89220); err != nil || id != "order" || link != redirect || token != "token" {
		t.Fatal("valid Snap checkout rejected", err)
	}
	for _, unsafe := range []string{"https://app.sandbox.midtrans.com.evil.test/snap/v2/vtweb/token", "https://app.midtrans.com/snap/v2/vtweb/token", "https://user@app.sandbox.midtrans.com/snap/v2/vtweb/token", "https://app.sandbox.midtrans.com:444/snap/v2/vtweb/token"} {
		redirect = unsafe
		if _, _, _, err := service.createMidtransCard(context.Background(), "order", 89220); err == nil {
			t.Fatal("unsafe card redirect accepted", unsafe)
		}
	}
}

func TestSubscriptionIdentityAndUSDValidation(t *testing.T) {
	sub := Subscription{ID: "local", ProviderID: "I-PAYPAL", PlanID: "P-PLAN"}
	result := paypalSubscription{ID: "I-PAYPAL", PlanID: "P-PLAN", CustomID: "local", Status: "ACTIVE"}
	if err := validateSubscription(sub, result); err != nil {
		t.Fatal(err)
	}
	for _, wrong := range []paypalSubscription{
		{ID: "OTHER", PlanID: "P-PLAN", CustomID: "local", Status: "ACTIVE"},
		{ID: "I-PAYPAL", PlanID: "OTHER", CustomID: "local", Status: "ACTIVE"},
		{ID: "I-PAYPAL", PlanID: "P-PLAN", CustomID: "another-account", Status: "ACTIVE"},
		{ID: "I-PAYPAL", PlanID: "P-PLAN", CustomID: "local", Status: "UNKNOWN"},
	} {
		if validateSubscription(sub, wrong) == nil {
			t.Fatal("unrelated subscription accepted", wrong)
		}
	}
	for _, value := range []string{"5", "5.0", "5.00"} {
		if amount, err := parseUSD(value); err != nil || amount != 500 {
			t.Fatal("incorrect USD parsing", value, amount, err)
		}
	}
	for _, value := range []string{"5.", "5.001", "1e3", "-5.00", "0.00", "999999999999999999999.00"} {
		if _, err := parseUSD(value); err == nil {
			t.Fatal("invalid provider amount accepted", value)
		}
	}
}

func TestCardFraudChallengeDoesNotGrantPremium(t *testing.T) {
	const id = "12345678-1234-1234-1234-123456789abc"
	service := New(nil, config.Billing{MidtransServerKey: "key"}, nil)
	service.client.Transport = roundTrip(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader(`{"order_id":"` + id + `","transaction_id":"tx","transaction_status":"capture","status_code":"200","payment_type":"credit_card","fraud_status":"challenge","gross_amount":"89220.00"}`))}, nil
	})
	if err := service.confirmMidtrans(context.Background(), Order{ID: id, Provider: "midtrans", ProviderID: id, Currency: "IDR", Amount: 89220, Method: "card"}); err != nil {
		t.Fatal(err)
	}
}
