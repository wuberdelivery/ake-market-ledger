module.exports = {
  apps: [
    {
      name: 'ake-ledger-asr',
      cwd: '/home/wuber/AkeLedger',
      script: 'server/run.sh',
      interpreter: '/bin/bash',
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '5G',
      time: true,
    },
  ],
};
