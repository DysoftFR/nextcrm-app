#!/usr/bin/env bash
# =============================================================
# NextCRM — Apple Container orchestrator (up)
# =============================================================
# Spins up Postgres (pgvector) + Next.js app via Apple `container` CLI.
# Equivalent to a minimal docker-compose: no Redis / MinIO / Inngest / Nginx.
#
# Usage:
#   ./apple-container/up.sh           # build + start
#   ./apple-container/up.sh --no-build  # skip image rebuild
# =============================================================

set -euo pipefail

# ---- Resolve paths ----
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.apple"

# ---- Load env ----
if [[ -f "${ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  set -a; source "${ENV_FILE}"; set +a
else
  echo "WARN: ${ENV_FILE} not found — using defaults."
fi

# ---- Defaults ----
NETWORK="${NETWORK:-nextcrm}"
PG_VOLUME="${PG_VOLUME:-nextcrm_postgres_data}"
PG_NAME="${PG_NAME:-nextcrm-postgres}"
APP_NAME="${APP_NAME:-nextcrm-app}"
APP_IMAGE="${APP_IMAGE:-nextcrm-app:latest}"
APP_DOCKERFILE="${APP_DOCKERFILE:-Dockerfile.apple}"
PG_IMAGE="${PG_IMAGE:-pgvector/pgvector:pg17}"

POSTGRES_USER="${POSTGRES_USER:-nextcrm}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-changeme}"
POSTGRES_DB="${POSTGRES_DB:-nextcrm}"
APP_PORT="${APP_PORT:-3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:${APP_PORT}}"

BUILD=1
[[ "${1:-}" == "--no-build" ]] && BUILD=0

# ---- Ensure container system running ----
echo "==> Ensuring Apple Container system is running..."
container system start >/dev/null 2>&1 || true
container system status | grep -q "apiserver is running" || {
  echo "ERROR: container apiserver not running."
  exit 1
}

# ---- Network ----
if ! container network list 2>/dev/null | awk '{print $1}' | grep -qx "${NETWORK}"; then
  echo "==> Creating network '${NETWORK}'..."
  container network create "${NETWORK}"
else
  echo "==> Network '${NETWORK}' exists."
fi

# ---- Volume ----
if ! container volume list 2>/dev/null | awk '{print $1}' | grep -qx "${PG_VOLUME}"; then
  echo "==> Creating volume '${PG_VOLUME}'..."
  container volume create "${PG_VOLUME}"
else
  echo "==> Volume '${PG_VOLUME}' exists."
fi

# ---- Build app image ----
if [[ "${BUILD}" == "1" ]]; then
  echo "==> Building '${APP_IMAGE}' from ${REPO_ROOT}/${APP_DOCKERFILE}..."
  ( cd "${REPO_ROOT}" && container build -t "${APP_IMAGE}" -f "${APP_DOCKERFILE}" . )
else
  echo "==> Skipping build (--no-build)."
fi

# ---- Postgres ----
if container list -a 2>/dev/null | awk '{print $NF}' | grep -qx "${PG_NAME}"; then
  echo "==> Removing existing '${PG_NAME}'..."
  container rm -f "${PG_NAME}" >/dev/null 2>&1 || true
fi

echo "==> Starting Postgres '${PG_NAME}'..."
container run -d \
  --name "${PG_NAME}" \
  --network "${NETWORK}" \
  -v "${PG_VOLUME}:/var/lib/postgresql/data" \
  -e POSTGRES_USER="${POSTGRES_USER}" \
  -e POSTGRES_PASSWORD="${POSTGRES_PASSWORD}" \
  -e POSTGRES_DB="${POSTGRES_DB}" \
  -e PGDATA="/var/lib/postgresql/data/pgdata" \
  "${PG_IMAGE}" >/dev/null

# ---- Wait for Postgres ready ----
echo "==> Waiting for Postgres..."
for i in {1..30}; do
  if container exec "${PG_NAME}" pg_isready -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" >/dev/null 2>&1; then
    echo "==> Postgres ready."
    break
  fi
  sleep 1
  if [[ "$i" == "30" ]]; then
    echo "ERROR: Postgres did not become ready in 30s."
    container logs "${PG_NAME}" | tail -30
    exit 1
  fi
done

# ---- App ----
if container list -a 2>/dev/null | awk '{print $NF}' | grep -qx "${APP_NAME}"; then
  echo "==> Removing existing '${APP_NAME}'..."
  container rm -f "${APP_NAME}" >/dev/null 2>&1 || true
fi

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${PG_NAME}:5432/${POSTGRES_DB}"

echo "==> Starting app '${APP_NAME}'..."
container run -d \
  --name "${APP_NAME}" \
  --network "${NETWORK}" \
  -p "${APP_PORT}:3000" \
  -e DATABASE_URL="${DATABASE_URL}" \
  -e DB_HOST="${PG_NAME}" \
  -e DB_PORT="5432" \
  -e DB_USER="${POSTGRES_USER}" \
  -e DB_PASSWORD="${POSTGRES_PASSWORD}" \
  -e DB_NAME="${POSTGRES_DB}" \
  -e BETTER_AUTH_URL="${BETTER_AUTH_URL}" \
  -e BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-}" \
  -e EMAIL_ENCRYPTION_KEY="${EMAIL_ENCRYPTION_KEY:-}" \
  -e TEST_USER_EMAIL="${ADMIN_EMAIL}" \
  -e NEXT_PUBLIC_APP_URL="${BETTER_AUTH_URL}" \
  -e MINIO_ENDPOINT="" \
  -e MINIO_ACCESS_KEY="" \
  -e MINIO_SECRET_KEY="" \
  -e MINIO_BUCKET="" \
  -e UPSTASH_REDIS_REST_URL="" \
  -e UPSTASH_REDIS_REST_TOKEN="" \
  -e INNGEST_DEV="0" \
  "${APP_IMAGE}" >/dev/null

echo
echo "==> Up. App: http://localhost:${APP_PORT}"
echo "    Logs:  container logs -f ${APP_NAME}"
echo "    Stop:  ./apple-container/down.sh"
