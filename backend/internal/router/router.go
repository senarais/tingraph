package router

import (
	"log/slog"
	"net/http"
	"net/url"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/handler"
	"tingraph/backend/internal/middleware"
)

func Setup(h *handler.Handler, authService *auth.Service, origin *url.URL, logger *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	protected := func(next http.HandlerFunc) http.Handler {
		return middleware.RequireSession(authService, logger, next)
	}
	admin := func(next http.HandlerFunc) http.Handler {
		return protected(middleware.RequireAdmin(next).ServeHTTP)
	}
	mux.HandleFunc("GET /health/live", h.Live)
	mux.HandleFunc("GET /health/ready", h.Ready)
	mux.HandleFunc("GET /api/v1/auth/session", h.Session)
	mux.HandleFunc("POST /api/v1/auth/register", h.Register)
	mux.HandleFunc("POST /api/v1/auth/verify-email", h.VerifyEmail)
	mux.HandleFunc("POST /api/v1/auth/login", h.Login)
	mux.Handle("POST /api/v1/auth/logout", protected(h.Logout))
	mux.HandleFunc("POST /api/v1/auth/password/forgot", h.ForgotPassword)
	mux.HandleFunc("POST /api/v1/auth/password/reset", h.ResetPassword)
	mux.HandleFunc("GET /api/v1/auth/google/start", h.GoogleStart)
	mux.HandleFunc("GET /api/v1/auth/google/callback", h.GoogleCallback)
	mux.Handle("GET /api/v1/me", protected(h.Me))
	mux.Handle("PATCH /api/v1/me/profile", protected(h.UpdateProfile))
	mux.Handle("POST /api/v1/me/avatar", protected(h.UploadAvatar))
	mux.Handle("GET /api/v1/diagrams", protected(h.ListDiagrams))
	mux.Handle("POST /api/v1/diagrams", protected(h.CreateDiagram))
	mux.Handle("GET /api/v1/diagrams/{id}", protected(h.GetDiagram))
	mux.Handle("PUT /api/v1/diagrams/{id}", protected(h.UpdateDiagram))
	mux.Handle("DELETE /api/v1/diagrams/{id}", protected(h.DeleteDiagram))
	mux.Handle("POST /api/v1/usage/generations", protected(h.ConsumeGeneration))
	mux.HandleFunc("GET /media/avatars/{user}/{file}", h.Avatar)
	mux.Handle("POST /api/v1/ai", protected(h.AI))
	mux.Handle("GET /api/v1/admin/overview", admin(h.AdminOverview))
	mux.Handle("GET /api/v1/admin/users", admin(h.AdminUsers))
	mux.Handle("POST /api/v1/admin/users", admin(h.AdminCreateUser))
	mux.Handle("GET /api/v1/admin/orders", admin(h.AdminOrders))
	mux.Handle("GET /api/v1/admin/users/{id}", admin(h.AdminUser))
	mux.Handle("PATCH /api/v1/admin/users/{id}", admin(h.AdminUpdateUser))
	mux.Handle("PUT /api/v1/admin/users/{id}/password", admin(h.AdminPassword))
	mux.Handle("DELETE /api/v1/admin/users/{id}", admin(h.AdminDeleteUser))
	mux.Handle("GET /api/v1/billing/quote", protected(h.BillingQuote))
	mux.Handle("POST /api/v1/billing/checkout", protected(h.BillingCheckout))
	mux.Handle("GET /api/v1/billing/orders/{id}", protected(h.BillingOrder))
	mux.Handle("POST /api/v1/billing/orders/{id}/capture", protected(h.BillingCapture))
	mux.Handle("POST /api/v1/billing/orders/{id}/sync", protected(h.BillingSync))
	mux.HandleFunc("POST /api/v1/billing/webhook/midtrans", h.MidtransWebhook)
	mux.HandleFunc("POST /api/v1/billing/webhook/paypal", h.PayPalWebhook)
	return middleware.Recover(logger, middleware.Security(middleware.Origin(origin, mux)))
}
