package database

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
)

type ImportResult struct {
	Users          int
	GoogleAccounts int
	Diagrams       int
	UsageRows      int
	SkippedAvatars int
}

type legacyUser struct {
	id              string
	email           string
	verifiedAt      *time.Time
	disabledAt      *time.Time
	createdAt       time.Time
	updatedAt       time.Time
	tier            string
	username        *string
	fullName        *string
	avatarURL       *string
	profession      *string
	affiliation     *string
	location        *string
	website         *string
	bio             *string
	profileCreated  time.Time
	profileModified time.Time
}

func ImportLegacy(ctx context.Context, sourceURL, targetURL string) (ImportResult, error) {
	if sourceURL == "" || targetURL == "" {
		return ImportResult{}, errors.New("source and target database URLs are required")
	}
	if sourceURL == targetURL {
		return ImportResult{}, errors.New("source and target database URLs must differ")
	}

	source, err := pgx.Connect(ctx, sourceURL)
	if err != nil {
		return ImportResult{}, fmt.Errorf("connect to legacy database: %w", err)
	}
	defer source.Close(context.Background())
	target, err := pgx.Connect(ctx, targetURL)
	if err != nil {
		return ImportResult{}, fmt.Errorf("connect to target database: %w", err)
	}
	defer target.Close(context.Background())

	sourceTx, err := source.BeginTx(ctx, pgx.TxOptions{
		IsoLevel: pgx.RepeatableRead, AccessMode: pgx.ReadOnly,
	})
	if err != nil {
		return ImportResult{}, fmt.Errorf("begin legacy snapshot: %w", err)
	}
	defer sourceTx.Rollback(context.Background())
	targetTx, err := target.BeginTx(ctx, pgx.TxOptions{IsoLevel: pgx.Serializable})
	if err != nil {
		return ImportResult{}, fmt.Errorf("begin target import: %w", err)
	}
	defer targetTx.Rollback(context.Background())

	var targetUsers int
	if err := targetTx.QueryRow(ctx, `select count(*) from auth.users`).Scan(&targetUsers); err != nil {
		return ImportResult{}, fmt.Errorf("check target database: %w", err)
	}
	if targetUsers != 0 {
		return ImportResult{}, errors.New("target database already contains users; refusing to merge")
	}

	result, err := importLegacyUsers(ctx, sourceTx, targetTx)
	if err != nil {
		return ImportResult{}, err
	}
	if err := importLegacyGoogleAccounts(ctx, sourceTx, targetTx, &result); err != nil {
		return ImportResult{}, err
	}
	if err := importLegacyDiagrams(ctx, sourceTx, targetTx, &result); err != nil {
		return ImportResult{}, err
	}
	if err := importLegacyUsage(ctx, sourceTx, targetTx, &result); err != nil {
		return ImportResult{}, err
	}
	if err := sourceTx.Commit(ctx); err != nil {
		return ImportResult{}, fmt.Errorf("close legacy snapshot: %w", err)
	}
	if err := targetTx.Commit(ctx); err != nil {
		return ImportResult{}, fmt.Errorf("commit target import: %w", err)
	}
	return result, nil
}

func importLegacyUsers(ctx context.Context, source, target pgx.Tx) (ImportResult, error) {
	rows, err := source.Query(ctx, `
		select u.id::text, u.email, u.email_confirmed_at,
		       case when u.banned_until > now() then u.banned_until end,
		       coalesce(u.created_at, now()), coalesce(u.updated_at, u.created_at, now()),
		       coalesce(p.tier, 'free'), p.username, p.full_name, p.avatar_url,
		       p.profession, p.affiliation, p.location, p.website, p.bio,
		       coalesce(p.created_at, u.created_at, now()),
		       coalesce(p.updated_at, p.created_at, u.updated_at, u.created_at, now())
		from auth.users u
		left join public.profiles p on p.id = u.id
		where u.deleted_at is null and u.email is not null
		order by u.created_at, u.id`)
	if err != nil {
		return ImportResult{}, fmt.Errorf("read legacy users: %w", err)
	}
	defer rows.Close()

	var result ImportResult
	for rows.Next() {
		var user legacyUser
		if err := rows.Scan(
			&user.id, &user.email, &user.verifiedAt, &user.disabledAt,
			&user.createdAt, &user.updatedAt, &user.tier, &user.username,
			&user.fullName, &user.avatarURL, &user.profession, &user.affiliation,
			&user.location, &user.website, &user.bio, &user.profileCreated,
			&user.profileModified,
		); err != nil {
			return ImportResult{}, fmt.Errorf("scan legacy user: %w", err)
		}
		if _, err := target.Exec(ctx, `
			insert into auth.users (
			  id, email, email_verified_at, disabled_at, created_at, updated_at
			) values ($1, $2, $3, $4, $5, $6)`,
			user.id, user.email, user.verifiedAt, user.disabledAt, user.createdAt, user.updatedAt,
		); err != nil {
			return ImportResult{}, fmt.Errorf("import user %s: %w", user.id, err)
		}
		if _, err := target.Exec(ctx, `
			update app.profiles set
			  tier = $2, username = $3, full_name = $4, profession = $5,
			  affiliation = $6, location = $7, website = $8, bio = $9,
			  created_at = $10, updated_at = $11
			where id = $1`,
			user.id, user.tier, user.username, user.fullName, user.profession,
			user.affiliation, user.location, user.website, user.bio,
			user.profileCreated, user.profileModified,
		); err != nil {
			return ImportResult{}, fmt.Errorf("import profile %s: %w", user.id, err)
		}
		result.Users++
		if user.avatarURL != nil {
			result.SkippedAvatars++
		}
	}
	if err := rows.Err(); err != nil {
		return ImportResult{}, fmt.Errorf("read legacy users: %w", err)
	}
	return result, nil
}

