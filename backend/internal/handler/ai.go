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
	"unicode/utf8"

	"tingraph/backend/internal/ai"
	"tingraph/backend/internal/httpx"
)

const (
	maxAttachments      = 2
	maxAttachmentBytes  = 5 << 20
	maxAttachmentsBytes = 10 << 20
	// the ask is JSON, and escaping can double what was typed
	maxAskBytes       = 1 << 20
	maxAIRequestBytes = maxAttachmentsBytes + maxAskBytes + (64 << 10)
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
			httpx.Problem(w, http.StatusTooManyRequests, "Your Tingraph AI allowance for this 24-hour window is used up. Your profile shows when it resets.")
		case errors.As(err, &input):
			httpx.Problem(w, http.StatusRequestEntityTooLarge, "This request is too long for Tingraph AI. Shorten the message, attach fewer pages, or press Clear to start the conversation again.")
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
			contents, err := io.ReadAll(io.LimitReader(part, maxAskBytes+1))
			part.Close()
			if len(contents) > maxAskBytes {
				return ai.Ask{}, nil, errors.New("this conversation is too long to send; press Clear and ask again")
			}
			if err != nil || json.Unmarshal(contents, &ask) != nil {
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
	if !sawAsk {
		return ai.Ask{}, nil, errors.New("invalid AI request")
	}
	if utf8.RuneCountInString(ask.Code) > ai.MaxSourceChars {
		return ai.Ask{}, nil, errors.New("the source on the sheet is longer than 24,000 characters, too long for Tingraph AI")
	}
	if !validAsk(&ask) {
		return ai.Ask{}, nil, errors.New("invalid AI request")
	}
	return ask, attachments, nil
}

// cut keeps at most n characters of text, never splitting one.
func cut(text string, n int) string {
	if utf8.RuneCountInString(text) <= n {
		return text
	}
	return string([]rune(text)[:n])
}

func validAsk(ask *ai.Ask) bool {
	if ask.Direction != "right" {
		ask.Direction = "down"
	}
	if len(ask.Turns) > ai.MaxTurns {
		ask.Turns = ask.Turns[len(ask.Turns)-ai.MaxTurns:]
	}
	clean := ask.Turns[:0]
	for _, turn := range ask.Turns {
		if turn.Role != "ai" {
			turn.Role = "you"
		}
		if turn.Text == "" {
			continue
		}
		turn.Text = cut(turn.Text, ai.MaxPromptChars)
		// half a diagram reads as a diagram with things taken out of it
		if utf8.RuneCountInString(turn.Source) > ai.MaxSourceChars {
			turn.Source = ""
		}
		clean = append(clean, turn)
	}
	ask.Turns = clean
	if ask.Retry != nil {
		if ask.Retry.Source == "" || ask.Retry.Complaint == "" || utf8.RuneCountInString(ask.Retry.Source) > ai.MaxSourceChars || utf8.RuneCountInString(ask.Retry.Complaint) > 1000 {
			return false
		}
	}
	return ask.Category != "" && len(ask.Turns) > 0
}
