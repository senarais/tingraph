package handler

import (
	"context"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/redis/go-redis/v9"
)

func TestDiagramListCacheIsolationAndInvalidation(t *testing.T) {
	store := miniredis.RunT(t)
	client := redis.NewClient(&redis.Options{Addr: store.Addr()})
	t.Cleanup(func() { _ = client.Close() })
	server := &Handler{redis: client, log: slog.New(slog.NewTextHandler(io.Discard, nil))}
	ctx := context.Background()
	version, ok := server.diagramListVersion(ctx, "alice")
	if !ok || version != "0" {
		t.Fatalf("initial version = %q, %v", version, ok)
	}
	server.storeDiagramList(ctx, "alice", version, map[string]any{"diagrams": []string{"old"}})
	if server.cachedDiagramList(ctx, "bob", "0") != nil {
		t.Fatal("alice's list leaked to bob")
	}
	server.invalidateDiagramList("alice")
	newVersion, ok := server.diagramListVersion(ctx, "alice")
	if !ok || newVersion == version {
		t.Fatal("mutation did not advance the list version")
	}
	// A query started before the mutation may finish afterwards.
	server.storeDiagramList(ctx, "alice", version, map[string]any{"diagrams": []string{"late old"}})
	if server.cachedDiagramList(ctx, "alice", newVersion) != nil {
		t.Fatal("stale query populated the new version")
	}
	server.storeDiagramList(ctx, "alice", newVersion, map[string]any{"diagrams": []string{"new"}})
	if got := string(server.cachedDiagramList(ctx, "alice", newVersion)); got != `{"diagrams":["new"]}` {
		t.Fatalf("cached list = %s", got)
	}
	server.storeDiagramList(ctx, "bob", "0", map[string]any{"diagrams": strings.Repeat("x", diagramListMaxBytes)})
	if server.cachedDiagramList(ctx, "bob", "0") != nil {
		t.Fatal("oversized list was cached")
	}
	store.FastForward(diagramListTTL + time.Second)
	if server.cachedDiagramList(ctx, "alice", newVersion) != nil {
		t.Fatal("expired list was still served")
	}
	if current, ok := server.diagramListVersion(ctx, "alice"); !ok || current != newVersion {
		t.Fatal("version expired before its list keys")
	}
	store.Close()
	if _, ok := server.diagramListVersion(ctx, "alice"); ok {
		t.Fatal("Redis outage did not fall back to DB path")
	}
}
