#!/usr/bin/env bash
# setup-prod.sh — NextCRM production Docker bootstrap.
#
# Orchestrates the one-command path from a fresh host to a running
# production deployment:
#   1. preflight checks (docker, docker compose, openssl, curl)
#   2. collect inputs (CLI flags > env vars > interactive prompt)
#   3. auto-generate missing secrets (BETTER_AUTH_SECRET, EMAIL_ENCRYPTION_KEY,
#      Postgres / MinIO passwords)
#   4. materialize .env.production from .env.production.example
#   5. build the production image
#   6. bring up the production compose profile
#   7. wait for the app-production healthcheck
#   8. smoke-verify (HTTP 200 on /, admin row present in Users)
#
# Idempotent. Re-running with the same inputs is a no-op apart from
# the smoke test. Re-running with new inputs rewrites .env.production
# (preserving previously generated secrets unless --rotate-secrets).
#
# See docs/deployment/docker-production-deploy.md for the underlying
# manual procedure this script automates.

set -euo pipefail

# ---------------------------------------------------------------- constants ---
SCRIPT_NAME="$(basename "$0")"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_EXAMPLE="${REPO_ROOT}/.env.production.example"
ENV_FILE="${REPO_ROOT}/.env.production"
LOG_FILE="${REPO_ROOT}/scripts/.setup-prod.log"

# Exit codes
EXIT_PREFLIGHT=1
EXIT_BUILD=2
EXIT_HEALTH=3
EXIT_SMOKE=4
EXIT_VALIDATION=5

# Health-wait config
HEALTH_TIMEOUT_SEC=300
HEALTH_POLL_INTERVAL_SEC=3

# ------------------------------------------------------------------ defaults ---
DOMAIN=""
ADMIN_EMAIL=""
POSTGRES_PASSWORD=""
MINIO_ROOT_PASSWORD=""
MINIO_SECRET_KEY=""
BETTER_AUTH_SECRET=""
EMAIL_ENCRYPTION_KEY=""
OPENAI_API_KEY=""
GOOGLE_ID=""
GOOGLE_SECRET=""
ENGAGEO_KEY=""
INNGEST_EVENT_KEY=""
INNGEST_SIGNING_KEY=""

NON_INTERACTIVE=0
SKIP_BUILD=0
SKIP_UP=0
ROTATE_SECRETS=0

# Inherit env-var defaults (env var > prompt). CLI flags override below.
DOMAIN="${DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
MINIO_ROOT_PASSWORD="${MINIO_ROOT_PASSWORD:-}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-}"
BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-}"
EMAIL_ENCRYPTION_KEY="${EMAIL_ENCRYPTION_KEY:-}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
GOOGLE_ID="${GOOGLE_ID:-}"
GOOGLE_SECRET="${GOOGLE_SECRET:-}"
ENGAGEO_KEY="${ENGAGEO_MESSAGING_API_KEY:-${ENGAGEO_KEY:-}}"
INNGEST_EVENT_KEY="${INNGEST_EVENT_KEY:-local}"
INNGEST_SIGNING_KEY="${INNGEST_SIGNING_KEY:-}"

# --------------------------------------------------------------------- ui ---
COLOR_RESET="\033[0m"
COLOR_DIM="\033[2m"
COLOR_BOLD="\033[1m"
COLOR_GREEN="\033[32m"
COLOR_YELLOW="\033[33m"
COLOR_RED="\033[31m"
COLOR_BLUE="\033[34m"

log()       { printf "${COLOR_DIM}[%s]${COLOR_RESET} %s\n" "$(date +%H:%M:%S)" "$*"; }
info()      { printf "${COLOR_BLUE}==>${COLOR_RESET} %s\n" "$*"; }
ok()        { printf "${COLOR_GREEN}\xE2\x9C\x93${COLOR_RESET} %s\n" "$*"; }
warn()      { printf "${COLOR_YELLOW}!${COLOR_RESET}  %s\n" "$*" >&2; }
fail()      { printf "${COLOR_RED}\xE2\x9C\x97${COLOR_RESET} %s\n" "$*" >&2; }

