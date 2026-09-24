package auth

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/mail"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"tingraph/backend/internal/config"
)

var ErrUnauthenticated = errors.New("authentication required")

type Service struct {
	db       *pgxpool.Pool
	cfg      config.Config
	password *PasswordHasher
	google   *Google
}

func NewService(db *pgxpool.Pool, cfg config.Config) (*Service, error) {
	hasher, err := NewPasswordHasher()
	if err != nil {
		return nil, err
	}
	return &Service{db: db, cfg: cfg, password: hasher}, nil
}

func (service *Service) NormalizeEmail(value string) (string, error) {
	value = strings.TrimSpace(value)
	address, err := mail.ParseAddress(value)
	if err != nil || address.Name != "" || !strings.EqualFold(address.Address, value) || len(value) > 320 {
		return "", errors.New("enter a valid email address")
	}
	local, domain, ok := strings.Cut(address.Address, "@")
	if !ok || local == "" || domain == "" {
		return "", errors.New("enter a valid email address")
	}
	return local + "@" + strings.ToLower(domain), nil
}

// HashPassword applies the same password policy and Argon2id settings as registration.
func (service *Service) HashPassword(password string) (string, error) {
	if err := ValidatePassword(password); err != nil {
		return "", err
	}
	return service.password.Hash(password)
}

func (service *Service) Register(ctx context.Context, email, password, name, next string) error {
	normalized, err := service.NormalizeEmail(email)
	if err != nil {
		return err
	}
	if len([]rune(name)) > 80 {
		return errors.New("name must be 80 characters or fewer")
	}
	hash, err := service.HashPassword(password)
	if err != nil {
		return err
	}
	token, tokenHash, err := RandomToken()
	if err != nil {
		return err
	}

	tx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var userID string
	err = tx.QueryRow(ctx,
		`insert into auth.users (email) values ($1) on conflict (email) do nothing returning id::text`, normalized,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		var verified bool
		if err := tx.QueryRow(ctx,
			`select id::text, email_verified_at is not null from auth.users where email = $1 for update`, normalized,
		).Scan(&userID, &verified); err != nil {
			return err
		}
		if verified {
			return tx.Commit(ctx)
		}
		if _, err := tx.Exec(ctx, `
			insert into auth.password_credentials (user_id, password_hash)
			values ($1, $2) on conflict (user_id) do nothing`, userID, hash,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`update auth.one_time_tokens set used_at = now()
			 where user_id = $1 and purpose = 'verify_email' and used_at is null`, userID,
		); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx,
			`insert into auth.one_time_tokens (user_id, purpose, token_hash, expires_at)
			 values ($1, 'verify_email', $2, now() + interval '24 hours')`, userID, tokenHash,
		); err != nil {
			return err
		}
		link := service.publicLink("/verify-email", token, SafeNext(next))
		if err := enqueueMail(ctx, tx, normalized, "verify_email", map[string]string{"link": link}); err != nil {
			return err
		}
		return tx.Commit(ctx)
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`insert into auth.password_credentials (user_id, password_hash) values ($1, $2)`,
		userID, hash,
	); err != nil {
		return err
	}
	if strings.TrimSpace(name) != "" {
		if _, err := tx.Exec(ctx,
			`update app.profiles set full_name = $2 where id = $1`, userID, strings.TrimSpace(name),
		); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx,
		`insert into auth.one_time_tokens (user_id, purpose, token_hash, expires_at)
		 values ($1, 'verify_email', $2, now() + interval '24 hours')`,
		userID, tokenHash,
	); err != nil {
		return err
	}
	link := service.publicLink("/verify-email", token, SafeNext(next))
	if err := enqueueMail(ctx, tx, normalized, "verify_email", map[string]string{"link": link}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) VerifyEmail(ctx context.Context, token string) error {
	if len(token) < 40 || len(token) > 128 {
		return errors.New("invalid or expired verification link")
	}
	tx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var userID string
	err = tx.QueryRow(ctx, `
		update auth.one_time_tokens
		set used_at = now()
		where token_hash = $1 and purpose = 'verify_email'
		  and used_at is null and expires_at > now()
		returning user_id::text`, TokenHash(token),
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("invalid or expired verification link")
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`update auth.users set email_verified_at = coalesce(email_verified_at, now()) where id = $1`, userID,
	); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) Login(ctx context.Context, email, password, ip, userAgent string) (string, Session, error) {
	normalized, normalizeErr := service.NormalizeEmail(email)
	var userID, passwordHash string
	var version int64
	var verifiedAt, disabledAt *time.Time
	err := normalizeErr
	if err == nil {
		err = service.db.QueryRow(ctx, `
			select u.id::text, c.password_hash, c.version, u.email_verified_at, u.disabled_at
			from auth.users u
			join auth.password_credentials c on c.user_id = u.id
			where u.email = $1`, normalized,
		).Scan(&userID, &passwordHash, &version, &verifiedAt, &disabledAt)
	}
	valid := service.password.Compare(passwordHash, password)
	if err != nil || !valid || verifiedAt == nil || disabledAt != nil {
		return "", Session{}, errors.New("email or password is incorrect, or the account is unavailable")
	}

	token, tokenHash, err := RandomToken()
	if err != nil {
		return "", Session{}, err
	}
	tx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return "", Session{}, err
	}
	defer tx.Rollback(ctx)
	var currentVersion int64
	if err := tx.QueryRow(ctx,
		`select version from auth.password_credentials where user_id = $1 for update`, userID,
	).Scan(&currentVersion); err != nil || currentVersion != version {
		return "", Session{}, errors.New("email or password is incorrect, or the account is unavailable")
	}
	var sessionID string
	err = tx.QueryRow(ctx, `
		insert into auth.sessions (
		  user_id, token_hash, credential_version, expires_at, ip, user_agent
		) values ($1, $2, $3, now() + $4::interval, $5, $6)
		returning id::text`,
		userID, tokenHash, version, durationInterval(service.cfg.SessionLifetime), nullableIP(ip), clip(userAgent, 500),
	).Scan(&sessionID)
	if err != nil {
		return "", Session{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return "", Session{}, err
	}
	session, err := service.sessionByID(ctx, sessionID, tokenHash)
	return token, session, err
}

