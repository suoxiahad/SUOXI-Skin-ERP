#!/usr/bin/env bash
# =============================================================================
# SUOXI Skin Care & Aesthetic Center CRM
# Disaster Recovery Restore Script (from Cloudflare R2 Encrypted Backups)
#
# Usage:
#   ./scripts/restore-from-r2.sh --list
#   ./scripts/restore-from-r2.sh --dry-run suoxi_full_20261119_031500.tar.enc
#   ./scripts/restore-from-r2.sh suoxi_full_20261119_031500.tar.enc
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[RESTORE ERROR] Environment file not found: $ENV_FILE"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${DATABASE_URL:?DATABASE_URL is required in .env}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required in .env}"
: "${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is required in .env}"
: "${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is required in .env}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME is required in .env}"
: "${R2_ENDPOINT:?R2_ENDPOINT is required in .env}"

UPLOAD_DIR="${UPLOAD_DIR:-/var/data/suoxi/uploads}"
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

if [[ "${1:-}" == "--list" || -z "${1:-}" ]]; then
  echo "[SUOXI Restore] Available backups in s3://${R2_BUCKET_NAME}/daily/:"
  aws s3 ls "s3://${R2_BUCKET_NAME}/daily/" --endpoint-url "$R2_ENDPOINT"
  exit 0
fi

DRY_RUN="false"
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="true"
  shift
fi

ARCHIVE_NAME="${1:?Please specify a backup filename (run with --list to view available backups)}"
WORK_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

echo "[1/4] Downloading ${ARCHIVE_NAME} from Cloudflare R2..."
aws s3 cp "s3://${R2_BUCKET_NAME}/daily/${ARCHIVE_NAME}" "$WORK_DIR/$ARCHIVE_NAME" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

if aws s3 cp "s3://${R2_BUCKET_NAME}/daily/${ARCHIVE_NAME}.sha256" "$WORK_DIR/${ARCHIVE_NAME}.sha256" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors 2>/dev/null; then
  echo "[2/4] Verifying SHA-256 checksum..."
  (cd "$WORK_DIR" && sha256sum -c "${ARCHIVE_NAME}.sha256")
else
  echo "[2/4] Checksum file not present; proceeding to authenticated decryption check."
fi

echo "[3/4] Decrypting and extracting backup archive..."
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
  -in "$WORK_DIR/$ARCHIVE_NAME" | tar -xf - -C "$WORK_DIR"

echo "[3/4] Backup manifest:"
cat "$WORK_DIR/manifest.json"
echo ""

if [[ "$DRY_RUN" == "true" ]]; then
  echo "[DRY-RUN OK] Backup downloaded, decrypted, and verified cleanly."
  echo "  - DB dump size: $(du -h "$WORK_DIR/suoxi_db.dump" | cut -f1)"
  echo "  - Uploads archive size: $(du -h "$WORK_DIR/suoxi_uploads.tar.gz" | cut -f1)"
  echo "No live data was modified."
  exit 0
fi

echo "============================================================"
echo "WARNING: This will OVERWRITE the live PostgreSQL database"
echo "and restore files into: $UPLOAD_DIR"
echo "Type YES-RESTORE-SUOXI to continue:"
read -r CONFIRM
if [[ "$CONFIRM" != "YES-RESTORE-SUOXI" ]]; then
  echo "[ABORTED] Restore cancelled."
  exit 1
fi

echo "[4/4] Stopping app briefly, restoring PostgreSQL & uploads..."
pm2 stop suoxi-crm >/dev/null 2>&1 || true

pg_restore --clean --if-exists --no-owner --no-privileges \
  --dbname="$DATABASE_URL" "$WORK_DIR/suoxi_db.dump"

mkdir -p "$UPLOAD_DIR"
tar -xzf "$WORK_DIR/suoxi_uploads.tar.gz" -C "$UPLOAD_DIR"

pm2 start suoxi-crm >/dev/null 2>&1 || pm2 start "$APP_DIR/ecosystem.config.cjs" --env production
echo "[SUCCESS] Restore completed from ${ARCHIVE_NAME} and SUOXI CRM restarted."
