package handler

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	"tingraph/backend/internal/ai"
	"tingraph/backend/internal/httpx"
)

const (
	maxAttachments      = 2
	maxAttachmentBytes  = 5 << 20
	maxAttachmentsBytes = 10 << 20
	maxAIRequestBytes   = maxAttachmentsBytes + (128 << 10)
)

var attachmentTypes = map[string]bool{
	"application/pdf": true,
	"image/jpeg":      true,
	"image/png":       true,
	"image/webp":      true,
	"image/heic":      true,
	"image/heif":      true,
}

func (server *Handler) AI(w http.ResponseWriter, r *http.Request) {
	if !server.aiService.Enabled() {
		httpx.Problem(w, http.StatusServiceUnavailable, "Tingraph AI is not configured")
		return
	}
	userID := currentSession(r).User.ID
	if server.limited(r.Context(), "ai_user", userID, 20, 10*time.Minute) {
		w.Header().Set("Retry-After", "600")
		httpx.Problem(w, http.StatusTooManyRequests, "Too many Tingraph AI requests. Try again shortly.")
		return
	}
	select {
	case server.aiSlots <- struct{}{}:
		defer func() { <-server.aiSlots }()
	default:
		w.Header().Set("Retry-After", "10")
		httpx.Problem(w, http.StatusServiceUnavailable, "Tingraph AI is busy. Try again shortly.")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxAIRequestBytes)
	reader, err := r.MultipartReader()
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, "invalid AI request")
		return
	}
	ask, attachments, err := readAIRequest(reader)
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	if !server.aiService.ValidCategory(ask.Category) || len(ask.Turns) == 0 {
		httpx.Problem(w, http.StatusBadRequest, "invalid AI request")
		return
	}
	reply, err := server.aiService.Ask(r.Context(), userID, ask, attachments)
	if err != nil {
		var quota ai.QuotaError
		var input ai.InputLimitError
		switch {
		case errors.As(err, &quota):
			httpx.Problem(w, http.StatusTooManyRequests, "Your daily Tingraph AI token limit is reached. It resets at 00:00 UTC.")
		case errors.As(err, &input):
			httpx.Problem(w, http.StatusRequestEntityTooLarge, "This request is too long. Keep the input under 3,000 tokens and try again.")
		default:
			server.log.Error("AI request failed", "error", err)
			httpx.Problem(w, http.StatusBadGateway, "Tingraph AI could not answer right now. Try again.")
		}
		return
	}
	httpx.JSON(w, http.StatusOK, reply)
}

func readAIRequest(reader *multipart.Reader) (ai.Ask, []ai.Attachment, error) {
	var ask ai.Ask
	var sawAsk bool
	attachments := make([]ai.Attachment, 0, maxAttachments)
	total := 0
	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return ai.Ask{}, nil, errors.New("invalid AI request")
		}
		if part.FormName() == "ask" && part.FileName() == "" && !sawAsk {
			contents, err := io.ReadAll(io.LimitReader(part, 64<<10))
			part.Close()
			if err != nil || len(contents) == 64<<10 || json.Unmarshal(contents, &ask) != nil {
				return ai.Ask{}, nil, errors.New("invalid AI request")
			}
			sawAsk = true
			continue
		}
		if part.FormName() != "attachments" || part.FileName() == "" {
			part.Close()
			continue
		}
		if len(attachments) >= maxAttachments {
			part.Close()
			return ai.Ask{}, nil, errors.New("attach up to 2 files at a time")
		}
		mimeType := strings.ToLower(strings.TrimSpace(part.Header.Get("Content-Type")))
		if !attachmentTypes[mimeType] {
			part.Close()
			return ai.Ask{}, nil, errors.New("choose a PDF, JPEG, PNG, WebP, HEIC, or HEIF file")
		}
		contents, err := io.ReadAll(io.LimitReader(part, maxAttachmentBytes+1))
		part.Close()
		if err != nil || len(contents) == 0 || len(contents) > maxAttachmentBytes {
			return ai.Ask{}, nil, errors.New("each file can be at most 5 MB")
		}
		total += len(contents)
		if total > maxAttachmentsBytes {
			return ai.Ask{}, nil, errors.New("attachments can total at most 10 MB")
		}
		attachments = append(attachments, ai.Attachment{
			MimeType: mimeType,
			Data:     base64.StdEncoding.EncodeToString(contents),
		})
	}
	if !sawAsk || !validAsk(&ask) {
		return ai.Ask{}, nil, errors.New("invalid AI request")
	}
	return ask, attachments, nil
}

func validAsk(ask *ai.Ask) bool {
	if len(ask.Code) > 4000 {
		ask.Code = ask.Code[:4000]
	}
	if ask.Direction != "right" {
		ask.Direction = "down"
	}
	if len(ask.Turns) > 8 {
		ask.Turns = ask.Turns[len(ask.Turns)-8:]
	}
	clean := ask.Turns[:0]
	for _, turn := range ask.Turns {
		if turn.Role != "ai" {
			turn.Role = "you"
		}
		if turn.Text == "" {
			continue
		}
		if len(turn.Text) > 4000 {
			turn.Text = turn.Text[:4000]
		}
		if len(turn.Source) > 4000 {
			turn.Source = turn.Source[:4000]
		}
		clean = append(clean, turn)
	}
	ask.Turns = clean
	if ask.Retry != nil {
		if ask.Retry.Source == "" || ask.Retry.Complaint == "" || len(ask.Retry.Source) > 4000 || len(ask.Retry.Complaint) > 1000 {
			return false
		}
	}
	return ask.Category != "" && len(ask.Turns) > 0
}
