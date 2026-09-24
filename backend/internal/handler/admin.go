package handler

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/httpx"
)

type adminUser struct {
	ID           string     `json:"id"`
	Email        string     `json:"email"`
	Role         string     `json:"role"`
	Verified     bool       `json:"verified"`
	DisabledAt   *time.Time `json:"disabled_at"`
	CreatedAt    time.Time  `json:"created_at"`
	Tier         string     `json:"tier"`
	PremiumUntil *time.Time `json:"premium_until"`
	Name         *string    `json:"name"`
	Username     *string    `json:"username"`
	Diagrams     int        `json:"diagrams"`
	Orders       int        `json:"orders"`
}

func scanAdminUser(rows pgx.Rows) (adminUser, error) {
	var user adminUser
	err := rows.Scan(&user.ID, &user.Email, &user.Role, &user.Verified, &user.DisabledAt,
		&user.CreatedAt, &user.Tier, &user.PremiumUntil, &user.Name, &user.Username,
		&user.Diagrams, &user.Orders)
	return user, err
}

const adminUserColumns = `u.id::text, u.email::text, u.role, u.email_verified_at is not null,
	u.disabled_at, u.created_at, p.tier, p.premium_until, p.full_name, p.username,
	(select count(*) from app.diagrams d where d.user_id = u.id),
	(select count(*) from ops.payment_orders o where o.user_id = u.id)`

type adminOrder struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Email      string     `json:"email"`
	Provider   string     `json:"provider"`
	ProviderID *string    `json:"provider_id"`
	PaymentID  *string    `json:"payment_id"`
	Currency   string     `json:"currency"`
	Amount     int64      `json:"amount"`
	Status     string     `json:"status"`
	CreatedAt  time.Time  `json:"created_at"`
	PaidAt     *time.Time `json:"paid_at"`
	RefundedAt *time.Time `json:"refunded_at"`
}

const adminOrderColumns = `o.id::text, o.user_id::text, u.email::text,
	o.provider, o.provider_id, o.payment_id, o.currency, o.amount,
	o.status, o.created_at, o.paid_at, o.refunded_at`

func scanOrders(rows pgx.Rows) ([]adminOrder, error) {
	result := []adminOrder{}
	for rows.Next() {
		var order adminOrder
		if err := rows.Scan(&order.ID, &order.UserID, &order.Email, &order.Provider,
			&order.ProviderID, &order.PaymentID, &order.Currency, &order.Amount,
			&order.Status, &order.CreatedAt, &order.PaidAt, &order.RefundedAt); err != nil {
			return nil, err
		}
		result = append(result, order)
	}
	return result, rows.Err()
}

func (server *Handler) adminError(w http.ResponseWriter, message string, err error) {
	server.log.Error(message, "error", err)
	httpx.Problem(w, http.StatusInternalServerError, message)
}