usage() {
  cat <<EOF
Usage: ${SCRIPT_NAME} [options]

Bootstrap NextCRM for production Docker deployment.

Required (any of: flag, env var, or interactive prompt):
  --domain URL                    BETTER_AUTH_URL / NEXTAUTH_URL / NEXT_PUBLIC_APP_URL
  --admin-email EMAIL             Initial admin user

Secrets (auto-generated if omitted; existing values preserved on re-run):
  --postgres-password VAL         POSTGRES_PASSWORD
  --minio-password VAL            MINIO_ROOT_PASSWORD
  --minio-secret-key VAL          MINIO_SECRET_KEY
  --better-auth-secret VAL        BETTER_AUTH_SECRET
  --email-encryption-key VAL      EMAIL_ENCRYPTION_KEY (also written to ENCRYPTION_KEY)

Optional integrations (left empty if omitted):
  --openai-key VAL                OPENAI_API_KEY
  --google-id VAL                 GOOGLE_ID
  --google-secret VAL             GOOGLE_SECRET
  --engageo-key VAL               ENGAGEO_MESSAGING_API_KEY
  --inngest-event-key VAL         INNGEST_EVENT_KEY (default: local)
  --inngest-signing-key VAL       INNGEST_SIGNING_KEY

Flow control:
  --non-interactive               Fail if any required input is missing
  --skip-build                    Do not build the production image
  --skip-up                       Do not run \`docker compose up -d\`
  --rotate-secrets                Regenerate ALL auto-managed secrets (destructive)
  --env-file PATH                 Output env file (default: .env.production)
  -h, --help                      Show this message
EOF
}

# ---------------------------------------------------------------- arg parse ---
parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --domain)               DOMAIN="${2:-}"; shift 2 ;;
      --admin-email)          ADMIN_EMAIL="${2:-}"; shift 2 ;;
      --postgres-password)    POSTGRES_PASSWORD="${2:-}"; shift 2 ;;
      --minio-password)       MINIO_ROOT_PASSWORD="${2:-}"; shift 2 ;;
      --minio-secret-key)     MINIO_SECRET_KEY="${2:-}"; shift 2 ;;
      --better-auth-secret)   BETTER_AUTH_SECRET="${2:-}"; shift 2 ;;
      --email-encryption-key) EMAIL_ENCRYPTION_KEY="${2:-}"; shift 2 ;;
      --openai-key)           OPENAI_API_KEY="${2:-}"; shift 2 ;;
      --google-id)            GOOGLE_ID="${2:-}"; shift 2 ;;
      --google-secret)        GOOGLE_SECRET="${2:-}"; shift 2 ;;
      --engageo-key)          ENGAGEO_KEY="${2:-}"; shift 2 ;;
      --inngest-event-key)    INNGEST_EVENT_KEY="${2:-}"; shift 2 ;;
      --inngest-signing-key)  INNGEST_SIGNING_KEY="${2:-}"; shift 2 ;;
      --env-file)             ENV_FILE="${2:-}"; shift 2 ;;
      --non-interactive)      NON_INTERACTIVE=1; shift ;;
      --skip-build)           SKIP_BUILD=1; shift ;;
      --skip-up)              SKIP_UP=1; shift ;;
      --rotate-secrets)       ROTATE_SECRETS=1; shift ;;
      -h|--help)              usage; exit 0 ;;
      *) fail "Unknown argument: $1"; usage >&2; exit "$EXIT_VALIDATION" ;;
    esac
  done
}

# ------------------------------------------------------------------ preflight ---
preflight() {
  info "Preflight checks"
  local missing=()
  command -v docker  >/dev/null 2>&1 || missing+=("docker")
  command -v openssl >/dev/null 2>&1 || missing+=("openssl")
  command -v curl    >/dev/null 2>&1 || missing+=("curl")
  command -v sed     >/dev/null 2>&1 || missing+=("sed")
  command -v awk     >/dev/null 2>&1 || missing+=("awk")

  if ((${#missing[@]} > 0)); then
    fail "Missing required commands: ${missing[*]}"
    exit "$EXIT_PREFLIGHT"
  fi

  if ! docker compose version >/dev/null 2>&1; then
    fail "Docker Compose v2 (\`docker compose\`) is required."
    exit "$EXIT_PREFLIGHT"
  fi

  for f in "${REPO_ROOT}/docker-compose.yml" "${REPO_ROOT}/Dockerfile" "${REPO_ROOT}/package.json"; do
    if [[ ! -f "$f" ]]; then
      fail "Not in the repo root (missing $(basename "$f"))."
      exit "$EXIT_PREFLIGHT"
    fi
  done

  if [[ ! -f "$ENV_EXAMPLE" ]]; then
    fail "Template not found: $ENV_EXAMPLE"
    exit "$EXIT_PREFLIGHT"
  fi

  ok "Tooling present, repo root verified."
}

# ---------------------------------------------------- existing-env reuse load ---
# Read a value from an existing dotenv file (handles unquoted, plain values).
# Args: $1 file, $2 key. Echoes value or empty.
read_env_value() {
  local file="$1" key="$2"
  [[ -f "$file" ]] || { echo ""; return; }
  awk -v k="$key" '
    BEGIN { FS = "=" }
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*$/ { next }
    {
      kk = $1; sub(/^[[:space:]]+/, "", kk); sub(/[[:space:]]+$/, "", kk)
      if (kk == k) {
        sub(/^[^=]*=/, "", $0)
        print $0
        exit
      }
    }
  ' "$file"
}

# If env file already exists, reuse its values for any input the operator did
# not override via flag/env. Skipped when --rotate-secrets is set.
load_existing_secrets() {
  [[ -f "$ENV_FILE" ]] || return 0
  [[ "$ROTATE_SECRETS" -eq 1 ]] && return 0

  info "Existing $(basename "$ENV_FILE") found — preserving prior secrets."

  : "${BETTER_AUTH_SECRET:=$(read_env_value "$ENV_FILE" BETTER_AUTH_SECRET)}"
  : "${EMAIL_ENCRYPTION_KEY:=$(read_env_value "$ENV_FILE" EMAIL_ENCRYPTION_KEY)}"
  : "${POSTGRES_PASSWORD:=$(read_env_value "$ENV_FILE" POSTGRES_PASSWORD)}"
  : "${MINIO_ROOT_PASSWORD:=$(read_env_value "$ENV_FILE" MINIO_ROOT_PASSWORD)}"
  : "${MINIO_SECRET_KEY:=$(read_env_value "$ENV_FILE" MINIO_SECRET_KEY)}"
  : "${ADMIN_EMAIL:=$(read_env_value "$ENV_FILE" ADMIN_EMAIL)}"
  # Recover prior DOMAIN from BETTER_AUTH_URL if --domain not given.
  if [[ -z "$DOMAIN" ]]; then
    DOMAIN="$(read_env_value "$ENV_FILE" BETTER_AUTH_URL)"
  fi
}

# --------------------------------------------------------------- prompt helpers ---
prompt_value() {
  local label="$1" varname="$2"
  if [[ -n "${!varname}" ]]; then return 0; fi
  if [[ "$NON_INTERACTIVE" -eq 1 ]]; then return 1; fi
  local input=""
  read -r -p "$label: " input
  printf -v "$varname" '%s' "$input"
}

# ----------------------------------------------------------- input collection ---
collect_inputs() {
  info "Collecting configuration"
  prompt_value "Public app URL (e.g. https://crm.example.com)" DOMAIN          || true
  prompt_value "Admin email (initial user)"                    ADMIN_EMAIL     || true
}

# --------------------------------------------------------------- validation ---
require() {
  local varname="$1" label="$2"
  if [[ -z "${!varname}" ]]; then
    fail "Missing required input: $label (set via --$label or env $varname)"
    return 1
  fi
}

validate_inputs() {
  local errs=0
  require DOMAIN "domain"        || errs=$((errs+1))
  require ADMIN_EMAIL "admin-email" || errs=$((errs+1))

  if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^https?://[^/[:space:]]+$ ]]; then
    fail "Invalid --domain: '$DOMAIN' (expected scheme + host, no trailing slash)"
    errs=$((errs+1))
  fi
  if [[ -n "$ADMIN_EMAIL" && ! "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
    fail "Invalid --admin-email: '$ADMIN_EMAIL'"
    errs=$((errs+1))
  fi

  ((errs == 0)) || exit "$EXIT_VALIDATION"
}

# ----------------------------------------------------------------- secrets ---
# URL-safe alphanumeric (no +, /, =) so values embed cleanly in DATABASE_URL.
gen_b64() { openssl rand -base64 "$(( $1 * 2 ))" | tr -dc 'A-Za-z0-9' | cut -c1-"$(( $1 + 8 ))"; }
gen_hex() { openssl rand -hex "$1"; }

GENERATED_COUNT=0
generate_secrets() {
  GENERATED_COUNT=0
  if [[ -z "$POSTGRES_PASSWORD"   ]]; then POSTGRES_PASSWORD="$(gen_b64 24)";   GENERATED_COUNT=$((GENERATED_COUNT+1)); fi
  if [[ -z "$MINIO_ROOT_PASSWORD" ]]; then MINIO_ROOT_PASSWORD="$(gen_b64 24)"; GENERATED_COUNT=$((GENERATED_COUNT+1)); fi
  if [[ -z "$MINIO_SECRET_KEY"    ]]; then MINIO_SECRET_KEY="$(gen_b64 24)";    GENERATED_COUNT=$((GENERATED_COUNT+1)); fi
  if [[ -z "$BETTER_AUTH_SECRET"  ]]; then BETTER_AUTH_SECRET="$(gen_b64 32)";  GENERATED_COUNT=$((GENERATED_COUNT+1)); fi
  if [[ -z "$EMAIL_ENCRYPTION_KEY" ]]; then EMAIL_ENCRYPTION_KEY="$(gen_hex 32)"; GENERATED_COUNT=$((GENERATED_COUNT+1)); fi
}

# Length sanity-check (existing values from a prior run pass too).
validate_secret_strength() {
  local errs=0
  if (( ${#BETTER_AUTH_SECRET} < 32 )); then
    fail "BETTER_AUTH_SECRET too short (< 32 chars)."; errs=$((errs+1))
  fi
  if [[ ! "$EMAIL_ENCRYPTION_KEY" =~ ^[a-fA-F0-9]{64}$ ]]; then
    fail "EMAIL_ENCRYPTION_KEY must be 64 hex chars (32 bytes)."; errs=$((errs+1))
  fi
  ((errs == 0)) || exit "$EXIT_VALIDATION"
}

# ------------------------------------------------------------------- writer ---
# sed substitution with `|` delimiter; values that contain `|` are escaped.
# Single shared helper keeps the substitution table explicit.
sed_escape() { printf '%s' "$1" | sed 's/[|&\\]/\\&/g'; }

write_env_file() {
  local tmp
  tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
  trap 'rm -f "$tmp"' EXIT

  # Build a sed script with one -e per placeholder. Order does not matter
  # because placeholder names are disjoint.
  local sed_args=()
  add_sub() {
    local placeholder="$1" value="$2"
    sed_args+=(-e "s|@@${placeholder}@@|$(sed_escape "$value")|g")
  }

  add_sub DOMAIN                "$DOMAIN"
  add_sub ADMIN_EMAIL           "$ADMIN_EMAIL"
  add_sub POSTGRES_PASSWORD     "$POSTGRES_PASSWORD"
  add_sub MINIO_ROOT_PASSWORD   "$MINIO_ROOT_PASSWORD"
  add_sub MINIO_SECRET_KEY      "$MINIO_SECRET_KEY"
  add_sub BETTER_AUTH_SECRET    "$BETTER_AUTH_SECRET"
  add_sub EMAIL_ENCRYPTION_KEY  "$EMAIL_ENCRYPTION_KEY"
  add_sub OPENAI_API_KEY        "$OPENAI_API_KEY"
  add_sub GOOGLE_ID             "$GOOGLE_ID"
  add_sub GOOGLE_SECRET         "$GOOGLE_SECRET"
  add_sub ENGAGEO_KEY           "$ENGAGEO_KEY"
  add_sub INNGEST_EVENT_KEY     "$INNGEST_EVENT_KEY"
  add_sub INNGEST_SIGNING_KEY   "$INNGEST_SIGNING_KEY"

  sed "${sed_args[@]}" "$ENV_EXAMPLE" >"$tmp"

  # Atomic move, then lock permissions.
  chmod 0600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  trap - EXIT
}

# ------------------------------------------------------------------ docker ---
docker_compose() {
  docker compose --env-file "$ENV_FILE" --profile production "$@"
}

build_image() {
  info "Building production image (this can take a few minutes)"
  mkdir -p "$(dirname "$LOG_FILE")"
  if ! docker_compose build app-production 2>&1 | tee "$LOG_FILE"; then
    fail "Build failed. See $LOG_FILE for details."
    exit "$EXIT_BUILD"
  fi
  ok "Image built."
}

bring_up() {
  info "Stopping any dev 'app' container that would conflict with app-production"
  docker_compose stop app 2>/dev/null || true
  docker_compose rm -f app 2>/dev/null || true

  info "Starting production stack (postgres, redis, minio, inngest, app-production)"
  # Explicit service list — avoids implicit start of the dev `app` service
  # (which has no profile) and nginx (which needs cert files mounted).
  # Operator can `docker compose --profile production up -d nginx` once TLS
  # certs are placed in ./nginx/.
  docker_compose up -d postgres redis minio minio-init inngest app-production
  ok "Stack started."
}

wait_healthy() {
  info "Waiting for app-production healthcheck (timeout ${HEALTH_TIMEOUT_SEC}s)"
  local elapsed=0 status=""
  while ((elapsed < HEALTH_TIMEOUT_SEC)); do
    status="$(docker inspect --format='{{ .State.Health.Status }}' \
      "$(docker_compose ps -q app-production 2>/dev/null)" 2>/dev/null || echo "starting")"
    case "$status" in
      healthy)
        ok "app-production is healthy (${elapsed}s)."
        return 0
        ;;
      unhealthy)
        fail "app-production reported unhealthy after ${elapsed}s."
        docker_compose logs --tail=50 app-production >&2 || true
        exit "$EXIT_HEALTH"
        ;;
    esac
    printf "    ${COLOR_DIM}%ss elapsed (status: %s)${COLOR_RESET}\r" "$elapsed" "$status"
    sleep "$HEALTH_POLL_INTERVAL_SEC"
    elapsed=$((elapsed + HEALTH_POLL_INTERVAL_SEC))
  done

  fail "Healthcheck timed out after ${HEALTH_TIMEOUT_SEC}s (last status: $status)."
  docker_compose logs --tail=50 app-production >&2 || true
  exit "$EXIT_HEALTH"
}

smoke_test() {
  info "Smoke verification"

  # 1. App responds.
  if ! docker_compose exec -T app-production curl -fsS http://localhost:3000 >/dev/null 2>&1; then
    fail "Smoke: app-production did not return 200 on /"
    exit "$EXIT_SMOKE"
  fi
  ok "Smoke: HTTP 200 on /"

  # 2. Migrations + (optional) seed produced at least one User row.
  local count
  count="$(docker_compose exec -T postgres psql -U nextcrm -d nextcrm -tAc \
    'SELECT COUNT(*) FROM "Users";' 2>/dev/null | tr -d '[:space:]' || echo "0")"
  if [[ -z "$count" || "$count" == "0" ]]; then
    warn "Smoke: Users table is empty. Entrypoint seed may not have run — check logs."
  else
    ok "Smoke: Users table has $count row(s)."
  fi
}

# ------------------------------------------------------------------- main ---
main() {
  parse_args "$@"
  preflight
  load_existing_secrets
  collect_inputs
  validate_inputs

  generate_secrets
  validate_secret_strength

  write_env_file
  if (( GENERATED_COUNT > 0 )); then
    ok "Wrote $(basename "$ENV_FILE") ($GENERATED_COUNT secret(s) auto-generated, file mode 0600)."
  else
    ok "Wrote $(basename "$ENV_FILE") (existing secrets preserved)."
  fi

  if [[ "$SKIP_BUILD" -eq 0 ]]; then build_image; else warn "Skipping build (--skip-build)"; fi
  if [[ "$SKIP_UP"    -eq 0 ]]; then bring_up; wait_healthy; smoke_test
  else warn "Skipping docker compose up (--skip-up)"
  fi

  printf "\n${COLOR_BOLD}Done.${COLOR_RESET}\n"
  printf "  Env file:   %s\n" "$ENV_FILE"
  printf "  Admin user: %s\n" "$ADMIN_EMAIL"
  printf "  App URL:    %s\n" "$DOMAIN"
  printf "\nSecrets live only in %s (mode 0600). Back it up before rotating.\n" "$(basename "$ENV_FILE")"
}

main "$@"
