// ============================================================================
// ProductListView - Lista LIMPA com apenas 3 tabs e busca
// ----------------------------------------------------------------------------
// 2026-04-25 v3:
//   - REMOVIDO: ordem rank, reordenar, "Mais filtros", filtros de grupo,
//     filtros especiais (sem cores, multicolor, com rank, sem rank, etc).
//   - MANTIDO: 3 tabs (Todos / Publicados / Rascunhos), busca, selecao
//     multipla, acoes em massa (publicar/despublicar/cores), atalho para
//     novo produto, recarregar.
//   - Persistencia total: busca, tab, scrollY, selecao salvos em
//     localStorage. Voltar do editor mantem tudo.
// ============================================================================

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, PlusCircle, RefreshCw,
  Eye, EyeOff, ChevronUp,
  CheckSquare, Square, Package, Loader2, ArrowLeft,
} from 'lucide-react';
import { ProductCard } from '../components/ProductCard';
import type { ParsedProduct } from '../types';

interface Stats {
  total: number;
  published: number;
  draft: number;
  noColors: number;
  withRank: number;
  outOfStock: number;
}

export interface ProductListViewProps {
  products: ParsedProduct[];
  loading: boolean;
  stats: Stats;
  onBack: () => void;
  onReload: () => void;
  onEdit: (p: ParsedProduct) => void;
  onNewProduct: () => void;
  onOpenActions: (p: ParsedProduct) => void;
  onOpenReorder: (filtered: ParsedProduct[]) => void;

  selectedIds: Set<string>;
  selectionMode: boolean;
  setSelectionMode: (v: boolean) => void;
  toggleSelect: (id: string) => void;
  selectAll: (ids: string[]) => void;
  onOpenBulkSheet: () => void;
  hasSelection: boolean;
}

// ============================================================================
// PERSISTENCIA - chaves do localStorage
// ============================================================================
const LS = {
  search:  'ddt_admin_list_search',
  status:  'ddt_admin_list_status',
  scrollY: 'ddt_admin_list_scrollY',
};

type StatusFilter = 'all' | 'published' | 'draft';