func (server *Handler) AdminOverview(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	var users, verified, premium, disabled, diagrams int
	err := server.db.QueryRow(r.Context(), `
		select count(*), count(*) filter (where email_verified_at is not null),
		count(*) filter (where p.tier = 'premium' and (p.premium_until is null or p.premium_until > now())),
		count(*) filter (where u.disabled_at is not null),
		(select count(*) from app.diagrams)
		from auth.users u join app.profiles p on p.id = u.id`,
	).Scan(&users, &verified, &premium, &disabled, &diagrams)
	if err != nil {
		server.adminError(w, "admin overview could not be loaded", err)
		return
	}
	rows, err := server.db.Query(r.Context(), `
		select currency, coalesce(sum(amount), 0)::bigint, count(*)
		from ops.payment_orders where status = 'paid' group by currency`)
	if err != nil {
		server.adminError(w, "revenue could not be loaded", err)
		return
	}
	type revenue struct {
		Currency string `json:"currency"`
		Amount   int64  `json:"amount"`
		Orders   int    `json:"orders"`
	}
	totals := []revenue{}
	for rows.Next() {
		var total revenue
		if err = rows.Scan(&total.Currency, &total.Amount, &total.Orders); err != nil {
			break
		}
		totals = append(totals, total)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		server.adminError(w, "revenue could not be loaded", err)
		return
	}
	rows, err = server.db.Query(r.Context(), `select `+adminOrderColumns+`
		from ops.payment_orders o join auth.users u on u.id = o.user_id
		order by o.created_at desc, o.id desc limit 12`)
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	orders, err := scanOrders(rows)
	rows.Close()
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	type activity struct {
		Action    string    `json:"action"`
		Email     string    `json:"email"`
		Actor     *string   `json:"actor"`
		CreatedAt time.Time `json:"created_at"`
	}
	rows, err = server.db.Query(r.Context(), `select a.action, a.target_email::text, u.email::text, a.created_at
		from ops.admin_audit a left join auth.users u on u.id = a.actor_id order by a.id desc limit 12`)
	if err != nil {
		server.adminError(w, "activity could not be loaded", err)
		return
	}
	activities := []activity{}
	for rows.Next() {
		var a activity
		if err = rows.Scan(&a.Action, &a.Email, &a.Actor, &a.CreatedAt); err != nil {
			break
		}
		activities = append(activities, a)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		server.adminError(w, "activity could not be loaded", err)
		return
	}
	type daily struct {
		Day      time.Time `json:"day"`
		Currency string    `json:"currency"`
		Amount   int64     `json:"amount"`
	}
	rows, err = server.db.Query(r.Context(), `select (paid_at at time zone 'utc')::date, currency, sum(amount)::bigint
		from ops.payment_orders where status = 'paid' and paid_at >= now() - interval '30 days'
		group by 1, 2 order by 1, 2`)
	if err != nil {
		server.adminError(w, "revenue could not be loaded", err)
		return
	}
	days := []daily{}
	for rows.Next() {
		var d daily
		if err = rows.Scan(&d.Day, &d.Currency, &d.Amount); err != nil {
			break
		}
		days = append(days, d)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		server.adminError(w, "revenue could not be loaded", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"users": users, "verified": verified, "premium": premium,
		"disabled": disabled, "diagrams": diagrams, "revenue": totals, "orders": orders,
		"activity": activities, "daily": days,
	})
}

func (server *Handler) AdminUsers(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	if page > 10000 {
		page = 10000
	}
	search := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(search) > 100 {
		httpx.Problem(w, http.StatusBadRequest, "search is too long")
		return
	}
	// Escape LIKE metacharacters: search input is a literal substring, not a pattern.
	search = strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(search)
	pattern := "%" + search + "%"
	var total int
	err = server.db.QueryRow(r.Context(), `select count(*) from auth.users u
		join app.profiles p on p.id = u.id
		where u.email::text ilike $1 or p.username ilike $1`, pattern).Scan(&total)
	if err != nil {
		server.adminError(w, "users could not be loaded", err)
		return
	}
	rows, err := server.db.Query(r.Context(), `select `+adminUserColumns+`
		from auth.users u join app.profiles p on p.id = u.id
		where u.email::text ilike $1 or p.username ilike $1
		order by u.created_at desc, u.id desc limit 25 offset $2`, pattern, (page-1)*25)
	if err != nil {
		server.adminError(w, "users could not be loaded", err)
		return
	}
	users := []adminUser{}
	for rows.Next() {
		var user adminUser
		user, err = scanAdminUser(rows)
		if err != nil {
			break
		}
		users = append(users, user)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		server.adminError(w, "users could not be loaded", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"users": users, "total": total, "page": page})
}

func (server *Handler) AdminOrders(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	page, err := strconv.Atoi(r.URL.Query().Get("page"))
	if err != nil || page < 1 {
		page = 1
	}
	if page > 10000 {
		page = 10000
	}
	userID := r.URL.Query().Get("user")
	if userID != "" && !validAdminID(userID) {
		httpx.Problem(w, 400, "invalid user")
		return
	}
	status := r.URL.Query().Get("status")
	if status != "" && status != "pending" && status != "paid" && status != "refunded" && status != "failed" {
		httpx.Problem(w, 400, "invalid status")
		return
	}
	var total int
	err = server.db.QueryRow(r.Context(), `select count(*) from ops.payment_orders
		where (nullif($1, '') is null or user_id = nullif($1, '')::uuid) and ($2 = '' or status = $2)`, userID, status).Scan(&total)
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	rows, err := server.db.Query(r.Context(), `select `+adminOrderColumns+`
		from ops.payment_orders o join auth.users u on u.id = o.user_id
		where (nullif($1, '') is null or o.user_id = nullif($1, '')::uuid) and ($2 = '' or o.status = $2)
		order by o.created_at desc, o.id desc limit 25 offset $3`, userID, status, (page-1)*25)
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	orders, err := scanOrders(rows)
	rows.Close()
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"orders": orders, "total": total, "page": page})
}

