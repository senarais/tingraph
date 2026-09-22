package ai

import (
	"bytes"
	"context"
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	maxOutputTokens = 1000
	minOutputTokens = 256
	maxInputTokens  = 3000
)

//go:embed briefings.json
var briefingJSON []byte

type Briefing struct {
	Keyword  string `json:"keyword"`
	Name     string `json:"name"`
	Briefing string `json:"briefing"`
}

type Turn struct {
	Role   string `json:"role"`
	Text   string `json:"text"`
	Source string `json:"source,omitempty"`
}

type Retry struct {
	Source    string `json:"source"`
	Complaint string `json:"complaint"`
}

type Ask struct {
	Category  string `json:"category"`
	Direction string `json:"direction"`
	Code      string `json:"code"`
	Turns     []Turn `json:"turns"`
	Retry     *Retry `json:"retry,omitempty"`
}

type Attachment struct {
	MimeType string `json:"mimeType"`
	Data     string `json:"data"`
}

type Reply struct {
	Message string `json:"message"`
	Source  string `json:"source"`
}

type Service struct {
	db        *pgxpool.Pool
	apiKey    string
	model     string
	client    *http.Client
	briefings map[string]Briefing
}

type QuotaError struct{}

func (QuotaError) Error() string { return "daily Tingraph AI token limit reached" }

type InputLimitError struct{}

func (InputLimitError) Error() string { return "request is longer than 3,000 input tokens" }

func New(db *pgxpool.Pool, apiKey, model string) (*Service, error) {
	briefings := map[string]Briefing{}
	if err := json.Unmarshal(briefingJSON, &briefings); err != nil {
		return nil, fmt.Errorf("load AI briefings: %w", err)
	}
	return &Service{
		db: db, apiKey: apiKey, model: model,
		client:    &http.Client{Timeout: 75 * time.Second},
		briefings: briefings,
	}, nil
}

func (service *Service) Enabled() bool { return service.apiKey != "" }

func (service *Service) ValidCategory(category string) bool {
	_, ok := service.briefings[category]
	return ok
}

func (service *Service) Ask(
	ctx context.Context,
	userID string,
	ask Ask,
	attachments []Attachment,
) (Reply, error) {
	briefing, ok := service.briefings[ask.Category]
	if !ok || len(ask.Turns) == 0 {
		return Reply{}, errors.New("invalid AI request")
	}
	system := systemPrompt(briefing, ask.Code)
	contents := conversation(ask.Turns, attachments, ask.Retry)
	request := generationRequest(system, contents, maxOutputTokens)
	reservationID, outputTokens, err := service.reserve(ctx, userID, maxOutputTokens)
	if err != nil {
		return Reply{}, err
	}
	request["generationConfig"].(map[string]any)["maxOutputTokens"] = outputTokens
	inputTokens, err := service.countTokens(ctx, request)
	if err != nil {
		_ = service.settle(ctx, userID, reservationID, 0)
		return Reply{}, err
	}
	if inputTokens > maxInputTokens {
		_ = service.settle(ctx, userID, reservationID, 0)
		return Reply{}, InputLimitError{}
	}
	response, usage, err := service.generate(ctx, request)
	actual := 0
	if err == nil {
		actual = usage.Output
		if actual < 0 || actual > outputTokens {
			actual = outputTokens
		}
	}
	if settleErr := service.settle(ctx, userID, reservationID, actual); settleErr != nil && err == nil {
		return Reply{}, settleErr
	}
	return response, err
}

func systemPrompt(briefing Briefing, code string) string {
	code = strings.TrimSpace(code)
	if code == "" {
		code = "(the sheet is empty)"
	}
	return strings.Join([]string{
		"You are Tingraph AI, the assistant inside the Tingraph diagram editor. The sheet in front of the reader is a " + briefing.Name + ", and what you write is drawn straight onto it.",
		"", briefing.Briefing, "", "THE SOURCE ON THE SHEET RIGHT NOW", code, "", "ANSWER",
		"- `message`: one or two short sentences for the reader, in the language they wrote in. Plain prose - no code, no markdown, no fences, and never the source repeated back.",
		"- `source`: the whole diagram as Tingraph source - one `" + briefing.Keyword + " \"...\" { ... }` block, nothing before it and nothing after it, no fences and no commentary.",
		"- Write the whole diagram every time. The sheet is redrawn from `source`, so a fragment would throw the rest of the drawing away.",
		"- A change means the source above with that one change made. Keep every other element, id and label exactly as it is.",
		"- Do not invent keywords or settings: use only the ones listed under SYNTAX.",
		"- Keep labels short enough to read inside a box, and keep every id unique.",
		"- " + briefing.Keyword + " is the only notation this sheet can draw. If the reader asks for another one, say so in `message` and leave `source` empty.",
		"- When there is nothing to draw - a greeting, a question about the language - leave `source` empty and answer in `message`.",
	}, "\n")
}

func conversation(turns []Turn, attachments []Attachment, retry *Retry) []map[string]any {
	contents := make([]map[string]any, 0, len(turns)+2)
	for index, turn := range turns {
		role := "user"
		text := turn.Text
		if turn.Role == "ai" {
			role = "model"
			encoded, _ := json.Marshal(Reply{Message: turn.Text, Source: turn.Source})
			text = string(encoded)
		}
		parts := []map[string]any{{"text": text}}
		if role == "user" && index == len(turns)-1 {
			for _, attachment := range attachments {
				parts = append(parts, map[string]any{"inlineData": attachment})
			}
		}
		contents = append(contents, map[string]any{"role": role, "parts": parts})
	}
	if retry != nil {
		encoded, _ := json.Marshal(Reply{Source: retry.Source})
		contents = append(contents,
			map[string]any{"role": "model", "parts": []map[string]string{{"text": string(encoded)}}},
			map[string]any{"role": "user", "parts": []map[string]string{{"text": retryPrompt(*retry)}}},
		)
	}
	return contents
}

