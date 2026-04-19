// ============================================================================
// AdminProducts.tsx — WRAPPER pós-refactor (2026-04-19)
// ----------------------------------------------------------------------------
// Este arquivo era um monólito de ~2.900 linhas. Foi refatorado numa arquitetura
// modular completa em `./products/`. Este arquivo apenas reexporta o novo root
// para manter a rota `/admin/produtos` funcionando sem alterar App.tsx.
//
// Nova arquitetura:
//   src/admin/products/
//     ├── index.tsx                → Root/router interno (este é o default export)
//     ├── types/                   → Tipos, constantes
//     ├── utils/                   → parser, shipping, upload
//     ├── hooks/                   → useProducts, useBulkActions, useProductSave, useToast
//     ├── components/              → Atômicos (ColorDot, ProductCard, Pills, …)
//     └── views/
//           ├── HomeDashboard       → TELA INICIAL (caminhos claros)
//           ├── ProductListView     → Lista tradicional com filtros
//           ├── ColorStudio         → Foco: cores em massa
//           ├── YardStudio          → Foco: jardas em massa
//           ├── RankStudio          → Foco: ranking/ordem
//           ├── ReorderMode         → Arrastar / mover
//           ├── Bulk*Modal          → Modais de ação em massa
//           └── editor/             → ProductEditor (5 abas em arquivos separados)
// ============================================================================

export { default } from './products';
