package api

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5/pgconn"
	_ "golang.org/x/image/webp"

	"tingraph/backend/internal/auth"
	"tingraph/backend/internal/httpx"
)

const avatarLimit = 1 << 20

var (
	usernamePattern  = regexp.MustCompile(`^[a-z0-9_]{3,24}$`)
	mediaPartPattern = regexp.MustCompile(`^[0-9a-f-]+$`)
	mediaFilePattern = regexp.MustCompile(`^[0-9a-f]{32}\.(webp|png|jpg)$`)
)

type entitlements struct {
	Tier            string `json:"tier"`
	DiagramCount    int64  `json:"diagram_count"`
	DiagramLimit    int    `json:"diagram_limit"`
	GenerationUsed  int    `json:"generation_used"`
	GenerationLimit *int   `json:"generation_limit"`
	AITokensUsed    int64  `json:"ai_tokens_used"`
	AITokenLimit    int64  `json:"ai_token_limit"`
}

func (server *Server) me(w http.ResponseWriter, r *http.Request) {
	httpx.NoStore(w)
	session := currentSession(r)
	usage, err := server.entitlements(r, session.User.ID)
	if err != nil {
		server.log.Error("entitlements query failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "account could not be loaded")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"user": session.User, "entitlements": usage})
}

func (server *Server) entitlements(r *http.Request, userID string) (entitlements, error) {
	var result entitlements
	err := server.db.QueryRow(r.Context(), `
		select p.tier,
		       (select count(*) from app.diagrams d where d.user_id = p.id),
		       case when p.tier = 'premium' then 100 else 2 end,
		       coalesce(u.generations, 0),
		       case when p.tier = 'premium' then null else 10 end,
		       coalesce(u.ai_tokens, 0),
		       case when p.tier = 'premium' then 100000::bigint else 2000::bigint end
		from app.profiles p
		left join app.daily_usage u
		  on u.user_id = p.id and u.usage_date = (now() at time zone 'utc')::date
		where p.id = $1`, userID,
	).Scan(
		&result.Tier, &result.DiagramCount, &result.DiagramLimit,
		&result.GenerationUsed, &result.GenerationLimit,
		&result.AITokensUsed, &result.AITokenLimit,
	)
	return result, err
}

func (server *Server) updateProfile(w http.ResponseWriter, r *http.Request) {
	var input auth.Profile
	if err := httpx.ReadJSON(w, r, &input); err != nil {
		httpx.Problem(w, http.StatusBadRequest, "invalid profile")
		return
	}
	profile, err := validProfile(input)
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	userID := currentSession(r).User.ID
	_, err = server.db.Exec(r.Context(), `
		update app.profiles set
		  username = $2, full_name = $3, profession = $4, affiliation = $5,
		  location = $6, website = $7, bio = $8
		where id = $1`,
		userID, profile.Username, profile.FullName, profile.Profession,
		profile.Affiliation, profile.Location, profile.Website, profile.Bio,
	)
	if err != nil {
		var postgresError *pgconn.PgError
		if errors.As(err, &postgresError) && postgresError.Code == "23505" {
			httpx.Problem(w, http.StatusConflict, "that username is taken")
			return
		}
		server.log.Error("profile update failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "profile could not be saved")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"notice": "Profile saved."})
}

func validProfile(input auth.Profile) (auth.Profile, error) {
	fields := []struct {
		name  string
		value **string
		limit int
	}{
		{"username", &input.Username, 24},
		{"full name", &input.FullName, 80},
		{"profession", &input.Profession, 60},
		{"affiliation", &input.Affiliation, 100},
		{"location", &input.Location, 80},
		{"website", &input.Website, 200},
		{"bio", &input.Bio, 280},
	}
	for _, field := range fields {
		if *field.value == nil {
			continue
		}
		trimmed := strings.TrimSpace(**field.value)
		if trimmed == "" {
			*field.value = nil
			continue
		}
		if utf8.RuneCountInString(trimmed) > field.limit {
			return auth.Profile{}, errors.New(field.name + " is too long")
		}
		*field.value = &trimmed
	}
	if input.Username != nil && !usernamePattern.MatchString(*input.Username) {
		return auth.Profile{}, errors.New("username must be 3-24 lowercase letters, numbers, or underscores")
	}
	if input.Website != nil {
		value := *input.Website
		if !strings.Contains(value, "://") {
			value = "https://" + value
		}
		parsed, err := url.Parse(value)
		if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.Hostname() == "" || parsed.User != nil {
			return auth.Profile{}, errors.New("website must be a valid http or https address")
		}
		input.Website = &value
	}
	input.AvatarURL = nil
	return input, nil
}

func (server *Server) uploadAvatar(w http.ResponseWriter, r *http.Request) {
	userID := currentSession(r).User.ID
	if server.limited(r.Context(), "avatar_user", userID, 20, time.Hour) {
		w.Header().Set("Retry-After", "3600")
		httpx.Problem(w, http.StatusTooManyRequests, "too many picture uploads")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, avatarLimit+(64<<10))
	if err := r.ParseMultipartForm(64 << 10); err != nil {
		httpx.Problem(w, http.StatusBadRequest, "picture must be 1 MB or smaller")
		return
	}
	file, header, err := r.FormFile("avatar")
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, "choose a picture first")
		return
	}
	defer file.Close()
	path, err := server.storeAvatar(file, header, userID)
	if err != nil {
		httpx.Problem(w, http.StatusBadRequest, err.Error())
		return
	}
	tx, err := server.db.Begin(r.Context())
	if err != nil {
		_ = os.Remove(filepath.Join(server.cfg.UploadsDir, "avatars", filepath.FromSlash(path)))
		httpx.Problem(w, http.StatusInternalServerError, "picture could not be saved")
		return
	}
	defer tx.Rollback(r.Context())
	var previous *string
	if err := tx.QueryRow(r.Context(),
		`select avatar_path from app.profiles where id = $1 for update`, userID,
	).Scan(&previous); err == nil {
		_, err = tx.Exec(r.Context(), `update app.profiles set avatar_path = $2 where id = $1`, userID, path)
	}
	if err == nil {
		err = tx.Commit(r.Context())
	}
	if err != nil {
		_ = os.Remove(filepath.Join(server.cfg.UploadsDir, "avatars", filepath.FromSlash(path)))
		server.log.Error("avatar profile update failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "picture could not be saved")
		return
	}
	if previous != nil && *previous != path {
		_ = os.Remove(filepath.Join(server.cfg.UploadsDir, "avatars", filepath.FromSlash(*previous)))
	}
	publicURL := server.cfg.PublicOrigin.String() + "/media/avatars/" + path
	httpx.JSON(w, http.StatusOK, map[string]string{"avatar_url": publicURL, "notice": "Picture updated."})
}

func (server *Server) storeAvatar(file multipart.File, header *multipart.FileHeader, userID string) (string, error) {
	if header.Size > avatarLimit {
		return "", errors.New("picture must be 1 MB or smaller")
	}
	contents, err := io.ReadAll(io.LimitReader(file, avatarLimit+1))
	if err != nil || len(contents) == 0 || len(contents) > avatarLimit {
		return "", errors.New("picture must be 1 MB or smaller")
	}
	mime := http.DetectContentType(contents)
	extensions := map[string]string{"image/webp": "webp", "image/png": "png", "image/jpeg": "jpg"}
	extension, ok := extensions[mime]
	if !ok {
		return "", errors.New("picture must be PNG, JPEG, or WebP")
	}
	config, _, err := image.DecodeConfig(bytes.NewReader(contents))
	if err != nil || config.Width != 256 || config.Height != 256 {
		return "", errors.New("picture must be a 256px square")
	}
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", errors.New("picture could not be stored")
	}
	relative := userID + "/" + hex.EncodeToString(random) + "." + extension
	directory := filepath.Join(server.cfg.UploadsDir, "avatars", userID)
	if err := os.MkdirAll(directory, 0o750); err != nil {
		return "", errors.New("picture could not be stored")
	}
	temporary, err := os.CreateTemp(directory, ".upload-*")
	if err != nil {
		return "", errors.New("picture could not be stored")
	}
	temporaryName := temporary.Name()
	defer os.Remove(temporaryName)
	if err := temporary.Chmod(0o640); err != nil {
		temporary.Close()
		return "", errors.New("picture could not be stored")
	}
	if _, err := temporary.Write(contents); err != nil {
		temporary.Close()
		return "", errors.New("picture could not be stored")
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return "", errors.New("picture could not be stored")
	}
	if err := temporary.Close(); err != nil {
		return "", errors.New("picture could not be stored")
	}
	finalName := filepath.Join(server.cfg.UploadsDir, "avatars", filepath.FromSlash(relative))
	if err := os.Rename(temporaryName, finalName); err != nil {
		return "", errors.New("picture could not be stored")
	}
	return relative, nil
}

func (server *Server) avatar(w http.ResponseWriter, r *http.Request) {
	user := r.PathValue("user")
	name := r.PathValue("file")
	if !mediaPartPattern.MatchString(user) || !mediaFilePattern.MatchString(name) {
		http.NotFound(w, r)
		return
	}
	path := filepath.Join(server.cfg.UploadsDir, "avatars", user, name)
	file, err := os.Open(path)
	if err != nil {
		http.NotFound(w, r)
		return
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		http.NotFound(w, r)
		return
	}
	w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	http.ServeContent(w, r, name, info.ModTime(), file)
}

func (server *Server) consumeGeneration(w http.ResponseWriter, r *http.Request) {
	userID := currentSession(r).User.ID
	var allowed bool
	var used int
	var limit *int
	err := server.db.QueryRow(r.Context(),
		`select allowed, used, usage_limit from app.consume_generation($1)`, userID,
	).Scan(&allowed, &used, &limit)
	if err != nil {
		server.log.Error("generation quota failed", "error", err)
		httpx.Problem(w, http.StatusInternalServerError, "generation allowance could not be checked")
		return
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"allowed": allowed, "used": used, "usage_limit": limit})
}
