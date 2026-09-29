package billing

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const monthlyUSD = 500 // cents

type Quote struct {
	USD      string     `json:"usd"`
	IDR      int64      `json:"idr,omitempty"`
	RateDate *time.Time `json:"rate_date,omitempty"`
	Midtrans bool       `json:"midtrans"`
	PayPal   bool       `json:"paypal"`
}

type Price struct {
	Method    string     `json:"method"`
	USD       string     `json:"usd"`
	Discount  int64      `json:"discount_cents"`
	Base      int64      `json:"base_cents"`
	Tax       int64      `json:"tax_cents"`
	Fee       int64      `json:"fee"`
	Amount    int64      `json:"amount"`
	Currency  string     `json:"currency"`
	RateDate  *time.Time `json:"rate_date,omitempty"`
	IDRBase   int64      `json:"idr_base,omitempty"`
	Code      string     `json:"code,omitempty"`
	Available bool       `json:"available"`
}

var ErrDiscount = errors.New("discount code is invalid or fully reserved")

func grossFor(net int64, bps int, fixed int64) int64 {
	return (net+fixed)*10000/(10000-int64(bps)) + boolInt((net+fixed)*10000%(10000-int64(bps)) != 0)
}

func boolInt(value bool) int64 {
	if value {
		return 1
	}
	return 0
}

func (service *Service) Price(ctx context.Context, method, code string) (Price, error) {
	price := Price{Method: method, USD: "5.00", Base: monthlyUSD, Code: code}
	var bps int
	switch method {
	case "paypal":
		price.Currency, price.Available = "USD", service.payPalEnabled()
		bps = service.cfg.PayPalFeeBPS
	case "gopay", "qris":
		price.Currency, price.Available = "IDR", service.midtransEnabled()
		if method == "gopay" {
			bps = service.cfg.GoPayFeeBPS
		} else {
			bps = service.cfg.QRISFeeBPS
		}
	default:
		return price, errors.New("unknown payment method")
	}
	if !price.Available {
		return price, ErrUnavailable
	}
	if code != "" {
		var percent int
		err := service.db.QueryRow(ctx, `select percent from ops.discount_codes c where c.code = $1 and c.enabled
			and (select count(*) from ops.payment_orders o where o.discount_code = c.code
			and o.status in ('paid', 'pending')) < c.max_uses`, code).Scan(&percent)
		if err != nil {
			return price, ErrDiscount
		}
		price.Discount = monthlyUSD * int64(percent) / 100
		price.Base -= price.Discount
	}
	price.Tax = (price.Base*int64(service.cfg.ProductTaxBPS) + 9999) / 10000
	payable := price.Base + price.Tax
	if method == "paypal" {
		price.Amount = grossFor(payable, bps, int64(service.cfg.PayPalFixedCents))
	} else {
		idr, day, err := service.idrAmount(ctx)
		if err != nil {
			return price, err
		}
		price.RateDate = &day
		price.IDRBase = idr
		net := (idr*payable + monthlyUSD - 1) / monthlyUSD
		price.Amount = grossFor(net, bps, 0)
		price.Fee = price.Amount - net
		return price, nil
	}
	price.Fee = price.Amount - payable
	return price, nil
}

type rates struct {
	mu       sync.Mutex
	day      string
	amount   int64
	rateDate time.Time
}

func (service *Service) Quote(ctx context.Context) (Quote, error) {
	quote := Quote{USD: "5.00", Midtrans: service.midtransEnabled(), PayPal: service.payPalEnabled()}
	if !quote.Midtrans {
		return quote, nil
	}
	amount, day, err := service.idrAmount(ctx)
	if err != nil {
		return quote, err
	}
	quote.IDR, quote.RateDate = amount, &day
	return quote, nil
}

func (service *Service) idrAmount(ctx context.Context) (int64, time.Time, error) {
	service.rates.mu.Lock()
	defer service.rates.mu.Unlock()
	today := time.Now().UTC().Format("2006-01-02")
	if service.rates.day == today {
		return service.rates.amount, service.rates.rateDate, nil
	}
	endpoint := strings.TrimRight(service.cfg.FXBaseURL, "/") + "/v2/rates?base=USD&quotes=IDR"
	u, err := url.Parse(endpoint)
	if err != nil || u == nil {
		return 0, time.Time{}, errors.New("invalid FX endpoint")
	}
	local := u.Scheme == "http" && (u.Hostname() == "frankfurter" || u.Hostname() == "localhost" || u.Hostname() == "127.0.0.1")
	if (u.Scheme != "https" && !local) || u.Host == "" || u.User != nil {
		return 0, time.Time{}, errors.New("invalid FX endpoint")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u.String(), nil)
	if err != nil {
		return 0, time.Time{}, err
	}
	res, err := service.client.Do(req)
	if err != nil {
		return 0, time.Time{}, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return 0, time.Time{}, fmt.Errorf("exchange rates unavailable (%d)", res.StatusCode)
	}
	var rows []struct {
		Date  string  `json:"date"`
		Base  string  `json:"base"`
		Quote string  `json:"quote"`
		Rate  float64 `json:"rate"`
	}
	data, err := io.ReadAll(io.LimitReader(res.Body, (64<<10)+1))
	if err != nil || len(data) > 64<<10 || json.Unmarshal(data, &rows) != nil || len(rows) != 1 {
		return 0, time.Time{}, errors.New("invalid exchange rate")
	}
	day, err := time.Parse("2006-01-02", rows[0].Date)
	if err != nil || rows[0].Base != "USD" || rows[0].Quote != "IDR" ||
		rows[0].Rate < 1000 || rows[0].Rate > 100000 ||
		day.After(time.Now().UTC()) || time.Since(day) > 6*24*time.Hour {
		return 0, time.Time{}, errors.New("exchange rate is unavailable or stale")
	}
	amount := int64(math.Ceil(5 * rows[0].Rate))
	service.rates.day, service.rates.amount, service.rates.rateDate = today, amount, day
	return amount, day, nil
}
