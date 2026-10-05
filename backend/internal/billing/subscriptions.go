package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"tingraph/backend/internal/auth"
)

var ErrRecurringConsent = errors.New("automatic renewal consent is required")
var ErrSubscriptionExists = errors.New("an existing subscription must be managed first")

type Subscription struct {
	ID              string     `json:"id"`
	Status          string     `json:"status"`
	Amount          int64      `json:"amount"`
	Currency        string     `json:"currency"`
	NextBillingAt   *time.Time `json:"next_billing_at,omitempty"`
	CancelRequested bool       `json:"cancel_requested"`
	ProviderID      string     `json:"-"`
	PlanID          string     `json:"-"`
	CreatedAt       time.Time  `json:"-"`
}

type paypalSubscription struct {
	ID              string    `json:"id"`
	PlanID          string    `json:"plan_id"`
	CustomID        string    `json:"custom_id"`
	Status          string    `json:"status"`
	StatusUpdatedAt time.Time `json:"status_update_time"`
	BillingInfo     struct {
		NextBillingAt *time.Time `json:"next_billing_time"`
	} `json:"billing_info"`
	Links []struct {
		Href string `json:"href"`
		Rel  string `json:"rel"`
	} `json:"links"`
}

type subscriptionTransaction struct {
	ID     string    `json:"id"`
	Status string    `json:"status"`
	Time   time.Time `json:"time"`
	Amount struct {
		Gross struct {
			Currency string `json:"currency_code"`
			Value    string `json:"value"`
		} `json:"gross_amount"`
	} `json:"amount_with_breakdown"`
}

func (service *Service) createCardSubscription(ctx context.Context, id, userID string, first Price) (providerID, checkoutURL string, err error) {
	renewal, err := service.Price(ctx, "card", "")
	if err != nil {
		return "", "", err
	}
	_, err = service.db.Exec(ctx, `insert into ops.card_subscriptions
		(id, user_id, amount, tax_cents, fee, consent_version)
		values ($1, $2, $3, $4, $5, $6)`, id, userID, renewal.Amount, renewal.Tax, renewal.Fee, auth.PolicyVersion)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return "", "", ErrSubscriptionExists
		}
		return "", "", err
	}
	defer func() {
		if err != nil {
			_, _ = service.db.Exec(ctx, `update ops.card_subscriptions set status = 'FAILED', updated_at = now()
				where id = $1 and status = 'CREATING'`, id)
		}
	}()
	cycle := func(sequence int, tenure string, count int, amount int64) map[string]any {
		return map[string]any{"frequency": map[string]any{"interval_unit": "DAY", "interval_count": 30},
			"tenure_type": tenure, "sequence": sequence, "total_cycles": count,
			"pricing_scheme": map[string]any{"fixed_price": map[string]string{"currency_code": "USD", "value": usd(amount)}}}
	}
	var plan struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	cycles := []any{cycle(1, "REGULAR", 0, renewal.Amount)}
	if first.Amount < renewal.Amount {
		cycles = []any{cycle(1, "TRIAL", 1, first.Amount), cycle(2, "REGULAR", 0, renewal.Amount)}
	}
	request := map[string]any{
		"product_id": service.cfg.PayPalCardProductID, "name": "Tingraph Premium — every 30 days", "status": "ACTIVE",
		"billing_cycles":      cycles,
		"payment_preferences": map[string]any{"auto_bill_outstanding": false, "payment_failure_threshold": 1},
	}
	if err = service.payPal(ctx, http.MethodPost, "/v1/billing/plans", request, strings.ReplaceAll(id, "-", "")+"-plan", &plan); err != nil {
		return "", "", err
	}
	if plan.ID == "" || plan.Status != "ACTIVE" {
		return "", "", errors.New("PayPal did not create an active subscription plan")
	}
	if _, err = service.db.Exec(ctx, `update ops.card_subscriptions set plan_id = $2 where id = $1`, id, plan.ID); err != nil {
		return "", "", err
	}
	var result paypalSubscription
	request = map[string]any{"plan_id": plan.ID, "custom_id": id,
		"application_context": map[string]any{"brand_name": "Tingraph", "shipping_preference": "NO_SHIPPING", "user_action": "SUBSCRIBE_NOW",
			"return_url": service.returnURL(id, "paypal-subscription"), "cancel_url": service.cancelURL(),
			"payment_method": map[string]string{"payee_preferred": "IMMEDIATE_PAYMENT_REQUIRED"}}}
	if err = service.payPal(ctx, http.MethodPost, "/v1/billing/subscriptions", request, strings.ReplaceAll(id, "-", "")+"-sub", &result); err != nil {
		return "", "", err
	}
	if result.ID == "" || result.PlanID != plan.ID || result.CustomID != id || result.Status != "APPROVAL_PENDING" {
		return "", "", errors.New("PayPal subscription does not match checkout")
	}
	for _, link := range result.Links {
		if link.Rel == "approve" {
			checkoutURL, err = checkoutLink(link.Href, "paypal")
			break
		}
	}
	if err != nil || checkoutURL == "" {
		return "", "", errors.New("PayPal subscription approval link is missing or invalid")
	}
	tx, err := service.db.Begin(ctx)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `update ops.card_subscriptions set provider_id = $2,
		status = case when status = 'CREATING' then 'APPROVAL_PENDING' else status end, updated_at = now()
		where id = $1 and (provider_id is null or provider_id = $2)`, id, result.ID); err != nil {
		return "", "", err
	}
	if _, err = tx.Exec(ctx, `update ops.payment_orders set subscription_id = $1, provider_id = $2 where id = $1`, id, result.ID); err != nil {
		return "", "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", "", err
	}
	return result.ID, checkoutURL, nil
}

