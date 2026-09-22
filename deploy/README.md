# Deploying the Commerce API — internal testing

Runs the NestJS API, PostgreSQL and a Caddy reverse proxy on the on-premise
server at **192.168.100.105**, reachable from the LAN at:

```
http://192.168.100.105/api/v1
```

No domain, no TLS, no inbound firewall rule — nothing here is reachable from
outside the network. See [Publishing it later](#publishing-it-later) when that
changes.

Everything below was verified end to end before being written down: migrations
apply, `/health/ready` reports the database up, protected routes return 401,
and rate limiting buckets per tester rather than globally.

## What runs

| Service      | Image / source            | Exposed        | Notes |
|--------------|---------------------------|----------------|-------|
| `caddy`      | `caddy:2-alpine`          | LAN `:80`      | Reverse proxy; the only way in |
| `api`        | built from this repo      | internal :3000 | Non-root, media on a volume |
| `postgres`   | `postgres:17-bookworm`    | internal only  | Data in the `pgdata` volume |
| `migrate`    | API image, `build` target | —              | One-shot `prisma migrate deploy` before `api` starts |
| `cloudflared`| `cloudflare/cloudflared`  | *not started*  | Behind the `tunnel` profile; unused for internal testing |

`migrate` is a separate one-shot container rather than part of the API's
startup, so a second API replica could never race a schema change.

## ⚠️ The Vercel frontends cannot reach this server

192.168.100.105 is a private address. The web, admin and seller apps call this
API **server-side** — from Vercel's infrastructure, not from the tester's
browser — and Vercel cannot route to your LAN. Deployed frontends pointed at
this server will fail on every request that loads data.

For internal testing, run the frontends where they can see it:

- **On a tester's machine**, with `NEXT_PUBLIC_API_BASE_URL=http://192.168.100.105/api/v1`
  and `npm run web:dev` / `admin:dev` / `seller:dev`. Fine for developers,
  awkward for non-technical testers.
- **On this same server**, added to this Compose stack behind Caddy, so testers
  get one LAN URL with `/`, `/admin` and `/seller` — the layout `vercel.json`
  already describes. Not built yet; ask if you want it.

The API itself is fully testable right now with curl, Postman or the Swagger UI
at `http://192.168.100.105/api/docs`.

## Server prerequisites

Debian 12 or Ubuntu 22.04/24.04, 2 GB RAM minimum — the TypeScript build is the
peak and 1 GB will OOM.

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"      # log out and back in
sudo systemctl enable --now docker   # so the stack returns after a power cut
```

Firewall — LAN only, no inbound from the internet:

```bash
sudo ufw allow OpenSSH
sudo ufw allow from 192.168.100.0/24 to any port 80
sudo ufw enable
```

Give the box a static address or a DHCP reservation for 192.168.100.105. If it
moves, every tester's bookmark and `NEXT_PUBLIC_API_BASE_URL` breaks.

**Check the clock.** Access tokens live 15 minutes and JWT expiry is
wall-clock. A drifting on-prem box rejects valid tokens or honours expired
ones, and the symptom looks like random logouts rather than a clock problem:

```bash
timedatectl set-ntp true && timedatectl status   # want "synchronized: yes"
```

## First deploy

```bash
git clone <this-repo> /opt/commerce && cd /opt/commerce/deploy
cp .env.example .env
chmod 600 .env
```

Fill in `.env`. Three values have no safe default — leave `TUNNEL_TOKEN` empty:

```bash
openssl rand -base64 48   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET           (min 32 chars, enforced at boot)
openssl rand -base64 48   # MEDIA_SIGNING_SECRET (min 32 chars, separate from JWT_SECRET)
```

Set `DATABASE_URL` and `SHADOW_DATABASE_URL` to the same password you used for
`POSTGRES_PASSWORD`. Then:

```bash
docker compose up -d --build
docker compose ps                                          # api should reach (healthy)
curl -s http://192.168.100.105/api/v1/health/ready          # database: up
```

First build takes a few minutes; later ones reuse cached layers.

> **Leave the commented-out `UNIFIED_PAYMENTS_*` lines commented.** Compose
> passes `FOO=` as an empty string, and `@IsOptional()` only skips
> null/undefined — an empty string still gets validated and the API refuses to
> boot. Uncomment them only when switching to the `unified` provider.

## Seeding test data

Internal testing usually wants an admin account to log in with. `SEED_ADMIN_EMAIL`
and `SEED_ADMIN_PASSWORD` in `.env.example` feed the seed script:

The seed script refuses to run unless `NODE_ENV` is `development` or `test`,
which is a guard against seeding a real database. `.env` sets `production`, so
override it for this one command:

```bash
docker compose run --rm -e NODE_ENV=development migrate npx prisma db seed
```

That creates the admin account and a small catalog (3 categories, 18 products)
to click around. Without the override it fails with
"Seeding requires NODE_ENV=development or test".

Do not carry those credentials forward if this server later becomes reachable
from outside.

## Updating

```bash
cd /opt/commerce && git pull
cd deploy && docker compose up -d --build
```

Compose rebuilds, re-runs `migrate`, then restarts `api`. Expect a few seconds
of downtime — single instance, no rolling deploy.

## Backups

Even for internal testing, the `pgdata` and `media` volumes are the only things
that cannot be rebuilt from git — and on-premise there are no snapshots to fall
back on.

```bash
sudo tee /etc/cron.daily/commerce-backup >/dev/null <<'EOF'
#!/bin/sh
set -e
DEST=/var/backups/commerce
mkdir -p "$DEST"
docker exec commerce-postgres-1 pg_dump -U commerce -Fc commerce \
  > "$DEST/commerce-$(date +%F).dump"
docker run --rm -v commerce_media:/media:ro -v "$DEST":/out alpine \
  tar czf "/out/media-$(date +%F).tar.gz" -C /media .
find "$DEST" -mtime +14 -delete
EOF
sudo chmod +x /etc/cron.daily/commerce-backup
```

Restore:

```bash
docker exec -i commerce-postgres-1 pg_restore -U commerce -d commerce --clean < backup.dump
```

While it is only test data this is low stakes — but get a copy off the machine
before anyone relies on it, and test a restore before you need one.

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

## Publishing it later

When this needs to be reachable from outside — for the Vercel frontends, or for
testers off-site — the server is behind NAT, so it needs an outbound tunnel
rather than a port forward. `cloudflared` is already defined in
`docker-compose.yml` behind a profile:

1. Cloudflare dashboard → **Zero Trust → Networks → Tunnels → Create**, pick
   **Docker** as the connector, copy the token.
2. Add a **Public Hostname** (e.g. `api.yourshop.com`) pointing at
   `http://caddy:80`.
3. Put the token in `.env` as `TUNNEL_TOKEN`.
4. `docker compose --profile tunnel up -d`

That also brings real HTTPS with it, since Cloudflare terminates TLS at its
edge. Nothing in the `Caddyfile` needs to change. Then point the Vercel apps at
`https://api.yourshop.com/api/v1`.

## Things that will bite you

These are all real, and each was hit while building this setup.

- **Do not remove `trusted_proxies` from the `Caddyfile`.** Without it Caddy
  discards the inbound `X-Forwarded-For`, the API sees every tester as one
  address, and the global 100 req/min throttle becomes a cap on everyone at
  once — about a dozen concurrent users before the whole thing returns 429s.
  It pairs with `app.set('trust proxy', …)` in `src/main.ts`; both are needed.
- **OpenSSL must be installed in both Docker stages.** Prisma picks its query
  engine by sniffing OpenSSL at *generate* time. If the two stages disagree the
  API crash-loops with "could not locate the Query Engine".
- **Single instance.** If you add API replicas, set
  `SCHEDULED_WORKERS_ENABLED=false` on every replica but one, or each runs the
  same cron jobs concurrently.
- **Swagger UI is open** at `/api/docs`. Fine on a trusted LAN, and genuinely
  useful for internal testing — but close it before this is public. Add above
  `reverse_proxy` in the `Caddyfile`:
  ```
  @docs path /api/docs*
  respond @docs 404
  ```
- **No log shipping or alerting.** Nothing tells you when the API is down.
- **Secrets sit in `deploy/.env`** in plaintext. Gitignored; keep it `chmod 600`.
