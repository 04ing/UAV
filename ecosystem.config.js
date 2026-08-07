/**
 * PM2 进程管理配置
 * 用法:
 *   首次启动:  pm2 start ecosystem.config.js
 *   查看:      pm2 status / pm2 logs uav-backend
 *   重启:      pm2 reload uav-backend
 *   停止:      pm2 stop uav-backend
 */

module.exports = {
  apps: [
    {
      name: 'uav-backend',
      script: './backend/server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 3000,
      listen_timeout: 5000,
      kill_timeout: 3000,
      env: {
        NODE_ENV: 'production',
        PORT: 4000,
        HOME: __dirname,
      },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      time: true,
    },
  ],
};
