# Deploying the Commerce API

Runs the NestJS API, PostgreSQL and a Caddy reverse proxy on one Linux server
via Docker Compose. Everything here has been verified end to end: migrations
apply, `/api/v1/health/ready` reports the database up, and an unauthenticated
request to a protected route returns 401.

Serving **plain HTTP** for now. See [Turning on HTTPS](#turning-on-https).

## What runs

| Service    | Image / source            | Exposed        | Notes |
|------------|---------------------------|----------------|-------|
| `caddy`    | `caddy:2-alpine`          | host `:80`     | The only service reachable from outside |
| `api`      | built from this repo      | internal :3000 | Non-root, read-only deps, media on a volume |
| `postgres` | `postgres:17-bookworm`    | internal only  | Data in the `pgdata` volume |
| `migrate`  | API image, `build` target | —              | One-shot `prisma migrate deploy`, runs before `api` starts |

`migrate` is a separate one-shot container rather than part of the API's
startup, so a second API replica can never race a schema change.

## Server prerequisites

Ubuntu 22.04/24.04 or Debian 12, 2 GB RAM minimum (the TypeScript build is the
peak; 1 GB will OOM). Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # log out and back in
```

Open only what you need:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw enable
```

Postgres is deliberately **not** published to the host — it is reachable only
on Compose's internal network. Do not add a `ports:` entry for it.

## First deploy

```bash
git clone <this-repo> /opt/commerce && cd /opt/commerce/deploy
cp .env.example .env
```

Fill in `.env`. Three values have no safe default:

```bash
openssl rand -base64 48   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET           (min 32 chars, enforced at boot)
openssl rand -base64 48   # MEDIA_SIGNING_SECRET (min 32 chars, separate from JWT_SECRET)
```

Set `DATABASE_URL` and `SHADOW_DATABASE_URL` to use the same password you put
in `POSTGRES_PASSWORD`. Then:

```bash
docker compose up -d --build
docker compose ps                      # api should reach (healthy)
curl -s localhost/api/v1/health/ready  # database: up
```

The first build takes a few minutes; later ones reuse cached layers.

> **Leave the commented-out `UNIFIED_PAYMENTS_*` lines commented.** Compose
> passes `FOO=` as an empty string, and `@IsOptional()` only skips
> null/undefined — an empty string still gets validated and the API refuses to
> boot. Uncomment them only when switching to the `unified` provider.

## Connecting the Vercel frontends

Set this on all three Vercel apps and redeploy:

```
NEXT_PUBLIC_API_BASE_URL = http://<SERVER_IP>/api/v1
```

Despite the `NEXT_PUBLIC_` prefix, the API client is server-only — it reads the
session from `next/headers`, which cannot run in a browser. So the plain-HTTP
hop is Vercel's server to this box, never the visitor's browser to this box,
and an HTTPS page will not trip mixed-content blocking.

Two consequences worth knowing while HTTPS is off:

- That hop crosses the public internet unencrypted. Requests carry bearer
  tokens, so anyone positioned between Vercel and this server can read them.
- `NEXT_PUBLIC_*` values are inlined into the client bundle, so the server's IP
  is visible in the shipped JavaScript.

## Updating

```bash
cd /opt/commerce && git pull
cd deploy && docker compose up -d --build
```

Compose rebuilds, re-runs `migrate`, then restarts `api`. Expect a few seconds
of downtime — this is a single-instance setup with no rolling deploy.

## Turning on HTTPS

Prerequisite: a hostname pointing at this server — a real domain, or a free
`sslip.io` name (`203-0-113-10.sslip.io` resolves to `203.0.113.10`), which is
enough for Let's Encrypt to issue a certificate.

Replace the first line of `Caddyfile`:

```diff
-:80 {
+api.example.com {
```

Then `docker compose restart caddy`. Caddy obtains and renews the certificate
itself; port 443 is already mapped. Update `NEXT_PUBLIC_API_BASE_URL` to
`https://api.example.com/api/v1` and redeploy the Vercel apps.

## Backups

The `pgdata` volume is the only thing here that cannot be rebuilt from git.
Nightly dump:

```bash
sudo tee /etc/cron.daily/commerce-backup >/dev/null <<'EOF'
#!/bin/sh
set -e
mkdir -p /var/backups/commerce
docker exec commerce-postgres-1 pg_dump -U commerce -Fc commerce \
  > "/var/backups/commerce/commerce-$(date +%F).dump"
find /var/backups/commerce -name '*.dump' -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/commerce-backup
```

Restore:

```bash
docker exec -i commerce-postgres-1 pg_restore -U commerce -d commerce --clean < backup.dump
```

Uploaded media lives in the `media` volume and is **not** covered by that dump.
Back it up too, or move media to object storage.

Verify a restore on a throwaway database before you need it. An untested
backup is not a backup.

## Operations

```bash
docker compose logs -f api            # follow logs
docker compose ps                     # health status
docker compose exec api sh            # shell in the API container
docker compose run --rm migrate       # re-run migrations by hand
docker compose exec postgres psql -U commerce commerce
docker compose down                   # stop (volumes survive)
docker compose down -v                # stop AND DELETE ALL DATA
```

## Known gaps

- **Single instance, single server.** No redundancy; restarts are brief
  downtime. If you add API replicas, set `SCHEDULED_WORKERS_ENABLED=false` on
  every replica but one, or each will run the same cron jobs concurrently.
- **Swagger UI is public** at `/api/docs`. It documents all 253 endpoints. To
  close it, add to the `Caddyfile` above `reverse_proxy`:
  ```
  @docs path /api/docs*
  respond @docs 404
  ```
  The admin portal proxies this path, so check nothing depends on it first.
- **No log shipping or alerting.** Logs live in the Docker journal; nothing
  tells you when the API is down.
- **Secrets sit in `deploy/.env`** as plaintext on the server. It is gitignored.
  Keep it `chmod 600` and owned by the deploying user.
