#!/usr/bin/env bash
# Startup smoke gate for the Elastic Beanstalk bundle (called by buildspec.yml; also runs locally).
#
# Boots <bundle>/dist/server.js exactly as EB will (cwd = bundle, Procfile command, production
# config) and asserts that:
#   1. GET /crm/api/health answers 200 (VMS/Keycloak are deliberately unreachable → "degraded")
#   2. GET /crm/ serves the SPA shell (index.html)
#   3. GET /crm/accounts (an SPA deep link) falls back to index.html
#   4. GET /crm/api/accounts without a session is a 401 JSON error, not the SPA
#
# Usage: scripts/smoke-boot.sh <bundle-dir>
set -euo pipefail

BUNDLE="${1:?usage: smoke-boot.sh <bundle-dir>}"
PORT="${SMOKE_PORT:-18082}"
LOG="$(mktemp)"
BASE="http://127.0.0.1:${PORT}/crm"

cleanup() {
  if [[ -n "${PID:-}" ]] && kill -0 "$PID" 2>/dev/null; then kill "$PID" 2>/dev/null || true; fi
  rm -f "$LOG"
}
trap cleanup EXIT

fail() {
  echo "SMOKE FAILED: $1" >&2
  echo "----- server log -----" >&2
  cat "$LOG" >&2 || true
  exit 1
}

# A throwaway deployed-style config: APP_ENV=dev applies the same fail-fast rules as production
# (SESSION_SECRET, VMS_URL and KEYCLOAK_URL required) but never calls AWS Secrets Manager, so the gate
# needs no credentials and cannot read real secrets. Unreachable upstreams, random secret.
SECRET="$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')"
(
  cd "$BUNDLE"
  APP_ENV=dev NODE_ENV=production PORT="$PORT" HOST=127.0.0.1 \
  SESSION_SECRET="$SECRET" \
  VMS_URL="http://127.0.0.1:9/vms/internal/v1/" KEYCLOAK_URL="http://127.0.0.1:9/realms/" \
  VMS_TIMEOUT_MS=2000 LOG_LEVEL=warn \
    exec node --env-file-if-exists=.env dist/server.js
) >"$LOG" 2>&1 &
PID=$!

# Wait up to 30s for the health endpoint.
for _ in $(seq 1 60); do
  if ! kill -0 "$PID" 2>/dev/null; then fail "server exited during startup"; fi
  if curl -fsS -o /dev/null "$BASE/api/health" 2>/dev/null; then break; fi
  sleep 0.5
done
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health") || true
[[ "$code" == "200" ]] || fail "/crm/api/health returned $code"

shell=$(curl -fsS "$BASE/") || fail "/crm/ did not return 200"
grep -q '<div id="root"' <<<"$shell" || fail "/crm/ is not the SPA shell"

deep=$(curl -fsS "$BASE/accounts") || fail "/crm/accounts deep link did not return 200"
grep -q '<div id="root"' <<<"$deep" || fail "/crm/accounts did not fall back to the SPA shell"

api_code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/accounts") || true
[[ "$api_code" == "401" ]] || fail "/crm/api/accounts without a session returned $api_code, expected 401"

echo "SMOKE OK: health 200, SPA shell + deep link served, API requires a session"
