# 🚀 Deploy — Guia Operacional Completo

Este projeto tem **3 componentes** que rodam em **lugares diferentes**:

| Componente | Onde roda | Tipo |
|---|---|---|
| **Frontend** (React CRA + CRACO) | **Vercel** | Estático (CDN) |
| **Backend** (FastAPI + MongoDB) | Seu servidor, Railway, Render ou Fly.io | Processo persistente |
| **whatsapp-service** (Baileys) | **Seu servidor** (NÃO Vercel) | Processo persistente |

> ⚠️ O Vercel roda apenas o **frontend estático**. O backend e o serviço de
> WhatsApp devem rodar em outra infraestrutura — Baileys precisa de socket
> permanente e o backend precisa de conexão ativa com MongoDB.

---

## 1️⃣ Deploy do Frontend no Vercel

1. Vá em https://vercel.com/new e importe o repositório.
2. Em **Framework Preset** escolha **Other** (não use "Create React App").
3. Deixe **Root Directory** em `./` — o `vercel.json` na raiz orquestra o build.
4. Não mexa nos campos Build/Install — o `vercel.json` já cuida disso.
5. Em **Environment Variables** adicione:

| Nome | Valor |
|---|---|
| `REACT_APP_BACKEND_URL` | URL pública do backend (ex: `https://api.palmilha.com.br`) |
| `CI` | `false` |
| `GENERATE_SOURCEMAP` | `false` |

6. Clique em **Deploy**.

### Notas
- O `vercel.json` aplica SPA fallback (`/login`, `/admin` etc. sempre retornam o bundle).
- `cleanUrls: true` desabilita `.html` nas URLs.
- Headers de segurança (`X-Frame-Options`, `Permissions-Policy`, `Referrer-Policy`)
  e cache agressivo para assets já estão ativos.

---

## 2️⃣ MongoDB (produção)

- Use **MongoDB Atlas** (free tier M0 já serve para começar):
  https://www.mongodb.com/cloud/atlas
- Crie um cluster.
- Em **Network Access** libere `0.0.0.0/0` (ou o IP do seu backend).
- Em **Database Access** crie um usuário.
- Copie a URI — algo como `mongodb+srv://user:pass@cluster.xxxx.mongodb.net`.

Essa URI é usada em `MONGO_URL` do backend.

---

## 3️⃣ Backend (FastAPI)

### Variáveis de ambiente

Veja `backend/.env.example`. As principais:

| Variável | Descrição |
|---|---|
| `MONGO_URL` | URI do MongoDB (Atlas em produção) |
| `DB_NAME` | nome do database (ex: `axiom_db`) |
| `JWT_SECRET` | string aleatória longa, **obrigatória** em produção |
| `FRONTEND_URL` | origem(ns) permitida(s) para CORS — múltiplas separadas por vírgula, ex: `https://palmilha.vercel.app,https://palmilha.com.br` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | seed do admin no primeiro boot |
| `WHATSAPP_SERVICE_URL` | URL interna do serviço WA (ex: `http://127.0.0.1:3001` se rodar na mesma máquina) |
| `WHATSAPP_SERVICE_TOKEN` | token compartilhado com o whatsapp-service |
| `COOKIE_SECURE` | `true` quando servir por HTTPS (obrigatório em produção!) |
| `COOKIE_DOMAIN` | domínio do cookie (opcional) — só se usar subdomínios |

### Rodando o backend no servidor (via PM2)

```bash
# Uma vez
python3 -m venv /home/root/venv
/home/root/venv/bin/pip install -r backend/requirements.txt

# Subir backend + whatsapp juntos:
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd  # gera comando para bootar junto com o servidor
```

### Alternativas de hospedagem

| Serviço | Prós | Contras |
|---|---|---|
| **Railway** | Deploy de repo direto; mesmo container serve backend + WA | Preço por uso |
| **Render** | Free tier simples | Cold start em free |
| **Fly.io** | Rede privada entre serviços | Curva |
| **Seu servidor com PM2** | Mais controle, mais barato | Você mantém |

### CORS

O backend aceita múltiplos origins na env `FRONTEND_URL`, separados por vírgula.
Em produção você **NÃO** deve usar `*` junto com credenciais — configure
exatamente o domínio Vercel (e eventual custom domain).

---

## 4️⃣ whatsapp-service (Baileys) — só no servidor

