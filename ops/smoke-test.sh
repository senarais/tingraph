#!/bin/sh
set -eu

BASE_URL=${BASE_URL:-http://localhost:8080}
BASE_URL=${BASE_URL%/}
ORIGIN=${APP_ORIGIN:-$BASE_URL}
PASSWORD='Smoke-test-passphrase-2026!'
POLICY_VERSION='2026-09-30'
stamp="$(date +%s)-$$"
email1="smoke-$stamp-a@example.test"
email2="smoke-$stamp-b@example.test"
discount_code="SMOKE${stamp%%-*}X$$"
unused_code="${discount_code}U"
work=$(mktemp -d)
db_container=""

export APP_ENV=${APP_ENV:-development}
export APP_ORIGIN=$ORIGIN
export SITE_ADDRESS=${SITE_ADDRESS:-:80}
export SESSION_COOKIE_NAME=${SESSION_COOKIE_NAME:-tingraph_session}

cleanup() {
  if [ -n "$db_container" ]; then
    docker exec "$db_container" psql -U tingraph_owner -d tingraph -v ON_ERROR_STOP=1 \
      -c "delete from ops.payment_orders where user_id in (select id from auth.users where email in ('$email1', '$email2')); delete from ops.discount_codes where code in ('$discount_code', '$unused_code'); delete from ops.admin_audit where target_email in ('$email1', '$email2'); delete from ops.email_outbox where recipient in ('$email1', '$email2'); delete from auth.users where email in ('$email1', '$email2');" \
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
    --data "{\"name\":\"Smoke Test\",\"email\":\"$email\",\"password\":\"$PASSWORD\",\"legal_consent\":{\"accepted\":true,\"version\":\"$POLICY_VERSION\"}}")
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

status=$(curl -sS -o "$work/response" -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/auth/register" -H "Origin: $ORIGIN" \
  -H 'Content-Type: application/json' --data '{"email":"not-accepted@example.test"}')
expect 400 "$status" "missing policy agreement"
status=$(curl -sS -o "$work/response" -w '%{http_code}' \
  -X POST "$BASE_URL/api/v1/auth/register" -H "Origin: $ORIGIN" \
  -H 'Content-Type: application/json' --data '{"legal_consent":{"accepted":true,"version":"2020-01-01"}}')
expect 400 "$status" "outdated policy agreement"

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

acceptances=$(docker exec "$db_container" psql -U tingraph_owner -d tingraph -At \
  -c "select count(*) from auth.legal_acceptances a join auth.users u on u.id = a.user_id where u.email in ('$email1', '$email2') and a.policy_version = '$POLICY_VERSION' and a.method = 'email';")
[ "$acceptances" = '2' ] || { printf 'policy acceptance was not recorded once per account\n' >&2; exit 1; }

token_state=$(docker exec "$db_container" psql -U tingraph_owner -d tingraph -At \
  -c "select count(*) = 1 from auth.one_time_tokens t join auth.users u on u.id = t.user_id where u.email = '$email1' and t.purpose = 'verify_email' and t.used_at is null; select bool_and(position('#' in payload->>'link') > 0 and position('?token=' in payload->>'link') = 0) from ops.email_outbox where recipient in ('$email1', '$email2');")
expected_token_state=$(printf 't\nt')
if [ "$token_state" != "$expected_token_state" ]; then
  echo 'verification token rotation or fragment link check failed' >&2
  exit 1
fi

csrf1=$(login "$work/cookies-1" "$email1")
csrf2=$(login "$work/cookies-2" "$email2")

for path in /api/v1/me /profile /checkout; do
  status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" "$BASE_URL$path")
  expect 200 "$status" "authenticated $path"
  if [ "$path" = '/checkout' ]; then
    node -e 'const html=require("fs").readFileSync(process.argv[1],"utf8"); if(!html.includes("Back to profile") || html.includes("01 / Payment")) process.exit(1)' "$work/response"
  fi
done
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X PUT "$BASE_URL/api/v1/me/time-zone" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1" \
  -H 'Content-Type: application/json' --data '{"time_zone":"Not/AZone"}')
expect 400 "$status" "invalid time zone"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X PUT "$BASE_URL/api/v1/me/time-zone" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1" \
  -H 'Content-Type: application/json' --data '{"time_zone":"Asia/Jakarta"}')
expect 200 "$status" "account time zone"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" "$BASE_URL/api/v1/me")
expect 200 "$status" "time zone on profile"
node -e 'const {entitlements:u}=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(u.time_zone!=="Asia/Jakarta") process.exit(1)' "$work/response"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" "$BASE_URL/api/v1/billing/quote")
expect 200 "$status" "checkout availability"
methods=$(node -e 'const q=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); process.stdout.write([q.midtrans&&"gopay",q.paypal&&"paypal"].filter(Boolean).join(" "))' "$work/response")
for method in $methods; do
  status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" "$BASE_URL/api/v1/billing/quote?method=$method")
  expect 200 "$status" "checkout price $method"
done

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X PATCH "$BASE_URL/api/v1/me/profile" -H "Origin: $ORIGIN" \
  -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' \
  --data "{\"username\":\"smoke_${stamp%%-*}\",\"full_name\":\"Smoke Test\"}")
expect 200 "$status" "profile update"

status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/usage/generations" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1")
expect 200 "$status" "generation quota"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" "$BASE_URL/api/v1/me")
expect 200 "$status" "usage after generation"
node -e 'const {entitlements:u}=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(u.generation_used<1 || !u.generation_reset || Math.abs(new Date(u.generation_reset)-Date.now()-86400000)>60000) process.exit(1)' "$work/response"

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

docker exec "$db_container" psql -U tingraph_owner -d tingraph -v ON_ERROR_STOP=1 \
  -c "update auth.users set role = 'admin' where email = '$email1';" >/dev/null
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/admin/discounts" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1" \
  -H 'Content-Type: application/json' --data "{\"code\":\"$discount_code\",\"percent\":20,\"max_uses\":1}")