func (service *Service) Authenticate(ctx context.Context, token string) (Session, error) {
	if token == "" || len(token) > 128 {
		return Session{}, ErrUnauthenticated
	}
	hash := TokenHash(token)
	var sessionID string
	err := service.db.QueryRow(ctx, `
		select s.id::text
		from auth.sessions s
		join auth.users u on u.id = s.user_id
		left join auth.password_credentials c on c.user_id = s.user_id
		where s.token_hash = $1
		  and s.revoked_at is null
		  and s.expires_at > now()
		  and s.last_seen_at > now() - $2::interval
		  and u.disabled_at is null
		  and u.email_verified_at is not null
		  and (s.credential_version is null or s.credential_version = c.version)`,
		hash, durationInterval(service.cfg.SessionIdle),
	).Scan(&sessionID)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrUnauthenticated
	}
	if err != nil {
		return Session{}, err
	}
	_, _ = service.db.Exec(ctx,
		`update auth.sessions set last_seen_at = now() where id = $1 and last_seen_at < now() - interval '5 minutes'`,
		sessionID,
	)
	return service.sessionByID(ctx, sessionID, hash)
}

func (service *Service) sessionByID(ctx context.Context, sessionID string, tokenHash []byte) (Session, error) {
	var session Session
	var avatarPath *string
	var providers []string
	var hasPassword bool
	err := service.db.QueryRow(ctx, `
		select s.id::text, u.id::text, u.email::text, u.role, u.email_verified_at is not null,
		       u.created_at, s.authenticated_at,
		       p.username, p.full_name, p.avatar_path, p.profession, p.affiliation,
		       p.location, p.website, p.bio,
		       exists(select 1 from auth.password_credentials c where c.user_id = u.id),
		       coalesce(array_agg(o.provider order by o.provider)
		         filter (where o.provider is not null), '{}')
		from auth.sessions s
		join auth.users u on u.id = s.user_id
		join app.profiles p on p.id = u.id
		left join auth.oauth_accounts o on o.user_id = u.id
		where s.id = $1 and u.disabled_at is null and u.email_verified_at is not null
		group by s.id, u.id, p.id`, sessionID,
	).Scan(
		&session.ID, &session.User.ID, &session.User.Email, &session.User.Role, &session.User.EmailVerified,
		&session.User.CreatedAt, &session.User.AuthenticatedAt,
		&session.User.Profile.Username, &session.User.Profile.FullName, &avatarPath,
		&session.User.Profile.Profession, &session.User.Profile.Affiliation,
		&session.User.Profile.Location, &session.User.Profile.Website, &session.User.Profile.Bio,
		&hasPassword,
		&providers,
	)
	if err != nil {
		return Session{}, err
	}
	session.TokenHash = tokenHash
	if hasPassword {
		providers = append([]string{"email"}, providers...)
	}
	session.User.Providers = providers
	if avatarPath != nil {
		value := service.cfg.PublicOrigin.String() + "/media/avatars/" + *avatarPath
		session.User.Profile.AvatarURL = &value
	}
	return session, nil
}

func (service *Service) Logout(ctx context.Context, sessionID string) error {
	_, err := service.db.Exec(ctx, `update auth.sessions set revoked_at = now() where id = $1`, sessionID)
	return err
}

