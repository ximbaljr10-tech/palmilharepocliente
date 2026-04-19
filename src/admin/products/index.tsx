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
//                  ColorStudio, YardStudio, RankStudio, Bulk*Modal,
//                  ReorderMode, editor/*)
//
// Regras:
// - Não toca em API nem em nenhum arquivo fora deste diretório.
// - Usa adminFetch + endpoints /admin/produtos-custom (iguais ao original).
// - Cada view é completamente focada em UMA tarefa.
// ============================================================================

import React, { useMemo, useState, useCallback } from 'react';

import type { ParsedProduct, ViewMode } from './types';

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
import { ColorStudio } from './views/ColorStudio';
import { YardStudio } from './views/YardStudio';
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
  const [view, setView] = useState<ViewMode>('home');

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

  // ---- Scoped bulk actions (quando vem do ColorStudio/YardStudio) ----
  // Guarda os produtos "alvo" da próxima ação em massa quando o usuário
  // dispara direto de uma view especializada (sem precisar selecionar).
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
  const handleProductSave = useCallback(async (data: any) => {
    const success = await saveProduct(data, editingProduct ?? null);
    if (success) setEditingProduct(undefined);
  }, [saveProduct, editingProduct]);

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

  // Atalhos para views especializadas chamarem ações
  const scopedOpenBulkColors = useCallback((scope: ParsedProduct[]) => {
    setScopedProducts(scope);
    setShowBulkColors(true);
  }, []);
  const scopedOpenQuickAdd = useCallback((scope: ParsedProduct[]) => {
    setScopedProducts(scope);
    setQuickBulkAction('add');
  }, []);
  const scopedOpenQuickRemove = useCallback((scope: ParsedProduct[]) => {
    setScopedProducts(scope);
    setQuickBulkAction('remove');
  }, []);
  const scopedOpenBulkRank = useCallback((scope: ParsedProduct[]) => {
    setScopedProducts(scope);
    setShowBulkRank(true);
  }, []);
  const scopedOpenBulkStatus = useCallback((scope: ParsedProduct[]) => {
    setScopedProducts(scope);
    setShowBulkStatus(true);
  }, []);
  const scopedOpenReorder = useCallback((scope: ParsedProduct[], label: string) => {
    setReorderState({ products: scope, label: `Ordenar: ${label}` });
  }, []);

  // Yard action dispatcher
  const handleYardAction = useCallback(
    (items: ParsedProduct[], action: 'edit_colors' | 'bulk_rank' | 'bulk_status' | 'reorder') => {
      switch (action) {
        case 'edit_colors': scopedOpenBulkColors(items); break;
        case 'bulk_rank':   scopedOpenBulkRank(items); break;
        case 'bulk_status': scopedOpenBulkStatus(items); break;
        case 'reorder':     scopedOpenReorder(items, items[0]?._yards ? `${items[0]._yards} jardas` : 'Jarda'); break;
      }
    },
    [scopedOpenBulkColors, scopedOpenBulkRank, scopedOpenBulkStatus, scopedOpenReorder]
  );

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

      {view === 'colors' && (
        <ColorStudio
          products={products}
          onBack={() => setView('home')}
          onEditGroup={scopedOpenBulkColors}
          onQuickAdd={scopedOpenQuickAdd}
          onQuickRemove={scopedOpenQuickRemove}
          onEditProduct={(p) => setEditingProduct(p)}
        />
      )}

      {view === 'yards' && (
        <YardStudio
          products={products}
          onBack={() => setView('home')}
          onEditProduct={(p) => setEditingProduct(p)}
          onYardAction={handleYardAction}
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