expect 201 "$status" "create discount"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X PATCH "$BASE_URL/api/v1/admin/discounts/$discount_code" -H "Origin: $ORIGIN" \
  -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' --data '{"enabled":false}')
expect 200 "$status" "deactivate discount"
node -e 'if(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).enabled!==false) process.exit(1)' "$work/response"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X PATCH "$BASE_URL/api/v1/admin/discounts/$discount_code" -H "Origin: $ORIGIN" \
  -H "X-CSRF-Token: $csrf1" -H 'Content-Type: application/json' --data '{"enabled":true}')
expect 200 "$status" "reactivate discount"
docker exec "$db_container" psql -U tingraph_owner -d tingraph -v ON_ERROR_STOP=1 \
  -c "insert into ops.payment_orders(user_id, provider, currency, amount, method, status, discount_code) select id, 'paypal', 'USD', 500, 'paypal', 'failed', '$discount_code' from auth.users where email = '$email1';" >/dev/null
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X DELETE "$BASE_URL/api/v1/admin/discounts/$discount_code" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1")
expect 204 "$status" "archive used discount"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  "$BASE_URL/api/v1/admin/discounts")
expect 200 "$status" "discount list"
node -e 'const list=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(list.codes.some(x=>x.code===process.argv[2])) process.exit(1)' "$work/response" "$discount_code"
archived=$(docker exec "$db_container" psql -U tingraph_owner -d tingraph -At \
  -c "select enabled::text || ':' || (deleted_at is not null)::text from ops.discount_codes where code = '$discount_code'")
[ "$archived" = 'false:true' ] || { printf 'archived code or order history missing: %s\n' "$archived" >&2; exit 1; }
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X POST "$BASE_URL/api/v1/admin/discounts" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1" \
  -H 'Content-Type: application/json' --data "{\"code\":\"$unused_code\",\"percent\":20,\"max_uses\":1}")
expect 201 "$status" "create unused discount"
status=$(curl -sS -o "$work/response" -w '%{http_code}' -b "$work/cookies-1" \
  -X DELETE "$BASE_URL/api/v1/admin/discounts/$unused_code" -H "Origin: $ORIGIN" -H "X-CSRF-Token: $csrf1")
expect 204 "$status" "delete unused discount"
gone=$(docker exec "$db_container" psql -U tingraph_owner -d tingraph -At \
  -c "select count(*) from ops.discount_codes where code = '$unused_code'")
[ "$gone" = '0' ] || { printf 'unused code was not deleted\n' >&2; exit 1; }

printf 'Smoke test passed: routing, auth, legal acceptance, Origin, CSRF, ownership, and quota.\n'
