package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/jackc/pgx/v5"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type payPalOrder struct {
	ID     string `json:"id"`
	Status string `json:"status"`
	Links  []struct {
		Href string `json:"href"`
		Rel  string `json:"rel"`
	} `json:"links"`
	PurchaseUnits []struct {
		ReferenceID string `json:"reference_id"`
		InvoiceID   string `json:"invoice_id"`
		Amount      struct {
			Currency string `json:"currency_code"`
			Value    string `json:"value"`
		} `json:"amount"`
		Payments struct {
			Captures []struct {
				ID     string `json:"id"`
				Status string `json:"status"`
				Amount struct {
					Currency string `json:"currency_code"`
					Value    string `json:"value"`
				} `json:"amount"`
			} `json:"captures"`
		} `json:"payments"`
	} `json:"purchase_units"`
}

func (service *Service) paypalBase() string {
	if service.cfg.PayPalMode == "live" {
		return "https://api-m.paypal.com"
	}
	return "https://api-m.sandbox.paypal.com"
}

func (service *Service) payPalToken(ctx context.Context) (string, error) {
	service.payPalTokenMu.Lock()
	defer service.payPalTokenMu.Unlock()
	if service.payPalAccessToken != "" && time.Now().Before(service.payPalTokenUntil) {
		return service.payPalAccessToken, nil
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		service.paypalBase()+"/v1/oauth2/token", strings.NewReader("grant_type=client_credentials"))
	if err != nil {
		return "", err
	}
	req.SetBasicAuth(service.cfg.PayPalClientID, service.cfg.PayPalClientSecret)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := service.client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("PayPal authorization returned HTTP %d", res.StatusCode)
	}
	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&result); err != nil {
		return "", err
	}
	if result.AccessToken == "" {
		return "", errors.New("PayPal did not return an access token")
	}
	if result.ExpiresIn > 60 {
		service.payPalAccessToken = result.AccessToken
		service.payPalTokenUntil = time.Now().Add(time.Duration(result.ExpiresIn-60) * time.Second)
	}
	return result.AccessToken, nil
}

func (service *Service) payPal(ctx context.Context, method, path string, body any, idempotency string, result any) error {
	token, err := service.payPalToken(ctx)
	if err != nil {
		return err
	}
	headers := map[string]string{"Authorization": "Bearer " + token, "Prefer": "return=representation"}
	if idempotency != "" {
		headers["PayPal-Request-Id"] = idempotency
	}
	return service.do(ctx, method, service.paypalBase()+path, "", "", body, result, headers)
}

func (service *Service) createPayPal(ctx context.Context, id string) (string, string, error) {
	request := map[string]any{
		"intent": "CAPTURE",
		"purchase_units": []any{map[string]any{
			"reference_id": id, "invoice_id": id,
			"description": "Tingraph Premium — 30 days",
			"amount":      map[string]string{"currency_code": "USD", "value": "5.00"},
		}},
		"payment_source": map[string]any{"paypal": map[string]any{
			"experience_context": map[string]string{
				"return_url":  service.returnURL(id, "paypal"),
				"cancel_url":  service.cancelURL(),
				"user_action": "PAY_NOW", "shipping_preference": "NO_SHIPPING",
			},
		}},
	}
	var order payPalOrder
	if err := service.payPal(ctx, http.MethodPost, "/v2/checkout/orders", request, id, &order); err != nil {
		return "", "", err
	}
	if order.ID == "" || order.Status != "PAYER_ACTION_REQUIRED" && order.Status != "CREATED" {
		return "", "", errors.New("PayPal did not create an approvable order")
	}
	for _, link := range order.Links {
		if link.Rel == "payer-action" || link.Rel == "approve" {
			checkoutURL, err := checkoutLink(link.Href, "paypal")
			return order.ID, checkoutURL, err
		}
	}
	return "", "", errors.New("PayPal approval link is missing")
}

func (service *Service) validateCapture(order Order, result payPalOrder) (string, error) {
	if result.ID != order.ProviderID || result.Status != "COMPLETED" || len(result.PurchaseUnits) != 1 {
		return "", errors.New("PayPal order has not been captured")
	}
	unit := result.PurchaseUnits[0]
	if unit.ReferenceID != order.ID || unit.InvoiceID != order.ID || unit.Amount.Currency != "USD" ||
		unit.Amount.Value != "5.00" || len(unit.Payments.Captures) != 1 {
		return "", errors.New("PayPal order does not match purchase")
	}
	capture := unit.Payments.Captures[0]
	if capture.ID == "" || capture.Status != "COMPLETED" || capture.Amount.Currency != order.Currency || capture.Amount.Value != "5.00" {
		return "", errors.New("PayPal capture does not match purchase")
	}
	return capture.ID, nil
}

func (service *Service) CapturePayPal(ctx context.Context, id, userID, token string) error {
	order, err := service.Order(ctx, id, userID)
	if err != nil {
		return err
	}
	if order.Provider != "paypal" || order.ProviderID == "" || order.ProviderID != token {
		return errors.New("PayPal order does not belong to this account")
	}
	if order.Status == "paid" {
		return nil
	}
	if order.Status != "pending" {
		return errors.New("payment is no longer payable")
	}
	var result payPalOrder
	err = service.payPal(ctx, http.MethodPost, "/v2/checkout/orders/"+url.PathEscape(order.ProviderID)+"/capture",
		map[string]any{}, id+"-capture", &result)
	if err != nil {
		// A timed-out response can still be a successful capture; check PayPal before retrying.
		if getErr := service.payPal(ctx, http.MethodGet, "/v2/checkout/orders/"+url.PathEscape(order.ProviderID), nil, "", &result); getErr != nil {
			return err
		}
	}
	captureID, err := service.validateCapture(order, result)
	if err != nil {
		return err
	}
	_, err = service.settle(ctx, order, captureID, false)
	return err
}

