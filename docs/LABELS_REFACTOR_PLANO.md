# 🏷️ Plano de Refatoração de Etiquetas — Execução

> Alterações **mínimas, aditivas e reversíveis**. Princípio: tudo que é novo vive em um arquivo novo. O que já funciona não é tocado.

## Estratégia de risco

| Tipo de alteração | Risco | Decisão |
|---|---|---|
| Criar tabela nova `remessa_label_jobs` | Baixíssimo (aditiva, não referencia `order`) | ✅ Fazer |
| Criar novas rotas `/admin/remessas/labels/*` | Zero (arquivo novo) | ✅ Fazer |
| Alterar `superfrete/route.ts` | **Alto** (rota em produção) | ❌ NÃO tocar — criar rota paralela |
| Alterar `pedidos/route.ts` | **Crítico** | ❌ NÃO tocar de jeito nenhum |
| Alterar `remessas/route.ts` | Médio | ❌ NÃO tocar — criar rota separada |
| Adicionar helpers no frontend `adminApi.ts` | Baixo (aditivo) | ✅ Fazer |
| Substituir `window.open` nos 3 pontos do frontend | Baixo (código cliente, reversível pelo git) | ✅ Fazer |

---

## Arquivos a criar (backend)

1. **`/home/root/medusa-backend/src/api/admin/remessas/labels/route.ts`** — novo endpoint dispatcher
   - `POST { action: 'build', remessa_id }` → dispara job em background, retorna 202
   - `POST { action: 'status', remessa_id }` → devolve status/progresso
   - `POST { action: 'invalidate', remessa_id }` → marca `pending` para regenerar
2. **`/home/root/medusa-backend/src/api/admin/remessas/labels/download/route.ts`** — `GET /admin/remessas/labels/download?remessa_id=N` → stream do PDF final com headers `Content-Type: application/pdf` + `Content-Disposition: attachment`
3. **`/home/root/medusa-backend/src/api/admin/remessas/labels/individual/route.ts`** — `GET /admin/remessas/labels/individual?order_id=...` → PDF de 1 pedido (preparação p/ WhatsApp futuro)

Total: **3 arquivos novos no backend**. Zero modificação em arquivos existentes.

## Arquivos a criar (frontend, novos helpers)

- `adminApi.ts` ganha **4 funções novas** no final do arquivo (não modifica as existentes):
  - `buildRemessaLabels(remessaId)` 
  - `pollRemessaLabelsStatus(remessaId)`
  - `downloadRemessaLabelsPdf(remessaId)` — faz `fetch` com auth header e `URL.createObjectURL`
  - `invalidateRemessaLabels(remessaId)`

## Arquivos a modificar (frontend, mudanças cirúrgicas)

- **`AdminOrderDetail.tsx`** — `printLabel()` (L.456-491): trocar `window.open` por download local via blob. **1 função, ~35 linhas.**
- **`AdminOrders.tsx`** — 
  - `handleRemessaLabels()` (L.1014-1055): idem, download local. **Usa o novo endpoint `GET /admin/remessas/labels/download`** quando disponível.
  - `printLabelsForDate()` (L.2358-2405): idem, download local.
- **`RemessaOverlay.tsx`** — adicionar badge de status + progresso legível para humanos ("Gerando 3 de 12 etiquetas…", "Pronto para baixar", "Erro: …")

---

## Tabela nova

```sql
CREATE TABLE IF NOT EXISTS remessa_label_jobs (
  id                 SERIAL PRIMARY KEY,
  remessa_id         INTEGER NOT NULL REFERENCES remessas(id) ON DELETE CASCADE,
  status             VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending|building|ready|error
  order_ids_hash     VARCHAR(64),                              -- sha256 ordered list (cache invalidation)
  pdf_path           TEXT,                                     -- caminho no disco quando ready
  pdf_size_bytes     INTEGER,
  page_count         INTEGER,
  progress_current   INTEGER DEFAULT 0,
  progress_total     INTEGER DEFAULT 0,
  error_message      TEXT,
  started_at         TIMESTAMPTZ,
  finished_at        TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(remessa_id)
);
CREATE INDEX IF NOT EXISTS idx_remessa_label_jobs_status ON remessa_label_jobs(status);
```

Zero FK para `order`. Zero trigger. Zero impacto em pedidos.

## Storage do PDF

Disco local: `/home/root/medusa-backend/static/labels/remessa_<id>_<hash8>.pdf`.
Diretório `static/` já existe e é usado pelo Medusa. Arquivos individuais em `static/labels/pedidos/pedido_<display_id>_<hash8>.pdf`.

## Job em background

Modelo simples, adequado ao volume (dezenas por vez):

- Ao receber `action: 'build'`, o handler:
  1. Lê a remessa, valida que tem pedidos com `superfrete_id`.
  2. `UPSERT` em `remessa_label_jobs` (`status=building`, progress_total=N).
  3. Responde `202 Accepted` imediatamente.
  4. **No mesmo processo**, dispara `processLabelJob(remessaId)` com `void` (fire-and-forget).
  5. O job:
     - **LEITURA ONLY** em `"order"` (via pool pg).
     - Para cada pedido, `POST /tag/print` com **apenas 1 ID** → garante 1 arquivo = 1 pedido = páginas na ordem certa (problema 3 resolvido).
     - Baixa PDF → junta tudo com `pdf-lib` + carimbo "Pedido #xxx | Cliente | CEP" no topo.
     - Salva arquivo final em disco + atualiza `status=ready`.
     - Em erro: `status=error` + `error_message`. **Nenhum UPDATE em `order`**.
  6. Entre chamadas SuperFrete: `sleep(1500ms)` (mesma política do front atual).

Concorrência: advisory lock do Postgres na `remessa_id` evita 2 builds simultâneos.

## Logs legíveis para humanos

Sempre prefixo `[LABELS]` + texto descritivo:
- `[LABELS] Iniciando geração da remessa R-042 com 8 pedidos...`
- `[LABELS] Remessa R-042: pedido 3/8 (etiqueta SF abcd123) baixada OK — 2 páginas`
- `[LABELS] Remessa R-042: etiqueta pronta → /static/labels/remessa_42_a1b2c3d4.pdf (412 KB, 16 páginas)`
- `[LABELS] Remessa R-042: ERRO no pedido 5/8 — SuperFrete HTTP 422. Pedido NÃO foi alterado.`

---

## Fases e ordem de execução

| Fase | Ação | Rollback |
|---|---|---|
| 0 | ✅ Backup + diagnóstico escrito | — |
| 1 | Criar tabela `remessa_label_jobs` (SQL idempotente) | `DROP TABLE remessa_label_jobs CASCADE;` |
| 2 | Criar 3 arquivos de rota novos + 1 lib helper | Remover arquivos |
| 3 | `medusa build` + `pm2 restart medusa` | RESTORE.sh |
| 4 | Smoke test via curl (sem impactar frontend) | — |
| 5 | Adicionar 4 helpers ao `adminApi.ts` | git checkout |
| 6 | Alterar `printLabel` / `handleRemessaLabels` / `printLabelsForDate` | git checkout |
| 7 | Atualizar `RemessaOverlay.tsx` com status visíveis | git checkout |
| 8 | Validar no frontend (build + serve) | git checkout |
| 9 | Commit + PR | — |

## Feature flag

`localStorage.getItem('labels_v2_enabled')` — se `'0'`, usa o fluxo antigo (window.open). Default = ligado (`'1'`).
Isso permite reverter no browser sem deploy, só seta `localStorage.setItem('labels_v2_enabled', '0')`.
