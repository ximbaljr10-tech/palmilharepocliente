/**
 * PM2 ecosystem — sobe o backend FastAPI e o whatsapp-service no servidor.
 *
 * Uso:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup  (gera comando systemd para subir no boot)
 *
 * Importante: este arquivo NÃO é usado no Vercel. Ele serve para o
 * servidor onde rodam os serviços persistentes (backend + whatsapp-service).
 */
module.exports = {
  apps: [
    {
      name: "axiom-backend",
      cwd: "./backend",
      script: "/home/root/venv/bin/uvicorn",
      args: "server:app --host 0.0.0.0 --port 8001 --workers 2 --log-level info",
      interpreter: "none",
      env: {
        PYTHONUNBUFFERED: "1"
      },
      max_memory_restart: "500M",
      autorestart: true,
      watch: false,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "./logs/backend.out.log",
      error_file: "./logs/backend.err.log",
      merge_logs: true,
      time: true
    },
    {
      name: "axiom-whatsapp",
      cwd: "./whatsapp-service",
      script: "index.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production"
      },
      max_memory_restart: "400M",
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      out_file: "../logs/whatsapp.out.log",
      error_file: "../logs/whatsapp.err.log",
      merge_logs: true,
      time: true
    }
  ]
};