func retryPrompt(retry Retry) string {
	return "That source does not parse, so it cannot be drawn. The parser says:\n" + retry.Complaint +
		"\n\nThis is what you wrote:\n" + retry.Source +
		"\n\nWrite the whole diagram again, fixed. Keep `message` as it was."
}

func generationRequest(system string, contents []map[string]any, output int) map[string]any {
	return map[string]any{
		"systemInstruction": map[string]any{"parts": []map[string]string{{"text": system}}},
		"contents":          contents,
		"generationConfig": map[string]any{
			"temperature": 0.4, "maxOutputTokens": output,
			"responseMimeType": "application/json",
			"responseSchema": map[string]any{
				"type": "OBJECT",
				"properties": map[string]any{
					"message": map[string]string{"type": "STRING", "description": "One or two short sentences for the reader. Plain prose."},
					"source":  map[string]string{"type": "STRING", "description": "The whole diagram as Tingraph source, or an empty string."},
				},
				"required":         []string{"message", "source"},
				"propertyOrdering": []string{"message", "source"},
			},
		},
	}
}

func (service *Service) countTokens(ctx context.Context, generation map[string]any) (int, error) {
	request := map[string]any{"generateContentRequest": map[string]any{"model": "models/" + service.model}}
	for key, value := range generation {
		request["generateContentRequest"].(map[string]any)[key] = value
	}
	var response struct {
		TotalTokens int `json:"totalTokens"`
		Error       struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	status, err := service.call(ctx, "countTokens", request, &response)
	if err != nil || status < 200 || status >= 300 || response.TotalTokens <= 0 {
		if response.Error.Message != "" {
			return 0, errors.New(response.Error.Message)
		}
		return 0, errors.New("Gemini could not count this request's tokens")
	}
	return response.TotalTokens, nil
}

type tokenUsage struct{ Output int }

func (service *Service) generate(ctx context.Context, request map[string]any) (Reply, tokenUsage, error) {
	var response struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		Usage struct {
			Prompt int `json:"promptTokenCount"`
			Total  int `json:"totalTokenCount"`
			Output int `json:"candidatesTokenCount"`
		} `json:"usageMetadata"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	status, err := service.call(ctx, "generateContent", request, &response)
	usage := tokenUsage{Output: response.Usage.Output}
	if usage.Output == 0 && response.Usage.Total >= response.Usage.Prompt {
		usage.Output = response.Usage.Total - response.Usage.Prompt
	}
	if err != nil || status < 200 || status >= 300 {
		if response.Error.Message != "" {
			return Reply{}, usage, errors.New(response.Error.Message)
		}
		return Reply{}, usage, errors.New("Gemini could not answer")
	}
	var text strings.Builder
	if len(response.Candidates) > 0 {
		for _, part := range response.Candidates[0].Content.Parts {
			text.WriteString(part.Text)
		}
	}
	if text.Len() == 0 {
		return Reply{}, usage, errors.New("Gemini answered with nothing")
	}
	var reply Reply
	if err := json.Unmarshal([]byte(text.String()), &reply); err != nil {
		return Reply{}, usage, errors.New("Gemini returned invalid JSON")
	}
	reply.Message = strings.TrimSpace(reply.Message)
	reply.Source = unfence(reply.Source)
	return reply, usage, nil
}

func (service *Service) call(ctx context.Context, method string, body any, destination any) (int, error) {
	encoded, err := json.Marshal(body)
	if err != nil {
		return 0, err
	}
	endpoint := "https://generativelanguage.googleapis.com/v1beta/models/" + service.model + ":" + method
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(encoded))
	if err != nil {
		return 0, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-goog-api-key", service.apiKey)
	response, err := service.client.Do(request)
	if err != nil {
		return 0, err
	}
	defer response.Body.Close()
	decoder := json.NewDecoder(io.LimitReader(response.Body, 2<<20))
	if err := decoder.Decode(destination); err != nil {
		return response.StatusCode, err
	}
	return response.StatusCode, nil
}

func (service *Service) reserve(ctx context.Context, userID string, requested int) (string, int, error) {
	reserve := func(tokens int) (string, bool, int64, error) {
		var id *string
		var allowed bool
		var remaining int64
		err := service.db.QueryRow(ctx,
			`select reservation_id::text, allowed, remaining from app.reserve_ai_tokens($1, $2)`,
			userID, tokens,
		).Scan(&id, &allowed, &remaining)
		if id == nil {
			return "", allowed, remaining, err
		}
		return *id, allowed, remaining, err
	}
	id, allowed, remaining, err := reserve(requested)
	if err != nil {
		return "", 0, err
	}
	if allowed {
		return id, requested, nil
	}
	output := min(requested, int(remaining))
	if output < minOutputTokens {
		return "", 0, QuotaError{}
	}
	id, allowed, _, err = reserve(output)
	if err != nil {
		return "", 0, err
	}
	if !allowed {
		return "", 0, QuotaError{}
	}
	return id, output, nil
}

func (service *Service) settle(ctx context.Context, userID, reservationID string, actual int) error {
	_, err := service.db.Exec(ctx,
		`select app.settle_ai_tokens($1, $2, $3)`, userID, reservationID, actual,
	)
	return err
}

func unfence(source string) string {
	source = strings.TrimSpace(source)
	if strings.HasPrefix(source, "```") {
		if newline := strings.IndexByte(source, '\n'); newline >= 0 {
			source = source[newline+1:]
		}
		if strings.HasSuffix(source, "```") {
			source = strings.TrimSpace(strings.TrimSuffix(source, "```"))
		}
	}
	return source
}
