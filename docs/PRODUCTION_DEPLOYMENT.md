# SUOXI Skin ERP — Production Deployment Guide (Linux VPS + LiteSpeed + PM2)

Target Domain: **`https://erp.suoxi.tech`**  
Web Server / Reverse Proxy: **LiteSpeed / OpenLiteSpeed** *(do NOT install or start Nginx)*  
Process Manager: **PM2** (`ecosystem.config.cjs`)  
Database: **PostgreSQL 16** (ONLY) + **Redis 7**

---

## 1. Pre-Deployment Port & Service Verification (MANDATORY)

Never assume ports `3000` or `3007` are free on the VPS. Inspect active listeners first:
```bash
sudo ss -tulpn | grep -E ':(3000|3007|3010|5432|6379|80|443)\b'
```
Choose an unused loopback port (for example `PORT=3010` or another free port confirmed by `ss -tulpn`), and use that **same port** in both `.env` and LiteSpeed's external app configuration (`127.0.0.1:<PORT>`).

---

## 2. System Prerequisites

1. **Node.js 22 LTS** & `npm`
2. **PostgreSQL 16** running locally on `127.0.0.1:5432`
3. **Redis 7** running locally on `127.0.0.1:6379` (bind `127.0.0.1`, password protected)
4. **PM2** installed globally (`npm i -g pm2`)
5. **Private upload storage directory** outside the webroot:
   ```bash
   sudo mkdir -p /var/data/suoxi/uploads /var/backups/suoxi
   sudo chown -R $USER:$USER /var/data/suoxi /var/backups/suoxi
   chmod 700 /var/data/suoxi/uploads /var/backups/suoxi
   ```

---

## 3. PostgreSQL Database & Least-Privilege User Setup

```bash
sudo -u postgres psql <<'SQL'
CREATE USER suoxi_app WITH PASSWORD 'REPLACE_WITH_STRONG_PG_PASSWORD';
CREATE DATABASE suoxi_erp OWNER suoxi_app ENCODING 'UTF8' LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8' TEMPLATE template0;
ALTER DATABASE suoxi_erp SET timezone TO 'Asia/Dhaka';
REVOKE ALL ON DATABASE suoxi_erp FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE suoxi_erp TO suoxi_app;
SQL
```

---

## 4. Application Build & Environment Configuration

```bash
cd /var/www/suoxi-erp
npm ci
npm run build
```

Create `.env` from `.env.production.example` and lock down permissions immediately:
```bash
cp .env.production.example .env
chmod 600 .env
```

Generate cryptographically strong secrets (64 hex chars each):
```bash
openssl rand -hex 32   # SESSION_SECRET
openssl rand -hex 32   # APP_MASTER_KEY
openssl rand -hex 32   # PORTAL_TOKEN_SECRET
openssl rand -hex 32   # PAYMENT_WEBHOOK_SECRET
openssl rand -hex 32   # SMS_WEBHOOK_SECRET
```

Required production `.env` keys:
```dotenv
NODE_ENV=production
PORT=3010
HOST=127.0.0.1
TZ=Asia/Dhaka
CORS_ORIGIN=https://erp.suoxi.tech
APP_PUBLIC_URL=https://erp.suoxi.tech
TRUST_PROXY=true

DATABASE_URL=postgresql://suoxi_app:<STRONG_PASSWORD>@127.0.0.1:5432/suoxi_erp
REDIS_URL=redis://:<REDIS_PASSWORD>@127.0.0.1:6379/0

SESSION_SECRET=<64-hex-chars>
APP_MASTER_KEY=<64-hex-chars>
PORTAL_TOKEN_SECRET=<64-hex-chars>
PAYMENT_WEBHOOK_SECRET=<64-hex-chars>
SMS_WEBHOOK_SECRET=<64-hex-chars>

UPLOAD_DIR=/var/data/suoxi/uploads
ENABLE_DEMO_ROLE_SWITCHER=false
EMBEDDED_WORKER=false
```

> **Security Reminder:** Never set `ENABLE_DEMO_ROLE_SWITCHER=true` in production. The server will refuse to start if it is enabled or if any required secret is missing/weak.

---

## 5. Run Migrations & Create Initial Super Admin

1. Apply PostgreSQL migrations (`0001` → `0002` → `0003`):
   ```bash
   npm run pg:migrate
   npm run pg:status
   ```
2. Provision the initial production `super_admin` (NEVER run `npm run pg:seed` in production — it is blocked when `NODE_ENV=production`):
   ```bash
   ADMIN_EMAIL="admin@suoxi.tech" \
   ADMIN_PASSWORD="<12+-char-mixed-case-digit-symbol-password>" \
   ADMIN_NAME="SUOXI Managing Director" \
   npm run pg:create-admin
   ```
3. Log in at `https://erp.suoxi.tech` and immediately change the initial password (`must_change_password = TRUE`).
4. Configure freshly rotated SMS Gateway API key and SMTP password via **Settings → Integrations** (they are encrypted with `APP_MASTER_KEY` before saving to PostgreSQL).

---

## 6. Start Services with PM2

`ecosystem.config.cjs` defines two processes:
- **`suoxi-crm`**: Canonical Express API + SPA server (`server.ts`, `EMBEDDED_WORKER=false`)
- **`suoxi-worker`**: Canonical PostgreSQL + BullMQ background worker (`server/worker.ts`)

```bash
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup   # follow printed systemd instruction
pm2 status
```

---

## 7. LiteSpeed / OpenLiteSpeed Reverse Proxy (`erp.suoxi.tech`)

Use the provided template at `deploy/litespeed/erp.suoxi.tech.conf`:
1. Ensure the LiteSpeed External App (`suoxi_erp_backend`) address matches `127.0.0.1:<PORT>` from `.env`.
2. Ensure SSL/TLS certificate (Let's Encrypt / CyberPanel SSL) is active for `erp.suoxi.tech` with HTTP → HTTPS redirect.
3. Preserve `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto` headers so Express `trust proxy` and `Secure` cookies work accurately.
4. Reload LiteSpeed gracefully:
   ```bash
   sudo /usr/local/lsws/bin/lswsctrl reload
   ```

---

## 8. Post-Deploy Smoke Verification

```bash
# 1. Local loopback liveness & readiness
curl -sf http://127.0.0.1:${PORT}/healthz | jq .
curl -sf http://127.0.0.1:${PORT}/readyz | jq .

# 2. Public HTTPS via LiteSpeed
curl -sf https://erp.suoxi.tech/healthz | jq .
curl -sf https://erp.suoxi.tech/api/v1/ready | jq .

# 3. Verify unauthenticated API request returns 401 and demo switcher is disabled
curl -i https://erp.suoxi.tech/api/v1/patients
```

Expected:
- `/healthz`: HTTP `200`, `allowRoleSwitcher: false`, `database.connected: true`
- `/readyz` and `/api/v1/ready`: HTTP `200`, `status: "ready"`, `schemaReady: true`
- `/api/v1/patients` without cookie: HTTP `401`
- Response headers include `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Strict-Transport-Security`.
