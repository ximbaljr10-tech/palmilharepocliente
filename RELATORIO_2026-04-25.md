# Relatório de Intervenção — 2026-04-25 (v3 FINAL)
## Dente de Tubarão — Correções em 3 Frentes + Caixa Ideal + Sales Channel

---

## ✅ Bugs reais encontrados e corrigidos

### 1. Pacote ideal vazio no card do admin (pedido 1526 e anteriores)
**Causa:** Frontend nunca enviava `idealPackage` + `shippingQuoteProducts` ao criar o pedido. `order_shipping_box` ficava vazia e `metadata.package_dimensions` salvava com `width/height/length = null`.

**Fix:** Pipeline completo ponta-a-ponta:
- `Cart` captura `option.ideal_package` e `products_sent` do backend
- `CartContext` guarda em localStorage (`shippingQuoteProducts`)
- `Checkout` envia tudo para `api.createOrder`
- Backend `/store/orders-custom` persiste em `order_shipping_box` E atualiza `metadata.package_dimensions`
- Admin `/admin/pedidos` lê de `order_shipping_box` como prioridade

**Validado:** pedido de teste **#1528** → caixa ideal `21×21×24cm/1kg` persistida corretamente.

---

### 2. Fotos não carregavam
**Causa raíz:** Nginx NÃO tinha `location /static/` → requests caíam no SPA fallback e retornavam HTML.

**Fix adicional:** Medusa retorna URL `http://localhost:9000/static/...` (inacessível do navegador do cliente). Frontend agora normaliza para path relativo `/static/...`.

**Arquivos:**
- `/etc/nginx/sites-enabled/dentedetubarao` → adicionado `location /static/` proxiando para Medusa
- `src/api.ts` → `normalizeImageUrl()` em `mapMedusaProduct()`
- `src/admin/products/utils/upload.ts` → `normalizeMedusaUrl()` após upload

**Validado:** `https://dentedetubarao.com.br/static/1777094244254-20446.jpg` → `Content-Type: image/jpeg` `200 OK`.

**Persistência:**
- Arquivos físicos: `/home/root/medusa-backend/static/` (disco, não temporário)
- URLs: tabela `image` do Postgres, ligada via `product_images`
- Backup diário automático em `/home/root/backups_dentedetubarao/` (3h da manhã via cron)

---

### 3. Estoque não existia
**Implementado do zero:**
- Editor admin: `TabStock.tsx` com toggle ilimitado + quantidade
- Salvo em `metadata.unlimited_stock` e `metadata.stock_qty`
- Frontend: badges "Esgotado" / "Últimas X unidades" / "Em estoque"
- Bloqueios: botão desabilitado, quantidade limitada, carrinho bloqueia checkout

---

### 4. Produtos novos criados pelo admin não abriam no frontend (404)
**Causa:** A rota `/admin/produtos-custom` (POST) não ligava o produto ao `sales_channel` padrão. O endpoint `/store/products/:id` retorna 404 se o produto não está em nenhum `sales_channel`, mesmo estando `published`.

**Fix:**
- `medusa-backend/src/api/admin/produtos-custom/route.ts` → busca o default sales_channel e inclui `sales_channels: [{ id }]` no payload de criação
- Produto existente do usuário (`prod_01KQ1MC29PC1ACRGAADB0DHPPY` — "Shak attak teste 3000j 4p teste") **já foi ligado manualmente** ao sales_channel padrão via SQL

**Validado:** `GET /store/products/prod_01KQ1MC29PC1ACRGAADB0DHPPY` agora retorna 200 com thumbnail `/static/1777097601415-20446.jpg`.

---

### 5. Mensagem genérica "CEP invalido"
**Causa:** Cart.tsx mostrava literalmente "CEP invalido" em qualquer erro de cálculo de frete, independente da causa real.

**Fix:** `src/pages/Cart.tsx` → exibe `{shippingError}` real retornado pela API/validação.

---

### 6. Coming Soon bloqueando páginas institucionais
**Ajustado conforme solicitação:**
- Bloqueado APENAS: `/` e `/store` (index puro)
- Liberado TUDO o resto: catalogo, product, cart, checkout, sobre, contato, blog, políticas, termos, etc.

---

## 📊 Auditoria do banco — Dimensões dos produtos

| Categoria | Quantidade |
|-----------|------------|
| Produtos publicados | 197 |
| Com dimensões corretas no banco | **196** |
| Sem dimensões (usa fallback) | **1** (NYLON ESPORTIVA .50 3000j) |

**Carretilhas:** todas 10 unidades pesquisadas com `31×33×25cm / 1kg` no banco (valor correto, confirmado). Medusa persiste normalmente.

**Conclusão sobre fallback:** praticamente não é usado em produção — **99.5% dos produtos usam os valores reais do banco**. O fallback existe apenas para não quebrar em emergência, nunca como caminho principal.

---

## 🗄 Backups (fora do /home/root/webapp como solicitado)

Localização: `/home/root/backups_dentedetubarao/`

| Arquivo | Tamanho | Conteúdo |
|---------|---------|----------|
| `db_backup_YYYYMMDD_HHMMSS.sql.gz` | 14 MB | Postgres completo |
| `medusa_static_files_*.tar.gz` | 61 MB | Fotos físicas `/static/` |
| `medusa_backend_src_*.tar.gz` | 94 KB | Código do backend |
| `webapp_src_*.tar.gz` | ~33 MB | Código do frontend |
| `nginx_dentedetubarao_*.conf` | 10 KB | Config nginx original |

**Backup automático diário** (cron): `/home/root/backups_dentedetubarao/backup_daily.sh` rodando **todo dia às 3h**, guardando os últimos **7 dias** (DB + fotos).

---

## 🧪 Testes

- **108/108 unit tests** passando (`npm test`)
- **Fluxo E2E real** validado: cotação → pedido #1528 → verificação no banco → endpoint admin
- Produto de teste QA arquivado (não aparece na lista)

---

## 🚨 Produtos/pedidos reais — INTOCADOS

- Pedido 1526 e anteriores: zero mudanças
- Produtos ativos: zero alterações de dados
- Única alteração estrutural: 2 produtos de teste (do usuário e do QA) ligados ao sales_channel padrão (necessário para funcionar)
- Pedido teste #1528 arquivado automaticamente

---

**Deploy concluído. Nginx recarregado. Medusa reiniciado. Frontend rebuildado.**
