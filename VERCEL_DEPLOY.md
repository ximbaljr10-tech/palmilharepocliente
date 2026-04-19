# 🚀 Deploy no Vercel — Guia Passo a Passo

Este repositório já está **100% configurado** para deploy no Vercel.
O design original é **totalmente preservado** — apenas arquivos de configuração foram adicionados.

---

## 📋 O que foi adicionado / alterado

| Arquivo | Propósito |
|---|---|
| `vercel.json` | Diz ao Vercel como buildar (monorepo frontend/) e faz rewrite SPA |
| `.vercelignore` | Ignora `backend/`, `whatsapp-service/`, testes e assets pesados |
| `frontend/.env.example` | Documenta variáveis de ambiente necessárias |
| `frontend/yarn.lock` | Lockfile para builds reprodutíveis |

**NADA** do código fonte (`src/`, `public/`, `tailwind.config.js`, etc.) foi alterado.
O design permanece idêntico ao original.

---

## 🎯 Passo a Passo no Vercel

### 1️⃣ Entrar no Vercel
- Acesse: https://vercel.com/new
- Faça login com GitHub (conta `ximbaljr10-tech`)

### 2️⃣ Importar o repositório
- Clique em **"Add New..." → "Project"**
- Selecione **`ximbaljr10-tech/palmilharepocliente`**
- Clique em **"Import"**

### 3️⃣ Configuração do Projeto (a tela que aparece)

| Campo | Valor | Observação |
|---|---|---|
| **Project Name** | `palmilha-cliente` (ou o que preferir) | — |
| **Framework Preset** | **`Other`** | ⚠️ **MUITO IMPORTANTE** — NÃO escolher Create React App! |
| **Root Directory** | `./` (raiz do repo, NÃO mudar) | O `vercel.json` já cuida do `frontend/` |
| **Build Command** | *(deixar em branco — já está no vercel.json)* | Sobrescrito pelo `vercel.json` |
| **Output Directory** | *(deixar em branco — já está no vercel.json)* | Sobrescrito pelo `vercel.json` |
| **Install Command** | *(deixar em branco)* | — |

> 💡 **Por que "Other" e não "Create React App"?**
> O Vercel com preset CRA tenta buildar a partir da raiz do repo. Como nosso React está em `frontend/`, usamos **Other** e deixamos o `vercel.json` orquestrar o build correto (`cd frontend && yarn build`).

### 4️⃣ Variáveis de Ambiente (Environment Variables)

Clique em **"Environment Variables"** e adicione:

| Nome | Valor | Environment |
|---|---|---|
| `REACT_APP_BACKEND_URL` | `https://seu-backend.exemplo.com` | Production, Preview, Development |
| `CI` | `false` | Production, Preview |
| `GENERATE_SOURCEMAP` | `false` | Production |

> ⚠️ Substitua `https://seu-backend.exemplo.com` pela URL real do backend FastAPI.
> Enquanto o backend não estiver online, pode deixar qualquer URL — o frontend vai buildar, só não conseguirá fazer login/listar dados.

### 5️⃣ Deploy!
- Clique em **"Deploy"**
- Aguarde ~2-3 minutos
- Vai aparecer `https://palmilha-cliente-xxxxx.vercel.app`

---

## 🔧 Sobre o Backend (FastAPI + MongoDB + WhatsApp)

O Vercel **não é ideal** para esse backend porque ele:
- Usa MongoDB (conexão persistente)
- Tem serviço WhatsApp separado (`whatsapp-service/`)
- Precisa estado/sessão

### Onde deployar o backend:

| Serviço | Recomendado para | Tier grátis |
|---|---|---|
| **Railway** | Backend + WhatsApp juntos (fácil) | ✅ $5/mês free credits |
| **Render** | Backend FastAPI puro | ✅ Free tier (com cold start) |
| **Fly.io** | Sessões WhatsApp persistentes | ✅ Free tier |
| **DigitalOcean App Platform** | Produção séria | ❌ ($5/mês) |

### Depois de deployar o backend:
1. Copie a URL pública (ex: `https://palmilha-api.up.railway.app`)
2. Vá em **Vercel → Settings → Environment Variables**
3. Edite `REACT_APP_BACKEND_URL` com a URL real
4. Clique em **Redeploy** no dashboard Vercel

### MongoDB:
Use **MongoDB Atlas** (free tier M0) → https://www.mongodb.com/cloud/atlas
- Criar cluster free
- Criar usuário database
- Adicionar IP `0.0.0.0/0` em Network Access
- Pegar connection string → colocar em `MONGO_URL` no backend

---

## 🐛 Troubleshooting

### ❌ Build falha com "lucide-react corrupt"
Raro, mas se acontecer: vá em **Vercel → Settings → General → "Clear Cache and Redeploy"**.

### ❌ Build reclama de `@emergentbase/visual-edits`
Esse pacote só é carregado em dev mode (há `try/catch` no `craco.config.js`). Em produção (`NODE_ENV=production`), ele é ignorado. Se ainda assim quebrar, você pode removê-lo do `devDependencies` no `package.json`.

### ❌ Rotas `/admin`, `/dashboard` dão 404 ao recarregar
O `vercel.json` já tem `rewrites` para SPA — se ainda der 404, verifique que o arquivo está na raiz do repo e foi commitado.

### ❌ CORS error ao chamar backend
No backend FastAPI, a env `FRONTEND_URL` deve apontar para a URL do Vercel:
```bash
FRONTEND_URL=https://palmilha-cliente-xxxxx.vercel.app
```

---

## ✅ Checklist final antes do deploy

- [x] `vercel.json` criado na raiz
- [x] `.vercelignore` criado na raiz
- [x] `frontend/.env.example` documentando variáveis
- [x] `frontend/yarn.lock` commitado (builds reprodutíveis)
- [x] Build local testado e funcionando (`yarn build` no `frontend/` passa ✅)
- [x] Design original preservado (nenhum `.js`/`.css`/`.html` do fonte alterado)
- [ ] Backend deployado em Railway/Render
- [ ] `REACT_APP_BACKEND_URL` configurado no Vercel
- [ ] Primeiro deploy no Vercel feito

---

**Resumo rapidíssimo:**
1. Import repo no Vercel → Framework Preset: **Other** → Deploy.
2. O `vercel.json` faz o resto.
3. Para o backend usar Railway/Render + MongoDB Atlas.
