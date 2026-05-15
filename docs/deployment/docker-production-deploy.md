# Docker Production Deployment

End-to-end guide for deploying NextCRM in production using the bundled `docker-compose.yml` (`app-production` + `nginx` profiles). Targets a single host (VM, bare-metal, or Docker-capable PaaS such as Coolify, Portainer, Dokku). External managed services (RDS, ElastiCache, S3) can replace any bundled service by overriding env vars — see [Externalizing services](#externalizing-services).

> For deploying to **Vercel** instead, see the "Deploying to Vercel" section of [`README.md`](../../README.md). This document covers self-hosted Docker only.

---

## 1. Architecture

The Compose stack runs five long-lived services on a private bridge network:

```
            ┌────────────────────────────────────────────┐
   client ──┤  nginx (80/443)                            │  TLS termination + reverse proxy
            └──────────────────┬─────────────────────────┘
                               │
            ┌──────────────────┴─────────────────────────┐
            │  app-production (Next.js standalone)       │  /api, RSC, server actions
            │  - migrates DB on boot                     │
            │  - creates MinIO bucket on boot            │
            │  - seeds DB if Users table is empty        │
            └─┬───────────┬───────────┬──────────────┬───┘
              │           │           │              │
        ┌─────▼───┐  ┌────▼────┐  ┌───▼────┐   ┌─────▼──────┐
        │ postgres│  │  redis  │  │ minio  │   │  inngest   │
        │  pg17 + │  │   7     │  │   S3   │   │   dev      │
        │ pgvector│  │         │  │ object │   │  (worker)  │
        └─────────┘  └─────────┘  └────────┘   └────────────┘
```

Activated via the `production` Compose profile. `app` (the dev container) and `app-production` are mutually exclusive — only one binds to the application port.

Key entrypoint (`docker-entrypoint.sh`):
1. waits for Postgres readiness
2. auto-generates `BETTER_AUTH_SECRET` / `EMAIL_ENCRYPTION_KEY` if empty (**override these in prod**)
3. runs `prisma migrate deploy`
4. creates the MinIO bucket if missing
5. seeds the database only if `Users` table is empty
6. starts `node server.js` (Next.js standalone)

---

## 2. Prerequisites

- Linux host with Docker `>=24` and Docker Compose plugin `>=2.20`
- ≥ 2 vCPU / 4 GB RAM / 20 GB disk (minimum for app + postgres + minio)
- A DNS A/AAAA record pointing your domain at the host
- TLS certificates (Let's Encrypt via certbot, Cloudflare Origin, etc.)
- Open ports `80` and `443` on the host firewall

---

## Quick start (one command)

For a fresh host that has Docker installed, the `setup-prod.sh` script automates everything below — env file generation (with auto-generated secrets), image build, stack startup, healthcheck wait, and smoke verification:

```bash
bun run setup:prod \
  --domain https://crm.example.com \
  --admin-email ops@example.com
```

Run with `--non-interactive` for unattended/CI use, `--rotate-secrets` to regenerate all auto-managed secrets, or `bash scripts/setup-prod.sh --help` for the full flag list. Generated values are written to `.env.production` (mode `0600`, gitignored).

The remaining sections of this document describe the underlying manual procedure the script automates — read them when debugging the script, externalizing services, or doing a custom deployment.

---

## 3. Initial host setup

```bash
# Install Docker (Debian/Ubuntu)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

# Clone the repo to a non-root location
sudo mkdir -p /opt/nextcrm && sudo chown $USER:$USER /opt/nextcrm
git clone https://github.com/<your-fork>/nextcrm-app.git /opt/nextcrm
cd /opt/nextcrm
```

---

## 4. Configure environment

Copy `.env.docker` to `.env` and harden it for production. The bundled file is preconfigured for local dev — every `changeme` / `dev-secret-*` / placeholder value **must be replaced** before exposing the deployment to the network.

```bash
cp .env.docker .env
```

Required edits in `.env`:

| Variable | Action |
|---|---|
| `ADMIN_EMAIL` | Real email of the first admin user — login is passwordless Email OTP |
| `POSTGRES_PASSWORD`, `DB_PASSWORD` | Replace `changeme` with a strong password (must match) |
| `DATABASE_URL` | Update the password segment to match the above |
| `MINIO_ROOT_PASSWORD`, `MINIO_SECRET_KEY` | Replace `changeme` with a strong password (must match) |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `EMAIL_ENCRYPTION_KEY`, `ENCRYPTION_KEY` | `openssl rand -hex 32` (must be 64 hex chars / 32 bytes) |
| `BETTER_AUTH_URL`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | `https://your-domain.com` (no trailing slash, no port) |
| `NEXT_PUBLIC_MINIO_ENDPOINT` | Publicly reachable URL for the MinIO bucket (e.g. `https://files.your-domain.com` or external S3 endpoint). Browsers fetch presigned URLs from this hostname — must be reachable from the user's network. |
| `ADMIN_EMAIL` -derived OTP provider | Set `RESEND_API_KEY` (or SMTP_* / Engageo) so login OTPs can actually be delivered |

Strongly recommended in production:

- `OPENAI_API_KEY` — enables AI embeddings, search, enrichment (otherwise these silently no-op)
- `GOOGLE_ID` / `GOOGLE_SECRET` — Google OAuth, in addition to Email OTP
- `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` — if pointing at Inngest Cloud instead of the bundled dev worker
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — required for `@upstash/ratelimit` rate limiting (the bundled local Redis is *not* used for rate limiting)
- `CRON_SECRET` — protects `/api/cron/*` endpoints

Tighten host-bound ports — by default the dev compose file publishes `5432`, `6379`, `9000`, `9001`, `8288` on the host. In production, set these to empty strings in `.env` (or remove the `ports:` blocks) so only `nginx` is reachable from outside:

```bash
# .env — keep these unset/empty in production so internal services are
# only reachable on the private Docker network.
POSTGRES_PORT=
REDIS_PORT=
MINIO_API_PORT=
MINIO_CONSOLE_PORT=
INNGEST_PORT=
```

Compose will refuse empty port mappings; if you prefer, override with a `docker-compose.prod.yml` that drops the `ports:` entries entirely (see [Section 10](#10-overrides-via-docker-composeprodyml)).

---

## 5. Configure TLS in nginx

The bundled `nginx/nginx.conf` is the entry point. Mount your certificates at `./nginx/certs/` and uncomment the volume in `docker-compose.yml`:

```yaml
# docker-compose.yml — nginx service
volumes:
  - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
  - ./nginx/certs:/etc/nginx/certs:ro
```

Edit `nginx/nginx.conf` to:
- listen on `443 ssl http2`
- reference `/etc/nginx/certs/fullchain.pem` and `/etc/nginx/certs/privkey.pem`
- redirect `80 → 443`
- set `server_name your-domain.com`
- proxy `/` to `http://app-production:3000`

Certbot (host-side, simplest):

```bash
sudo apt-get install -y certbot
sudo certbot certonly --standalone -d your-domain.com
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem ./nginx/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem  ./nginx/certs/
sudo chown -R $USER:$USER ./nginx/certs
```

Renewal: add a host cron that re-copies certs and reloads nginx (`docker compose --profile production exec nginx nginx -s reload`).

---

## 6. Build and launch

```bash
# Build the production image (multi-stage; ~5–10 min on first build)
docker compose --profile production build app-production

# Bring the whole stack up
docker compose --profile production up -d

# Tail the app boot sequence
docker compose --profile production logs -f app-production
```

Expected boot output (entrypoint):

```
==> Waiting for PostgreSQL...
==> PostgreSQL is ready.
==> Running database migrations...
==> Migrations complete.
==> Ensuring MinIO bucket 'nextcrm' exists...
==> Checking if database needs seeding...
==> No users found, seeding database...
==> Starting NextCRM...
```

On a brand-new database the seed runs once and populates initial reference data (currencies, lead/account/contact statuses, etc.). Subsequent restarts skip seeding because `Users` is no longer empty.

---

## 7. First login

1. Visit `https://your-domain.com`
2. Enter the `ADMIN_EMAIL` you set in `.env`
3. Email OTP is sent via the configured provider (Resend / SMTP / Engageo)
4. If no email provider is configured, read the OTP directly from Postgres:

   ```bash
   docker compose --profile production exec postgres \
     psql -U nextcrm -d nextcrm \
     -c 'SELECT email, otp FROM "EmailOTP" ORDER BY "createdAt" DESC LIMIT 1;'
   ```

The first user is auto-promoted to `admin`. From the admin panel, add real email provider credentials so future logins work without DB access.

---

## 8. Verify the deployment

```bash
# Health endpoint
curl -fsS https://your-domain.com/api/health
# → {"status":"ok"} (200)

# All containers healthy
docker compose --profile production ps

# Migrations actually applied
docker compose --profile production exec app-production \
  prisma migrate status

# Inngest functions registered
curl -fsS http://localhost:8288/v1/apps  # only if INNGEST_PORT is published, else exec into the inngest container
```

Smoke checklist:
- [ ] Sign in succeeds with Email OTP
- [ ] Admin panel shows the seeded reference data
- [ ] Create a CRM account → record persists after `docker compose restart app-production`
- [ ] Upload a document → file lands in MinIO bucket → presigned URL opens in the browser
- [ ] Trigger an AI embedding (save any CRM record with `OPENAI_API_KEY` set) → Inngest run shows up

---

## 9. Externalizing services

The bundled stack is the simplest starting point. For higher durability, replace any bundled service by overriding its env vars and removing the corresponding Compose service.

| Replace | With | Env to override |
|---|---|---|
| `postgres` | Managed Postgres (RDS, Neon, Supabase) **with `pgvector`** | `DATABASE_URL`, `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` |
| `redis` | Upstash Redis (HTTP REST) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`. Optional: `REDIS_URL` for any direct-connection consumers |
| `minio` | AWS S3 / DigitalOcean Spaces / Cloudflare R2 | `MINIO_ENDPOINT` (https URL), `MINIO_PORT=443`, `MINIO_USE_SSL=true`, `MINIO_BUCKET`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `NEXT_PUBLIC_MINIO_ENDPOINT` (browser-facing URL — used for presigned URLs) |
| `inngest` (bundled dev) | Inngest Cloud | `INNGEST_DEV=0`, `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY` (omit `INNGEST_BASE_URL`) |

`pgvector` is **required** — migrations create vector indexes for AI embeddings. Hosted Postgres must support the extension (RDS, Neon, Supabase, and Aiven do; some others do not).

---

## 10. Overrides via `docker-compose.prod.yml`

Rather than editing the committed `docker-compose.yml`, create a local override that strips published ports and adjusts resource limits:

```yaml
# docker-compose.prod.yml — not committed
services:
  postgres:
    ports: []
    deploy:
      resources:
        limits: { cpus: "1.5", memory: 2g }
  redis:
    ports: []
  minio:
    ports: []
  inngest:
    ports: []
  app-production:
    deploy:
      resources:
        limits: { cpus: "2", memory: 2g }
```

Apply with both files:

```bash
docker compose \
  -f docker-compose.yml -f docker-compose.prod.yml \
  --profile production up -d
```

---

## 11. Updates and rollbacks

```bash
# Pull new code
cd /opt/nextcrm && git fetch && git checkout main && git pull

# Rebuild app image (other services unchanged)
docker compose --profile production build app-production

# Restart only the app — Postgres/Redis/MinIO/Inngest keep running
docker compose --profile production up -d app-production

# Watch the rolling restart + new migrations
docker compose --profile production logs -f app-production
```

The entrypoint runs `prisma migrate deploy` on every boot, so new migrations land automatically. If a release ships a destructive migration, take a backup first (Section 12).

Rollback:

```bash
git checkout <previous-tag>
docker compose --profile production build app-production
docker compose --profile production up -d app-production
```

> Prisma does not auto-revert migrations. A rollback that requires an earlier schema must be paired with a manual `prisma migrate resolve --rolled-back` and a database restore from backup.

---

## 12. Backups

**Postgres** (logical dump, daily cron):

```bash
docker compose --profile production exec -T postgres \
  pg_dump -U nextcrm -Fc nextcrm \
  > /var/backups/nextcrm-$(date +%F).dump
```

Restore:

```bash
cat /var/backups/nextcrm-2026-05-15.dump | \
  docker compose --profile production exec -T postgres \
  pg_restore -U nextcrm -d nextcrm --clean --if-exists
```

**MinIO** (rclone or `mc mirror` to an off-host bucket):

```bash
docker compose --profile production exec minio \
  mc mirror /data/nextcrm s3-backup/nextcrm-backup
```

---

## 13. Observability

- App stdout/stderr → `docker compose --profile production logs -f app-production`
- nginx access/error → `docker compose --profile production logs -f nginx`
- Inngest function runs → Inngest dashboard (bundled at `:8288` if port published, otherwise `exec` in)
- `GET /api/health` → expose to your uptime monitor (UptimeRobot, BetterStack, Healthchecks.io)

---

## 14. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| App boots then exits with `prisma migrate deploy` errors | `pgvector` extension missing on managed Postgres | `CREATE EXTENSION vector;` on the target database, then redeploy |
| Browser uploads fail with CORS / DNS error after presigning | `NEXT_PUBLIC_MINIO_ENDPOINT` not reachable from browsers | Point it at a public hostname for the MinIO bucket (matches `MINIO_ENDPOINT` only if MinIO itself is internet-exposed) |
| OTPs never arrive | No email provider configured | Set `RESEND_API_KEY` (or full SMTP set, or Engageo creds) and restart `app-production` |
| `BETTER_AUTH_SECRET` rotates on every restart | Not set in `.env` — entrypoint generates a random one | Set it explicitly: `openssl rand -base64 32` |
| 502 from nginx | App container not healthy yet | Wait for the entrypoint to finish migrations; `docker compose ps` should show `app-production` as `(healthy)` |
| First login auto-creates admin but never lets you in | OTP not delivered AND DB query above returns no row | Check `BETTER_AUTH_URL` matches the actual public URL exactly (scheme + host, no port) |
| AI features silently no-op | `OPENAI_API_KEY` placeholder still in place | Replace `sk-placeholder-replace-to-enable-ai` with a real key and restart |

---

## 15. Production hardening checklist

- [ ] All `changeme` / `dev-secret-*` / placeholder values replaced in `.env`
- [ ] Internal service ports (`5432`, `6379`, `9000`, `9001`, `8288`) **not** published on the host
- [ ] TLS certs mounted; `nginx.conf` redirects HTTP→HTTPS
- [ ] `.env` mode `600` and owned by the deploy user
- [ ] Daily Postgres `pg_dump` cron + off-host MinIO mirror
- [ ] Uptime monitor probing `https://your-domain.com/api/health`
- [ ] Backups restore-tested at least once
- [ ] `OPENAI_API_KEY`, `INNGEST_*`, and rate-limit (`UPSTASH_*`) creds present if those features are in use
- [ ] First admin login verified end-to-end via real OTP delivery
