#!/bin/sh
set -e

echo "==> NextCRM Entrypoint (Bun)"

PG_TOOLS=/app/node_modules

# ---- Wait for Postgres via bun TCP check ----
echo "==> Waiting for PostgreSQL..."
RETRIES=30
until bun -e "
const net = require('net');
const s = net.connect(parseInt(process.env.DB_PORT || '5432'), process.env.DB_HOST);
s.on('connect', () => { s.destroy(); process.exit(0); });
s.on('error', () => { s.destroy(); process.exit(1); });
" 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "ERROR: PostgreSQL did not become ready in time."
    exit 1
  fi
  echo "    Postgres not ready, retrying in 1s... ($RETRIES attempts left)"
  sleep 1
done
echo "==> PostgreSQL is ready."

# ---- Auto-generate secrets ----
if [ -z "$BETTER_AUTH_SECRET" ]; then
  export BETTER_AUTH_SECRET=$(head -c 32 /dev/urandom | base64)
  echo "==> Generated BETTER_AUTH_SECRET"
fi

if [ -z "$EMAIL_ENCRYPTION_KEY" ]; then
  export EMAIL_ENCRYPTION_KEY=$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')
  echo "==> Generated EMAIL_ENCRYPTION_KEY"
fi

# ---- Run Prisma migrations ----
echo "==> Running database migrations..."
prisma migrate deploy
echo "==> Migrations complete."

# ---- Conditional seed via bun + pg ----
echo "==> Checking if database needs seeding..."
USER_COUNT=$(bun -e "
const { Client } = require('${PG_TOOLS}/pg');
const c = new Client({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
c.connect()
  .then(() => c.query('SELECT COUNT(*) FROM \"Users\"'))
  .then(r => { console.log(r.rows[0].count); return c.end(); })
  .catch(() => { console.log('0'); process.exit(0); });
" 2>/dev/null || echo "0")
USER_COUNT=$(echo "$USER_COUNT" | tr -d '[:space:]')

if [ "$USER_COUNT" = "0" ] || [ -z "$USER_COUNT" ]; then
  echo "==> No users found, seeding database..."
  prisma db seed
  echo "==> Seeding complete."
else
  echo "==> Database has $USER_COUNT user(s), skipping seed."
fi

echo "==> Starting NextCRM..."
exec bun server.js