func (server *Handler) AdminUser(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	id := r.PathValue("id")
	if !validAdminID(id) {
		http.NotFound(w, r)
		return
	}
	rows, err := server.db.Query(r.Context(), `select `+adminUserColumns+`
		from auth.users u join app.profiles p on p.id = u.id where u.id = $1`, id)
	if err != nil {
		server.adminError(w, "user could not be loaded", err)
		return
	}
	var user adminUser
	if rows.Next() {
		user, err = scanAdminUser(rows)
	} else {
		err = rows.Err()
		if err == nil {
			err = pgx.ErrNoRows
		}
	}
	rows.Close()
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		server.adminError(w, "user could not be loaded", err)
		return
	}
	var profile auth.Profile
	err = server.db.QueryRow(r.Context(), `select username, full_name, profession, affiliation,
		location, website, bio from app.profiles where id = $1`, id).Scan(
		&profile.Username, &profile.FullName, &profile.Profession,
		&profile.Affiliation, &profile.Location, &profile.Website, &profile.Bio)
	if err != nil {
		server.adminError(w, "profile could not be loaded", err)
		return
	}
	rows, err = server.db.Query(r.Context(), `select `+adminOrderColumns+`
		from ops.payment_orders o join auth.users u on u.id = o.user_id
		where o.user_id = $1 order by o.created_at desc, o.id desc limit 100`, id)
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	orders, err := scanOrders(rows)
	rows.Close()
	if err != nil {
		server.adminError(w, "orders could not be loaded", err)
		return
	}
	type diagram struct {
		ID        string    `json:"id"`
		Title     string    `json:"title"`
		Category  string    `json:"category"`
		UpdatedAt time.Time `json:"updated_at"`
	}
	rows, err = server.db.Query(r.Context(), `select id::text, title, category, updated_at from app.diagrams
		where user_id = $1 order by updated_at desc limit 100`, id)
	if err != nil {
		server.adminError(w, "diagrams could not be loaded", err)
		return
	}
	diagrams := []diagram{}
	for rows.Next() {
		var d diagram
		if err = rows.Scan(&d.ID, &d.Title, &d.Category, &d.UpdatedAt); err != nil {
			break
		}
		diagrams = append(diagrams, d)
	}
	if err == nil {
		err = rows.Err()
	}
	rows.Close()
	if err != nil {
		server.adminError(w, "diagrams could not be loaded", err)
		return
	}
	var generations int64
	var tokens int64
	err = server.db.QueryRow(r.Context(), `select coalesce(sum(generations), 0)::bigint,
		coalesce(sum(ai_tokens), 0)::bigint from app.daily_usage where user_id = $1`, id).Scan(&generations, &tokens)
	if err != nil {
		server.adminError(w, "usage could not be loaded", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{
		"user": user, "profile": profile, "orders": orders, "diagrams": diagrams,
		"generations": generations, "ai_tokens": tokens,
	})
}

func validAdminID(id string) bool {
	if len(id) != 36 {
		return false
	}
	for i, c := range id {
		if i == 8 || i == 13 || i == 18 || i == 23 {
			if c != '-' {
				return false
			}
			continue
		}
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F')) {
			return false
		}
	}
	return true
}

type adminCreateInput struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
	Verified bool   `json:"verified"`
}

func (server *Handler) AdminCreateUser(w http.ResponseWriter, r *http.Request) {
	var input adminCreateInput
	if httpx.ReadJSON(w, r, &input) != nil {
		httpx.Problem(w, 400, "invalid user details")
		return
	}
	email, err := server.auth.NormalizeEmail(input.Email)
	if err != nil {
		httpx.Problem(w, 400, err.Error())
		return
	}
	name := strings.TrimSpace(input.Name)
	if len([]rune(name)) > 80 {
		httpx.Problem(w, 400, "name is too long")
		return
	}
	hash, err := server.auth.HashPassword(input.Password)
	if err != nil {
		httpx.Problem(w, 400, err.Error())
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "user could not be created", err)
		return
	}
	defer tx.Rollback(r.Context())
	var id string
	err = tx.QueryRow(r.Context(), `insert into auth.users (email, email_verified_at)
		values ($1, case when $2 then now() else null end) returning id::text`, email, input.Verified).Scan(&id)
	if adminConflict(w, err) {
		return
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into auth.password_credentials (user_id, password_hash) values ($1, $2)`, id, hash)
	}
	if err == nil && name != "" {
		_, err = tx.Exec(r.Context(), `update app.profiles set full_name = $2 where id = $1`, id, name)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into ops.admin_audit (actor_id, target_id, target_email, action)
		values ($1, $2, $3, 'create')`, currentSession(r).User.ID, id, email)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "user could not be created", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

