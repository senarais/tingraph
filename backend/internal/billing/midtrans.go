package billing

import (
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var midtransOrderID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

type midtransStatus struct {
	OrderID           string `json:"order_id"`
	TransactionID     string `json:"transaction_id"`
	TransactionStatus string `json:"transaction_status"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	RefundAmount      string `json:"refund_amount"`
	FraudStatus       string `json:"fraud_status"`
	Currency          string `json:"currency"`
	SignatureKey      string `json:"signature_key"`
	PaymentType       string `json:"payment_type"`
}

func (service *Service) createMidtransCard(ctx context.Context, id string, amount int64) (string, string, string, error) {
	request := map[string]any{
		"transaction_details": map[string]any{"order_id": id, "gross_amount": amount},
		"enabled_payments":    []string{"credit_card"},
		"credit_card":         map[string]any{"secure": true, "save_card": false},
		"callbacks":           map[string]string{"finish": service.returnURL(id, "midtrans")},
		"expiry":              map[string]any{"duration": 24, "unit": "hours", "start_time": time.Now().Format("2006-01-02 15:04:05 -0700")},
		"page_expiry":         map[string]any{"duration": 24, "unit": "hours"},
	}
	var result struct {
		Token string `json:"token"`
		URL   string `json:"redirect_url"`
	}
	if err := service.do(ctx, http.MethodPost, service.midtransBase(true)+"/snap/v1/transactions",
		service.cfg.MidtransServerKey, "", request, &result, map[string]string{"Accept": "application/json"}); err != nil {
		return "", "", "", err
	}
	u, err := url.Parse(result.URL)
	base, _ := url.Parse(service.midtransBase(true))
	if err != nil || result.Token == "" || u.Scheme != "https" || u.Host != base.Host || u.User != nil ||
		u.Path != "/snap/v2/vtweb/"+url.PathEscape(result.Token) {
		return "", "", "", errors.New("invalid Midtrans card checkout")
	}
	return id, u.String(), result.Token, nil
}

func (service *Service) expireMidtransCard(ctx context.Context, order Order) error {
	err := service.confirmMidtrans(ctx, order)
	var status providerStatusError
	if err != nil && (!errors.As(err, &status) || status.Status != http.StatusNotFound) {
		return err
	}
	current, lookupErr := service.lookup(ctx, order.ID)
	if lookupErr != nil {
		return lookupErr
	}
	if current.Status != "pending" {
		return nil
	}
	var token string
	if err := service.db.QueryRow(ctx, `select coalesce(snap_token, '') from ops.payment_orders where id = $1`, order.ID).Scan(&token); err != nil {
		return err
	}
	if token == "" {
		return errors.New("Snap session token is missing")
	}
	if err := service.cancelSnapSession(ctx, token); err != nil {
		return err
	}
	// A Snap token is created before a Core transaction exists. A 404 alone does
	// not prove expiry; only release the reservation after closing that token.
	if _, err := service.getMidtrans(ctx, order.ID); err != nil {
		if !errors.As(err, &status) || status.Status != http.StatusNotFound {
			return err
		}
		var expired bool
		return service.db.QueryRow(ctx, `select ops.expire_confirmed_payment($1, $2)`, order.ID, order.ProviderID).Scan(&expired)
	}
	return service.confirmMidtrans(ctx, order)
}

func (service *Service) cancelSnapSession(ctx context.Context, token string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, service.midtransBase(true)+"/snap/v1/transactions/"+url.PathEscape(token)+"/cancel", nil)
	if err != nil {
		return err
	}
	// The Snap-session cancel API documents a raw Server Key, not Core's Basic auth.
	req.Header.Set("Authorization", service.cfg.MidtransServerKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	response, err := service.client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	var result struct {
		CancelledAt time.Time `json:"canceled_at"`
		Errors      []string  `json:"error_messages"`
	}
	if err := json.NewDecoder(io.LimitReader(response.Body, 64<<10)).Decode(&result); err != nil {
		return err
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 && !result.CancelledAt.IsZero() {
		return nil
	}
	if response.StatusCode >= 400 && response.StatusCode < 500 && len(result.Errors) == 1 && result.Errors[0] == "token already canceled" {
		return nil
	}
	return errors.New("Midtrans has not confirmed that the Snap session is closed")
}

func (service *Service) midtransBase(snap bool) string {
	if snap {
		if service.cfg.MidtransMode == "production" {
			return "https://app.midtrans.com"
		}
		return "https://app.sandbox.midtrans.com"
	}
	if service.cfg.MidtransMode == "production" {
		return "https://api.midtrans.com"
	}
	return "https://api.sandbox.midtrans.com"
}

func (service *Service) createMidtrans(ctx context.Context, id string, amount int64) (string, string, string, error) {
	request := map[string]any{
		"payment_type":        "gopay", // Both GoPay deeplink and dynamic QRIS use Core API's GoPay charge.
		"transaction_details": map[string]any{"order_id": id, "gross_amount": amount},
		"custom_expiry":       map[string]any{"order_time": time.Now().Format("2006-01-02 15:04:05 -0700"), "expiry_duration": 24, "unit": "hour"},
	}
	var response struct {
		OrderID string `json:"order_id"`
		Status  string `json:"transaction_status"`
		Actions []struct {
			Name string `json:"name"`
			URL  string `json:"url"`
		} `json:"actions"`
	}
	if err := service.do(ctx, http.MethodPost, service.midtransBase(false)+"/v2/charge",
		service.cfg.MidtransServerKey, "", request, &response, map[string]string{"Accept": "application/json"}); err != nil {
		return "", "", "", err
	}
	if response.OrderID != id || response.Status != "pending" {
		return "", "", "", errors.New("Midtrans did not return a pending Core API charge")
	}
	var qr, deeplink string
	for _, action := range response.Actions {
		u, err := url.Parse(action.URL)
		if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" {
			continue
		}
		if action.Name == "generate-qr-code" &&
			(u.Hostname() == "api.midtrans.com" || u.Hostname() == "api.sandbox.midtrans.com" || u.Hostname() == "api.sandbox.veritrans.co.id") &&
			strings.HasPrefix(u.Path, "/v2/gopay/") && strings.HasSuffix(u.Path, "/qr-code") {
			qr = action.URL
		}
		if action.Name == "deeplink-redirect" &&
			(u.Hostname() == "gojek.link" || u.Hostname() == "simulator.sandbox.midtrans.com" || u.Hostname() == "app.gopay.co.id") {
			deeplink = action.URL
		}
	}
	if qr == "" {
		return "", "", "", errors.New("Midtrans QR action is missing")
	}
	return id, qr, deeplink, nil
}

func (service *Service) QR(ctx context.Context, id, userID string) ([]byte, error) {
	order, err := service.Order(ctx, id, userID)
	if err != nil || order.Provider != "midtrans" || order.Method == "card" || order.Status != "pending" || !time.Now().Before(order.ExpiresAt) {
		return nil, errors.New("QR payment is unavailable")
	}
	var raw string
	if err := service.db.QueryRow(ctx, `select checkout_url from ops.payment_orders where id = $1 and user_id = $2`, id, userID).Scan(&raw); err != nil {
		return nil, err
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme != "https" || u.User != nil || u.Port() != "" ||
		(u.Hostname() != "api.midtrans.com" && u.Hostname() != "api.sandbox.midtrans.com" && u.Hostname() != "api.sandbox.veritrans.co.id") ||
		!strings.HasPrefix(u.Path, "/v2/gopay/") || !strings.HasSuffix(u.Path, "/qr-code") {
		return nil, errors.New("invalid QR address")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, raw, nil)
	if err != nil {
		return nil, err
	}
	res, err := service.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != 200 || !strings.HasPrefix(res.Header.Get("Content-Type"), "image/png") {
		return nil, errors.New("QR image is unavailable")
	}
	image, err := io.ReadAll(io.LimitReader(res.Body, 1<<20+1))
	if err != nil || len(image) > 1<<20 || len(image) < 8 || string(image[:4]) != "\x89PNG" {
		return nil, errors.New("invalid QR image")
	}
	return image, nil
}

func parseIDR(value string) (int64, error) {
	whole, fraction, hasFraction := strings.Cut(value, ".")
	if hasFraction && fraction != "00" {
		return 0, errors.New("invalid IDR fraction")
	}
	if whole == "" || strings.Trim(whole, "0123456789") != "" {
		return 0, errors.New("invalid IDR amount")
	}
	amount, err := strconv.ParseInt(whole, 10, 64)
	if err != nil || amount <= 0 {
		return 0, errors.New("invalid IDR amount")
	}
	return amount, nil
}

func (service *Service) getMidtrans(ctx context.Context, orderID string) (midtransStatus, error) {
	var status midtransStatus
	if !midtransOrderID.MatchString(orderID) {
		return status, errors.New("invalid Midtrans order ID")
	}
	err := service.do(ctx, http.MethodGet, service.midtransBase(false)+"/v2/"+orderID+"/status",
		service.cfg.MidtransServerKey, "", nil, &status, nil)
	if err == nil && status.StatusCode == "404" {
		err = providerStatusError{Status: http.StatusNotFound}
	}
	return status, err
}

func (service *Service) confirmMidtrans(ctx context.Context, order Order) error {
	status, err := service.getMidtrans(ctx, order.ID)
	if err != nil {
		return err
	}
	amount, err := parseIDR(status.GrossAmount)
	if err != nil || status.OrderID != order.ID || order.Provider != "midtrans" ||
		order.ProviderID != "" && order.ProviderID != status.OrderID ||
		status.Currency != "" && status.Currency != "IDR" ||
		order.Currency != "IDR" || amount != order.Amount {
		return errors.New("Midtrans status does not match purchase")
	}
	order.ProviderID = status.OrderID
	switch status.TransactionStatus {
	case "settlement", "capture":
		if order.Method == "card" && (status.PaymentType != "credit_card" || status.FraudStatus != "accept") {
			return nil
		}
		if status.StatusCode != "200" || status.FraudStatus != "" && status.FraudStatus != "accept" {
			return nil
		}
		if status.TransactionID == "" {
			return errors.New("Midtrans transaction ID is missing")
		}
		_, err = service.settle(ctx, order, status.TransactionID, false)
	case "refund", "chargeback":
		if status.TransactionID == "" {
			return errors.New("Midtrans transaction ID is missing")
		}
		_, err = service.settle(ctx, order, status.TransactionID, true)
	case "partial_refund", "partial_chargeback":
		refunded, parseErr := parseIDR(status.RefundAmount)
		if parseErr == nil && refunded >= order.Amount {
			_, err = service.settle(ctx, order, status.TransactionID, true)
		}
	case "deny", "cancel", "expire", "failure":
		if order.Status == "paid" && status.TransactionStatus == "cancel" {
			if status.TransactionID == "" {
				return errors.New("Midtrans transaction ID is missing")
			}
			_, err = service.settle(ctx, order, status.TransactionID, true)
		} else if order.Status == "pending" {
			var changed bool
			if status.TransactionStatus == "expire" {
				err = service.db.QueryRow(ctx, `select ops.expire_confirmed_payment($1, $2)`, order.ID, order.ProviderID).Scan(&changed)
			} else {
				err = service.db.QueryRow(ctx, `select ops.fail_payment($1, $2, $3)`, order.ID, order.Provider, order.ProviderID).Scan(&changed)
			}
		}
	}
	return err
}

func (service *Service) SyncMidtrans(ctx context.Context, id, userID string) error {
	order, err := service.Order(ctx, id, userID)
	if err != nil {
		return err
	}
	if order.Provider != "midtrans" || order.ProviderID != id {
		return errors.New("Midtrans order does not belong to this account")
	}
	if order.Status == "refunded" || order.Status == "failed" {
		return nil
	}
	return service.confirmMidtrans(ctx, order)
}

func (service *Service) HandleMidtrans(ctx context.Context, body []byte) error {
	if !service.midtransEnabled() {
		return ErrUnavailable
	}
	var notification midtransStatus
	if err := json.Unmarshal(body, &notification); err != nil {
		return err
	}
	if !validMidtransSignature(notification, service.cfg.MidtransServerKey) {
		return ErrInvalidWebhook
	}
	if !midtransOrderID.MatchString(notification.OrderID) {
		return nil
	}
	order, err := service.lookup(ctx, notification.OrderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if order.Provider != "midtrans" {
		return errors.New("Midtrans notification does not match provider")
	}
	if order.Status == "refunded" || order.Status == "failed" {
		return nil
	}
	verifyCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	if err := service.confirmMidtrans(verifyCtx, order); err != nil {
		return fmt.Errorf("verify Midtrans notification: %w", err)
	}
	return nil
}

func validMidtransSignature(notification midtransStatus, serverKey string) bool {
	if serverKey == "" || notification.OrderID == "" || notification.StatusCode == "" || notification.GrossAmount == "" {
		return false
	}
	digest := sha512.Sum512([]byte(notification.OrderID + notification.StatusCode + notification.GrossAmount + serverKey))
	signature, err := hex.DecodeString(notification.SignatureKey)
	return err == nil && subtle.ConstantTimeCompare(digest[:], signature) == 1
}
