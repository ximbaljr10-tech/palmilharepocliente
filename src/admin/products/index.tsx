// ============================================================================
// AdminProducts - Root / Router interno do módulo de produtos
// ----------------------------------------------------------------------------
// Arquitetura modular:
//
//   /types       → Tipos e constantes (ALL_COLORS, ParsedProduct…)
//   /utils       → parser, shipping, upload
//   /hooks       → useProducts, useBulkActions, useProductSave, useToast
//   /components  → Atômicos (ColorDot, StatusDot, ProductCard, ActionRow…)
//   /views       → Telas completas (HomeDashboard, ProductListView,
//                  RankStudio, Bulk*Modal, ReorderMode, editor/*)
//
// 2026-04-25 v2 (UX reduzida a 3 caminhos):
//   HomeDashboard oferece apenas:
//     1. Adicionar Produto  - editor em branco
//     2. Ajustar Ranking    - RankStudio
//     3. Gerenciar Produtos - ProductListView (lista + bulk)
//   ColorStudio e YardStudio foram removidos do menu. Edicao de cores e
//   jardas continua possivel individualmente (TabColors no editor) e em
//   massa via selecao multipla -> BulkActionSheet.
//
// Regras:
// - Não toca em API nem em nenhum arquivo fora deste diretório.
// - Usa adminFetch + endpoints /admin/produtos-custom (iguais ao original).
// - Cada view é completamente focada em UMA tarefa.
// ============================================================================

import React, { useMemo, useState, useCallback, useEffect } from 'react';

import type { ParsedProduct, ViewMode } from './types';

// ============================================================================
// Persistência da view ativa (query param ?view=rank)
// ----------------------------------------------------------------------------
// Antes: a `view` vivia só no useState local. Ao recarregar a página ou
// compartilhar URL, o operador voltava sempre pra tela inicial — perdia
// contexto no meio da tarefa.
//
// Agora: sincronizamos `view` com `?view=...` na URL. Benefícios:
//   1. F5 não perde a tela atual.
//   2. Botão voltar do navegador volta pra view anterior.
//   3. URL pode ser compartilhada: /store/admin/produtos?view=rank
//
// 2026-04-25 v2: dashboard reduzido — apenas list/rank/reorder sao validos.
// Se alguem chegar com ?view=colors ou ?view=yards (URL antiga), cai em 'list',
// pois as acoes de cores/jardas agora vivem dentro do Bulk Action Sheet.
// ============================================================================
const VALID_VIEWS: ViewMode[] = ['home', 'list', 'rank', 'reorder'];
const LEGACY_REDIRECTS: Record<string, ViewMode> = {
  colors: 'list',
  yards:  'list',
};

function readViewFromURL(): ViewMode {
  if (typeof window === 'undefined') return 'home';
  try {
    const p = new URLSearchParams(window.location.search).get('view');
    if (!p) return 'home';
    if ((VALID_VIEWS as string[]).includes(p)) return p as ViewMode;
    if (LEGACY_REDIRECTS[p]) return LEGACY_REDIRECTS[p];
  } catch (_) {}
  return 'home';
}

function writeViewToURL(v: ViewMode) {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (v === 'home') url.searchParams.delete('view');
    else url.searchParams.set('view', v);
    // pushState para que o botão "voltar" do navegador funcione corretamente.
    // Antes era replaceState — agora cada mudança de view fica no histórico.
    window.history.pushState({ view: v }, '', url.toString());
  } catch (_) {}
}

import { useProducts } from './hooks/useProducts';
import { useBulkActions } from './hooks/useBulkActions';
import { useProductSave } from './hooks/useProductSave';
import { useToast } from './hooks/useToast';

import { Toast } from './components/Toast';
import { ProductActionSheet } from './components/ProductActionSheet';
import { QuickRankPopup } from './components/QuickRankPopup';
import { BulkActionSheet } from './components/BulkActionSheet';

