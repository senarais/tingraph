package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/config"
)

var ErrUnavailable = errors.New("payment provider is not configured")
var ErrPriceChanged = errors.New("exchange rate changed; refresh the price")
var ErrInvalidWebhook = errors.New("invalid webhook authentication")

type Service struct {
	db                *pgxpool.Pool
	cfg               config.Billing
	origin            *url.URL
	client            *http.Client
	rates             rates
	payPalTokenMu     sync.Mutex
	payPalAccessToken string
	payPalTokenUntil  time.Time
}

type Checkout struct {
	ID  string `json:"id"`
	URL string `json:"url"`
}

type Order struct {
	ID         string     `json:"id"`
	Provider   string     `json:"provider"`
	Status     string     `json:"status"`
	Currency   string     `json:"currency"`
	Amount     int64      `json:"amount"`
	ProviderID string     `json:"-"`
	PaymentID  string     `json:"-"`
	PaidAt     *time.Time `json:"paid_at,omitempty"`
	UserID     string     `json:"-"`
}

func New(db *pgxpool.Pool, cfg config.Billing, origin *url.URL) *Service {
	return &Service{db: db, cfg: cfg, origin: origin, client: &http.Client{
		Timeout:       12 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse },
	}}
}

func (service *Service) midtransEnabled() bool {
	return service.cfg.MidtransServerKey != ""
}

func (service *Service) payPalEnabled() bool {
	return service.cfg.PayPalClientID != "" && service.cfg.PayPalClientSecret != "" && service.cfg.PayPalWebhookID != ""
}

func (service *Service) Checkout(ctx context.Context, userID, provider string, quotedAmount int64) (Checkout, error) {
	var currency string
	var amount int64
	var rateDate any
	switch provider {
	case "midtrans":
		if !service.midtransEnabled() {
			return Checkout{}, ErrUnavailable
		}
		currency = "IDR"
		var day time.Time
		var err error
		amount, day, err = service.idrAmount(ctx)
		if err != nil {
			return Checkout{}, err
		}
		if amount != quotedAmount {
			return Checkout{}, ErrPriceChanged
		}
		rateDate = day
	case "paypal":
		if !service.payPalEnabled() {
			return Checkout{}, ErrUnavailable
		}
		currency, amount = "USD", monthlyUSD
	default:
		return Checkout{}, errors.New("unknown payment provider")
	}
	var id string
	err := service.db.QueryRow(ctx, `
		insert into ops.payment_orders (user_id, provider, currency, amount, rate_date)
		select id, $2, $3, $4, $5 from app.profiles
		where id = $1 and not (tier = 'premium' and premium_until is null)
		returning id::text`, userID, provider, currency, amount, rateDate,
	).Scan(&id)
	if err != nil {
		return Checkout{}, fmt.Errorf("create payment order: %w", err)
	}

	var providerID, checkoutURL string
	if provider == "midtrans" {
		providerID, checkoutURL, err = service.createMidtrans(ctx, id, amount)
	} else {
		providerID, checkoutURL, err = service.createPayPal(ctx, id)
	}
	if err != nil {
		return Checkout{}, err
	}
	if _, err := service.db.Exec(ctx, `update ops.payment_orders
		set provider_id = $2, checkout_url = $3 where id = $1`, id, providerID, checkoutURL); err != nil {
		return Checkout{}, fmt.Errorf("save payment order: %w", err)
	}
	return Checkout{ID: id, URL: checkoutURL}, nil
}

func (service *Service) Order(ctx context.Context, id, userID string) (Order, error) {
	var order Order
	err := service.db.QueryRow(ctx, `select id::text, user_id::text, provider, status,
		currency, amount, coalesce(provider_id, ''), coalesce(payment_id, ''), paid_at
		from ops.payment_orders where id = $1 and user_id = $2`, id, userID,
	).Scan(&order.ID, &order.UserID, &order.Provider, &order.Status, &order.Currency,
		&order.Amount, &order.ProviderID, &order.PaymentID, &order.PaidAt)
	return order, err
}

func (service *Service) lookup(ctx context.Context, id string) (Order, error) {
	var order Order
	err := service.db.QueryRow(ctx, `select id::text, user_id::text, provider, status,
		currency, amount, coalesce(provider_id, ''), coalesce(payment_id, ''), paid_at
		from ops.payment_orders where id = $1`, id,
	).Scan(&order.ID, &order.UserID, &order.Provider, &order.Status, &order.Currency,
		&order.Amount, &order.ProviderID, &order.PaymentID, &order.PaidAt)
	return order, err
}

func (service *Service) settle(ctx context.Context, order Order, paymentID string, refund bool) (bool, error) {
	var changed bool
	err := service.db.QueryRow(ctx, `select ops.settle_payment($1, $2, $3, $4, $5, $6, $7)`,
		order.ID, order.Provider, order.ProviderID, paymentID, order.Currency, order.Amount, refund,
	).Scan(&changed)
	return changed, err
}

func (service *Service) returnURL(id, provider string) string {
	u := *service.origin
	u.Path = "/billing/return"
	u.RawQuery = url.Values{"order": {id}, "provider": {provider}}.Encode()
	return u.String()
}

func (service *Service) cancelURL() string {
	u := *service.origin
	u.Path, u.RawQuery = "/profile", "payment=cancelled"
	return u.String()
}

func (service *Service) do(ctx context.Context, method, endpoint, user, password string, body any, target any, headers map[string]string) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}
	req, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return err
	}
	req.SetBasicAuth(user, password)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	res, err := service.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("payment provider returned HTTP %d", res.StatusCode)
	}
	if target != nil {
		return json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(target)
	}
	return nil
}

func checkoutLink(raw, provider string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
		return "", errors.New("invalid payment checkout link")
	}
	allowed := provider == "midtrans" && (u.Hostname() == "app.midtrans.com" || u.Hostname() == "app.sandbox.midtrans.com") ||
		provider == "paypal" && (u.Hostname() == "www.paypal.com" || u.Hostname() == "www.sandbox.paypal.com")
	if !allowed || !strings.HasPrefix(u.Path, "/") {
		return "", errors.New("invalid payment checkout host")
	}
	return u.String(), nil
}
