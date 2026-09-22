package auth

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/http"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"golang.org/x/oauth2"
)

var ErrOAuthLinkRequired = errors.New("an account already uses this email; sign in with its existing method")

type Google struct {
	oauth    oauth2.Config
	verifier *oidc.IDTokenVerifier
}

func (service *Service) ConfigureGoogle(ctx context.Context) error {
	if service.cfg.GoogleClientID == "" {
		return nil
	}
	provider, err := oidc.NewProvider(ctx, "https://accounts.google.com")
	if err != nil {
		return err
	}
	service.google = &Google{
		oauth: oauth2.Config{
			ClientID:     service.cfg.GoogleClientID,
			ClientSecret: service.cfg.GoogleSecret,
			Endpoint:     provider.Endpoint(),
			RedirectURL:  service.cfg.PublicOrigin.String() + "/api/v1/auth/google/callback",
			Scopes:       []string{oidc.ScopeOpenID, "email"},
		},
		verifier: provider.Verifier(&oidc.Config{ClientID: service.cfg.GoogleClientID}),
	}
	return nil
}

func (service *Service) GoogleEnabled() bool {
	return service.google != nil
}

func (service *Service) BeginGoogle(ctx context.Context, w http.ResponseWriter, next string) (string, error) {
	if service.google == nil {
		return "", errors.New("google sign-in is not configured")
	}
	state, stateHash, err := RandomToken()
	if err != nil {
		return "", err
	}
	browser, browserHash, err := RandomToken()
	if err != nil {
		return "", err
	}
	nonce, _, err := RandomToken()
	if err != nil {
		return "", err
	}
	verifier, _, err := RandomToken()
	if err != nil {
		return "", err
	}
	if _, err := service.db.Exec(ctx, `
		insert into auth.oauth_transactions (
		  state_hash, browser_hash, nonce, pkce_verifier, next_path, expires_at
		) values ($1, $2, $3, $4, $5, now() + interval '10 minutes')`,
		stateHash, browserHash, nonce, verifier, SafeNext(next),
	); err != nil {
		return "", err
	}
	http.SetCookie(w, &http.Cookie{
		Name:     service.oauthCookieName(),
		Value:    browser,
		Path:     "/",
		MaxAge:   600,
		HttpOnly: true,
		Secure:   service.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
	challenge := sha256.Sum256([]byte(verifier))
	return service.google.oauth.AuthCodeURL(
		state,
		oidc.Nonce(nonce),
		oauth2.SetAuthURLParam("code_challenge", base64.RawURLEncoding.EncodeToString(challenge[:])),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	), nil
}

func (service *Service) FinishGoogle(
	ctx context.Context,
	r *http.Request,
	ip string,
) (string, Session, string, error) {
	if service.google == nil {
		return "", Session{}, "/", errors.New("google sign-in is not configured")
	}
	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	browserCookie, err := r.Cookie(service.oauthCookieName())
	if err != nil || state == "" || code == "" {
		return "", Session{}, "/", errors.New("invalid oauth callback")
	}

	tx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", Session{}, "/", err
	}
	defer tx.Rollback(ctx)
	var nonce, verifier, next string
	err = tx.QueryRow(ctx, `
		select nonce, pkce_verifier, next_path
		from auth.oauth_transactions
		where state_hash = $1 and browser_hash = $2
		  and used_at is null and expires_at > now()
		for update`, TokenHash(state), TokenHash(browserCookie.Value),
	).Scan(&nonce, &verifier, &next)
	if err != nil {
		return "", Session{}, "/", errors.New("invalid or expired oauth transaction")
	}
	if _, err := tx.Exec(ctx, `
		update auth.oauth_transactions set used_at = now()
		where state_hash = $1`, TokenHash(state),
	); err != nil {
		return "", Session{}, "/", err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", Session{}, "/", err
	}

	token, err := service.google.oauth.Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		return "", Session{}, "/", errors.New("google code exchange failed")
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		return "", Session{}, "/", errors.New("google did not return an id token")
	}
	idToken, err := service.google.verifier.Verify(ctx, rawIDToken)
	if err != nil {
		return "", Session{}, "/", errors.New("google id token validation failed")
	}
	var claims struct {
		Subject       string `json:"sub"`
		Email         string `json:"email"`
		EmailVerified bool   `json:"email_verified"`
		Nonce         string `json:"nonce"`
	}
	if err := idToken.Claims(&claims); err != nil || claims.Subject == "" || claims.Nonce != nonce || !claims.EmailVerified {
		return "", Session{}, "/", errors.New("invalid google identity claims")
	}
	email, err := service.NormalizeEmail(claims.Email)
	if err != nil {
		return "", Session{}, "/", errors.New("invalid google email claim")
	}

	sessionToken, tokenHash, err := RandomToken()
	if err != nil {
		return "", Session{}, "/", err
	}
	dbTx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", Session{}, "/", err
	}
	defer dbTx.Rollback(ctx)
	var userID string
	err = dbTx.QueryRow(ctx, `
		select user_id::text from auth.oauth_accounts
		where provider = 'google' and provider_subject = $1`, claims.Subject,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		var existingID string
		existingErr := dbTx.QueryRow(ctx,
			`select id::text from auth.users where email = $1`, email,
		).Scan(&existingID)
		if existingErr == nil {
			return "", Session{}, "/", ErrOAuthLinkRequired
		}
		if !errors.Is(existingErr, pgx.ErrNoRows) {
			return "", Session{}, "/", existingErr
		}
		err = dbTx.QueryRow(ctx, `
			insert into auth.users (email, email_verified_at)
			values ($1, now()) returning id::text`, email,
		).Scan(&userID)
		if err != nil {
			var postgresError *pgconn.PgError
			if errors.As(err, &postgresError) && postgresError.Code == "23505" {
				return "", Session{}, "/", ErrOAuthLinkRequired
			}
			return "", Session{}, "/", err
		}
		if _, err := dbTx.Exec(ctx, `
			insert into auth.oauth_accounts (user_id, provider, provider_subject, provider_email)
			values ($1, 'google', $2, $3)`, userID, claims.Subject, email,
		); err != nil {
			return "", Session{}, "/", err
		}
	} else if err != nil {
		return "", Session{}, "/", err
	}
	var sessionID string
	err = dbTx.QueryRow(ctx, `
		insert into auth.sessions (user_id, token_hash, expires_at, ip, user_agent)
		values ($1, $2, now() + $3::interval, $4, $5)
		returning id::text`,
		userID, tokenHash, durationInterval(service.cfg.SessionLifetime), nullableIP(ip), clip(r.UserAgent(), 500),
	).Scan(&sessionID)
	if err != nil {
		return "", Session{}, "/", err
	}
	if err := dbTx.Commit(ctx); err != nil {
		return "", Session{}, "/", err
	}
	session, err := service.sessionByID(ctx, sessionID, tokenHash)
	return sessionToken, session, SafeNext(next), err
}

func (service *Service) ClearOAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     service.oauthCookieName(),
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   service.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (service *Service) oauthCookieName() string {
	if service.cfg.CookieSecure {
		return "__Host-tingraph_oauth"
	}
	return "tingraph_oauth"
}

func OAuthCleanup(ctx context.Context, db interface {
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}) {
	_, _ = db.Exec(ctx, `delete from auth.oauth_transactions where expires_at < now() - interval '1 hour'`)
}

var _ = time.Second
