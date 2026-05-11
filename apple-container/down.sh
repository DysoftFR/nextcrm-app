#!/usr/bin/env bash
# =============================================================
# NextCRM — Apple Container teardown
# =============================================================
# Stops and removes the app + Postgres containers.
# Pass --purge to also remove the Postgres volume (DESTROYS DATA).
# =============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/.env.apple"
[[ -f "${ENV_FILE}" ]] && { set -a; source "${ENV_FILE}"; set +a; }

NETWORK="${NETWORK:-nextcrm}"
PG_VOLUME="${PG_VOLUME:-nextcrm_postgres_data}"
PG_NAME="${PG_NAME:-nextcrm-postgres}"
APP_NAME="${APP_NAME:-nextcrm-app}"

PURGE=0
[[ "${1:-}" == "--purge" ]] && PURGE=1

for c in "${APP_NAME}" "${PG_NAME}"; do
  if container list -a 2>/dev/null | awk '{print $NF}' | grep -qx "${c}"; then
    echo "==> Removing '${c}'..."
    container rm -f "${c}" >/dev/null 2>&1 || true
  fi
done

if [[ "${PURGE}" == "1" ]]; then
  echo "==> Purging volume '${PG_VOLUME}' (data will be lost)..."
  container volume rm "${PG_VOLUME}" >/dev/null 2>&1 || true
  echo "==> Removing network '${NETWORK}'..."
  container network rm "${NETWORK}" >/dev/null 2>&1 || true
fi

echo "==> Down."
