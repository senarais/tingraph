# Tingraph

Tingraph turns a compact DSL into editable Excalidraw diagrams. Repository is
self-hosted: Next.js frontend, Go API, PostgreSQL, Caddy TLS proxy, filesystem
uploads, SMTP email, and optional encrypted offsite Restic backups.

## Layout

- `web/`: Next.js 16 UI, DSL parser, layout engine, Excalidraw mapper.
- `backend/`: Go API, auth, migrations, Gemini integration, SMTP worker.
- `ops/`: Caddy, secret bootstrap, smoke test, and backup image.
- `docker-compose.yml`: production-shaped stack sized for a 2-core/2 GB VPS.

Caddy is the only public service. It routes `/api/v1/*`, `/media/*`, and
`/health/*` to Go; all other paths go to Next. PostgreSQL, Go, and Next remain
on the internal Docker network.

## Local Stack

Requirements: Docker Engine with Compose v2. Source-only checks additionally
use Node.js 22 and Go 1.26.8.

```bash
cp .env.example .env
./ops/bootstrap-secrets.sh
docker compose up -d --build
./ops/smoke-test.sh
```

Open <http://localhost:8080>. Development defaults leave SMTP, Google, Gemini,
and offsite backup disabled. Email verification/reset messages remain safely
queued until SMTP is configured.

Inspect state with:

```bash
docker compose ps
docker compose logs -f api web caddy
```

Stop containers without deleting PostgreSQL or uploads:

```bash
docker compose down
```

Never add `-v` unless permanent deletion of local database, uploads, and Caddy
state is intended.

## Source Development

Run database and API in containers, while Next runs with hot reload:

```bash
APP_ENV=development \
APP_ORIGIN=http://localhost:3000 \
SITE_ADDRESS=:80 \
SESSION_COOKIE_NAME=tingraph_session \
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db db-bootstrap migrate api

cd web
BACKEND_INTERNAL_URL=http://localhost:8081 npm run dev
```

The dev override binds PostgreSQL to `127.0.0.1:5433` and Go to
`127.0.0.1:8081`; neither is exposed beyond the host.

## Production

1. Point domain A/AAAA records at VPS. Allow inbound TCP 80/443 and UDP 443.
2. Copy `.env.example` to `.env` and set:
   `APP_ENV=production`, `APP_ORIGIN=https://your-domain`,
   `SITE_ADDRESS=your-domain`, `HTTP_PORT=80`, `HTTPS_PORT=443`, and
   `SESSION_COOKIE_NAME=__Host-tingraph_session`.
3. Run `./ops/bootstrap-secrets.sh` once. It generates database passwords,
   runtime URLs, and rate-limit key under owner-only `secrets/`.
4. Put provider values in `secrets/gemini_api_key`,
   `secrets/google_client_secret`, and `secrets/smtp_password`. Set matching
   non-secret Google/SMTP fields in `.env`.
5. Configure Google redirect URI as
   `https://your-domain/api/v1/auth/google/callback`.
6. Start with `docker compose up -d --build` and run
   `BASE_URL=https://your-domain APP_ORIGIN=https://your-domain ./ops/smoke-test.sh`.

Production startup fails closed when HTTPS origin or SMTP sender configuration
is missing. Migration owner and runtime API use separate PostgreSQL roles. App
containers run non-root, read-only, with dropped Linux capabilities and bounded
CPU/memory.

Deploy updates with:

```bash
git pull --ff-only
docker compose up -d --build
./ops/smoke-test.sh
```

Migrations are embedded in `backend/internal/database/migrations/`, run once
under an advisory lock, and recorded in `public.schema_migrations`. Never edit
an applied migration; add the next numbered file.

### Legacy data cutover

Run the one-time importer before anyone creates an account on the new database.
It refuses to merge into a target that already contains users. The importer
copies non-deleted users, profiles, Google identities, diagrams, and daily usage in a
repeatable-read snapshot. It does not copy sessions, password hashes, active AI
reservations, or remote avatar URLs.

Put a direct, TLS-enabled connection URL for the old PostgreSQL database in the
gitignored file `secrets/legacy_database_url`, make it container-readable, then
run:

```bash
chmod 0444 secrets/legacy_database_url
docker compose build migrate
docker compose run --rm \
  -e LEGACY_DATABASE_URL_FILE=/run/secrets/legacy_database_url \
  -v "$PWD/secrets/legacy_database_url:/run/secrets/legacy_database_url:ro" \
  migrate /app/import-legacy
rm secrets/legacy_database_url
```

Email users must use **Forgot password** once after cutover. Google users keep
their provider subject and can sign in normally. Upload legacy avatars again
from the profile page; importer output reports how many URLs it skipped.

## Backups

Backups contain a PostgreSQL custom dump plus immutable avatar files. Restic
encrypts them before upload. Configure these secret files:

- `secrets/restic_repository`: S3-compatible Restic URL.
- `secrets/restic_password`: long independent encryption password.
- `secrets/aws_access_key_id` and `secrets/aws_secret_access_key`: restricted
  object-storage credentials with access only to the backup bucket/prefix.

Start backup service:

```bash
mkdir -p backups
docker compose --profile backup up -d --build backup
docker compose --profile backup logs -f backup
```

Default retention is 7 daily, 5 weekly, and 12 monthly snapshots. Keep Restic
password in a second secure location; losing it makes backups unrecoverable.

Restore drill:

```bash
docker compose --profile backup run --rm --user "$(id -u):$(id -g)" \
  --entrypoint restic-wrapper backup \
  restore latest --target /restore
```

Restored files appear under `backups/scratch/tingraph.dump` and
`backups/data/uploads/`. Before a real restore, take a fresh backup, stop API,
verify snapshot, restore the dump into an empty PostgreSQL database with
`pg_restore`, replace uploads, rerun migrations, then execute smoke test. Test
this procedure on a separate host; do not discover credential or version
problems during an incident.

## Checks

```bash
cd web
npm ci
npm run ai-briefings:build
npm run typecheck
npm run lint
npm run self-check
npm run build

cd ../backend
go test ./...
```

After stack starts, run `./ops/smoke-test.sh` from repository root. It verifies
routing, registration/login, Origin enforcement, CSRF, ownership isolation,
diagram quota, and logout, then removes its test accounts.

## Secrets

No secret is committed or baked into images. Compose mounts only secrets each
service needs. `secrets/`, `.env`, database data, uploads, and restored backups
are gitignored. Rotate database/application secrets by updating secret files
and rerunning `docker compose up -d --force-recreate`; keep old Restic password
until every retained snapshot using it has expired.
