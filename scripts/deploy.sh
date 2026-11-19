#!/usr/bin/env bash
# =============================================================================
# SUOXI Skin Care & Aesthetic Center CRM — One-Command GitHub -> VPS Deploy
#
# Usage on VPS:
#   ./scripts/deploy.sh          # pulls 'main' branch
#   ./scripts/deploy.sh staging  # pulls a custom branch
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRANCH="${1:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/v1/health}"

cd "$APP_DIR"

echo "============================================================"
echo "[SUOXI Deploy] Starting deployment from branch: $BRANCH"
echo "[SUOXI Deploy] Directory: $APP_DIR"
echo "============================================================"

if [[ ! -f ".env" ]]; then
  echo "[ERROR] .env file not found in $APP_DIR."
  echo "Copy .env.production.example to .env and fill in production credentials first."
  exit 1
fi

# Ensure no accidental untracked/modified tracked files block a clean fast-forward pull
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "[ERROR] Local tracked files have uncommitted modifications on VPS:"
  git status --short --untracked-files=no
  echo "Please commit, stash, or revert them before pulling updates."
  exit 1
fi

echo "[1/6] Pulling latest code from GitHub (origin/$BRANCH)..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[2/6] Installing Node.js dependencies (npm ci)..."
npm ci --include=dev

echo "[3/6] Building production React frontend (dist/)..."
npm run build

echo "[4/6] Running idempotent PostgreSQL migrations..."
npm run pg:migrate

echo "[5/6] Ensuring log & private upload directories exist..."
set -a
# shellcheck disable=SC1091
source .env
set +a
mkdir -p "${UPLOAD_DIR:-/var/data/suoxi/uploads}"
mkdir -p "/var/log/suoxi"

echo "[6/6] Restarting PM2 process (suoxi-crm)..."
if pm2 describe suoxi-crm >/dev/null 2>&1; then
  pm2 restart suoxi-crm --update-env
else
  pm2 start ecosystem.config.cjs --env production
fi
pm2 save

echo "[Verify] Waiting for application health check at $HEALTH_URL..."
for i in $(seq 1 15); do
  if curl -fsS "$HEALTH_URL" >/tmp/suoxi_health.json 2>/dev/null; then
    echo "[SUCCESS] SUOXI CRM is live and healthy:"
    cat /tmp/suoxi_health.json
    echo ""
    rm -f /tmp/suoxi_health.json
    exit 0
  fi
  sleep 1
done

echo "[ERROR] Health check failed after 15 seconds. Inspect logs with: pm2 logs suoxi-crm --lines 50"
exit 1