func (service *Service) RequestPasswordReset(ctx context.Context, email string) error {
	normalized, err := service.NormalizeEmail(email)
	if err != nil {
		return nil
	}
	token, tokenHash, err := RandomToken()
	if err != nil {
		return err
	}
	tx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var userID string
	err = tx.QueryRow(ctx, `
			select u.id::text
			from auth.users u
			where u.email = $1 and u.disabled_at is null`, normalized,
	).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`update auth.one_time_tokens set used_at = now()
		 where user_id = $1 and purpose = 'reset_password' and used_at is null`, userID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into auth.one_time_tokens (user_id, purpose, token_hash, expires_at)
		values ($1, 'reset_password', $2, now() + interval '30 minutes')`, userID, tokenHash,
	); err != nil {
		return err
	}
	if err := enqueueMail(ctx, tx, normalized, "reset_password", map[string]string{
		"link": service.publicLink("/reset-password", token, ""),
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) ResetPassword(ctx context.Context, token, password string) error {
	hash, err := service.HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := service.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var userID, email string
	err = tx.QueryRow(ctx, `
		select t.user_id::text, u.email::text
		from auth.one_time_tokens t
		join auth.users u on u.id = t.user_id
		where t.token_hash = $1 and t.purpose = 'reset_password'
		  and t.used_at is null and t.expires_at > now()
		for update of t`, TokenHash(token),
	).Scan(&userID, &email)
	if errors.Is(err, pgx.ErrNoRows) {
		return errors.New("invalid or expired reset link")
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
			insert into auth.password_credentials (user_id, password_hash)
			values ($1, $2)
			on conflict (user_id) do update
			set password_hash = excluded.password_hash,
			    version = auth.password_credentials.version + 1`, userID, hash,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`update auth.one_time_tokens set used_at = now()
		 where user_id = $1 and purpose = 'reset_password' and used_at is null`, userID,
	); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`update auth.sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, userID,
	); err != nil {
		return err
	}
	if err := enqueueMail(ctx, tx, email, "password_changed", map[string]string{}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) CSRFToken(tokenHash []byte) string {
	mac := hmac.New(sha256.New, service.cfg.RateLimitKey)
	mac.Write([]byte("csrf:"))
	mac.Write(tokenHash)
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

func (service *Service) CheckCSRF(session Session, supplied string) bool {
	expected := service.CSRFToken(session.TokenHash)
	return hmac.Equal([]byte(expected), []byte(supplied))
}

func (service *Service) Allow(ctx context.Context, scope, key string, limit int, window time.Duration) (bool, error) {
	mac := hmac.New(sha256.New, service.cfg.RateLimitKey)
	mac.Write([]byte(scope))
	mac.Write([]byte{0})
	mac.Write([]byte(strings.ToLower(strings.TrimSpace(key))))
	keyHash := mac.Sum(nil)
	var attempts int
	err := service.db.QueryRow(ctx, `
		insert into auth.rate_limits (scope, key_hash, window_started_at, attempts)
		values ($1, $2, now(), 1)
		on conflict (scope, key_hash) do update set
		  attempts = case
		    when auth.rate_limits.window_started_at + $3::interval <= now() then 1
		    else auth.rate_limits.attempts + 1
		  end,
		  window_started_at = case
		    when auth.rate_limits.window_started_at + $3::interval <= now() then now()
		    else auth.rate_limits.window_started_at
		  end
		returning attempts`, scope, keyHash, durationInterval(window),
	).Scan(&attempts)
	return attempts <= limit, err
}

func (service *Service) SetSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     service.cfg.SessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(service.cfg.SessionLifetime.Seconds()),
		HttpOnly: true,
		Secure:   service.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (service *Service) ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     service.cfg.SessionCookieName,
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   service.cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	})
}

func (service *Service) CookieToken(r *http.Request) string {
	cookie, err := r.Cookie(service.cfg.SessionCookieName)
	if err != nil {
		return ""
	}
	return cookie.Value
}

func (service *Service) publicLink(path, token, next string) string {
	result := *service.cfg.PublicOrigin
	result.Path = path
	fragment := url.Values{"token": []string{token}}
	if next != "" {
		fragment.Set("next", next)
	}
	result.Fragment = fragment.Encode()
	return result.String()
}

func SafeNext(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || strings.Contains(value, "\\") {
		return "/profile"
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.IsAbs() || parsed.Host != "" {
		return "/profile"
	}
	for _, char := range value {
		if char < 0x20 || char == 0x7f {
			return "/profile"
		}
	}
	return value
}

func enqueueMail(ctx context.Context, tx pgx.Tx, recipient, template string, payload map[string]string) error {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = tx.Exec(ctx,
		`insert into ops.email_outbox (recipient, template, payload) values ($1, $2, $3)`,
		recipient, template, encoded,
	)
	return err
}

func durationInterval(value time.Duration) string {
	return fmt.Sprintf("%f seconds", value.Seconds())
}

func nullableIP(value string) any {
	if ip := net.ParseIP(value); ip != nil {
		return ip.String()
	}
	return nil
}

func clip(value string, limit int) string {
	value = strings.TrimSpace(value)
	if len(value) <= limit {
		return value
	}
	return value[:limit]
}
