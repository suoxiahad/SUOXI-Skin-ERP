# SUOXI Skin ERP — Backup, Offsite Archival & Disaster Recovery Guide

## 1. Backup Scope & RPO / RTO Targets

| Asset | Location | Backup Method | Frequency | Retention |
|---|---|---|---|---|
| **PostgreSQL 16 Database** | `suoxi_erp` | `pg_dump --format=custom --compress=9` + AES-256-CBC encryption | Daily at 02:30 `Asia/Dhaka` + pre-deploy manual snapshot | 14 days local + 90 days offsite (Cloudflare R2 / S3) |
| **Private Clinical Uploads** | `/var/data/suoxi/uploads` | `tar -czf` + AES-256-CBC encryption | Daily at 03:00 `Asia/Dhaka` | 14 days local + 90 days offsite |
| **Secrets & Env Config** | `.env` (`chmod 600`) | Stored in password manager / offline encrypted vault (NEVER in git or unencrypted buckets) | On every key rotation | Latest + previous rotation record |

- **Target RPO:** 24 hours (or 15 minutes if WAL archiving is enabled).
- **Target RTO:** < 45 minutes on a replacement Linux VPS.

---

## 2. Automated Daily Backup Script (`/usr/local/bin/suoxi-backup.sh`)

```bash
#!/usr/bin/env bash
set -euo pipefail

umask 077
export TZ="Asia/Dhaka"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="/var/backups/suoxi"
UPLOAD_DIR="/var/data/suoxi/uploads"
ENV_FILE="/var/www/suoxi-erp/.env"
BACKUP_PASSPHRASE_FILE="/etc/suoxi/backup.passphrase" # chmod 600 root:root

source "$ENV_FILE"
mkdir -p "$BACKUP_DIR"

PG_RAW="${BACKUP_DIR}/suoxi_erp_${TIMESTAMP}.dump"
PG_ENC="${PG_RAW}.enc"
UPLOADS_ENC="${BACKUP_DIR}/suoxi_uploads_${TIMESTAMP}.tar.gz.enc"

# 1. Logical consistent PostgreSQL dump (custom format supports selective & parallel restore)
pg_dump "$DATABASE_URL" --format=custom --compress=9 --no-owner --no-privileges --file="$PG_RAW"

# 2. Verify dump archive integrity before encrypting
pg_restore --list "$PG_RAW" > /dev/null

# 3. Encrypt PostgreSQL dump at rest with AES-256-CBC + PBKDF2
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
  -in "$PG_RAW" -out "$PG_ENC" -pass "file:${BACKUP_PASSPHRASE_FILE}"
rm -f "$PG_RAW"
sha256sum "$PG_ENC" > "${PG_ENC}.sha256"

# 4. Archive & encrypt private clinical uploads
if [ -d "$UPLOAD_DIR" ]; then
  tar -czf - -C "$(dirname "$UPLOAD_DIR")" "$(basename "$UPLOAD_DIR")" \
    | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
        -out "$UPLOADS_ENC" -pass "file:${BACKUP_PASSPHRASE_FILE}"
  sha256sum "$UPLOADS_ENC" > "${UPLOADS_ENC}.sha256"
fi

# 5. Offsite sync to Cloudflare R2 (requires rclone remote `r2_suoxi` configured)
if command -v rclone >/dev/null 2>&1; then
  rclone copy "$PG_ENC" r2_suoxi:suoxi-erp-backups/postgres/
  rclone copy "${PG_ENC}.sha256" r2_suoxi:suoxi-erp-backups/postgres/
  if [ -f "$UPLOADS_ENC" ]; then
    rclone copy "$UPLOADS_ENC" r2_suoxi:suoxi-erp-backups/uploads/
    rclone copy "${UPLOADS_ENC}.sha256" r2_suoxi:suoxi-erp-backups/uploads/
  fi
fi

# 6. Prune local archives older than 14 days
find "$BACKUP_DIR" -type f -mtime +14 -delete
echo "[SUOXI Backup] Completed successfully at $(date -Iseconds)"
```

Schedule via root crontab (`crontab -e`):
```cron
30 2 * * * /usr/local/bin/suoxi-backup.sh >> /var/log/suoxi-backup.log 2>&1
```

---

## 3. Step-by-Step Disaster Recovery & Restore Drill

Perform a **monthly restore drill** into a temporary staging database (`suoxi_erp_drill`) to confirm backups are decryptable and intact:

```bash
# 1. Verify SHA-256 checksum
sha256sum -c /var/backups/suoxi/suoxi_erp_<TIMESTAMP>.dump.enc.sha256

# 2. Decrypt archive
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in /var/backups/suoxi/suoxi_erp_<TIMESTAMP>.dump.enc \
  -out /tmp/suoxi_restore.dump \
  -pass file:/etc/suoxi/backup.passphrase

# 3. Stop API and worker before production restore (skip if restoring to drill DB)
pm2 stop suoxi-crm suoxi-worker

# 4. Restore into fresh PostgreSQL database
sudo -u postgres createdb -O suoxi_app suoxi_erp_restore
pg_restore --dbname="postgresql://suoxi_app:<PW>@127.0.0.1:5432/suoxi_erp_restore" \
  --clean --if-exists --no-owner --no-privileges --single-transaction \
  /tmp/suoxi_restore.dump
rm -f /tmp/suoxi_restore.dump

# 5. Verify schema migrations and row counts
psql "postgresql://suoxi_app:<PW>@127.0.0.1:5432/suoxi_erp_restore" -c "
  SELECT version, applied_at FROM schema_migrations ORDER BY version;
  SELECT 'patients' AS tbl, COUNT(*) FROM patients
  UNION ALL SELECT 'invoices', COUNT(*) FROM invoices
  UNION ALL SELECT 'payment_records', COUNT(*) FROM payment_records
  UNION ALL SELECT 'audit_events', COUNT(*) FROM audit_events;
"

# 6. Restore private uploads (if full server rebuild)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in /var/backups/suoxi/suoxi_uploads_<TIMESTAMP>.tar.gz.enc \
  -pass file:/etc/suoxi/backup.passphrase \
  | tar -xzf - -C /var/data/suoxi/

# 7. Restart services and confirm readiness
pm2 start suoxi-crm suoxi-worker
curl -sf http://127.0.0.1:${PORT}/readyz
```

> **Important:** Because gateway secrets (`clinic_settings`, `integration_configs`, `referrers.payout_account_encrypted`) are encrypted with `APP_MASTER_KEY`, you **must** restore the exact same `APP_MASTER_KEY` in `.env` when recovering a backup onto a new server.
