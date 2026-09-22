#!/bin/sh
set -eu

export RESTIC_REPOSITORY="$(cat /run/secrets/restic_repository)"
export RESTIC_PASSWORD_FILE=/run/secrets/restic_password
export RESTIC_CACHE_DIR=/tmp/restic-cache
export AWS_ACCESS_KEY_ID="$(cat /run/secrets/aws_access_key_id)"
export AWS_SECRET_ACCESS_KEY="$(cat /run/secrets/aws_secret_access_key)"

if [ -z "$RESTIC_REPOSITORY" ]; then
  echo "restic_repository secret is empty" >&2
  exit 1
fi

exec restic "$@"
