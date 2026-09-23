#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
SECRETS="$ROOT/secrets"
umask 077
mkdir -p "$SECRETS"

random_hex() {
  od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

ensure_random() {
  path="$SECRETS/$1"
  if [ ! -s "$path" ]; then
    random_hex > "$path"
  fi
}

ensure_file() {
  path="$SECRETS/$1"
  if [ ! -e "$path" ]; then
    : > "$path"
  fi
}

ensure_random postgres_owner_password
ensure_random postgres_app_password
ensure_random postgres_backup_password
ensure_random rate_limit_secret

owner_password=$(cat "$SECRETS/postgres_owner_password")
app_password=$(cat "$SECRETS/postgres_app_password")
backup_password=$(cat "$SECRETS/postgres_backup_password")
chmod u+w "$SECRETS/migrations_database_url" "$SECRETS/database_url" "$SECRETS/backup_database_url" 2>/dev/null || true
printf 'postgresql://tingraph_owner:%s@db:5432/tingraph?sslmode=disable\n' "$owner_password" > "$SECRETS/migrations_database_url"
printf 'postgresql://tingraph_app:%s@db:5432/tingraph?sslmode=disable\n' "$app_password" > "$SECRETS/database_url"
printf 'postgresql://tingraph_backup:%s@db:5432/tingraph?sslmode=disable\n' "$backup_password" > "$SECRETS/backup_database_url"

for name in gemini_api_key google_client_secret smtp_password midtrans_server_key paypal_client_secret restic_repository restic_password aws_access_key_id aws_secret_access_key; do
  ensure_file "$name"
done

# Preserve a pre-monorepo Gemini key while removing the obsolete root .env.
if [ ! -s "$SECRETS/gemini_api_key" ] && [ -f "$ROOT/.env" ]; then
  while IFS= read -r line; do
    case "$line" in
      GEMINI_API_KEY=*)
        value=${line#*=}
        case "$value" in
          \"*\") value=${value#\"}; value=${value%\"} ;;
          \'*\') value=${value#\'}; value=${value%\'} ;;
        esac
        if [ -n "$value" ]; then
          chmod u+w "$SECRETS/gemini_api_key"
          printf '%s\n' "$value" > "$SECRETS/gemini_api_key"
        fi
        break
        ;;
    esac
  done < "$ROOT/.env"
fi

chmod 700 "$SECRETS"
# Compose bind-mounts local secrets without remapping ownership. Directory
# traversal remains owner-only; mounted files stay readable by non-root apps.
chmod 444 "$SECRETS"/*
printf 'Secrets initialized in %s. Fill provider and offsite backup secrets before production deploy.\n' "$SECRETS"