func (service *Service) subscription(ctx context.Context, id string) (Subscription, error) {
	var sub Subscription
	err := service.db.QueryRow(ctx, `select id::text, status, amount, next_billing_at,
		coalesce(provider_id, ''), coalesce(plan_id, ''), created_at, cancel_requested from ops.card_subscriptions where id = $1`, id).
		Scan(&sub.ID, &sub.Status, &sub.Amount, &sub.NextBillingAt, &sub.ProviderID, &sub.PlanID, &sub.CreatedAt, &sub.CancelRequested)
	sub.Currency = "USD"
	return sub, err
}

func (service *Service) Subscriptions(ctx context.Context, userID string) ([]Subscription, error) {
	rows, err := service.db.Query(ctx, `select id::text, status, amount, next_billing_at, cancel_requested from ops.card_subscriptions
		where user_id = $1 order by created_at desc limit 10`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	items := []Subscription{}
	for rows.Next() {
		var sub Subscription
		if err := rows.Scan(&sub.ID, &sub.Status, &sub.Amount, &sub.NextBillingAt, &sub.CancelRequested); err != nil {
			return nil, err
		}
		sub.Currency = "USD"
		items = append(items, sub)
	}
	return items, rows.Err()
}

func validateSubscription(sub Subscription, result paypalSubscription) error {
	if result.ID != sub.ProviderID || result.PlanID != sub.PlanID || result.CustomID != sub.ID {
		return errors.New("PayPal subscription does not match purchase")
	}
	switch result.Status {
	case "APPROVAL_PENDING", "APPROVED", "ACTIVE", "SUSPENDED", "CANCELLED", "EXPIRED":
		return nil
	default:
		return errors.New("unexpected PayPal subscription status")
	}
}

func (service *Service) syncSubscription(ctx context.Context, id string) error {
	sub, err := service.subscription(ctx, id)
	if err != nil {
		return err
	}
	if sub.ProviderID == "" {
		return errors.New("subscription setup is not complete")
	}
	var result paypalSubscription
	path := "/v1/billing/subscriptions/" + url.PathEscape(sub.ProviderID)
	if err := service.payPal(ctx, http.MethodGet, path, nil, "", &result); err != nil {
		return err
	}
	if err := validateSubscription(sub, result); err != nil {
		return err
	}
	_, err = service.db.Exec(ctx, `update ops.card_subscriptions set
		status = case when status in ('CANCELLED', 'EXPIRED', 'FAILED') then status else $2 end,
		next_billing_at = case when status in ('CANCELLED', 'EXPIRED', 'FAILED') or $2 in ('CANCELLED', 'EXPIRED') then null else $3::timestamptz end,
		updated_at = now() where id = $1`, id, result.Status, result.BillingInfo.NextBillingAt)
	if err != nil || result.Status == "APPROVAL_PENDING" {
		return err
	}
	if sub.CancelRequested && (result.Status == "ACTIVE" || result.Status == "SUSPENDED") {
		if err := service.cancelSubscription(ctx, id); err != nil {
			return err
		}
	}
	transactions, err := service.subscriptionTransactions(ctx, sub, path)
	if err != nil {
		return err
	}
	// Provider events can arrive out of order. Process the complete ledger oldest first.
	sort.Slice(transactions, func(i, j int) bool {
		if transactions[i].Time.Equal(transactions[j].Time) {
			return transactions[i].ID < transactions[j].ID
		}
		return transactions[i].Time.Before(transactions[j].Time)
	})
	for _, payment := range transactions {
		if payment.Status != "COMPLETED" && payment.Status != "PARTIALLY_REFUNDED" && payment.Status != "REFUNDED" {
			continue
		}
		amount, err := parseUSD(payment.Amount.Gross.Value)
		if err != nil || payment.Amount.Gross.Currency != "USD" || payment.ID == "" || len(payment.ID) > 50 ||
			payment.Time.Before(sub.CreatedAt.Add(-time.Minute)) || payment.Time.After(time.Now().Add(time.Minute)) {
			return errors.New("invalid PayPal subscription payment")
		}
		var changed bool
		if err := service.db.QueryRow(ctx, `select ops.settle_subscription_payment($1, $2, $3, $4, $5)`,
			sub.ID, payment.ID, amount, payment.Time, payment.Status == "REFUNDED").Scan(&changed); err != nil {
			return err
		}
	}
	return nil
}

func parseUSD(raw string) (int64, error) {
	whole, fraction, decimal := strings.Cut(raw, ".")
	if whole == "" || strings.Trim(whole, "0123456789") != "" || decimal && fraction == "" || len(fraction) > 2 || strings.Trim(fraction, "0123456789") != "" {
		return 0, errors.New("invalid USD amount")
	}
	value, err := strconv.ParseInt(whole+fraction+strings.Repeat("0", 2-len(fraction)), 10, 64)
	if err != nil || value <= 0 {
		return 0, errors.New("invalid USD amount")
	}
	return value, nil
}

func (service *Service) subscriptionTransactions(ctx context.Context, sub Subscription, path string) ([]subscriptionTransaction, error) {
	query := url.Values{"start_time": {sub.CreatedAt.Add(-time.Minute).UTC().Format(time.RFC3339)}, "end_time": {time.Now().UTC().Format(time.RFC3339)}}
	endpoint := path + "/transactions?" + query.Encode()
	items := []subscriptionTransaction{}
	seen := map[string]bool{}
	for page := 0; page < 20; page++ {
		if seen[endpoint] {
			return nil, errors.New("repeated PayPal transaction page")
		}
		seen[endpoint] = true
		var result struct {
			Transactions []subscriptionTransaction `json:"transactions"`
			TotalItems   int                       `json:"total_items"`
			Links        []struct {
				Rel  string `json:"rel"`
				Href string `json:"href"`
			} `json:"links"`
		}
		if err := service.payPal(ctx, http.MethodGet, endpoint, nil, "", &result); err != nil {
			return nil, err
		}
		items = append(items, result.Transactions...)
		endpoint = ""
		for _, link := range result.Links {
			if link.Rel != "next" {
				continue
			}
			u, err := url.Parse(link.Href)
			base, _ := url.Parse(service.paypalBase())
			if err != nil || u.Scheme != "https" || u.Host != base.Host || u.User != nil || u.Path != path+"/transactions" {
				return nil, errors.New("invalid PayPal transaction page")
			}
			endpoint = u.RequestURI()
		}
		if endpoint == "" {
			if result.TotalItems > len(items) {
				return nil, errors.New("incomplete PayPal transaction ledger")
			}
			return items, nil
		}
	}
	return nil, errors.New("PayPal transaction ledger exceeds page limit")
}

func (service *Service) SyncPayment(ctx context.Context, id, userID string) error {
	order, err := service.Order(ctx, id, userID)
	if err != nil {
		return err
	}
	if order.Method == "card" && order.Provider == "paypal" {
		return service.syncSubscription(ctx, id)
	}
	return service.SyncMidtrans(ctx, id, userID)
}

func (service *Service) CancelSubscription(ctx context.Context, id, userID string) error {
	var own bool
	if err := service.db.QueryRow(ctx, `select exists(select 1 from ops.card_subscriptions where id = $1 and user_id = $2)`, id, userID).Scan(&own); err != nil {
		return err
	}
	if !own {
		return pgx.ErrNoRows
	}
	return service.cancelSubscription(ctx, id)
}

func (service *Service) cancelSubscription(ctx context.Context, id string) error {
	sub, err := service.subscription(ctx, id)
	if err != nil {
		return err
	}
	if sub.Status == "CANCELLED" || sub.Status == "EXPIRED" || sub.Status == "FAILED" {
		return nil
	}
	if _, err := service.db.Exec(ctx, `update ops.card_subscriptions set cancel_requested = true where id = $1`, id); err != nil {
		return err
	}
	if sub.ProviderID == "" {
		return nil
	}
	path := "/v1/billing/subscriptions/" + url.PathEscape(sub.ProviderID)
	var result paypalSubscription
	if err := service.payPal(ctx, http.MethodGet, path, nil, "", &result); err != nil {
		return err
	}
	if err := validateSubscription(sub, result); err != nil {
		return err
	}
	// PayPal only permits cancellation of ACTIVE or SUSPENDED subscriptions.
	// Keep the stop request durable; activation callbacks and the worker will finish it.
	if result.Status == "APPROVAL_PENDING" || result.Status == "APPROVED" {
		return nil
	}
	if result.Status != "CANCELLED" && result.Status != "EXPIRED" {
		// Also re-read after an ambiguous timeout: a successful cancellation must not be reported as failed.
		cancelErr := service.payPal(ctx, http.MethodPost, path+"/cancel", map[string]string{"reason": "Subscriber stopped Tingraph Premium renewal"}, strings.ReplaceAll(id, "-", "")+"-stop", nil)
		if err := service.payPal(ctx, http.MethodGet, path, nil, "", &result); err != nil {
			return err
		}
		if err := validateSubscription(sub, result); err != nil {
			return err
		}
		if result.Status != "CANCELLED" && result.Status != "EXPIRED" {
			if cancelErr != nil {
				return cancelErr
			}
			return errors.New("PayPal has not confirmed cancellation")
		}
	}
	_, err = service.db.Exec(ctx, `update ops.card_subscriptions set status = $2, next_billing_at = null, updated_at = now() where id = $1`, id, result.Status)
	return err
}

func (service *Service) expireSubscription(ctx context.Context, id string) error {
	if err := service.syncSubscription(ctx, id); err != nil {
		return err
	}
	order, err := service.lookup(ctx, id)
	if err != nil || order.Status != "pending" {
		return err
	}
	if err := service.cancelSubscription(ctx, id); err != nil {
		return err
	}
	sub, err := service.subscription(ctx, id)
	if err != nil {
		return err
	}
	if sub.Status != "CANCELLED" && sub.Status != "EXPIRED" {
		return nil
	}
	path := "/v1/billing/subscriptions/" + url.PathEscape(sub.ProviderID)
	var remote paypalSubscription
	if err := service.payPal(ctx, http.MethodGet, path, nil, "", &remote); err != nil {
		return err
	}
	if err := validateSubscription(sub, remote); err != nil {
		return err
	}
	if remote.Status != "CANCELLED" && remote.Status != "EXPIRED" || remote.StatusUpdatedAt.IsZero() || time.Since(remote.StatusUpdatedAt) < time.Minute {
		return nil
	}
	transactions, err := service.subscriptionTransactions(ctx, sub, path)
	if err != nil {
		return err
	}
	for _, payment := range transactions {
		if payment.Status == "PENDING" {
			return nil
		}
		if payment.Status == "COMPLETED" || payment.Status == "PARTIALLY_REFUNDED" || payment.Status == "REFUNDED" {
			return service.syncSubscription(ctx, id)
		}
	}
	var expired bool
	return service.db.QueryRow(ctx, `select ops.expire_confirmed_payment($1, $2)`, id, order.ProviderID).Scan(&expired)
}

func (service *Service) reconcileSubscriptions(ctx context.Context) {
	if _, err := service.db.Exec(ctx, `update ops.card_subscriptions set status = 'FAILED', updated_at = now()
		where status = 'CREATING' and provider_id is null and created_at < now() - interval '24 hours'`); err != nil && ctx.Err() == nil {
		slog.Error("abandoned subscription cleanup failed", "error", err)
	}
	rows, err := service.db.Query(ctx, `select id::text from ops.card_subscriptions where provider_id is not null
		and status not in ('FAILED', 'CANCELLED', 'EXPIRED') and (cancel_requested or next_billing_at is null or next_billing_at <= now()
		or updated_at < now() - interval '6 hours') order by updated_at limit 20`)
	if err != nil {
		if ctx.Err() == nil {
			slog.Error("subscription reconciliation lookup failed", "error", err)
		}
		return
	}
	ids := []string{}
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
	if err != nil {
		slog.Error("subscription reconciliation scan failed", "error", err)
		return
	}
	for _, id := range ids {
		if err := service.syncSubscription(ctx, id); err != nil && ctx.Err() == nil {
			slog.Warn("subscription reconciliation failed", "subscription", id, "error", err)
		}
	}
}

func (service *Service) handleSubscriptionEvent(ctx context.Context, event string, resource json.RawMessage) error {
	var data struct {
		ID          string `json:"id"`
		CustomID    string `json:"custom_id"`
		PlanID      string `json:"plan_id"`
		AgreementID string `json:"billing_agreement_id"`
		SaleID      string `json:"sale_id"`
		Amount      struct {
			Total    string `json:"total"`
			Currency string `json:"currency"`
		} `json:"amount"`
		Links []struct {
			Rel  string `json:"rel"`
			Href string `json:"href"`
		} `json:"links"`
	}
	if err := json.Unmarshal(resource, &data); err != nil {
		return err
	}
	providerID := data.AgreementID
	if strings.HasPrefix(event, "BILLING.SUBSCRIPTION.") {
		providerID = data.ID
	}
	var id string
	paymentID := data.ID
	if data.SaleID != "" {
		paymentID = data.SaleID
	}
	for _, link := range data.Links {
		u, err := url.Parse(link.Href)
		base, _ := url.Parse(service.paypalBase())
		legacyHost := strings.Replace(base.Host, "api-m.", "api.", 1)
		if err == nil && link.Rel == "up" && u.Scheme == "https" && (u.Host == base.Host || u.Host == legacyHost) && u.User == nil && strings.HasPrefix(u.Path, "/v1/payments/sale/") {
			candidate := strings.TrimPrefix(u.Path, "/v1/payments/sale/")
			if candidate != "" && !strings.Contains(candidate, "/") {
				paymentID = candidate
			}
		}
	}
	if providerID != "" {
		err := service.db.QueryRow(ctx, `select id::text from ops.card_subscriptions where provider_id = $1`, providerID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) && midtransOrderID.MatchString(data.CustomID) && data.PlanID != "" {
			// CREATED can arrive before the checkout response is saved. Bind only our pre-recorded plan and account ID.
			err = service.db.QueryRow(ctx, `update ops.card_subscriptions set provider_id = $2 where id = $1
				and plan_id = $3 and provider_id is null and status = 'CREATING' returning id::text`, data.CustomID, providerID, data.PlanID).Scan(&id)
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
	} else {
		err := service.db.QueryRow(ctx, `select subscription_id::text from ops.payment_orders where provider = 'paypal'
			and payment_id = $1 and subscription_id is not null`, paymentID).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return fmt.Errorf("subscription payment %s has not been reconciled yet", paymentID)
		}
		if err != nil {
			return err
		}
	}
	if err := service.syncSubscription(ctx, id); err != nil {
		return err
	}
	if event == "PAYMENT.SALE.REFUNDED" || event == "PAYMENT.SALE.REVERSED" {
		// The signature-verified reversal may precede the transaction-list update.
		// Match the original sale and full amount; partial refunds retain access.
		var amount int64
		var paidAt *time.Time
		var status string
		if err := service.db.QueryRow(ctx, `select amount, paid_at, status from ops.payment_orders
			where payment_id = $1 and subscription_id = $2`, paymentID, id).Scan(&amount, &paidAt, &status); err != nil {
			return err
		}
		if status == "refunded" {
			return nil
		}
		refunded, err := parseUSD(data.Amount.Total)
		if err != nil || data.Amount.Currency != "USD" {
			return errors.New("invalid PayPal subscription refund")
		}
		if refunded < amount {
			return nil
		}
		if refunded != amount || paidAt == nil {
			return errors.New("PayPal subscription refund does not match payment")
		}
		var changed bool
		return service.db.QueryRow(ctx, `select ops.settle_subscription_payment($1, $2, $3, $4, true)`, id, paymentID, amount, paidAt).Scan(&changed)
	}
	return nil
}
