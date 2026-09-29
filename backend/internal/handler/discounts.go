package handler

import (
	"errors"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"tingraph/backend/internal/httpx"
)

var discountPattern = regexp.MustCompile(`^[A-Z0-9_-]{3,32}$`)

type discountRow struct {
	Code     string `json:"code"`
	Percent  int    `json:"percent"`
	MaxUses  int    `json:"max_uses"`
	Paid     int    `json:"paid"`
	Reserved int    `json:"reserved"`
	Enabled  bool   `json:"enabled"`
}

func (server *Handler) AdminDiscounts(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	rows, err := server.db.Query(r.Context(), `select c.code, c.percent, c.max_uses,
		count(o.id) filter (where o.status = 'paid')::int,
		count(o.id) filter (where o.status = 'pending')::int, c.enabled
		from ops.discount_codes c left join ops.payment_orders o on o.discount_code = c.code
		where c.deleted_at is null group by c.code order by c.created_at desc limit 200`)
	if err != nil {
		server.adminError(w, "discounts could not be loaded", err)
		return
	}
	defer rows.Close()
	codes := []discountRow{}
	for rows.Next() {
		var code discountRow
		if err := rows.Scan(&code.Code, &code.Percent, &code.MaxUses, &code.Paid, &code.Reserved, &code.Enabled); err != nil {
			server.adminError(w, "discounts could not be loaded", err)
			return
		}
		codes = append(codes, code)
	}
	if err := rows.Err(); err != nil {
		server.adminError(w, "discounts could not be loaded", err)
		return
	}
	httpx.JSON(w, 200, map[string]any{"codes": codes})
}

func (server *Handler) AdminCreateDiscount(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Code    string `json:"code"`
		Percent int    `json:"percent"`
		MaxUses int    `json:"max_uses"`
	}
	if httpx.ReadJSON(w, r, &input) != nil {
		httpx.Problem(w, 400, "invalid discount")
		return
	}
	input.Code = strings.ToUpper(strings.TrimSpace(input.Code))
	if !discountPattern.MatchString(input.Code) || input.Percent < 1 || input.Percent > 99 || input.MaxUses < 1 || input.MaxUses > 1000000 {
		httpx.Problem(w, 400, "code must be 3–32 letters, digits, _ or -; discount 1–99%; limit at least 1")
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "discount could not be created", err)
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `insert into ops.discount_codes(code, percent, max_uses) values ($1,$2,$3)`, input.Code, input.Percent, input.MaxUses)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		httpx.Problem(w, 409, "code already exists")
		return
	}
	if err == nil {
		actor := currentSession(r).User
		_, err = tx.Exec(r.Context(), `insert into ops.admin_audit(actor_id, target_id, target_email, action, details)
			values ($1,$1,$2,'discount_create',$3)`, actor.ID, actor.Email, input.Code)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "discount could not be created", err)
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"code": input.Code})
}

func (server *Handler) AdminUpdateDiscount(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if !discountPattern.MatchString(code) {
		http.NotFound(w, r)
		return
	}
	var input struct {
		Enabled *bool `json:"enabled"`
	}
	if httpx.ReadJSON(w, r, &input) != nil || input.Enabled == nil {
		httpx.Problem(w, 400, "choose whether this code is active")
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "discount could not be updated", err)
		return
	}
	defer tx.Rollback(r.Context())
	var updated bool
	err = tx.QueryRow(r.Context(), `update ops.discount_codes set enabled = $2
		where code = $1 and deleted_at is null returning enabled`, code, *input.Enabled).Scan(&updated)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err == nil {
		actor := currentSession(r).User
		_, err = tx.Exec(r.Context(), `insert into ops.admin_audit(actor_id, target_id, target_email, action, details)
			values ($1,$1,$2,'discount_update',$3)`, actor.ID, actor.Email, code)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "discount could not be updated", err)
		return
	}
	httpx.JSON(w, 200, map[string]bool{"enabled": updated})
}

func (server *Handler) AdminDeleteDiscount(w http.ResponseWriter, r *http.Request) {
	code := r.PathValue("code")
	if !discountPattern.MatchString(code) {
		http.NotFound(w, r)
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		server.adminError(w, "discount could not be deleted", err)
		return
	}
	defer tx.Rollback(r.Context())
	var locked string
	err = tx.QueryRow(r.Context(), `select code from ops.discount_codes where code = $1 and deleted_at is null for update`, code).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `update ops.discount_codes set enabled = false, deleted_at = now() where code = $1`, code)
	}
	if err == nil {
		_, err = tx.Exec(r.Context(), `delete from ops.discount_codes c where c.code = $1
			and not exists (select 1 from ops.payment_orders o where o.discount_code = c.code)`, code)
	}
	if err == nil {
		actor := currentSession(r).User
		_, err = tx.Exec(r.Context(), `insert into ops.admin_audit(actor_id, target_id, target_email, action, details)
			values ($1,$1,$2,'discount_delete',$3)`, actor.ID, actor.Email, code)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		server.adminError(w, "discount could not be deleted", err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
