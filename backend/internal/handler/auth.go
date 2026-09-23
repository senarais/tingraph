package handler

import (
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/httpx"
)

type sessionResponse struct {
	User      *auth.User `json:"user"`
	CSRFToken string     `json:"csrf_token,omitempty"`
}

func (server *Handler) Session(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	session, err := server.auth.Authenticate(r.Context(), server.auth.CookieToken(r))
	if err != nil {
		if errors.Is(err, auth.ErrUnauthenticated) {
			server.auth.ClearSessionCookie(w)
			httpx.JSON(w, http.StatusOK, sessionResponse{})
			return
		}
		server.log.Error("session lookup failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "session could not be checked")
		return
	}
	httpx.JSON(w, http.StatusOK, sessionResponse{
		User:      &session.User,
		CSRFToken: server.auth.CSRFToken(session.TokenHash),
	})
}

func (server *Handler) Register(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Next     string `json:"next"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil {
		httpx.Problem(w, http.StatusBadRequest, "invalid registration details")
		return
	}
	if server.limited(r.Context(), "register_ip", server.clientIP(r), 10, time.Hour) {
		w.Header().Set("Retry-After", "3600")
		httpx.Problem(w, http.StatusTooManyRequests, "too many registration attempts")
		return
	}
	if normalized, err := server.auth.NormalizeEmail(input.Email); err == nil && server.limited(r.Context(), "register_email", normalized, 3, time.Hour) {
		w.Header().Set("Retry-After", "3600")
		httpx.Problem(w, http.StatusTooManyRequests, "too many registration attempts")
		return
	}
	if err := server.auth.Register(r.Context(), input.Email, input.Password, input.Name, input.Next); err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	httpx.JSON(w, http.StatusAccepted, map[string]string{
		"notice": "If this address can create an account, a confirmation link is on its way.",
	})
}

func (server *Handler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Token string `json:"token"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil {
		httpx.Problem(w, http.StatusBadRequest, "invalid verification request")
		return
	}
	if server.limited(r.Context(), "verify_ip", server.clientIP(r), 20, time.Hour) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many verification attempts")
		return
	}
	if err := server.auth.VerifyEmail(r.Context(), input.Token); err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"notice": "Email confirmed. You can sign in."})
}

func (server *Handler) Login(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil {
		httpx.Problem(w, http.StatusBadRequest, "invalid sign-in details")
		return
	}
	ip := server.clientIP(r)
	if server.limited(r.Context(), "login_ip", ip, 50, 15*time.Minute) {
		w.Header().Set("Retry-After", "900")
		httpx.Problem(w, http.StatusTooManyRequests, "too many sign-in attempts")
		return
	}
	normalized := strings.ToLower(strings.TrimSpace(input.Email))
	if server.limited(r.Context(), "login_email", normalized, 20, time.Hour) {
		w.Header().Set("Retry-After", "3600")
		httpx.Problem(w, http.StatusTooManyRequests, "too many sign-in attempts")
		return
	}
	if server.limited(r.Context(), "login_pair", ip+"\x00"+normalized, 5, 15*time.Minute) {
		w.Header().Set("Retry-After", "900")
		httpx.Problem(w, http.StatusTooManyRequests, "too many sign-in attempts")
		return
	}
	token, session, err := server.auth.Login(r.Context(), input.Email, input.Password, ip, r.UserAgent())
	if err != nil {
		httpx.Problem(w, http.StatusUnauthorized, err.Error())
		return
	}
	server.auth.SetSessionCookie(w, token)
	httpx.JSON(w, http.StatusOK, sessionResponse{
		User:      &session.User,
		CSRFToken: server.auth.CSRFToken(session.TokenHash),
	})
}

func (server *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	if err := server.auth.Logout(r.Context(), currentSession(r).ID); err != nil {
		server.log.Error("logout failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "sign out failed")
		return
	}
	server.auth.ClearSessionCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

func (server *Handler) ForgotPassword(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Email string `json:"email"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil {
		httpx.Problem(w, http.StatusBadRequest, "invalid password reset request")
		return
	}
	ip := server.clientIP(r)
	if server.limited(r.Context(), "reset_ip", ip, 20, time.Hour) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many password reset requests")
		return
	}
	if normalized, err := server.auth.NormalizeEmail(input.Email); err == nil && server.limited(r.Context(), "reset_email", normalized, 3, time.Hour) {
		httpx.JSON(w, http.StatusAccepted, map[string]string{
			"notice": "If an account uses this address, a reset link is on its way.",
		})
		return
	}
	if err := server.auth.RequestPasswordReset(r.Context(), input.Email); err != nil {
		server.log.Error("password reset request failed", "error", err)
	}
	httpx.JSON(w, http.StatusAccepted, map[string]string{
		"notice": "If an account uses this address, a reset link is on its way.",
	})
}

func (server *Handler) ResetPassword(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var input struct {
		Token    string `json:"token"`
		Password string `json:"password"`
		Confirm  string `json:"confirm"`
	}
	if err := httpx.ReadJSON(w, r, &input); err != nil || input.Password != input.Confirm {
		httpx.Problem(w, http.StatusBadRequest, "the two passwords are not the same")
		return
	}
	if server.limited(r.Context(), "reset_attempt_ip", server.clientIP(r), 10, time.Hour) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many password reset attempts")
		return
	}
	if err := server.auth.ResetPassword(r.Context(), input.Token, input.Password); err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	server.auth.ClearSessionCookie(w)
	httpx.JSON(w, http.StatusOK, map[string]string{"notice": "Password updated. Sign in again."})
}

func (server *Handler) GoogleStart(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	if server.limited(r.Context(), "google_start_ip", server.clientIP(r), 30, 10*time.Minute) {
		http.Redirect(w, r, "/login?error=google", http.StatusFound)
		return
	}
	destination, err := server.auth.BeginGoogle(r.Context(), w, r.URL.Query().Get("next"))
	if err != nil {
		server.log.Error("google sign-in start failed", "error", err)
		http.Redirect(w, r, "/login?error=google", http.StatusFound)
		return
	}
	http.Redirect(w, r, destination, http.StatusFound)
}

func (server *Handler) GoogleCallback(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	token, _, next, err := server.auth.FinishGoogle(r.Context(), r, server.clientIP(r))
	server.auth.ClearOAuthCookie(w)
	if err != nil {
		server.log.Warn("google sign-in callback rejected", "error", err)
		code := "google"
		if errors.Is(err, auth.ErrOAuthLinkRequired) {
			code = "google-link"
		}
		http.Redirect(w, r, "/login?error="+url.QueryEscape(code), http.StatusFound)
		return
	}
	server.auth.SetSessionCookie(w, token)
	http.Redirect(w, r, next, http.StatusFound)
}
