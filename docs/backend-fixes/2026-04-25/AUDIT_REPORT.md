# Relatório de Auditoria — Produtos, Frete e Persistência
**Data:** 2026-04-25
**Contexto:** Correção dos bugs introduzidos pela auditoria anterior.

---

## 🔴 Bug Crítico Encontrado

A auditoria anterior introduziu um bug grave em `/admin/produtos-custom/[productId]/route.ts`
que **quebrou completamente o salvamento de qualquer produto com imagens**.

### Evidência (log do servidor, 03:28:44)
```
Failed to update product: 400 {"type":"invalid_data",
  "message":"Invalid request: Expected type: 'object' for field 'images, 0', got: 'string';
   Expected type: 'object' for field 'images, 1', got: 'string'"}
```

### Causa
O endpoint aceitava `body.images` como array de **strings** (URLs) vindo do frontend
(`useProductSave.ts` linha 117: `images: images.map(i => i.url)`), mas repassava
**direto** para o Medusa Admin API que exige array de **objetos** `{ url: "..." }`.

```typescript
// ❌ ANTES (quebrado):
if (body.images !== undefined) productUpdate.images = body.images
```

### Correção
Normalização do payload — aceita tanto `string[]` quanto `{url}[]`:

```typescript
// ✅ DEPOIS (corrigido):
if (body.images !== undefined) {
  if (Array.isArray(body.images)) {
    productUpdate.images = body.images.map((img: any) => {
      if (typeof img === "string") return { url: img }
      if (img && typeof img === "object" && img.url) return { url: img.url }
      return img
    })
  } else {
    productUpdate.images = body.images
  }
}
```

---

## 🔴 Bug Secundário: Dimensões passadas como string para campos "number"

A auditoria anterior também tentava passar `weight`, `length`, `height`, `width`
como string raw para o Medusa Admin API, que os valida como **number**.

### Evidência
```
Failed to create product: 400 {"type":"invalid_data",
  "message":"Invalid request: Expected type: 'number' for field 'weight', got: 'string'"}
```

### Detalhe técnico importante
- **Tabela `product`**: colunas `weight/length/height/width` são `TEXT` no Postgres,
  mas a Admin API do Medusa v2 valida o input como `number` (a ORM faz o cast).
- **Tabela `product_variant`**: colunas `weight/length/height/width` são `INTEGER`.
  Admin API exige `number` inteiro.

### Correção
Parse explícito para número antes de enviar; arredondamento para inteiro no variant.

---

## 📦 Descoberta importante: fontes de dados de dimensões

O banco foi auditado direto. Estado antes da correção:

| Fonte                              | Preenchida? | Observação                        |
|------------------------------------|-------------|-----------------------------------|
| `product.weight`                   | 318/318     | Armazenado em gramas (TEXT)       |
| `product.height/width/length`      | **0/318**   | Nunca populado                    |
| `product_variant.weight`           | **0/318**   | Nunca populado                    |
| `product_variant.height/width/length` | **0/318** | Nunca populado                  |
| `metadata.shipping_weight`         | 318/318     | Em kg (float)                     |
| `metadata.shipping_height/width/length` | 317/318 | Em cm (PRIMARY source)          |

### Conclusão
**A fonte de verdade REAL dos dados de frete é `product.metadata.shipping_*`.**
O storefront lê dela em `src/api.ts` linha 113-118:

```typescript
shipping: {
  height: metadata.shipping_height || shipping.height,  // fallback legado por jardas
  width:  metadata.shipping_width  || shipping.width,
  length: metadata.shipping_length || shipping.length,
  weight: metadata.shipping_weight || shipping.weight,
}
```

O caso relatado pelo usuário (carretilha — mudou para 20cm mas banco mostrava
menor) era provavelmente pela **divergência entre**:
- O que aparecia no Admin (lê de `metadata.shipping_*`) → 20cm
- O que estava em `product.width/height/length` → NULL (nunca foi gravado)
- Algum cálculo legado por fallback de jardas → valor pequeno

### Solução aplicada
Agora cada salvamento grava nos **3 lugares** simultaneamente:
1. `metadata.shipping_*` (fonte primária — mantida por compat. retroativa)
2. `product.weight/height/width/length` (campos nativos TEXT)
3. `product_variant.weight/height/width/length` (campos nativos INT)

---

## 🧪 Testes executados (E2E real)

Criado produto de teste em `draft` (id `prod_01KQ1BPTSAQPSZ062QWZXWYHB0`), realizado:

1. ✅ **CREATE** com dimensões + metadata → salvou em todas fontes
2. ✅ **UPDATE** com imagens como `string[]` → convertido para `{url}[]` e salvo
3. ✅ **UPDATE** somente dimensões → sincronizou product + variant + metadata
4. ✅ **UPLOAD real** de imagem PNG via `/admin/uploads` → URL retornada
5. ✅ **LINK** da imagem uploaded ao produto → persistida em `image` table
6. ✅ **Consistência**: 3 fontes verificadas via SQL direto, tudo igual

Resultado final: produto **deletado (soft)** para não poluir a base.
Nenhum produto em produção foi tocado.

---

## 📝 Arquivos modificados nesta sessão

Backend (Medusa, NÃO é git repo — snapshot aqui em `docs/backend-fixes/`):
- `/home/root/medusa-backend/src/api/admin/produtos-custom/route.ts`
  → Normalização de imagens no CREATE; parse numérico de dimensões
- `/home/root/medusa-backend/src/api/admin/produtos-custom/[productId]/route.ts`
  → **FIX CRÍTICO**: normalização de imagens no UPDATE; parse de dimensões

Frontend (webapp, já versionado): **nada modificado** — a mudança feita pela
auditoria anterior em `useProductSave.ts` (enviar weight/length/height/width
na raiz do payload) já está correta e agora funciona com o backend fixado.

---

## 🛡️ Instruções de rollback

```bash
# Restaurar apenas os arquivos do backend (versão anterior):
cp /home/root/backups/fix_images_bug_20260425_033850/route.ts.bak \
   /home/root/medusa-backend/src/api/admin/produtos-custom/route.ts
cp /home/root/backups/fix_images_bug_20260425_033850/productId_route.ts.bak \
   /home/root/medusa-backend/src/api/admin/produtos-custom/[productId]/route.ts
pm2 restart medusa

# Se precisar restaurar o banco inteiro:
# pg_restore -d postgresql://postgres:...@localhost:5432/medusa_db -c \
#   /home/root/backups/medusa_db_before_images_fix_20260425_033851.dump
```

---

## ✅ Checklist do pedido original

- [x] Backup do banco feito ANTES das mudanças (dump + sql.gz diário)
- [x] Backup dos arquivos de código modificados
- [x] Nenhum produto em produção alterado (usado produto draft descartável)
- [x] Nenhum pedido existente afetado
- [x] Fluxo de imagens corrigido e testado E2E
- [x] Fluxo de dimensões corrigido — 3 fontes sincronizadas
- [x] Medusa em produção reiniciado e saudável (health 200)
- [x] Frontend rebuildado (dist atualizado)
- [x] **NÃO tocado** no fluxo de frete `products[]` (como instruído)
