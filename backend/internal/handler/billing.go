package handler

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"tingraph/backend/internal/billing"
	"tingraph/backend/internal/httpx"
)

func (server *Handler) BillingQuote(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	if method := r.URL.Query().Get("method"); method != "" {
		if method != "paypal" && method != "gopay" && method != "qris" {
			httpx.Problem(w, 400, "invalid payment method")
			return
		}
		code := strings.ToUpper(strings.TrimSpace(r.URL.Query().Get("code")))
		if len(code) > 32 {
			httpx.Problem(w, 400, "invalid discount code")
			return
		}
		price, err := server.billing.Price(r.Context(), method, code)
		if errors.Is(err, billing.ErrDiscount) {
			httpx.Problem(w, 409, "discount code is invalid or fully reserved")
			return
		}
		if errors.Is(err, billing.ErrUnavailable) {
			httpx.Problem(w, 503, "payment method unavailable")
			return
		}
		if err != nil {
			server.log.Warn("checkout price unavailable", "error", err)
			httpx.Problem(w, 503, "price temporarily unavailable")
			return
		}
		httpx.JSON(w, http.StatusOK, price)
		return
	}
	quote, err := server.billing.Quote(r.Context())
	if err != nil {
		server.log.Warn("IDR exchange rate unavailable", "error", err)
		quote.Midtrans = false
	}
	httpx.JSON(w, http.StatusOK, quote)
}

func (server *Handler) BillingCheckout(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Method   string `json:"method"`
		Amount   int64  `json:"amount"`
		Code     string `json:"code"`
		TimeZone string `json:"time_zone"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil || input.Method != "gopay" && input.Method != "qris" && input.Method != "paypal" || len(input.Code) > 32 {
		httpx.Problem(w, http.StatusBadRequest, "choose GoPay, QRIS or PayPal")
		return
	}
	session := currentSession(r)
	if server.limited(r.Context(), "checkout_user", session.User.ID, 8, time.Hour) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many checkout attempts")
		return
	}
	order, err := server.billing.Checkout(r.Context(), session.User.ID, input.Method, input.Amount, strings.ToUpper(strings.TrimSpace(input.Code)), input.TimeZone)
	if err != nil {
		if errors.Is(err, billing.ErrPriceChanged) {
			httpx.Problem(w, http.StatusConflict, "price changed; refresh your checkout")
			return
		}
		if errors.Is(err, billing.ErrDiscount) {
			httpx.Problem(w, 409, "discount code is invalid or fully reserved")
			return
		}
		if errors.Is(err, billing.ErrTimeZone) {
			httpx.Problem(w, http.StatusBadRequest, "choose a valid time zone")
			return
		}
		server.log.Error("checkout creation failed", "method", input.Method, "error", err)
		status := http.StatusBadGateway
		if errors.Is(err, billing.ErrUnavailable) {
			status = http.StatusServiceUnavailable
		}
		httpx.Problem(w, status, "checkout could not be started")
		return
	}
	httpx.JSON(w, http.StatusCreated, order)
}

func (server *Handler) BillingQR(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	image, err := server.billing.QR(r.Context(), r.PathValue("id"), currentSession(r).User.ID)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	if r.URL.Query().Get("download") == "1" {
		w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="tingraph-%s.png"`, r.PathValue("id")))
	}
	_, _ = w.Write(image)
}

func (server *Handler) BillingOrder(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	order, err := server.billing.Order(r.Context(), r.PathValue("id"), currentSession(r).User.ID)
	if err != nil {
		if !errors.Is(err, pgx.ErrNoRows) {
			server.log.Error("order lookup failed", "error", err)
		}
		http.NotFound(w, r)
		return
	}
	httpx.JSON(w, http.StatusOK, order)
}

func (server *Handler) BillingCapture(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Token string `json:"token"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil || len(input.Token) < 5 || len(input.Token) > 128 {
		httpx.Problem(w, http.StatusBadRequest, "invalid PayPal order")
		return
	}
	if err := server.billing.CapturePayPal(r.Context(), r.PathValue("id"), currentSession(r).User.ID, input.Token); err != nil {
		server.log.Error("PayPal capture failed", "error", err)
		httpx.Problem(w, http.StatusBadGateway, "payment could not be confirmed yet")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"notice": "Premium is active."})
}

func (server *Handler) BillingSync(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	userID := currentSession(r).User.ID
	if server.limited(r.Context(), "billing_sync_user", userID, 10, time.Hour) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many payment status checks")
		return
	}
	if err := server.billing.SyncMidtrans(r.Context(), r.PathValue("id"), userID); err != nil {
		server.log.Warn("Midtrans status check failed", "error", err)
		httpx.Problem(w, http.StatusBadGateway, "payment status could not be checked yet")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (server *Handler) MidtransWebhook(w http.ResponseWriter, r *http.Request) {
	server.billingWebhook(w, r, "midtrans")
}

func (server *Handler) PayPalWebhook(w http.ResponseWriter, r *http.Request) {
	server.billingWebhook(w, r, "paypal")
}

func (server *Handler) billingWebhook(w http.ResponseWriter, r *http.Request, provider string) {
	httpx.NoStore(w)
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 64<<10))
	if err != nil {
		httpx.Problem(w, http.StatusRequestEntityTooLarge, "webhook body is too large")
		return
	}
	if provider == "midtrans" {
		err = server.billing.HandleMidtrans(r.Context(), body)
	} else {
		err = server.billing.HandlePayPal(r.Context(), r.Header, body)
	}
	if err != nil {
		server.log.Warn("payment webhook rejected", "provider", provider, "error", err)
		if errors.Is(err, billing.ErrInvalidWebhook) {
			httpx.Problem(w, http.StatusUnauthorized, "invalid webhook authentication")
			return
		}
		// Retry provider failures. Never acknowledge an event before its transaction commits.
		httpx.Problem(w, http.StatusServiceUnavailable, "webhook could not be processed")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