import { HomeDashboard } from './views/HomeDashboard';
import { ProductListView } from './views/ProductListView';
// 2026-04-25 v2: ColorStudio / YardStudio removidos do menu.
// Acoes em massa de cor e jarda continuam disponiveis via Bulk Action Sheet
// (selecionar multiplos produtos na lista e clicar em "Acoes em massa").
import { RankStudio } from './views/RankStudio';
import { ReorderMode } from './views/ReorderMode';
import { BulkStatusModal } from './views/BulkStatusModal';
import { BulkColorEditor } from './views/BulkColorEditor';
import { QuickBulkColorModal } from './views/QuickBulkColorModal';
import { BulkRankModal } from './views/BulkRankModal';
import { ProductEditor } from './views/editor/ProductEditor';

// ============================================================================
// MAIN
// ============================================================================

export default function AdminProducts() {
  const { toast, showToast, dismiss: dismissToast } = useToast();
  const { products, loading, loadProducts, patchProduct } = useProducts();

  const bulk = useBulkActions({ products, patchProduct, showToast });
  const { saving: editSaving, saveProduct } = useProductSave({
    showToast,
    reload: loadProducts,
  });

  // ------------------------ View routing ------------------------
  // Inicializa a partir da URL (?view=…) — sobrevive a F5.
  const [view, setViewState] = useState<ViewMode>(() => readViewFromURL());
  const setView = useCallback((v: ViewMode) => {
    setViewState(v);
    writeViewToURL(v);
  }, []);

  // Se o usuário usar "voltar" do navegador, reaplica a view da URL.
  useEffect(() => {
    const onPop = () => setViewState(readViewFromURL());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ------------------------ Selection state (para list view) ------------------------
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAllIds = useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      if (prev.size === ids.length) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);

  // ------------------------ Modais ------------------------
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkColors, setShowBulkColors] = useState(false);
  const [showBulkRank, setShowBulkRank] = useState(false);
  const [quickBulkAction, setQuickBulkAction] = useState<'add' | 'remove' | null>(null);

  // ---- Scoped bulk actions ----
  // Historicamente guardava os produtos "alvo" de uma acao em massa quando
  // disparada de uma view especializada (ColorStudio/YardStudio). Hoje (v2)
  // ambas foram removidas, entao este slot fica sempre null e as acoes em
  // massa usam a selecao da lista. Mantido por compatibilidade dos modais
  // (que continuam chamando setScopedProducts(null) ao fechar).
  const [scopedProducts, setScopedProducts] = useState<ParsedProduct[] | null>(null);

  // ------------------------ Editor ------------------------
  const [editingProduct, setEditingProduct] = useState<ParsedProduct | null | undefined>(undefined);

  // ------------------------ Action sheets individuais ------------------------
  const [actionSheetProduct, setActionSheetProduct] = useState<ParsedProduct | null>(null);
  const [quickRankProductId, setQuickRankProductId] = useState<string | null>(null);

  // ------------------------ Reorder mode (full-screen) ------------------------
  const [reorderState, setReorderState] = useState<{
    products: ParsedProduct[];
    label: string;
  } | null>(null);

  // ------------------------ Stats ------------------------
  const stats = useMemo(() => ({
    total: products.length,
    published: products.filter(p => p.status === 'published').length,
    draft: products.filter(p => p.status === 'draft').length,
    noColors: products.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0).length,
    withRank: products.filter(p => p._rank !== null).length,
    outOfStock: products.filter(p => p._stock !== null && p._stock <= 0).length,
  }), [products]);

  // ------------------------ Groups ------------------------
  const groups = useMemo(() => {
    const set = new Set(products.map(p => p._group));
    return Array.from(set).sort();
  }, [products]);

  // ------------------------ Helpers ------------------------
  // Retorna os produtos a usar numa ação bulk: scopedProducts se existirem,
  // senão usa a seleção atual.
  const activeBulkProducts = useMemo(() => {
    if (scopedProducts) return scopedProducts;
    return products.filter(p => selectedIds.has(p.id));
  }, [scopedProducts, products, selectedIds]);

  // ------------------------ Handlers ------------------------
  // 2026-04-25 v2 PERSISTENCIA DE LUGAR:
  // Antes: ao salvar, o editor fechava automaticamente (setEditingProduct(undefined))
  // — o usuario perdia o contexto da edicao e era jogado de volta na lista.
  //
  // Agora: ao salvar com sucesso, MANTEMOS o editor aberto. O operador escolhe
  // quando sair (botao X). Se for um produto NOVO, recarregamos a lista e
  // trocamos o editingProduct para o produto recem-criado (assim ele continua
  // editando o mesmo produto ao inves de ficar num formulario "novo" vazio).
  const handleProductSave = useCallback(async (data: any) => {
    const success = await saveProduct(data, editingProduct ?? null);
    if (!success) return;

    // Produto novo: aguardar reload e mudar editingProduct para o salvo,
    // identificado pelo title+handle (que sao unicos na pratica).
    if (data.isNew) {
      // O hook useProductSave ja chama reload() internamente. Aguardamos um
      // ciclo para que `products` (do hook useProducts) seja atualizado, e
      // tentamos achar o produto recem-criado pelo title.
      setTimeout(() => {
        // products aqui pode estar stale — usamos uma busca defensiva com retries
        const tryFind = (attempt: number) => {
          const found = products.find(p =>
            p.title === data.title || p.handle === data.handle
          );
          if (found) {
            setEditingProduct(found);
          } else if (attempt < 3) {
            setTimeout(() => tryFind(attempt + 1), 400);
          } else {
            // Nao achou em 3 tentativas — fecha mesmo (caso extremo).
            setEditingProduct(undefined);
          }
        };
        tryFind(0);
      }, 300);
    }
    // Produto existente: editor permanece aberto com os mesmos campos
    // (ja salvos). O operador clica em X quando quiser sair.
  }, [saveProduct, editingProduct, products]);

  const closeAllBulkModals = useCallback(() => {
    setShowBulkSheet(false);
    setShowBulkStatus(false);
    setShowBulkColors(false);
    setShowBulkRank(false);
    setQuickBulkAction(null);
    setScopedProducts(null);
  }, []);

  const handleBulkStatusApply = useCallback(async (ids: string[], status: string) => {
    await bulk.applyBulkStatus(ids, status);
    closeAllBulkModals();
    clearSelection();
  }, [bulk, closeAllBulkModals, clearSelection]);

  const handleBulkColorApply = useCallback(async (updates: any[]) => {
    await bulk.applyBulkColors(updates);
    closeAllBulkModals();
    clearSelection();
  }, [bulk, closeAllBulkModals, clearSelection]);

  const handleQuickBulkColorApply = useCallback(async (ids: string[], names: string[], action: 'add' | 'remove') => {
    await bulk.applyQuickBulkColor(ids, names, action);
    closeAllBulkModals();
    clearSelection();
  }, [bulk, closeAllBulkModals, clearSelection]);

  const handleBulkRankApply = useCallback(async (ids: string[], rankOrOpts: any) => {
    await bulk.applyBulkRank(ids, rankOrOpts);
    closeAllBulkModals();
    clearSelection();
  }, [bulk, closeAllBulkModals, clearSelection]);

  const handleReorderSave = useCallback(async (ordered: ParsedProduct[]) => {
    await bulk.applyReorder(ordered);
    setReorderState(null);
  }, [bulk]);

  // 2026-04-25 v2: Atalhos "scoped*" e handleYardAction removidos.
  // Eles so eram chamados por ColorStudio/YardStudio, que foram retirados
  // do menu. Hoje toda acao em massa parte de uma SELECAO explicita na
  // ProductListView, passando pelo BulkActionSheet \u2192 modais. Isso elimina
  // duas fontes de comportamento concorrentes (sem escopo vs com escopo).

  // ------------------------ Reorder full-screen tem prioridade ------------------------
  if (reorderState) {
    return (
      <>
        <ReorderMode
          products={reorderState.products}
          onCancel={() => setReorderState(null)}
          onSave={handleReorderSave}
          saving={bulk.bulkSaving}
          title={reorderState.label}
          // Permite abrir o editor direto a partir do ReorderMode — resolve
          // o caso em que o nome do produto estava truncado e o operador
          // queria ver detalhes / corrigir dados.
          onEditProduct={(p) => {
            setReorderState(null);
            setEditingProduct(p);
          }}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={dismissToast} />}
      </>
    );
  }

  // ------------------------ Render view atual ------------------------
  return (
    <div className="space-y-2.5 pb-4 overflow-x-hidden">
      {view === 'home' && (
        <HomeDashboard
          stats={stats}
          loading={loading}
          products={products}
          onNavigate={(v) => setView(v)}
          onNewProduct={() => setEditingProduct(null)}
        />
      )}

      {view === 'list' && (
        <ProductListView
          products={products}
          loading={loading}
          stats={stats}
          onBack={() => { clearSelection(); setView('home'); }}
          onReload={loadProducts}
          onEdit={(p) => setEditingProduct(p)}
          onNewProduct={() => setEditingProduct(null)}
          onOpenActions={(p) => setActionSheetProduct(p)}
          onOpenReorder={(filtered) => setReorderState({ products: filtered, label: 'Todos filtrados' })}
          selectedIds={selectedIds}
          selectionMode={selectionMode}
          setSelectionMode={(v) => { setSelectionMode(v); if (!v) setSelectedIds(new Set()); }}
          toggleSelect={toggleSelect}
          selectAll={selectAllIds}
          onOpenBulkSheet={() => setShowBulkSheet(true)}
          hasSelection={selectedIds.size > 0}
        />
      )}

      {view === 'rank' && (
        <RankStudio
          products={products}
          onBack={() => setView('home')}
          onOpenReorder={(items, label) => setReorderState({ products: items, label: `Ordenar: ${label}` })}
        />
      )}

      {/* ------------------------ Modais globais ------------------------ */}

      {/* Bulk actions sheet (aparece quando há seleção na list view) */}
      {showBulkSheet && selectedIds.size > 0 && (
        <BulkActionSheet
          count={selectedIds.size}
          onClose={() => setShowBulkSheet(false)}
          onOpenStatus={() => setShowBulkStatus(true)}
          onOpenColors={() => setShowBulkColors(true)}
          onOpenAddColor={() => setQuickBulkAction('add')}
          onOpenRemoveColor={() => setQuickBulkAction('remove')}
          onOpenRank={() => setShowBulkRank(true)}
        />
      )}

      {showBulkStatus && activeBulkProducts.length > 0 && (
        <BulkStatusModal
          products={activeBulkProducts}
          onApply={handleBulkStatusApply}
          onClose={() => { setShowBulkStatus(false); setScopedProducts(null); }}
          saving={bulk.bulkSaving}
        />
      )}

      {showBulkColors && activeBulkProducts.length > 0 && (
        <BulkColorEditor
          products={activeBulkProducts}
          onApply={handleBulkColorApply}
          onClose={() => { setShowBulkColors(false); setScopedProducts(null); }}
          saving={bulk.bulkSaving}
        />
      )}

      {quickBulkAction && activeBulkProducts.length > 0 && (
        <QuickBulkColorModal
          products={activeBulkProducts}
          action={quickBulkAction}
          onApply={handleQuickBulkColorApply}
          onClose={() => { setQuickBulkAction(null); setScopedProducts(null); }}
          saving={bulk.bulkSaving}
        />
      )}

      {showBulkRank && activeBulkProducts.length > 0 && (
        <BulkRankModal
          products={activeBulkProducts}
          onApply={handleBulkRankApply}
          onClose={() => { setShowBulkRank(false); setScopedProducts(null); }}
          saving={bulk.bulkSaving}
        />
      )}

      {/* ------------------------ Action sheet individual ------------------------ */}
      {actionSheetProduct && (
        <ProductActionSheet
          product={actionSheetProduct}
          onClose={() => setActionSheetProduct(null)}
          onEdit={(p) => setEditingProduct(p)}
          onStatusChange={bulk.applyStatus}
          onQuickRank={(pid) => setQuickRankProductId(pid)}
          saving={bulk.savingId === actionSheetProduct.id}
        />
      )}

      {quickRankProductId && (() => {
        const p = products.find(pp => pp.id === quickRankProductId);
        return p ? (
          <QuickRankPopup
            product={p}
            onApply={async (id, rank) => {
              await bulk.applyQuickRank(id, rank);
              setQuickRankProductId(null);
            }}
            onClose={() => setQuickRankProductId(null)}
            saving={bulk.savingId === p.id}
          />
        ) : null;
      })()}

      {/* ------------------------ Editor full-screen ------------------------ */}
      {editingProduct !== undefined && (
        <ProductEditor
          product={editingProduct}
          allGroups={groups}
          onSave={handleProductSave}
          onClose={() => setEditingProduct(undefined)}
          saving={editSaving}
        />
      )}

      {/* ------------------------ Toast ------------------------ */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={dismissToast} />
      )}
    </div>
  );
}
