module.exports = {
  apps: [{
    name: 'profi-planner-server',
    script: './dist/server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'development',
      PORT: 5000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    // Watch mode
    watch: ['src'],
    ignore_watch: ['node_modules', 'logs', 'data'],
    watch_delay: 1000,
    
    // Memory and performance
    max_memory_restart: '200M',
    max_instances: 1,
    
    // Error and output logs
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time_format: 'YYYY-MM-DD HH:mm:ss Z',
    
    // Graceful shutdown
    kill_timeout: 10000,
    listen_timeout: 3000,
    
    // Auto restart
    max_restarts: 10,
    min_uptime: '10s',
    autorestart: true,
    exp_backoff_restart_delay: 100,
    
    // Health check
    cron_restart: '0 0 * * *',
  }]
};
