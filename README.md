# Axiom Biomechanics

Plataforma que intermedeia profissionais da saúde dos pés (podólogos /
biomecânicos) com o laboratório que fabrica palmilhas personalizadas.

## Estrutura

```
webapp/
├─ frontend/           React (CRA + CRACO + Tailwind + shadcn-ui) — deploy no Vercel
├─ backend/            FastAPI + MongoDB — deploy em Railway/Render/Fly.io/servidor
├─ whatsapp-service/   Node/Baileys — roda SEMPRE no servidor, nunca no Vercel
├─ vercel.json         Orquestração de build do frontend
├─ ecosystem.config.js PM2 para backend + whatsapp-service no servidor
└─ VERCEL_DEPLOY.md    Guia passo a passo completo
```

## Stack

- **Frontend**: React 19 + CRA + CRACO + Tailwind CSS + shadcn-ui + React Router v7.
- **Backend**: FastAPI + Motor (MongoDB async) + JWT (cookies httpOnly) + bcrypt.
- **DB**: MongoDB 7 (local em dev, Atlas em produção).
- **WhatsApp**: Baileys em microserviço separado, protegido por token interno.

## Desenvolvimento local

```bash
# 1. MongoDB
mongod --dbpath ./data/db --bind_ip 127.0.0.1

# 2. Backend
cd backend
python3 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env          # ajuste valores
./venv/bin/uvicorn server:app --reload --port 8001

# 3. WhatsApp service
cd whatsapp-service
npm install
cp .env.example .env
node index.js

# 4. Frontend
cd frontend
npm install --legacy-peer-deps
cp .env.example .env
npm start
```

Credenciais de admin iniciais (criadas no primeiro boot do backend):

- usuário: `adminpalmilha`
- senha: `admin@123`

**Troque em produção** alterando `ADMIN_EMAIL`/`ADMIN_PASSWORD` no `.env` antes
do primeiro start, ou atualizando a senha direto no banco.

## Produção

Veja [`VERCEL_DEPLOY.md`](./VERCEL_DEPLOY.md) para o guia completo.

Arquitetura de produção:

```
Browser ──HTTPS──▶ Vercel (frontend)
                     │  REACT_APP_BACKEND_URL
                     ▼
                  Backend FastAPI (HTTPS)
                     │ ◀──── MongoDB Atlas
                     │
                     │ X-Internal-Token (loopback/VPN)
                     ▼
               whatsapp-service (Baileys)
                     │
                     ▼
                WhatsApp Web
```
