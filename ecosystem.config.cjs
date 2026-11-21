/**
 * SUOXI Skin Care & Aesthetic Center ERP — PM2 Production Configuration
 * Target: Linux VPS behind LiteSpeed / OpenLiteSpeed Reverse Proxy (erp.suoxi.tech)
 *
 * IMPORTANT:
 *   - Do NOT assume port 3000 or 3007 is free on the VPS; configure PORT in `.env`
 *     after verifying available ports (`ss -tulpn`).
 *   - Start both web API (`suoxi-crm`) and dedicated worker (`suoxi-worker`):
 *       pm2 start ecosystem.config.cjs --env production
 *       pm2 save
 *       pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'suoxi-crm',
      script: './server.ts',
      interpreter: 'node',
      node_args: '--import tsx --max-old-space-size=2048',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      kill_timeout: 10000,
      listen_timeout: 15000,
      wait_ready: true,
      merge_logs: true,
      time: true,
      out_file: '/var/log/suoxi/api-out.log',
      error_file: '/var/log/suoxi/api-error.log',
      env_production: {
        NODE_ENV: 'production',
        EMBEDDED_WORKER: 'false',
        TZ: 'Asia/Dhaka',
      },
    },
    {
      name: 'suoxi-worker',
      script: './server/worker.ts',
      interpreter: 'node',
      node_args: '--import tsx --max-old-space-size=1024',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      kill_timeout: 10000,
      wait_ready: true,
      merge_logs: true,
      time: true,
      out_file: '/var/log/suoxi/worker-out.log',
      error_file: '/var/log/suoxi/worker-error.log',
      env_production: {
        NODE_ENV: 'production',
        TZ: 'Asia/Dhaka',
      },
    },
  ],
};
