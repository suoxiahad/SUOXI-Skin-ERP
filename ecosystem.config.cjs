/**
 * SUOXI Skin Care & Aesthetic Center CRM — PM2 Production Configuration
 * Target: Linux VPS (8 CPU Cores, 32 GB RAM, Ubuntu 22.04/24.04 LTS)
 *
 * First start:
 *   pm2 start ecosystem.config.cjs --env production
 *   pm2 save
 *   pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'suoxi-crm',
      script: './server.ts',
      interpreter: 'node',
      node_args: '--import tsx --max-old-space-size=4096',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '2G',
      kill_timeout: 10000,
      listen_timeout: 15000,
      merge_logs: true,
      time: true,
      out_file: '/var/log/suoxi/out.log',
      error_file: '/var/log/suoxi/error.log',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
        TZ: 'Asia/Dhaka',
      },
    },
  ],
};
