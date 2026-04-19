# Admin Products Module

Módulo refatorado da área de Admin de Produtos (antes: `AdminProducts.tsx` monolítico de ~2.900 linhas).

## Princípios

1. **Mobile-first**: tudo cabe na tela, nada depende de hover.
2. **Fluxo por caminhos**: em vez de uma lista confusa, o usuário escolhe
   O QUE quer fazer (Cores / Jardas / Ranking / Lista) e vai para uma tela
   focada nisso.
3. **Operação em massa escalável**: cada view especializada permite aplicar
   ações a grupos inteiros sem cliques repetitivos.
4. **Arquivos pequenos** (~120 linhas em média, máximo 392).

## Estrutura

```
products/
├── index.tsx                    → Root/router interno (default export)
├── types/index.ts               → Tipos + constantes (ALL_COLORS, ParsedProduct, ViewMode…)
├── utils/
│   ├── parser.ts                → parseProduct, detectGroup, getColorHex, buildColorConfigKey
│   ├── shipping.ts              → getDefaultShipping (por jarda/tipo)
│   └── upload.ts                → uploadImageToMedusa, validateImageFile
├── hooks/
│   ├── useProducts.ts           → Fetch paginado, patch local otimista
│   ├── useBulkActions.ts        → Status / cores / rank / reorder em massa
│   ├── useProductSave.ts        → Criar/atualizar um único produto
│   └── useToast.ts              → Sistema de toasts
├── components/                  → Átomos reutilizáveis
│   ├── ActionRow.tsx
│   ├── BulkActionSheet.tsx
│   ├── ColorDot.tsx
│   ├── ConfirmModal.tsx
│   ├── Field.tsx                → Field, StatusButton, INPUT_CLASS
│   ├── Pills.tsx                → StatTile, ModePill, FilterPill
│   ├── ProductActionSheet.tsx
│   ├── ProductCard.tsx
│   ├── QuickRankPopup.tsx
│   ├── RankPill.tsx
│   ├── StatusDot.tsx
│   └── Toast.tsx
└── views/                       → Telas completas
    ├── HomeDashboard.tsx        → 🏠 TELA INICIAL (cards de caminhos)
    ├── ProductListView.tsx      → 📋 Lista tradicional c/ filtros
    ├── ColorStudio.tsx          → 🎨 Focado em cores em massa (por grupo)
    ├── YardStudio.tsx           → 📏 Focado em jardas (por jarda)
    ├── RankStudio.tsx           → 📊 Focado em ranking (por grupo/jarda)
    ├── ReorderMode.tsx          → 🔄 Drag/mover para definir ordem 1..N
    ├── BulkStatusModal.tsx
    ├── BulkColorEditor.tsx      → Editor avançado: grupos c/ mesma config
    ├── QuickBulkColorModal.tsx  → Add/Remove rápido
    ├── BulkRankModal.tsx        → Sequencial / mesmo nº / limpar
    └── editor/                  → Editor full-screen em 5 abas separadas
        ├── ProductEditor.tsx    → Orquestrador
        ├── EditorTabs.tsx
        ├── TabInfo.tsx
        ├── TabImages.tsx
        ├── TabColors.tsx
        ├── TabRank.tsx
        └── TabShipping.tsx
```

## Fluxos principais

### 1. Entrada → Dashboard
Abre em `HomeDashboard` mostrando:
- 4 tiles de stats (Total / Pub / Rasc / Rank)
- Alertas contextuais (produtos sem cor / sem estoque / em rascunho)
- Botão principal "Adicionar Produto"
- 4 cards de caminhos especializados

### 2. Gerenciar Cores (ColorStudio)
- Lista **buckets** = produtos agrupados por (grupo + config de cor).
- Cada bucket tem 3 botões diretos: Editar / +Cor / -Cor.
- Abre modal pré-populado com APENAS os produtos daquele bucket.
- Sem precisar selecionar um por um.

### 3. Gerenciar Jardas (YardStudio)
- Lista agrupada por jarda numérica.
- Expandir mostra: Publicar/Ocultar, Editar Cores, Definir Rank, Reordenar.
- Cada ação é **escopada** para aquela jarda.

### 4. Ajustar Ranking (RankStudio)
- Explica em linguagem simples ("arrasta, topo = #1").
- Escolha entre "Por Grupo" ou "Por Jarda".
- Abre `ReorderMode` só com os produtos daquela categoria.

### 5. Lista tradicional (ProductListView)
- Busca + filtros + ações em massa via seleção.
- Mantém toda a funcionalidade original.

## Integração com Medusa

Usa exclusivamente os endpoints já existentes:
- `GET  /admin/produtos-custom?limit&offset` (paginação)
- `GET  /admin/produtos-custom/:id` (detalhe p/ merge de metadata)
- `POST /admin/produtos-custom/:id` (update)
- `POST /admin/produtos-custom` (create)
- `POST /admin/uploads` (imagens)

Nenhuma API nova. Nenhuma mudança em `adminApi.ts` ou `types.ts`.

## Rollback

O arquivo original está preservado em:
```
backups/admin_products_refactor_<timestamp>/AdminProducts.tsx.original
```

Para reverter:
```bash
cp backups/admin_products_refactor_<timestamp>/AdminProducts.tsx.original src/admin/AdminProducts.tsx
rm -rf src/admin/products
```
