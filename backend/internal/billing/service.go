package billing

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
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
var ErrTimeZone = errors.New("choose a valid time zone")

type providerStatusError struct{ Status int }

func (e providerStatusError) Error() string {
	return fmt.Sprintf("payment provider returned HTTP %d", e.Status)
}

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
	Method     string     `json:"method"`
	ExpiresAt  time.Time  `json:"expires_at"`
	Deeplink   string     `json:"deeplink,omitempty"`
	Discount   string     `json:"discount_code,omitempty"`
	BaseCents  int64      `json:"base_cents"`
	TaxCents   int64      `json:"tax_cents"`
	Fee        int64      `json:"fee"`
	IDRBase    int64      `json:"idr_base,omitempty"`
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

func (service *Service) ValidTimeZone(ctx context.Context, zone string) (bool, error) {
	if len(zone) == 0 || len(zone) > 64 {
		return false, nil
	}
	var valid bool
	err := service.db.QueryRow(ctx, `select exists(select 1 from pg_timezone_names where name = $1)`, zone).Scan(&valid)
	return valid, err
}

func (service *Service) Checkout(ctx context.Context, userID, method string, quotedAmount int64, code, timeZone string) (Checkout, error) {
	price, err := service.Price(ctx, method, code)
	if err != nil {
		return Checkout{}, err
	}
	if quotedAmount != price.Amount {
		return Checkout{}, ErrPriceChanged
	}
	valid, err := service.ValidTimeZone(ctx, timeZone)
	if err != nil {
		return Checkout{}, err
	}
	if !valid {
		return Checkout{}, ErrTimeZone
	}
	provider := "midtrans"
	if method == "paypal" {
		provider = "paypal"
	}
	var id string
	err = service.db.QueryRow(ctx, `
		insert into ops.payment_orders (user_id, provider, currency, amount, rate_date, method, base_cents, tax_cents, fee, idr_base, time_zone)
		select id, $2, $3, $4, $5, $6, $7, $8, $9, nullif($10, 0), $11 from app.profiles
		where id = $1 and not (tier = 'premium' and premium_until is null)
		returning id::text`, userID, provider, price.Currency, price.Amount, price.RateDate, method, price.Base, price.Tax, price.Fee, price.IDRBase, timeZone,
	).Scan(&id)
	if err != nil {
		return Checkout{}, fmt.Errorf("create payment order: %w", err)
	}

	if code != "" {
		var reserved bool
		if err := service.db.QueryRow(ctx, `select ops.reserve_discount($1, $2)`, id, code).Scan(&reserved); err != nil || !reserved {
			_, _ = service.db.Exec(ctx, `update ops.payment_orders set status = 'failed' where id = $1`, id)
			if err != nil {
				return Checkout{}, err
			}
			return Checkout{}, ErrDiscount
		}
	}
	var providerID, checkoutURL, deeplink string
	if provider == "midtrans" {
		providerID, checkoutURL, deeplink, err = service.createMidtrans(ctx, id, price.Amount)
	} else {
		providerID, checkoutURL, err = service.createPayPal(ctx, id, price.Amount)
	}
	if err != nil {
		_, _ = service.db.Exec(ctx, `update ops.payment_orders set status = 'failed' where id = $1 and provider_id is null`, id)
		return Checkout{}, err
	}
	if _, err := service.db.Exec(ctx, `update ops.payment_orders
		set provider_id = $2, checkout_url = $3, deeplink_url = $4 where id = $1`, id, providerID, checkoutURL, deeplink); err != nil {
		return Checkout{}, fmt.Errorf("save payment order: %w", err)
	}
	if provider == "midtrans" {
		checkoutURL = "/checkout?order=" + id
	}
	return Checkout{ID: id, URL: checkoutURL}, nil
}

func (service *Service) Order(ctx context.Context, id, userID string) (Order, error) {
	if _, err := service.db.Exec(ctx, `select ops.expire_payments()`); err != nil {
		return Order{}, err
	}
	var order Order
	err := service.db.QueryRow(ctx, `select id::text, user_id::text, provider, status,
		currency, amount, coalesce(provider_id, ''), coalesce(payment_id, ''), paid_at,
		method, expires_at, coalesce(deeplink_url, ''), coalesce(discount_code, ''), base_cents, tax_cents, fee, coalesce(idr_base, 0)
		from ops.payment_orders where id = $1 and user_id = $2`, id, userID,
	).Scan(&order.ID, &order.UserID, &order.Provider, &order.Status, &order.Currency,
		&order.Amount, &order.ProviderID, &order.PaymentID, &order.PaidAt,
		&order.Method, &order.ExpiresAt, &order.Deeplink, &order.Discount, &order.BaseCents, &order.TaxCents, &order.Fee, &order.IDRBase)
	return order, err
}

