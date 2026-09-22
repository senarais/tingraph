package database

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

func RunCleanup(ctx context.Context, db *pgxpool.Pool, logger *slog.Logger) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		if err := cleanup(ctx, db); err != nil && ctx.Err() == nil {
			logger.Error("database retention cleanup failed", "error", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func cleanup(ctx context.Context, db *pgxpool.Pool) error {
	_, err := db.Exec(ctx, `
		delete from auth.sessions
		where id in (
		  select id from auth.sessions
		  where expires_at < now() - interval '7 days'
		     or revoked_at < now() - interval '7 days'
		  limit 1000
		);
		delete from auth.one_time_tokens
		where id in (
		  select id from auth.one_time_tokens
		  where expires_at < now() - interval '7 days'
		     or used_at < now() - interval '7 days'
		  limit 1000
		);
		delete from auth.oauth_transactions
		where id in (
		  select id from auth.oauth_transactions
		  where expires_at < now() - interval '1 day'
		     or used_at < now() - interval '1 day'
		  limit 1000
		);
		delete from auth.rate_limits
		where (scope, key_hash) in (
		  select scope, key_hash from auth.rate_limits
		  where window_started_at < now() - interval '2 days'
		  limit 1000
		);
		delete from ops.email_outbox
		where id in (
		  select id from ops.email_outbox
		  where sent_at < now() - interval '30 days'
		  limit 1000
		)`)
	return err
}
