package handler

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/httpx"
)

// A saved diagram can be shared by one link per diagram, view-only or
// editable. The owner manages the link through /api/v1/diagrams/{id}/share;
// anyone holding it reads the diagram through /api/v1/shared/{token}, and a
// signed-in holder of an editable link saves through the same address.
//
// The token is the whole capability, so it is only ever compared whole, and
// the shared read never says who owns the diagram or what its id is. A link
// to a diagram whose owner has been disabled opens nothing, as if turned off.

var (
	shareTokenPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)
	uuidPattern       = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)
)

const (
	shareReadLimit  = 240
	shareWriteLimit = 120
)

type shareRow struct {
	Token  string `json:"token"`
	Access string `json:"access"`
}

type shareInput struct {
	Access string `json:"access"`
}

type sharedDiagram struct {
	Title     string          `json:"title"`
	Category  string          `json:"category"`
	Document  json.RawMessage `json:"document"`
	Revision  int64           `json:"revision"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func validShareAccess(access string) bool {
	return access == "view" || access == "edit"
}

// sharedHeaders keeps a shared diagram out of caches, search engines and the
// Referer of anything it links to: the address is the key to it.
func sharedHeaders(w http.ResponseWriter) {
	httpx.NoStore(w)
	w.Header().Set("X-Robots-Tag", "noindex, nofollow")
	w.Header().Set("Referrer-Policy", "no-referrer")
}

func (server *Handler) GetShare(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	var owned bool
	var share shareRow
	err := server.db.QueryRow(r.Context(), `
		select true, coalesce(s.token, ''), coalesce(s.access, '')
		from app.diagrams d left join app.diagram_shares s on s.diagram_id = d.id
		where d.id = $1 and d.user_id = $2`,
		id, currentSession(r).User.ID,
	).Scan(&owned, &share.Token, &share.Access)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "sharing could not be loaded")
		return
	}
	if share.Token == "" {
		httpx.JSON(w, http.StatusOK, map[string]any{"share": nil})
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"share": share})
}

// PutShare turns the link on, or changes what it allows. The link already
// handed out keeps working: changing view to edit does not change the token.
func (server *Handler) PutShare(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	var input shareInput
	if err := httpx.ReadJSON(w, r, &input); err != nil || !validShareAccess(input.Access) {
		httpx.Problem(w, http.StatusBadRequest, "access must be view or edit")
		return
	}
	token, _, err := auth.RandomToken()
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "link could not be made")
		return
	}
	var share shareRow
	err = server.db.QueryRow(r.Context(), `
		insert into app.diagram_shares (diagram_id, token, access)
		select d.id, $3, $4 from app.diagrams d where d.id = $1 and d.user_id = $2
		on conflict (diagram_id) do update set access = excluded.access
		returning token, access`,
		id, currentSession(r).User.ID, token, input.Access,
	).Scan(&share.Token, &share.Access)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		server.log.Error("share upsert failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "link could not be saved")
		return
	}
	// My diagrams lists which diagrams are shared
	server.invalidateDiagramList(currentSession(r).User.ID)
	httpx.JSON(w, http.StatusOK, map[string]any{"share": share})
}

// ResetShare replaces the token, so every copy of the old link stops working.
func (server *Handler) ResetShare(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	token, _, err := auth.RandomToken()
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "link could not be made")
		return
	}
	var share shareRow
	err = server.db.QueryRow(r.Context(), `
		update app.diagram_shares s set token = $3
		from app.diagrams d
		where s.diagram_id = d.id and d.id = $1 and d.user_id = $2
		returning s.token, s.access`,
		id, currentSession(r).User.ID, token,
	).Scan(&share.Token, &share.Access)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		server.log.Error("share reset failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "link could not be replaced")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"share": share})
}

// DeleteShare stops sharing. It is idempotent for the owner.
func (server *Handler) DeleteShare(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !uuidPattern.MatchString(id) {
		http.NotFound(w, r)
		return
	}
	var owned bool
	err := server.db.QueryRow(r.Context(), `
		with owned as (select id from app.diagrams where id = $1 and user_id = $2),
		removed as (delete from app.diagram_shares where diagram_id in (select id from owned))
		select exists(select 1 from owned)`,
		id, currentSession(r).User.ID,
	).Scan(&owned)
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "sharing could not be stopped")
		return
	}
	if !owned {
		http.NotFound(w, r)
		return
	}
	server.invalidateDiagramList(currentSession(r).User.ID)
	w.WriteHeader(http.StatusNoContent)
}

// GetShared is the public read of a shared diagram. It needs no account; a
// signed-in owner is told so, so the page can send them to their own copy.
func (server *Handler) GetShared(w http.ResponseWriter, r *http.Request) {
	sharedHeaders(w)
	token := r.PathValue("token")
	if server.limited(r.Context(), "share_read", server.clientIP(r), shareReadLimit, time.Minute) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many requests")
		return
	}
	if !shareTokenPattern.MatchString(token) {
		http.NotFound(w, r)
		return
	}
	var diagram sharedDiagram
	var id, owner, access string
	err := server.db.QueryRow(r.Context(), `
		select d.id::text, d.user_id::text, d.title, d.category, d.document, d.revision, d.updated_at, s.access
		from app.diagram_shares s
		join app.diagrams d on d.id = s.diagram_id
		join auth.users u on u.id = d.user_id and u.disabled_at is null
		where s.token = $1`, token,
	).Scan(&id, &owner, &diagram.Title, &diagram.Category, &diagram.Document, &diagram.Revision, &diagram.UpdatedAt, &access)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be loaded")
		return
	}
	result := map[string]any{"diagram": diagram, "access": access}
	if session, err := server.auth.Authenticate(r.Context(), server.auth.CookieToken(r)); err == nil && session.User.ID == owner {
		result["owned"] = id
	}
	httpx.JSON(w, http.StatusOK, result)
}

// UpdateShared saves an editable shared diagram. It needs a session (the
// router wraps it, CSRF included), an edit link, the diagram's own category,
// and the revision the editor started from: a save made against an older
// revision is refused, never merged.
func (server *Handler) UpdateShared(w http.ResponseWriter, r *http.Request) {
	sharedHeaders(w)
	token := r.PathValue("token")
	if !shareTokenPattern.MatchString(token) {
		http.NotFound(w, r)
		return
	}
	if server.limited(r.Context(), "share_write", currentSession(r).User.ID, shareWriteLimit, time.Minute) {
		httpx.Problem(w, http.StatusTooManyRequests, "too many saves; wait a moment")
		return
	}
	input, err := readDiagram(w, r)
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	if input.Revision == nil {
		httpx.Problem(w, http.StatusBadRequest, "a shared save names the revision it was made from")
		return
	}
	var revision int64
	var owner string
	err = server.db.QueryRow(r.Context(), `
		update app.diagrams d set title = $2, document = $3, revision = d.revision + 1
		from app.diagram_shares s, auth.users u
		where s.token = $1 and s.diagram_id = d.id and s.access = 'edit'
		  and u.id = d.user_id and u.disabled_at is null
		  and d.category = $4 and d.revision = $5
		returning d.revision, d.user_id::text`,
		token, input.Title, input.Document, input.Category, *input.Revision,
	).Scan(&revision, &owner)
	if errors.Is(err, pgx.ErrNoRows) {
		server.sharedRefusal(w, r, token, input.Category)
		return
	}
	if err != nil {
		server.log.Error("shared diagram update failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be saved")
		return
	}
	server.invalidateDiagramList(owner)
	httpx.JSON(w, http.StatusOK, map[string]any{"revision": revision})
}

// sharedRefusal says why a shared save matched nothing, in the order a holder
// of the link can do something about it.
func (server *Handler) sharedRefusal(w http.ResponseWriter, r *http.Request, token, category string) {
	var access, current string
	err := server.db.QueryRow(r.Context(), `
		select s.access, d.category
		from app.diagram_shares s
		join app.diagrams d on d.id = s.diagram_id
		join auth.users u on u.id = d.user_id and u.disabled_at is null
		where s.token = $1`, token,
	).Scan(&access, &current)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		http.NotFound(w, r)
	case err != nil:
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be saved")
	case access != "edit":
		httpx.Problem(w, http.StatusForbidden, "this link is view-only")
	case current != category:
		httpx.Problem(w, http.StatusBadRequest, "invalid diagram category")
	default:
		httpx.Problem(w, http.StatusPreconditionFailed, "this diagram was saved by someone else since you opened it")
	}
}