type adminUpdateInput struct {
	Email        string       `json:"email"`
	Role         string       `json:"role"`
	Verified     bool         `json:"verified"`
	Disabled     bool         `json:"disabled"`
	Tier         string       `json:"tier"`
	PremiumUntil *time.Time   `json:"premium_until"`
	Profile      auth.Profile `json:"profile"`
}

func (server *Handler) AdminUpdateUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validAdminID(id) {
		http.NotFound(w, r)
		return
	}
	var input adminUpdateInput
	if httpx.ReadJSON(w, r, &input) != nil {
		httpx.Problem(w, 400, "invalid user details")
		return
	}
	email, err := server.auth.NormalizeEmail(input.Email)
	if err != nil {
		httpx.Problem(w, 400, err.Error())
		return
	}
	profile, err := validProfile(input.Profile)
	if err != nil {
		httpx.Problem(w, 400, err.Error())
		return
	}
	if (input.Role != "user" && input.Role != "admin") || (input.Tier != "free" && input.Tier != "premium") ||
		(input.Tier == "premium" && input.PremiumUntil != nil && !input.PremiumUntil.After(time.Now())) {
		httpx.Problem(w, 400, "invalid role or plan")
		return
	}
	if id == currentSession(r).User.ID && (input.Role != "admin" || input.Disabled) {
		httpx.Problem(w, 400, "you cannot remove your own admin access")
		return
	}
	if input.Tier == "premium" && input.PremiumUntil == nil {
		// Billing cannot extend a legacy premium plan with no expiry.
		expires := time.Now().UTC().AddDate(0, 0, 30)
		input.PremiumUntil = &expires
	}
	if input.Tier == "free" {
		input.PremiumUntil = nil
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "user could not be updated", err)
		return
	}
	defer tx.Rollback(r.Context())
	// Serialize privilege changes and deletions, including two admins acting concurrently.
	if _, err = tx.Exec(r.Context(), `select pg_advisory_xact_lock(78121)`); err != nil {
		server.adminError(w, "user could not be updated", err)
		return
	}
	var oldRole, oldEmail string
	var oldDisabledAt *time.Time
	err = tx.QueryRow(r.Context(), `select role, email::text, disabled_at from auth.users where id = $1 for update`, id).Scan(&oldRole, &oldEmail, &oldDisabledAt)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		server.adminError(w, "user could not be updated", err)
		return
	}
	if oldRole == "admin" && oldDisabledAt == nil && (input.Role != "admin" || input.Disabled) {
		var count int
		if err = tx.QueryRow(r.Context(), `select count(*) from auth.users where role = 'admin' and disabled_at is null`).Scan(&count); err != nil {
			server.adminError(w, "user could not be updated", err)
			return
		}
		if count <= 1 {
			httpx.Problem(w, 409, "at least one active admin is required")
			return
		}
	}
	_, err = tx.Exec(r.Context(), `update auth.users set email = $2, role = $3,
		email_verified_at = case when $4 then coalesce(email_verified_at, now()) else null end,
		disabled_at = case when $5 then coalesce(disabled_at, now()) else null end where id = $1`,
		id, email, input.Role, input.Verified, input.Disabled)
	if adminConflict(w, err) {
		return
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `update app.profiles set tier = $2, premium_until = $3,
		username = $4, full_name = $5, profession = $6, affiliation = $7,
		location = $8, website = $9, bio = $10 where id = $1`, id, input.Tier,
			input.PremiumUntil, profile.Username, profile.FullName, profile.Profession,
			profile.Affiliation, profile.Location, profile.Website, profile.Bio)
	}
	if err == nil && !strings.EqualFold(oldEmail, email) {
		_, err = tx.Exec(r.Context(), `update auth.one_time_tokens set used_at = now()
			where user_id = $1 and used_at is null`, id)
	}
	if err == nil && !strings.EqualFold(oldEmail, email) {
		_, err = tx.Exec(r.Context(), `delete from ops.email_outbox
			where recipient = $1 and sent_at is null`, oldEmail)
	}
	if err == nil && (input.Disabled || !input.Verified || !strings.EqualFold(oldEmail, email) || (oldRole == "admin" && input.Role != "admin")) {
		_, err = tx.Exec(r.Context(), `update auth.sessions set revoked_at = now()
			where user_id = $1 and revoked_at is null`, id)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into ops.admin_audit (actor_id, target_id, target_email, action)
		values ($1, $2, $3, 'update')`, currentSession(r).User.ID, id, email)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "user could not be updated", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"notice": "User saved."})
}

func (server *Handler) AdminPassword(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validAdminID(id) {
		http.NotFound(w, r)
		return
	}
	var input struct {
		Password string `json:"password"`
	}
	if httpx.ReadJSON(w, r, &input) != nil {
		httpx.Problem(w, 400, "invalid password request")
		return
	}
	hash, err := server.auth.HashPassword(input.Password)
	if err != nil {
		httpx.Problem(w, 400, err.Error())
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "password could not be changed", err)
		return
	}
	defer tx.Rollback(r.Context())
	var email string
	err = tx.QueryRow(r.Context(), `select email::text from auth.users where id = $1 for update`, id).Scan(&email)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into auth.password_credentials (user_id, password_hash)
		values ($1, $2) on conflict (user_id) do update set password_hash = excluded.password_hash,
		version = auth.password_credentials.version + 1`, id, hash)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `update auth.sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, id)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `insert into ops.admin_audit (actor_id, target_id, target_email, action)
		values ($1, $2, $3, 'password')`, currentSession(r).User.ID, id, email)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "password could not be changed", err)
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"notice": "Password changed; sessions revoked."})
}

func (server *Handler) AdminDeleteUser(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !validAdminID(id) {
		http.NotFound(w, r)
		return
	}
	if id == currentSession(r).User.ID {
		httpx.Problem(w, 400, "you cannot delete your own account")
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "user could not be deleted", err)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `select pg_advisory_xact_lock(78121)`); err != nil {
		server.adminError(w, "user could not be deleted", err)
		return
	}
	var email, role string
	var avatarPath *string
	var disabledAt *time.Time
	err = tx.QueryRow(r.Context(), `select u.email::text, u.role, u.disabled_at, p.avatar_path
		from auth.users u join app.profiles p on p.id = u.id where u.id = $1 for update of u`, id).Scan(&email, &role, &disabledAt, &avatarPath)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		server.adminError(w, "user could not be deleted", err)
		return
	}
	var count int
	if err = tx.QueryRow(r.Context(), `select count(*) from ops.payment_orders where user_id = $1`, id).Scan(&count); err != nil {
		server.adminError(w, "user could not be deleted", err)
		return
	}
	if count > 0 {
		httpx.Problem(w, 409, "payment history exists; disable this account instead")
		return
	}
	if role == "admin" && disabledAt == nil {
		if err = tx.QueryRow(r.Context(), `select count(*) from auth.users where role = 'admin' and disabled_at is null`).Scan(&count); err != nil {
			server.adminError(w, "user could not be deleted", err)
			return
		}
		if count <= 1 {
			httpx.Problem(w, 409, "at least one active admin is required")
			return
		}
	}
	_, err = tx.Exec(r.Context(), `insert into ops.admin_audit (actor_id, target_id, target_email, action)
		values ($1, $2, $3, 'delete')`, currentSession(r).User.ID, id, email)
	if err == nil {
		_, err = tx.Exec(r.Context(), `delete from ops.email_outbox where recipient = $1`, email)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `delete from auth.users where id = $1`, id)
	}
	if adminConflict(w, err) {
		return
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "user could not be deleted", err)
		return
	}
	if avatarPath != nil {
		if err := os.RemoveAll(filepath.Join(server.cfg.UploadsDir, "avatars", id)); err != nil {
			server.log.Error("deleted user avatar cleanup failed", "user", id, "error", err)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func adminConflict(w http.ResponseWriter, err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && (pgErr.Code == "23505" || pgErr.Code == "23503") {
		httpx.Problem(w, http.StatusConflict, "email or username is taken, or payment history exists")
		return true
	}
	return false
}