> ⚠️ **Nunca tente colocar o whatsapp-service no Vercel.** Ele precisa manter
> um socket com WhatsApp 24/7 e armazenar credenciais em disco persistente.

### Variáveis (veja `whatsapp-service/.env.example`)

| Variável | Descrição |
|---|---|
| `PORT` | porta (3001 por padrão) |
| `BIND` | bind address — **mantenha em `127.0.0.1`** se backend está na mesma máquina |
| `INTERNAL_TOKEN` | token compartilhado com o backend (OBRIGATÓRIO em produção) |
| `AUTH_DIR` | diretório persistente das credenciais Baileys (backup!) |

### Subindo o serviço

```bash
cd whatsapp-service
npm install
# use PM2 (recomendado):
pm2 start index.js --name axiom-whatsapp
pm2 save
```

### Primeira conexão (escanear QR)

1. Acesse o painel admin do sistema → aba **Integrações**.
2. Clique em **Gerar QR Code**.
3. Escaneie com o celular do admin (WhatsApp → Aparelhos conectados → Conectar
   aparelho).
4. Pronto — a sessão fica salva em `AUTH_DIR`.

### Backup da sessão

```bash
tar czf wa_session_$(date +%F).tgz whatsapp-service/auth_info_baileys/
```

> Manter esse backup **seguro** evita ter que escanear QR a cada redeploy.

---

## 5️⃣ Fluxo ponta a ponta

```
 Navegador do profissional
        │
        ▼
  Frontend (Vercel)   ── REACT_APP_BACKEND_URL ──▶   Backend (FastAPI)
                                                          │
                                      MongoDB Atlas ◀─────┤
                                                          │
                                      X-Internal-Token ───┤
                                                          ▼
                                               whatsapp-service (Baileys)
                                                          │
                                                          ▼
                                                   WhatsApp Web
```

Exemplo: **enviar fatura**
1. Pro clica no botão "Enviar Fatura".
2. Frontend → `POST /api/orders/{id}/send-invoice` (cookie httpOnly).
3. Backend valida: (a) dono; (b) tem payment_link; (c) paciente tem phone;
   (d) não foi enviado nos últimos 60s.
4. Backend chama `whatsapp-service` com token interno.
5. Baileys envia mensagem; retorna id da mensagem.
6. Backend grava em `whatsapp_logs` e atualiza `invoice_sent_at` no order.

---

## 6️⃣ Checklist final

- [ ] MongoDB Atlas criado e `MONGO_URL` anotado.
- [ ] Backend deployado e acessível via HTTPS.
- [ ] `JWT_SECRET` e `WHATSAPP_SERVICE_TOKEN` definidos com valores aleatórios longos.
- [ ] `FRONTEND_URL` no backend aponta para o domínio Vercel.
- [ ] `REACT_APP_BACKEND_URL` no Vercel aponta para o backend público.
- [ ] whatsapp-service rodando via PM2 com `INTERNAL_TOKEN` **igual** ao `WHATSAPP_SERVICE_TOKEN` do backend.
- [ ] QR scaneado uma vez; `auth_info_baileys/` com backup seguro.
- [ ] `COOKIE_SECURE=true` em produção (HTTPS).
- [ ] Primeiro deploy no Vercel concluído.
- [ ] Endpoint `/api/health/deep` retorna `mongo: true, whatsapp_service: true`.

---

## 7️⃣ Troubleshooting

**401 "Not authenticated" após login**
→ Em produção HTTPS, `COOKIE_SECURE` precisa ser `true` e o `SameSite` vira `none`.
Verifique também se o domínio do frontend está na `FRONTEND_URL` (CORS).

**"All connection attempts failed" ao enviar fatura**
→ O whatsapp-service não está acessível pelo backend. Confira `WHATSAPP_SERVICE_URL`.

**401 "unauthorized" no endpoint WA**
→ `WHATSAPP_SERVICE_TOKEN` (backend) ≠ `INTERNAL_TOKEN` (whatsapp-service).

**Rotas `/dashboard`, `/admin` dão 404 no Vercel**
→ Verifique que o `vercel.json` está na raiz e tem o rewrite para `/index.html`.

**Build falha no Vercel**
→ Veja se `.npmrc` tem `legacy-peer-deps=true` (necessário pela mistura React 19 + libs antigas).
