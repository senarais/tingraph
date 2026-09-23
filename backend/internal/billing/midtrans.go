package billing

import (
	"context"
	"crypto/sha512"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
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

func (service *Service) createMidtrans(ctx context.Context, id string, amount int64) (string, string, error) {
	request := map[string]any{
		"transaction_details": map[string]any{"order_id": id, "gross_amount": amount},
		"credit_card":         map[string]bool{"secure": true},
		"callbacks":           map[string]string{"finish": service.returnURL(id, "midtrans")},
	}
	var response struct {
		Token string `json:"token"`
		URL   string `json:"redirect_url"`
	}
	if err := service.do(ctx, http.MethodPost, service.midtransBase(true)+"/snap/v1/transactions",
		service.cfg.MidtransServerKey, "", request, &response, map[string]string{"Accept": "application/json"}); err != nil {
		return "", "", err
	}
	if response.Token == "" {
		return "", "", errors.New("Midtrans did not return a Snap token")
	}
	link, err := checkoutLink(response.URL, "midtrans")
	if err != nil {
		return "", "", err
	}
	u, _ := url.Parse(link)
	if u.Scheme+"://"+u.Host != service.midtransBase(true) ||
		(u.Path != "/snap/v4/redirection/"+response.Token && u.Path != "/snap/v2/vtweb/"+response.Token) {
		return "", "", errors.New("Midtrans checkout link is for the wrong environment")
	}
	return id, link, nil
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
			err = service.db.QueryRow(ctx, `select ops.fail_payment($1, $2, $3)`, order.ID, order.Provider, order.ProviderID).Scan(&changed)
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
