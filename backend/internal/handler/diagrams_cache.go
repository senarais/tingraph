package handler

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	diagramListTTL      = 30 * time.Second
	diagramListMaxBytes = 32 << 10
)

func diagramVersionKey(userID string) string { return "diagrams:v1:" + userID + ":version" }
func diagramListKey(userID, version string) string {
	return "diagrams:v1:" + userID + ":list:" + version
}

func (server *Handler) diagramListVersion(ctx context.Context, userID string) (string, bool) {
	if server.redis == nil {
		return "", false
	}
	ctx, cancel := context.WithTimeout(ctx, 75*time.Millisecond)
	defer cancel()
	version, err := server.redis.Get(ctx, diagramVersionKey(userID)).Result()
	if errors.Is(err, redis.Nil) {
		return "0", true
	}
	return version, err == nil
}

func (server *Handler) cachedDiagramList(ctx context.Context, userID, version string) json.RawMessage {
	ctx, cancel := context.WithTimeout(ctx, 75*time.Millisecond)
	defer cancel()
	payload, err := server.redis.Get(ctx, diagramListKey(userID, version)).Bytes()
	if err != nil || len(payload) > diagramListMaxBytes || !json.Valid(payload) {
		return nil
	}
	return payload
}

func (server *Handler) storeDiagramList(ctx context.Context, userID, version string, result any) {
	payload, err := json.Marshal(result)
	if err != nil || len(payload) > diagramListMaxBytes {
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 75*time.Millisecond)
	defer cancel()
	// A concurrent mutation increments the version, so a late reader can only
	// populate its old key, never the key a subsequent reader will request.
	_ = server.redis.Set(ctx, diagramListKey(userID, version), payload, diagramListTTL).Err()
}

func (server *Handler) invalidateDiagramList(userID string) {
	if server.redis == nil {
		return
	}
	// A client disconnect after a committed write must not cancel invalidation.
	ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
	defer cancel()
	key := diagramVersionKey(userID)
	if err := server.redis.Incr(ctx, key).Err(); err != nil {
		server.log.Warn("diagram list cache invalidation failed", "error", err)
		return
	}
	// Versions live longer than cached lists; a reset cannot resurrect version 0.
	if err := server.redis.Expire(ctx, key, time.Hour).Err(); err != nil {
		server.log.Warn("diagram list cache version expiry failed", "error", err)
	}
}
