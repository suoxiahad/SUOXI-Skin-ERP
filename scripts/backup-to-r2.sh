#!/usr/bin/env bash
# =============================================================================
# SUOXI Skin Care & Aesthetic Center CRM
# Automated Encrypted Offsite Backup -> Cloudflare R2
#
# Backs up:
#   1. Full PostgreSQL database dump (pg_dump custom format)
#   2. Private VPS Patient Photos & Clinical Documents (UPLOAD_DIR)
# Encrypts the combined archive with AES-256-CBC (PBKDF2) before uploading to R2.
#
# Recommended Crontab (Daily at 03:15 AM Asia/Dhaka):
#   15 3 * * * /var/www/suoxi-crm/scripts/backup-to-r2.sh >> /var/log/suoxi/backup.log 2>&1
# =============================================================================
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$APP_DIR/.env}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[BACKUP ERROR] Environment file not found: $ENV_FILE"
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
BACKUP_DIR="${BACKUP_DIR:-/var/backups/suoxi}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
LOCAL_RETENTION_DAYS="${LOCAL_BACKUP_RETENTION_DAYS:-7}"

TIMESTAMP="$(date -u +%Y%m%d_%H%M%S)"
WORK_DIR="$(mktemp -d "${BACKUP_DIR%/}/work_${TIMESTAMP}_XXXXXX" 2>/dev/null || mktemp -d)"
ARCHIVE_BASENAME="suoxi_full_${TIMESTAMP}.tar.enc"
LOCAL_ENC_PATH="${BACKUP_DIR%/}/${ARCHIVE_BASENAME}"
LOCAL_SHA_PATH="${LOCAL_ENC_PATH}.sha256"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

echo "============================================================"
echo "[SUOXI Backup] Started at $(date -Iseconds)"
echo "============================================================"

# 1. PostgreSQL Logical Dump (consistent snapshot, no table locks)
echo "[1/5] Dumping PostgreSQL database..."
pg_dump --format=custom --compress=9 --no-owner --no-privileges \
  --file="$WORK_DIR/suoxi_db.dump" "$DATABASE_URL"

# 2. Private Uploads Archive (Patient Photos, Documents, Prescriptions)
echo "[2/5] Archiving private clinic uploads from $UPLOAD_DIR..."
if [[ -d "$UPLOAD_DIR" ]]; then
  tar -czf "$WORK_DIR/suoxi_uploads.tar.gz" -C "$UPLOAD_DIR" .
else
  echo "[WARN] UPLOAD_DIR ($UPLOAD_DIR) does not exist yet; creating empty placeholder archive."
  mkdir -p "$WORK_DIR/empty_uploads"
  tar -czf "$WORK_DIR/suoxi_uploads.tar.gz" -C "$WORK_DIR/empty_uploads" .
fi

# Metadata manifest
cat > "$WORK_DIR/manifest.json" <<EOF
{
  "app": "suoxi-crm",
  "timestampUtc": "${TIMESTAMP}",
  "hostname": "$(hostname)",
  "uploadDir": "${UPLOAD_DIR}",
  "encryption": "aes-256-cbc-pbkdf2-100000"
}
EOF

# 3. Combine & Encrypt with OpenSSL AES-256-CBC + PBKDF2
echo "[3/5] Encrypting combined backup archive..."
tar -cf - -C "$WORK_DIR" suoxi_db.dump suoxi_uploads.tar.gz manifest.json | \
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -pass env:BACKUP_ENCRYPTION_PASSPHRASE \
    -out "$LOCAL_ENC_PATH"

chmod 600 "$LOCAL_ENC_PATH"
(cd "$BACKUP_DIR" && sha256sum "$ARCHIVE_BASENAME" > "$LOCAL_SHA_PATH")
chmod 600 "$LOCAL_SHA_PATH"

FILE_SIZE_HUMAN="$(du -h "$LOCAL_ENC_PATH" | cut -f1)"
echo "[3/5] Encrypted archive ready: $LOCAL_ENC_PATH ($FILE_SIZE_HUMAN)"

# 4. Upload to Cloudflare R2 (S3-compatible API via AWS CLI v2)
echo "[4/5] Uploading encrypted archive to Cloudflare R2 (s3://${R2_BUCKET_NAME}/daily/)..."
export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="auto"

aws s3 cp "$LOCAL_ENC_PATH" "s3://${R2_BUCKET_NAME}/daily/${ARCHIVE_BASENAME}" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors
aws s3 cp "$LOCAL_SHA_PATH" "s3://${R2_BUCKET_NAME}/daily/${ARCHIVE_BASENAME}.sha256" \
  --endpoint-url "$R2_ENDPOINT" --only-show-errors

echo "[4/5] Uploaded cleanly to Cloudflare R2."

# 5. Record backup metadata in PostgreSQL backup_records (best-effort)
if command -v psql >/dev/null 2>&1; then
  BKP_ID="bkp-r2-${TIMESTAMP}"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=0 -q <<SQL || true
INSERT INTO backup_records (
  id, filename, file_size, backup_type, storage_target, status,
  total_records, tables_included, created_by, created_at
)
VALUES (
  '${BKP_ID}',
  '${ARCHIVE_BASENAME}',
  '${FILE_SIZE_HUMAN}',
  'auto_daily',
  'r2',
  'completed',
  (SELECT
    (SELECT COUNT(*) FROM patients) +
    (SELECT COUNT(*) FROM appointments) +
    (SELECT COUNT(*) FROM invoices) +
    (SELECT COUNT(*) FROM prescriptions)
  ),
  '["postgresql_full_dump","private_uploads_archive"]'::jsonb,
  'cron_r2_backup',
  NOW()
)
ON CONFLICT (id) DO NOTHING;
SQL
fi

# 6. Local retention pruning (keeps last N days on VPS disk; configure R2 Lifecycle Rule for offsite pruning)
echo "[5/5] Pruning local backup archives older than ${LOCAL_RETENTION_DAYS} days..."
find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'suoxi_full_*.tar.enc' -o -name 'suoxi_full_*.tar.enc.sha256' \) \
  -mtime "+${LOCAL_RETENTION_DAYS}" -delete

echo "[SUOXI Backup] Completed successfully at $(date -Iseconds). Offsite R2 retention target: ${RETENTION_DAYS} days."
