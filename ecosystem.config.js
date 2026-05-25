module.exports = {
  apps: [
    {
      name: 'wavemod',
      script: 'npm',
      args: 'start',
      cwd: '/var/www/WaveMod',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/var/log/pm2/wavemod-error.log',
      out_file: '/var/log/pm2/wavemod-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