func importLegacyGoogleAccounts(ctx context.Context, source, target pgx.Tx, result *ImportResult) error {
	rows, err := source.Query(ctx, `
		select i.user_id::text, i.provider_id,
		       nullif(i.identity_data ->> 'email', ''), coalesce(i.created_at, now())
		from auth.identities i
		join auth.users u on u.id = i.user_id
		where i.provider = 'google' and u.deleted_at is null`)
	if err != nil {
		return fmt.Errorf("read legacy Google accounts: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var userID, subject string
		var email *string
		var createdAt time.Time
		if err := rows.Scan(&userID, &subject, &email, &createdAt); err != nil {
			return fmt.Errorf("scan legacy Google account: %w", err)
		}
		if _, err := target.Exec(ctx, `
			insert into auth.oauth_accounts (
			  user_id, provider, provider_subject, provider_email, created_at
			) values ($1, 'google', $2, $3, $4)`, userID, subject, email, createdAt,
		); err != nil {
			return fmt.Errorf("import Google account for %s: %w", userID, err)
		}
		result.GoogleAccounts++
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read legacy Google accounts: %w", err)
	}
	return nil
}

func importLegacyDiagrams(ctx context.Context, source, target pgx.Tx, result *ImportResult) error {
	rows, err := source.Query(ctx, `
		select d.id::text, d.user_id::text, d.title, d.category, d.document,
		       d.created_at, d.updated_at
		from public.diagrams d
		join auth.users u on u.id = d.user_id
		where u.deleted_at is null
		order by d.created_at, d.id`)
	if err != nil {
		return fmt.Errorf("read legacy diagrams: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var id, userID, title, category string
		var document []byte
		var createdAt, updatedAt time.Time
		if err := rows.Scan(&id, &userID, &title, &category, &document, &createdAt, &updatedAt); err != nil {
			return fmt.Errorf("scan legacy diagram: %w", err)
		}
		if _, err := target.Exec(ctx, `
			insert into app.diagrams (
			  id, user_id, title, category, document, created_at, updated_at
			) values ($1, $2, $3, $4, $5, $6, $7)`,
			id, userID, title, category, document, createdAt, updatedAt,
		); err != nil {
			return fmt.Errorf("import diagram %s: %w", id, err)
		}
		result.Diagrams++
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read legacy diagrams: %w", err)
	}
	return nil
}

func importLegacyUsage(ctx context.Context, source, target pgx.Tx, result *ImportResult) error {
	rows, err := source.Query(ctx, `
		select usage.user_id::text, usage.usage_date, usage.generations,
		       usage.ai_tokens, usage.updated_at
		from private.daily_usage usage
		join auth.users u on u.id = usage.user_id
		where u.deleted_at is null
		order by usage.usage_date, usage.user_id`)
	if err != nil {
		return fmt.Errorf("read legacy usage: %w", err)
	}
	defer rows.Close()
	for rows.Next() {
		var userID string
		var usageDate time.Time
		var generations int
		var aiTokens int64
		var updatedAt time.Time
		if err := rows.Scan(&userID, &usageDate, &generations, &aiTokens, &updatedAt); err != nil {
			return fmt.Errorf("scan legacy usage: %w", err)
		}
		if _, err := target.Exec(ctx, `
			insert into app.daily_usage (
			  user_id, usage_date, generations, ai_tokens, ai_reserved, updated_at
			) values ($1, $2, $3, $4, 0, $5)`,
			userID, usageDate, generations, aiTokens, updatedAt,
		); err != nil {
			return fmt.Errorf("import usage for %s on %s: %w", userID, usageDate.Format(time.DateOnly), err)
		}
		result.UsageRows++
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read legacy usage: %w", err)
	}
	return nil
}
