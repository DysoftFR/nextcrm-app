# Deploy NextCRM behind an existing reverse proxy

Use this guide when another nginx / Traefik / Caddy container (managed by a separate Docker Compose stack on the same VPS) already terminates TLS on `:80`/`:443` for one or more domains — and you want it to also serve NextCRM on a new subdomain, without disturbing the existing sites.

The standalone deployment path (with the bundled `nginx` service) is documented in [`docker-production-deploy.md`](docker-production-deploy.md). This page is the alternative for "co-tenant" setups.

---

## Pattern

```
                Internet
                   │
                   ▼
   ┌──────────────────────────────────────────┐
   │  Existing reverse-proxy container        │  e.g. nginx serving api.example.com
   │  (owns :80 / :443, owns TLS certs)       │
   └──────┬─────────────────────┬─────────────┘
          │                     │
   existing upstream        NEW upstream
   (api.example.com →       (crm.example.com →
    api backend)             NextCRM app-production)
```

The existing proxy and NextCRM live in two **separate Compose projects**. They are joined by a **shared Docker network**: the proxy is on it already, and NextCRM's `app-production` attaches to it as an additional network via the overlay file. The proxy reaches NextCRM by Docker DNS.

The bundled `nginx` service ships with NextCRM stays **off** — it would clash on `:80`/`:443`.

---

## What you need before starting

- A reverse-proxy container already running on the VPS, owning the host's `:80`/`:443`.
- The Docker network name that proxy is attached to (`docker network ls`).
- The host path of the proxy's nginx config (single file or `conf.d` dir mounted from host).
- A working ACME flow for the proxy's existing domains. NextCRM piggybacks on it.
- DNS `A` record for the NextCRM subdomain pointing at the VPS — set this before issuing the cert.

---

## Steps

### 1. Bootstrap NextCRM with the overlay

`scripts/setup-prod.sh` takes `--external-network NAME`; when set it auto-layers `docker-compose.external-proxy.yml` for every compose invocation:

```bash
cd ~/nextcrm-app
bun run setup:prod \
  --domain https://crm.example.com \
  --admin-email ops@example.com \
  --external-network <NETWORK_NAME>
```

The overlay (`docker-compose.external-proxy.yml`):

- removes public host port bindings on Postgres, Redis, Inngest;
- binds MinIO API/console to `127.0.0.1` only;
- attaches `app-production` to both the internal `nextcrm` network AND the external one;
- disables the bundled `nginx` service via a `disabled` profile so it never starts.

Verify before bringing up:

```bash
# Confirms overlay parses and resolves the external network
docker compose -f docker-compose.yml -f docker-compose.external-proxy.yml \
  --env-file .env.production --profile production config | head -40

docker network inspect <NETWORK_NAME> >/dev/null && echo "OK: network exists"
```

If you prefer to bring it up manually (without the helper script):

```bash
docker compose -f docker-compose.yml -f docker-compose.external-proxy.yml \
  --env-file .env.production --profile production up -d \
  postgres redis minio minio-init inngest app-production
```

### 2. Discover the NextCRM `app-production` container DNS name

Compose names containers `<project>-<service>-<n>`. The project is the directory name unless overridden with `-p`. From the host:

```bash
docker ps --filter name=app-production --format '{{.Names}}'
# e.g. nextcrm-app-app-production-1
```

The existing proxy container reaches this hostname directly **because both are attached to `<NETWORK_NAME>`**.

Sanity-check reachability from inside the proxy:

```bash
docker exec <existing-proxy-container-name> \
  sh -c "wget -qSO- --header='Host: crm.example.com' http://nextcrm-app-app-production-1:3000/ 2>&1 | head -20"
```

### 3. Add an HTTP-only vhost for the ACME challenge

In the existing proxy's nginx config — **as a new server block**, do not edit existing blocks — add:

```nginx
upstream nextcrm_app {
    server nextcrm-app-app-production-1:3000;   # use the name from step 2
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name crm.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;                  # match your existing webroot
    }

    location / {
        return 301 https://$host$request_uri;
    }
}
```

Reload nginx (run from the host):

```bash
docker exec <existing-nginx-container> nginx -t
docker exec <existing-nginx-container> nginx -s reload
```

### 4. Issue the Let's Encrypt cert via the existing certbot

```bash
docker exec <existing-certbot-container> certbot certonly \
  --webroot -w /var/www/certbot \
  -d crm.example.com \
  --email ops@example.com \
  --agree-tos --non-interactive --no-eff-email
```

Confirm:

