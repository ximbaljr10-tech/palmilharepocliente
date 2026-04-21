# 🏷️ Diagnóstico do Sistema de Etiquetas — 2026-04-21

> Auditoria completa antes de qualquer alteração. Este documento descreve **o que existe hoje**, **o que está quebrado** e **o que NÃO vai ser tocado**. Lê como um laudo, não como um plano.

---

## 1. Mapa real do sistema

```
Frontend (este repo /home/root/webapp) ──► nginx ──► Medusa backend (/home/root/medusa-backend)
                                                     │
                                                     ├─► PostgreSQL (medusa_db)
                                                     │    ├─ "order", order_item, order_shipping,…   ◄─ NÚCLEO CRÍTICO
                                                     │    ├─ payment, payment_session                 ◄─ NÚCLEO CRÍTICO
                                                     │    ├─ remessas, remessa_orders, remessa_history ◄─ overlay já existente
                                                     │    └─ remessa_label_jobs (NOVA, AINDA NÃO CRIADA)
                                                     │
                                                     └─► SuperFrete (api.superfrete.com/api/v0)
                                                          POST /cart        (cria etiqueta)
                                                          POST /checkout    (paga)
                                                          POST /tag/print   (gera PDF assinado, expira)
                                                          GET  /order/info  (status)
```

**PM2**: 1 processo `medusa` online há 22h, rodando `medusa start` em `127.0.0.1:9000`.
**Build**: Medusa usa `/home/root/medusa-backend/.medusa/server/` (JS transpilado). Toda mudança em `src/` requer `medusa build` + `pm2 restart medusa`.

---

## 2. Fluxos existentes

### A) Geração + pagamento da etiqueta (FUNCIONA BEM)

| Passo | Local | Arquivo | O que faz |
|---|---|---|---|
| 1 | Frontend | `AdminOrderDetail.finalizeAndLabel` / `adminApi.batchFinalizeAndLabelSequential` | `PUT /admin/pedidos` com `action=finalize_and_label` |
| 2 | Backend | `src/api/admin/pedidos/route.ts` | Cria etiqueta na SuperFrete (`POST /cart`) + paga (`POST /checkout`), grava `superfrete_id`, `tracking_code`, etc |
| 3 | Frontend (bulk) | `batchFinalizeAndLabelSequential` | Sequencial com delay de 2s, já mostra progresso em tempo real |

✅ **Sem redirect aqui.** Este fluxo **não vai ser tocado.**

### B) Impressão / download do PDF final (ESTÁ QUEBRADO)

| Passo | Local | Arquivo | O que faz |
|---|---|---|---|
| 1 | Frontend | `AdminOrderDetail.printLabel` (L.456), `AdminOrders.handleRemessaLabels` (L.1014), `AdminOrders.printLabelsForDate` (L.2358) | `POST /admin/superfrete` com `action=print` |
| 2 | Backend | `src/api/admin/superfrete/route.ts` | Chama `POST /tag/print` → SuperFrete retorna `{ url }` (link efêmero) |
| 3 | Backend | idem (L.156-258) | Baixa o PDF pela URL, tenta carimbar "Pedido #xxx \| Cliente \| CEP" no topo de cada página via `pdf-lib`, devolve `pdf_base64` |
| 4 | Frontend | 3 lugares | `window.open(blob | data.url, '_blank')` |

**É nesse fluxo B que mora toda a dor.**

---

## 3. Problemas confirmados

| # | Problema | Evidência no código |
|---|---|---|
| 1 | **Redirect para SuperFrete** quando `pdf-lib` falha ou quando `order_info` não é enviado | `superfrete/route.ts` L.151-153 e L.276-278; chamadas com `window.open(result.data.url)` |
| 2 | **Abre sempre em nova aba** mesmo no sucesso — bloqueado por popup blocker | L.482, 1043, 2393 do admin; L.484, 1045, 2396 do fallback |
| 3 | **Etiquetas misturadas** em bulk: código assume `pagesPerOrder = Math.floor(total/orders)` → se a SuperFrete gerar número irregular de páginas por pedido, o carimbo cai no pedido errado | `superfrete/route.ts` L.184-199 |
| 4 | **Sem persistência**: cada clique refaz download + pdf-lib. Link SuperFrete expira, então "salvar para depois" não funciona | Backend é stateless |
| 5 | **Processamento síncrono no request** — se tiver 30 etiquetas, o HTTP fica ~30s open | Action `print` é síncrona |
| 6 | **Sem feedback de progresso** na impressão em massa | Spinner genérico só |
| 7 | **Sem endpoint autenticado** tipo `GET /admin/remessas/:id/labels.pdf` | Arquitetura |

---

## 4. O que NÃO é problema (não vai ser tocado)

- `pedidos/route.ts` (2.189 linhas) — **intocado**
- `remessas/route.ts` (430 linhas, CRUD funcional) — **intocado**, só adiciono chamadas novas
- Hooks de webhook, emails, checkout, estoque — **intocados**
- Tabelas `order`, `payment`, `remessas`, `remessa_orders`, `remessa_history` — **nenhum UPDATE/DELETE**

---

## 5. Backup prévio (validado)

Diretório: `/home/root/webapp/backups/labels_refactor_20260421_202111/`

Contém:
- `backend_src/` — cópias `.ORIGINAL` fiéis dos `.ts` + `.js` buildados
- `frontend_src/` — cópias `.ORIGINAL` dos 4 arquivos a serem tocados
- `schema/schema_pre_refactor.sql` — schema das tabelas remessa* e order
- `schema/data_critical_pre_refactor.sql` — 8.895 linhas de dump de dados críticos (orders, payments, remessas)
- `RESTORE.sh` — script one-shot para reverter arquivos + (opcional) banco

**Execução do restore:** `bash backups/labels_refactor_20260421_202111/RESTORE.sh`