function loadStr(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function loadNum(key: string, fallback = 0): number {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
}
function saveStr(key: string, v: string) { try { localStorage.setItem(key, v); } catch {} }
function saveNum(key: string, v: number) { try { localStorage.setItem(key, String(v)); } catch {} }

export function ProductListView({
  products, loading, stats,
  onBack, onReload, onEdit, onNewProduct, onOpenActions,
  selectedIds, selectionMode, setSelectionMode,
  toggleSelect, selectAll, onOpenBulkSheet, hasSelection,
}: ProductListViewProps) {
  // Estado persistido — busca + status apenas
  const [searchQuery, setSearchQueryRaw] = useState(() => loadStr(LS.search, ''));
  const [statusFilter, setStatusFilterRaw] = useState<StatusFilter>(() => {
    const v = loadStr(LS.status, 'all') as StatusFilter;
    return v === 'published' || v === 'draft' || v === 'all' ? v : 'all';
  });

  const setSearchQuery = useCallback((v: string) => { setSearchQueryRaw(v); saveStr(LS.search, v); }, []);
  const setStatusFilter = useCallback((v: StatusFilter) => { setStatusFilterRaw(v); saveStr(LS.status, v); }, []);

  // Scroll preservation
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!loading && !restoredRef.current) {
      const y = loadNum(LS.scrollY, 0);
      if (y > 0) {
        setTimeout(() => window.scrollTo({ top: y, behavior: 'auto' }), 50);
      }
      restoredRef.current = true;
    }
  }, [loading]);

  useEffect(() => {
    let rafId: number | null = null;
    const handler = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        saveNum(LS.scrollY, window.scrollY);
        rafId = null;
      });
    };
    window.addEventListener('scroll', handler, { passive: true });
    return () => {
      window.removeEventListener('scroll', handler);
      if (rafId) cancelAnimationFrame(rafId);
      saveNum(LS.scrollY, window.scrollY);
    };
  }, []);

  // Filtragem — APENAS busca + status
  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.handle?.toLowerCase().includes(q) ||
        p._group?.toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'published') result = result.filter(p => p.status === 'published');
    else if (statusFilter === 'draft') result = result.filter(p => p.status === 'draft');

    return result;
  }, [products, searchQuery, statusFilter]);

  return (
    <div className="space-y-2.5 pb-24 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 -mt-1">
        <button
          onClick={onBack}
          className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-xl"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-sm font-bold text-zinc-700 flex-1 truncate">Gerenciar Produtos</h2>
        <span className="text-[11px] text-zinc-400 shrink-0">
          {filteredProducts.length} de {products.length}
        </span>
        <button
          onClick={onReload}
          className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg shrink-0"
          aria-label="Atualizar"
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Search + Novo */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, handle, grupo..."
            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-zinc-300 hover:text-zinc-500 shrink-0">
              <X size={16} />
            </button>
          )}
          <button
            onClick={onNewProduct}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
            aria-label="Novo produto"
          >
            <PlusCircle size={14} />
            <span className="hidden sm:inline">Novo</span>
          </button>
        </div>
      </div>

      {/* APENAS 3 tabs - "Todos" pre-selecionado */}
      <div className="flex gap-1.5">
        <StatusTab
          active={statusFilter === 'all'}
          onClick={() => setStatusFilter('all')}
          label="Todos"
          count={products.length}
          tone="zinc"
        />
        <StatusTab
          active={statusFilter === 'published'}
          onClick={() => setStatusFilter('published')}
          label="Publicados"
          count={stats.published}
          tone="emerald"
          icon={<Eye size={12} />}
        />
        <StatusTab
          active={statusFilter === 'draft'}
          onClick={() => setStatusFilter('draft')}
          label="Rascunhos"
          count={stats.draft}
          tone="amber"
          icon={<EyeOff size={12} />}
        />
      </div>

      {/* Selection bar */}
      {!loading && filteredProducts.length > 0 && (
        <div className="flex items-center gap-2 px-1 min-w-0">
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-900 font-medium px-2 py-1.5 rounded-lg hover:bg-zinc-100 touch-manipulation"
            >
              <CheckSquare size={13} />
              Selecionar
            </button>
          ) : (
            <>
              <button
                onClick={() => selectAll(filteredProducts.map(p => p.id))}
                className="flex items-center gap-1 text-[11px] text-zinc-700 font-semibold px-2 py-1.5 rounded-lg hover:bg-zinc-100 touch-manipulation min-w-0"
              >
                {selectedIds.size === filteredProducts.length
                  ? <CheckSquare size={14} className="text-blue-600 shrink-0" />
                  : <Square size={14} className="text-zinc-300 shrink-0" />}
                <span className="truncate">
                  {selectedIds.size === 0
                    ? 'Selecionar todos'
                    : selectedIds.size === filteredProducts.length
                      ? 'Desmarcar todos'
                      : `${selectedIds.size} marcado(s)`}
                </span>
              </button>
              <button
                onClick={() => setSelectionMode(false)}
                className="text-[11px] text-zinc-400 hover:text-red-500 px-2 py-1.5 rounded-lg shrink-0"
              >
                Sair
              </button>
            </>
          )}
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={28} className="animate-spin text-zinc-300 mx-auto" />
          <p className="text-zinc-400 mt-3 text-sm">Carregando produtos...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-zinc-100 text-center">
          <Package size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm font-medium">Nenhum produto encontrado</p>
          {(searchQuery || statusFilter !== 'all') && (
            <button
              onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
              className="text-blue-600 text-xs mt-2 hover:underline"
            >
              Limpar busca/filtros
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
          {filteredProducts.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              isSelected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onOpenActions={onOpenActions}
              onEdit={onEdit}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}

      {/* Barra de acoes em massa (sticky bottom) */}
      {hasSelection && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={onOpenBulkSheet}
            className="w-full max-w-md mx-auto bg-zinc-900 text-white py-3.5 rounded-2xl text-sm font-bold shadow-2xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors"
          >
            <span className="bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
            <span>Acoes em massa</span>
            <ChevronUp size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// StatusTab - tab grande tocavel com contador
// ============================================================================
function StatusTab({
  active, label, count, onClick, icon, tone,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
  icon?: React.ReactNode;
  tone: 'zinc' | 'emerald' | 'amber';
}) {
  const tones = {
    zinc: {
      active: 'bg-zinc-900 text-white border-zinc-900',
      idle:   'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300',
      count:  'bg-white/20 text-white',
      countIdle: 'bg-zinc-100 text-zinc-500',
    },
    emerald: {
      active: 'bg-emerald-600 text-white border-emerald-600',
      idle:   'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-300',
      count:  'bg-white/20 text-white',
      countIdle: 'bg-emerald-50 text-emerald-600',
    },
    amber: {
      active: 'bg-amber-600 text-white border-amber-600',
      idle:   'bg-white text-amber-700 border-amber-200 hover:border-amber-300',
      count:  'bg-white/20 text-white',
      countIdle: 'bg-amber-50 text-amber-600',
    },
  } as const;
  const t = tones[tone];
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl text-[12px] font-bold border transition-all min-w-0 ${
        active ? t.active : t.idle
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{label}</span>
      <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-md ${active ? t.count : t.countIdle}`}>
        {count}
      </span>
    </button>
  );
}