func (service *Service) RunExpiry(ctx context.Context) {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		if _, err := service.db.Exec(ctx, `select ops.expire_payments()`); err != nil && ctx.Err() == nil {
			slog.Error("payment expiry sweep failed", "error", err)
		}
		rows, err := service.db.Query(ctx, `select id::text from ops.payment_orders
			where status = 'pending' and provider_id is not null and expires_at <= now()
			order by expires_at limit 50`)
		if err != nil && ctx.Err() == nil {
			slog.Error("payment expiry lookup failed", "error", err)
		}
		ids := []string{}
		if err == nil {
			for rows.Next() {
				var id string
				if err = rows.Scan(&id); err != nil {
					break
				}
				ids = append(ids, id)
			}
			if err == nil {
				err = rows.Err()
			}
			rows.Close()
		}
		if err != nil && ctx.Err() == nil {
			slog.Error("payment expiry scan failed", "error", err)
		}
		for _, id := range ids {
			if err := service.expireOne(ctx, id); err != nil && ctx.Err() == nil {
				slog.Warn("payment expiry verification failed", "order", id, "error", err)
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func (service *Service) expireOne(ctx context.Context, id string) error {
	order, err := service.lookup(ctx, id)
	if err != nil || order.Status != "pending" {
		return err
	}
	if order.Provider == "midtrans" {
		return service.confirmMidtrans(ctx, order)
	}
	// A PayPal capture started just before the deadline can still be in flight.
	// Allow its bounded provider request to complete before freeing its code.
	if time.Since(order.ExpiresAt) < time.Minute {
		return nil
	}
	var result payPalOrder
	if err := service.payPal(ctx, http.MethodGet, "/v2/checkout/orders/"+url.PathEscape(order.ProviderID), nil, "", &result); err != nil {
		var status providerStatusError
		if !errors.As(err, &status) || status.Status != http.StatusNotFound {
			return err
		}
		// PayPal no longer has an unpaid expired order; no capture can be initiated here.
		var expired bool
		return service.db.QueryRow(ctx, `select ops.expire_confirmed_payment($1, $2)`, id, order.ProviderID).Scan(&expired)
	}
	if result.ID != order.ProviderID {
		return errors.New("PayPal expiry lookup does not match order")
	}
	if result.Status == "COMPLETED" {
		captureID, err := service.validateCapture(order, result)
		if err != nil {
			return err
		}
		_, err = service.settle(ctx, order, captureID, false)
		return err
	}
	if result.Status != "CREATED" && result.Status != "APPROVED" && result.Status != "PAYER_ACTION_REQUIRED" && result.Status != "VOIDED" {
		return fmt.Errorf("PayPal order has unexpected status %q", result.Status)
	}
	var expired bool
	return service.db.QueryRow(ctx, `select ops.expire_confirmed_payment($1, $2)`, id, order.ProviderID).Scan(&expired)
}

func (service *Service) lookup(ctx context.Context, id string) (Order, error) {
	var order Order
	err := service.db.QueryRow(ctx, `select id::text, user_id::text, provider, status,
		currency, amount, coalesce(provider_id, ''), coalesce(payment_id, ''), paid_at,
		method, expires_at, coalesce(deeplink_url, ''), coalesce(discount_code, ''), base_cents, tax_cents, fee, coalesce(idr_base, 0)
		from ops.payment_orders where id = $1`, id,
	).Scan(&order.ID, &order.UserID, &order.Provider, &order.Status, &order.Currency,
		&order.Amount, &order.ProviderID, &order.PaymentID, &order.PaidAt,
		&order.Method, &order.ExpiresAt, &order.Deeplink, &order.Discount, &order.BaseCents, &order.TaxCents, &order.Fee, &order.IDRBase)
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
		return providerStatusError{Status: res.StatusCode}
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
	allowed := provider == "paypal" && (u.Hostname() == "www.paypal.com" || u.Hostname() == "www.sandbox.paypal.com")
	if !allowed || !strings.HasPrefix(u.Path, "/") {
		return "", errors.New("invalid payment checkout host")
	}
	return u.String(), nil
}
