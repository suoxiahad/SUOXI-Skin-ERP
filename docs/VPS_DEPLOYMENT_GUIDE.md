# SUOXI Skin Care & Aesthetic Center CRM — VPS Production Deployment Guide

Target Infrastructure: **Linux VPS (8 CPU Cores, 32 GB RAM, 400 GB Disk)** — Ubuntu 22.04 / 24.04 LTS  
Architecture: **PostgreSQL + Redis + Node.js/Express + React SPA + Private Disk Uploads on VPS**, **Cloudflare R2 for Encrypted Offsite Backups**, and **GitHub -> VPS (`git pull`)** updates.

---

## 1. Initial VPS Packages & Firewall Setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential nginx certbot python3-certbot-nginx \
  postgresql postgresql-contrib redis-server openssl awscli ufw

# Install Node.js 22 LTS + PM2
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Firewall: Allow SSH, HTTP, HTTPS only (PostgreSQL 5432 & Redis 6379 stay local-only)
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
```

---

## 2. Configure PostgreSQL & Redis (Localhost Only)

### PostgreSQL
```bash
sudo -u postgres psql <<'SQL'
CREATE USER suoxi_app WITH PASSWORD 'REPLACE_WITH_STRONG_DB_PASSWORD';
CREATE DATABASE suoxi_crm OWNER suoxi_app;
GRANT ALL PRIVILEGES ON DATABASE suoxi_crm TO suoxi_app;
SQL
```
Verify PostgreSQL listens only on localhost (`listen_addresses = 'localhost'` in `/etc/postgresql/*/main/postgresql.conf`).

### Redis
Edit `/etc/redis/redis.conf`:
- Ensure `bind 127.0.0.1 -::1`
- Set `requirepass REPLACE_WITH_STRONG_REDIS_PASSWORD`
- Set `maxmemory 2gb` and `maxmemory-policy allkeys-lru`
- Restart Redis:
```bash
sudo systemctl restart redis-server
sudo systemctl enable redis-server
```

---

## 3. Private Data Directories (Outside Git Repository)

```bash
sudo mkdir -p /var/www/suoxi-crm /var/data/suoxi/uploads /var/backups/suoxi /var/log/suoxi
sudo chown -R "$USER:$USER" /var/www/suoxi-crm /var/data/suoxi /var/backups/suoxi /var/log/suoxi
chmod 750 /var/data/suoxi/uploads
chmod 700 /var/backups/suoxi
```

---

## 4. Connect GitHub (Private Repository -> VPS)

Generate a dedicated read-only SSH deploy key on the VPS:
```bash
ssh-keygen -t ed25519 -C "suoxi-vps-deploy" -f ~/.ssh/suoxi_github_deploy -N ""
cat ~/.ssh/suoxi_github_deploy.pub
```
Add that public key to your GitHub Repository: **Settings -> Deploy keys -> Add deploy key** (leave "Allow write access" unchecked).

Configure SSH to use the deploy key:
```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile ~/.ssh/suoxi_github_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
```

Clone the repository onto the VPS:
```bash
git clone git@github.com:YOUR_GITHUB_ORG_OR_USER/YOUR_REPO_NAME.git /var/www/suoxi-crm
cd /var/www/suoxi-crm
```

---

## 5. Production Environment Configuration (`.env`)

```bash
cp .env.production.example .env
chmod 600 .env
nano .env
```
Generate strong secrets before editing `.env`:
```bash
openssl rand -hex 32   # Use for SESSION_SECRET
openssl rand -hex 32   # Use for APP_MASTER_KEY (encrypts referrer payout accounts)
openssl rand -base64 36 # Use for BACKUP_ENCRYPTION_PASSPHRASE (save safely offline!)
```

---

## 6. First-Time Database Migration, Seed & Launch

```bash
cd /var/www/suoxi-crm
npm ci --include=dev
npm run build
npm run pg:migrate
npm run pg:seed
# Optional: if importing legacy patients.json once:
# npm run pg:import-patients -- --file=/path/to/patients.json

chmod +x scripts/deploy.sh scripts/backup-to-r2.sh scripts/restore-from-r2.sh
pm2 start ecosystem.config.cjs --env production
pm2 save
pm2 startup
```

Verify health endpoint:
```bash
curl -s http://127.0.0.1:3000/api/v1/health | jq .
```
Expected: `"status": "ok"`, `"storageMode": "postgresql"`, `"authMode": "production_session"`, `"allowRoleSwitcher": false`, `"redis": { "ok": true }`.

> **Important:** After signing in as `admin@suoxiclinic.com` with your `SEED_ADMIN_PASSWORD`, immediately change the password and remove `SEED_ADMIN_PASSWORD` from `.env`.

---

## 7. Nginx & Free HTTPS (Let's Encrypt)

```bash
sudo cp /var/www/suoxi-crm/deploy/nginx/suoxi-crm.conf /etc/nginx/sites-available/suoxi-crm
# Replace crm.suoxiclinic.com with your actual domain if different:
sudo nano /etc/nginx/sites-available/suoxi-crm
sudo ln -sf /etc/nginx/sites-available/suoxi-crm /etc/nginx/sites-enabled/suoxi-crm
sudo nginx -t
sudo systemctl reload nginx

# Issue automatic HTTPS certificate:
sudo certbot --nginx -d crm.suoxiclinic.com
```

---

## 8. Daily Code Updates (GitHub -> VPS in 1 Command)

Whenever you push new code to GitHub `main`, SSH into the VPS and run:
```bash
cd /var/www/suoxi-crm && ./scripts/deploy.sh
```
This automatically pulls from GitHub, installs packages, builds the React frontend, runs any new PostgreSQL migrations, restarts PM2, and verifies `/api/v1/health`.

---

## 9. Cloudflare R2 Encrypted Nightly Backup & Restore

1. Create a private Cloudflare R2 bucket (e.g., `suoxi-crm-backups`).
2. In R2 Bucket **Settings -> Object Lifecycle Rules**, add a rule to auto-expire objects under `daily/` after **30 days** (or 90 days as desired).
3. Test manual backup first:
```bash
/var/www/suoxi-crm/scripts/backup-to-r2.sh
```
4. Verify restore integrity without touching live data (`--dry-run`):
```bash
/var/www/suoxi-crm/scripts/restore-from-r2.sh --list
/var/www/suoxi-crm/scripts/restore-from-r2.sh --dry-run <ARCHIVE_FILENAME.tar.enc>
```
5. Schedule nightly automated backup at **03:15 AM Dhaka time** (`crontab -e`):
```cron
CRON_TZ=Asia/Dhaka
15 3 * * * /var/www/suoxi-crm/scripts/backup-to-r2.sh >> /var/log/suoxi/backup.log 2>&1
```
