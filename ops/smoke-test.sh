#!/bin/sh
set -eu

BASE_URL=${BASE_URL:-http://localhost:8080}
BASE_URL=${BASE_URL%/}
ORIGIN=${APP_ORIGIN:-$BASE_URL}
PASSWORD='Smoke-test-passphrase-2026!'
stamp="$(date +%s)-$$"
email1="smoke-$stamp-a@example.test"
email2="smoke-$stamp-b@example.test"
work=$(mktemp -d)
db_container=""

export APP_ENV=${APP_ENV:-development}
export APP_ORIGIN=$ORIGIN
export SITE_ADDRESS=${SITE_ADDRESS:-:80}
export SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-tingraph_session}

cleanup() {
  if [ -n "$db_container" ]; then
    docker exec "$db_container" psql -U tingraph_owner -d tingraph -v ON_ERROR_STOP=1 \
      -c "delete from ops.email_outbox where recipient in ('$email1', '$email2'); delete from auth.users where email in ('$email1', '$email2');" \
      >/dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

expect() {
  expected=$1
  actual=$2
  label=$3
  if [ "$actual" != "$expected" ]; then
    printf '%s: expected HTTP %s, got %s\n' "$label" "$expected" "$actual" >&2
    sed -n '1,20p' "$work/response" >&2
    exit 1
  fi
}

register() {
  email=$1
  status=$(curl -sS -o "$work/response" -w '%{http_code}' \
    -X POST "$BASE_URL/api/v1/auth/register" \
    -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
    --data "{\"name\":\"Smoke Test\",\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
  expect 202 "$status" "register $email"
}

login() {
  cookie_jar=$1
  email=$2
  status=$(curl -sS -o "$work/response" -w '%{http_code}' -c "$cookie_jar" \
    -X POST "$BASE_URL/api/v1/auth/login" \
    -H "Origin: $ORIGIN" -H 'Content-Type: application/json' \
    --data "{\"email\":\"$email\",\"password\":\"$PASSWORD\"}")
  expect 200 "$status" "login $email"
  node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (!x.csrf_token) process.exit(1); process.stdout.write(x.csrf_token)' "$work/response"
}

curl -fsS "$BASE_URL/health/ready" >/dev/null
curl -fsS "$BASE_URL/" >/dev/null

status=$(curl -sS -o "$work/response" -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/auth/register" -H 'Content-Type: application/json' --data '{}')
expect 403 "$status" "missing Origin"

register "$email1"
register "$email2"
register "$email1"

db_container=$(docker compose ps -q db)
if [ -z "$db_container" ]; then
  echo 'database container is not running' >&2
  exit 1
fi
docker exec "$db_container" psql -U tingraph_owner -d tingraph -v ON_ERROR_STOP=1 \
  -c "update auth.users set email_verified_at = now() where email in ('$email1', '$email2');" >/dev/null

token_state=$(docker exec "$db_container" psql -U tingraph_owner -d tingraph -At \
  -c "select count(*) = 1 from auth.one_time_tokens t join auth.users u on u.id = t.user_id where u.email = '$email1' and t.purpose = 'verify_email' and t.used_at is null; select bool_and(position('#' in payload->>'link') > 0 and position('?token=' in payload->>'link') = 0) from ops.email_outbox where recipient in ('$email1', '$email2');")
expected_token_state=$(printf 't\nt')
if [ "$token_state" != "$expected_token_state" ]; then
  echo 'verification token rotation or fragment link check failed' >&2
  exit 1
fi

csrf1=$(login "$work/cookies-1" "$email1")
csrf2=$(login "$work/cookies-2" "$email2")

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X PATCH "$BASE_URL/api/v1/me/profile" -H "Origin: $ORIGIN" \
  -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' \
  --data "{\"username\":\"smoke_${stamp%%-*}\",\"full_name\":\"Smoke Test\"}")
expect 200 "$status" "profile update"

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/usage/generations" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1")
expect 200 "$status" "generation quota"

document='{"version":1,"category":"flow","source":"start -> done","direction":"right","ink":{},"style":"formal","scene":{"elements":[],"files":{}}}'
payload="{\"title\":\"Smoke diagram\",\"category\":\"flow\",\"document\":$document}"

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/diagrams" -H "Origin: $ORIGIN" -H 'Content-Type: application/json' --data "$payload")
expect 403 "$status" "missing CSRF token"

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/diagrams" -H 'Origin: https://invalid.example' \
  -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' --data "$payload")
expect 403 "$status" "invalid Origin"

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/diagrams" -H "Origin: $ORIGIN" \
  -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' --data "$payload")
expect 201 "$status" "create diagram"
diagram_id=$(node -e 'const x=JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); if (!x.id) process.exit(1); process.stdout.write(x.id)' "$work/response")

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-2" \
  "$BASE_URL/api/v1/diagrams/$diagram_id")
expect 404 "$status" "cross-account diagram read"

for title in second third; do
  status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
    -X POST "$BASE_URL/api/v1/diagrams" -H "Origin: $ORIGIN" \
    -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' \
    --data "{\"title\":\"$title\",\"category\":\"flow\",\"document\":$document}")
  [ "$title" = second ] && expect 201 "$status" "second diagram"
  [ "$title" = third ] && expect 409 "$status" "diagram quota"
done

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-2" \
  -X POST "$BASE_URL/api/v1/auth/logout" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf2")
expect 204 "$status" "logout"

printf 'Smoke test passed: routing, auth, Origin, CSRF, ownership, and quota.\n'