```bash
docker exec <existing-certbot-container> ls -l /etc/letsencrypt/live/crm.example.com/
```

If the certbot container's renew loop does NOT reload nginx after renewal, add a host cron:

```bash
(crontab -l 2>/dev/null; echo "15 3 * * * docker exec <existing-nginx-container> nginx -s reload") | crontab -
```

### 5. Promote the vhost to HTTPS

Replace the HTTP block from step 3 with HTTP + HTTPS:

```nginx
upstream nextcrm_app {
    server nextcrm-app-app-production-1:3000;
    keepalive 32;
}

server {
    listen 80;
    listen [::]:80;
    server_name crm.example.com;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    location / {
        return 301 https://$host$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name crm.example.com;

    ssl_certificate     /etc/letsencrypt/live/crm.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/crm.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    client_max_body_size 100M;          # documents, invoice PDFs

    # Inngest webhook — no rate limit, long timeout
    location /api/inngest {
        proxy_pass         http://nextcrm_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass         http://nextcrm_app;
        proxy_http_version 1.1;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_set_header   Upgrade           $http_upgrade;
        proxy_set_header   Connection        "upgrade";
        proxy_read_timeout 120s;
    }
}
```

Reload nginx again. The existing site (e.g. `api.example.com`) is untouched because every line above is in a **new** server block with a different `server_name`.

### 6. Verify

```bash
curl -I https://crm.example.com/                # 200 / 302 from Next.js
curl -I https://api.example.com/                # unchanged — sanity check
```

Browser: visit `https://crm.example.com`, request an OTP for the admin email, sign in. First user auto-promotes to admin.

Confirm internal services are not publicly reachable from outside the VPS:

```bash
nc -zv <VPS_IP> 5432   # postgres — MUST fail
nc -zv <VPS_IP> 6379   # redis — MUST fail
nc -zv <VPS_IP> 9000   # minio API — MUST fail
nc -zv <VPS_IP> 9001   # minio console — MUST fail
nc -zv <VPS_IP> 8288   # inngest — MUST fail
```

---

## Operational notes

### Updating NextCRM

```bash
cd ~/nextcrm-app
git pull --ff-only
docker compose -f docker-compose.yml -f docker-compose.external-proxy.yml \
  --env-file .env.production --profile production build app-production
docker compose -f docker-compose.yml -f docker-compose.external-proxy.yml \
  --env-file .env.production --profile production up -d app-production
```

The existing proxy / certbot / other sites are not touched.

### Browser-side MinIO uploads

`NEXT_PUBLIC_MINIO_ENDPOINT` is materialized to the public app URL by `setup-prod.sh`. If you want presigned upload URLs to work, add a `/minio/` location to the new vhost:

```nginx
    location /minio/ {
        proxy_pass http://minio:9000/;        # only works if proxy is on same network as minio
        proxy_set_header Host $host;
        client_max_body_size 100M;
    }
```

…and either attach the existing proxy to NextCRM's `nextcrm` network too (`docker network connect`), or expose MinIO on a different shared network. If browser uploads are not used, omit and leave MinIO loopback-only.

### MinIO not exposed at all

Set both `MINIO_API_PORT` and `MINIO_CONSOLE_PORT` to a placeholder and edit the overlay to drop those bindings if you never need loopback access. The default loopback binding is harmless: external `nc` probes will fail because nothing is bound to `0.0.0.0`.

### Dependency order

The external network must exist before bringing NextCRM up — `setup-prod.sh` checks this and exits early with a clear message if it's missing. If the owning stack is fully `down`, NextCRM cannot start because the external network is gone.

### Email is required for sign-in

NextCRM uses Better Auth Email OTP. Without `RESEND_API_KEY` (or `ENGAGEO_MESSAGING_API_KEY`) + `EMAIL_FROM` on a verified domain, no one can sign in. Set these in `.env.production` before going live.

---

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `network <name> not found` | External network does not exist; bring up the owning stack or `docker network create <name>`. |
| `502 Bad Gateway` from proxy | Wrong upstream hostname. Verify the actual container name with `docker ps --filter name=app-production`. |
| OTP email never arrives | Missing email provider keys or unverified `EMAIL_FROM` domain. Check `docker compose logs app-production`. |
| Cert renewal works but site keeps old cert | Certbot does not reload nginx after renew. Add the host cron from step 4. |
| Existing site (e.g. `api.example.com`) starts returning NextCRM | You edited the wrong server block. Each vhost lives in its own `server { server_name X; }` block. Run `nginx -t` before reloading. |
