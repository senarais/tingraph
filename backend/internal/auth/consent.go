package auth

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

// Keep this release in sync with web/lib/legal.ts; never infer acceptance for existing accounts.
const PolicyVersion = "2026-09-30"

var ErrConsentRequired = errors.New("read the policies and agree to the current Terms before creating an account")

type LegalConsent struct {
	Accepted bool   `json:"accepted"`
	Version  string `json:"version"`
}

func (consent LegalConsent) Validate() error {
	if !consent.Accepted || consent.Version != PolicyVersion {
		return ErrConsentRequired
	}
	return nil
}

func recordAcceptance(ctx context.Context, tx pgx.Tx, userID, version, method string) error {
	_, err := tx.Exec(ctx, `
		insert into auth.legal_acceptances (user_id, policy_version, method)
		values ($1, $2, $3) on conflict (user_id, policy_version) do nothing`, userID, version, method)
	return err
}