func (service *Service) HandlePayPal(ctx context.Context, headers http.Header, body []byte) error {
	if !service.payPalEnabled() {
		return ErrUnavailable
	}
	var event struct {
		EventType string          `json:"event_type"`
		Resource  json.RawMessage `json:"resource"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		return err
	}
	var payload struct {
		AuthAlgo         string          `json:"auth_algo"`
		CertURL          string          `json:"cert_url"`
		TransmissionID   string          `json:"transmission_id"`
		TransmissionSig  string          `json:"transmission_sig"`
		TransmissionTime string          `json:"transmission_time"`
		WebhookID        string          `json:"webhook_id"`
		WebhookEvent     json.RawMessage `json:"webhook_event"`
	}
	payload.AuthAlgo = headers.Get("PAYPAL-AUTH-ALGO")
	payload.CertURL = headers.Get("PAYPAL-CERT-URL")
	payload.TransmissionID = headers.Get("PAYPAL-TRANSMISSION-ID")
	payload.TransmissionSig = headers.Get("PAYPAL-TRANSMISSION-SIG")
	payload.TransmissionTime = headers.Get("PAYPAL-TRANSMISSION-TIME")
	payload.WebhookID, payload.WebhookEvent = service.cfg.PayPalWebhookID, body
	if payload.AuthAlgo == "" || payload.CertURL == "" || payload.TransmissionID == "" ||
		payload.TransmissionSig == "" || payload.TransmissionTime == "" {
		return ErrInvalidWebhook
	}
	var verified struct {
		Status string `json:"verification_status"`
	}
	if err := service.payPal(ctx, http.MethodPost, "/v1/notifications/verify-webhook-signature", payload, "", &verified); err != nil {
		return err
	}
	if verified.Status != "SUCCESS" {
		return ErrInvalidWebhook
	}
	if event.EventType != "PAYMENT.CAPTURE.COMPLETED" && event.EventType != "PAYMENT.CAPTURE.REFUNDED" && event.EventType != "PAYMENT.CAPTURE.REVERSED" {
		return nil
	}
	var resource struct {
		ID        string `json:"id"`
		Status    string `json:"status"`
		InvoiceID string `json:"invoice_id"`
		Links     []struct {
			Href string `json:"href"`
			Rel  string `json:"rel"`
		} `json:"links"`
		Amount struct {
			Currency string `json:"currency_code"`
			Value    string `json:"value"`
		} `json:"amount"`
		SupplementaryData struct {
			RelatedIDs struct {
				OrderID string `json:"order_id"`
			} `json:"related_ids"`
		} `json:"supplementary_data"`
	}
	if err := json.Unmarshal(event.Resource, &resource); err != nil {
		return err
	}
	orderID := resource.InvoiceID
	if orderID == "" && resource.SupplementaryData.RelatedIDs.OrderID != "" {
		if err := service.db.QueryRow(ctx, `select id::text from ops.payment_orders
			where provider = 'paypal' and provider_id = $1`, resource.SupplementaryData.RelatedIDs.OrderID).Scan(&orderID); err != nil {
			return err
		}
	}
	if event.EventType != "PAYMENT.CAPTURE.COMPLETED" && orderID == "" {
		for _, link := range resource.Links {
			u, err := url.Parse(link.Href)
			if err == nil && link.Rel == "up" && u.Scheme == "https" &&
				(u.Hostname() == "api-m.paypal.com" || u.Hostname() == "api-m.sandbox.paypal.com") &&
				strings.HasPrefix(u.Path, "/v2/payments/captures/") {
				captureID := strings.TrimPrefix(u.Path, "/v2/payments/captures/")
				if captureID != "" && !strings.Contains(captureID, "/") {
					if err := service.db.QueryRow(ctx, `select id::text from ops.payment_orders
						where provider = 'paypal' and payment_id = $1`, captureID).Scan(&orderID); err != nil {
						return err
					}
				}
			}
		}
	}
	order, err := service.lookup(ctx, orderID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if event.EventType != "PAYMENT.CAPTURE.COMPLETED" &&
		(resource.Status == "PARTIALLY_REFUNDED" || resource.Status == "COMPLETED" && resource.Amount.Value != "5.00") {
		return nil
	}
	if order.Provider != "paypal" || event.EventType == "PAYMENT.CAPTURE.COMPLETED" && order.ProviderID != resource.SupplementaryData.RelatedIDs.OrderID ||
		resource.Amount.Currency != order.Currency || resource.Amount.Value != "5.00" {
		return errors.New("PayPal webhook does not match order")
	}
	if event.EventType == "PAYMENT.CAPTURE.COMPLETED" && resource.Status == "COMPLETED" {
		_, err = service.settle(ctx, order, resource.ID, false)
	} else if (event.EventType == "PAYMENT.CAPTURE.REFUNDED" || event.EventType == "PAYMENT.CAPTURE.REVERSED") &&
		(resource.Status == "REFUNDED" || resource.Status == "REVERSED" || resource.Status == "COMPLETED") &&
		order.PaymentID != "" && (resource.ID == order.PaymentID || resource.Status == "COMPLETED") {
		_, err = service.settle(ctx, order, order.PaymentID, true)
	} else {
		err = errors.New("unconfirmed PayPal payment event")
	}
	return err
}
