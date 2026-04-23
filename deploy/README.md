# 🖥️ Deploy em servidor Linux — arquivos prontos

Esta pasta contém os arquivos de infraestrutura usados no servidor de produção
do Axiom Biomechanics. Você pode copiá-los direto para os locais padrão
do sistema e tudo funciona.

## Estrutura

```
deploy/
├── nginx/
│   ├── axiom-api.conf        # reverse proxy p/ backend FastAPI
│   └── axiom-frontend.conf   # serve o SPA buildado (opcional, fallback do Vercel)
├── systemd/
│   └── mongod.service        # MongoDB como serviço systemd
└── README.md (este arquivo)
```

## Passo-a-passo da instalação no servidor

Pré-requisitos:
- Ubuntu 22.04+ (ou outro Linux com systemd)
- Acesso root
- Domínio ou sslip.io apontando para o IP do servidor
- Portas 80 e 443 abertas no firewall
- Node 20+ e Python 3.10+ instalados

```bash
# 1. MongoDB (binário standalone, sem apt)
sudo mkdir -p /opt/mongodb /var/lib/mongodb /var/log/mongodb
# baixe e extraia os binários em /opt/mongodb (veja versão aarch64/x86_64 do seu server)
sudo cp deploy/systemd/mongod.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mongod

# 2. Backend (FastAPI) — via PM2
cd backend && python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env
# preencha MONGO_URL, JWT_SECRET, WHATSAPP_SERVICE_TOKEN, FRONTEND_URL, ADMIN_*
cd .. && pm2 start ecosystem.config.js

# 3. WhatsApp service
cd whatsapp-service && npm install
cp .env.example .env
# preencha INTERNAL_TOKEN (deve ser igual ao WHATSAPP_SERVICE_TOKEN do backend)
# já está no ecosystem.config.js

# 4. PM2 persistente
pm2 save && pm2 startup systemd -u root --hp /root
# execute o comando que o PM2 imprimir

# 5. Nginx + SSL
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp deploy/nginx/axiom-api.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/axiom-frontend.conf /etc/nginx/sites-available/
# edite server_name em cada arquivo para seu domínio
sudo ln -sf /etc/nginx/sites-available/axiom-api /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/axiom-frontend /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

sudo certbot --nginx -d api.SEU-DOMINIO.com --non-interactive --agree-tos \
     --register-unsafely-without-email --redirect
sudo certbot --nginx -d app.SEU-DOMINIO.com --non-interactive --agree-tos \
     --register-unsafely-without-email --redirect

# 6. Reset/criacao do admin
/home/root/venv/bin/python scripts/reset_admin.py

# 7. Build do frontend (se for servir pelo nginx local)
cd frontend
REACT_APP_BACKEND_URL=https://api.SEU-DOMINIO.com CI=false \
   GENERATE_SOURCEMAP=false npm run build
```

## Atalhos operacionais

```bash
# Estado geral
pm2 list
systemctl status mongod nginx

# Logs ao vivo
pm2 logs axiom-backend --lines 100
pm2 logs axiom-whatsapp --lines 100
sudo tail -f /var/log/nginx/error.log

# Ver QR do WhatsApp
pm2 logs axiom-whatsapp --nostream --lines 200 | grep -A 30 "QR gerado"
# (ou pegue via API autenticada: GET /api/admin/whatsapp/qr)

# Restart backend depois de mudar .env
pm2 restart axiom-backend --update-env

# Renovar SSL manualmente (renova sozinho via systemd timer de qqr forma)
sudo certbot renew --quiet
```

## Ambiente validado (23 de abril de 2026)

- Servidor: Ubuntu 22.04.5, 7.6 GiB RAM, aarch64
- MongoDB 7.0.14 (rodando como systemd, bind 127.0.0.1:27017)
- Node 20.18.0 + PM2 (axiom-backend + axiom-whatsapp)
- Python 3.10 + venv em /home/root/venv
- Nginx 1.18 como reverse proxy + SSL Let's Encrypt
- Hostnames publicados:
  - Frontend: `https://app.91-98-154-218.sslip.io`
  - Backend:  `https://api.91-98-154-218.sslip.io`
