#!/bin/sh
set -eu

repository=$(cat /run/secrets/restic_repository)
if [ -z "$repository" ]; then
  echo "restic_repository secret is empty" >&2
  exit 1
fi

export RESTIC_REPOSITORY="$repository"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password
export RESTIC_CACHE_DIR=/tmp/restic-cache
export AWS_ACCESS_KEY_ID="$(cat /run/secrets/aws_access_key_id)"
export AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/aws_secret_access_key)"
database_url=$(cat /run/secrets/backup_database_url)
interval=${BACKUP_INTERVAL_SECONDS:-86400}

if ! restic snapshots >/dev/null 2>&1; then
  restic init
fi

while :; do
  dump="/scratch/tingraph.dump"
  pg_dump --dbname="$database_url" --format=custom --no-owner --file="$dump"
  restic backup --host tingraph --tag tingraph "$dump" /data/uploads
  rm -f "$dump"
  restic forget --host tingraph --tag tingraph --keep-daily 7 --keep-weekly 5 --keep-monthly 12 --prune
  sleep "$interval"
done
