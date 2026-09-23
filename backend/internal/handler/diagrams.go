package handler

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"tingraph/backend/internal/httpx"
)

const diagramBodyLimit = 11 << 20

var diagramCategories = map[string]bool{
	"flow": true, "bpmn": true, "org": true, "usecase": true, "activity": true,
	"sequence": true, "erd": true, "bar": true, "line": true, "pie": true,
	"scatter": true, "mind": true, "matrix": true, "venn": true, "fishbone": true,
}

type diagramInput struct {
	Title    string          `json:"title"`
	Category string          `json:"category"`
	Document json.RawMessage `json:"document"`
}

type diagramRow struct {
	ID        string          `json:"id"`
	Title     string          `json:"title"`
	Category  string          `json:"category"`
	Document  json.RawMessage `json:"document,omitempty"`
	CreatedAt time.Time       `json:"created_at"`
	UpdatedAt time.Time       `json:"updated_at"`
}

func (server *Handler) ListDiagrams(w http.ResponseWriter, r *http.Request) {
	rows, err := server.db.Query(r.Context(), `
		select id::text, title, category, created_at, updated_at
		from app.diagrams where user_id = $1 order by updated_at desc`, currentSession(r).User.ID,
	)
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "diagrams could not be loaded")
		return
	}
	defer rows.Close()
	diagrams := make([]diagramRow, 0)
	for rows.Next() {
		var diagram diagramRow
		if err := rows.Scan(&diagram.ID, &diagram.Title, &diagram.Category, &diagram.CreatedAt, &diagram.UpdatedAt); err != nil {
			httpx.Problem(w, http.StatusInternalServerError, "diagrams could not be loaded")
			return
		}
		diagrams = append(diagrams, diagram)
	}
	if rows.Err() != nil {
		httpx.Problem(w, http.StatusInternalServerError, "diagrams could not be loaded")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"diagrams": diagrams})
}

func (server *Handler) GetDiagram(w http.ResponseWriter, r *http.Request) {
	var diagram diagramRow
	err := server.db.QueryRow(r.Context(), `
		select id::text, title, category, document, created_at, updated_at
		from app.diagrams where id = $1 and user_id = $2`,
		r.PathValue("id"), currentSession(r).User.ID,
	).Scan(&diagram.ID, &diagram.Title, &diagram.Category, &diagram.Document, &diagram.CreatedAt, &diagram.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be loaded")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"diagram": diagram})
}

func (server *Handler) CreateDiagram(w http.ResponseWriter, r *http.Request) {
	input, err := readDiagram(w, r)
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	var id string
	err = server.db.QueryRow(r.Context(), `
		insert into app.diagrams (user_id, title, category, document)
		values ($1, $2, $3, $4) returning id::text`,
		currentSession(r).User.ID, input.Title, input.Category, input.Document,
	).Scan(&id)
	if err != nil {
		if diagramLimitError(err) {
			httpx.Problem(w, http.StatusConflict, "saved-diagram limit reached for your plan")
			return
		}
		server.log.Error("diagram insert failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be saved")
		return
	}
	httpx.JSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (server *Handler) UpdateDiagram(w http.ResponseWriter, r *http.Request) {
	input, err := readDiagram(w, r)
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	var id string
	err = server.db.QueryRow(r.Context(), `
		update app.diagrams set title = $3, category = $4, document = $5
		where id = $1 and user_id = $2 returning id::text`,
		r.PathValue("id"), currentSession(r).User.ID, input.Title, input.Category, input.Document,
	).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		http.NotFound(w, r)
		return
	}
	if err != nil {
		server.log.Error("diagram update failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be saved")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"id": id})
}

func (server *Handler) DeleteDiagram(w http.ResponseWriter, r *http.Request) {
	result, err := server.db.Exec(r.Context(),
		`delete from app.diagrams where id = $1 and user_id = $2`,
		r.PathValue("id"), currentSession(r).User.ID,
	)
	if err != nil {
		httpx.Problem(w, http.StatusInternalServerError, "diagram could not be deleted")
		return
	}
	if result.RowsAffected() == 0 {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func readDiagram(w http.ResponseWriter, r *http.Request) (diagramInput, error) {
	r.Body = http.MaxBytesReader(w, r.Body, diagramBodyLimit)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	var input diagramInput
	if err := decoder.Decode(&input); err != nil {
		return diagramInput{}, errors.New("invalid diagram document")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return diagramInput{}, errors.New("invalid diagram document")
	}
	input.Title = strings.TrimSpace(input.Title)
	if input.Title == "" || utf8.RuneCountInString(input.Title) > 120 || !diagramCategories[input.Category] {
		return diagramInput{}, errors.New("invalid diagram title or category")
	}
	if len(input.Document) == 0 || len(input.Document) > 10<<20 {
		return diagramInput{}, errors.New("diagram document is too large")
	}
	var document struct {
		Version   int                        `json:"version"`
		Category  string                     `json:"category"`
		Source    string                     `json:"source"`
		Direction string                     `json:"direction"`
		Ink       map[string]json.RawMessage `json:"ink"`
		Style     string                     `json:"style"`
		Scene     map[string]json.RawMessage `json:"scene"`
	}
	if err := json.Unmarshal(input.Document, &document); err != nil ||
		document.Version != 1 || document.Category != input.Category ||
		utf8.RuneCountInString(document.Source) > 200_000 ||
		(document.Direction != "down" && document.Direction != "right") ||
		(document.Style != "formal" && document.Style != "playful") ||
		document.Ink == nil || document.Scene == nil {
		return diagramInput{}, errors.New("invalid diagram document")
	}
	if _, ok := document.Scene["elements"]; !ok {
		return diagramInput{}, errors.New("invalid diagram scene")
	}
	if _, ok := document.Scene["files"]; !ok {
		document.Scene["files"] = json.RawMessage(`{}`)
		normalized, err := json.Marshal(document)
		if err != nil {
			return diagramInput{}, errors.New("invalid diagram document")
		}
		input.Document = normalized
	}
	return input, nil
}

func diagramLimitError(err error) bool {
	var postgresError *pgconn.PgError
	return errors.As(err, &postgresError) && postgresError.Message == "diagram_limit_reached"
}
