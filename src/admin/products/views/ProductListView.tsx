// ============================================================================
// ProductListView - Lista simplificada com 3 filtros principais
// ----------------------------------------------------------------------------
// 2026-04-25 v2:
//   - Apenas 3 filtros de status: Todos (padrao) / Publicados / Rascunhos
//   - Poluicao visual removida: filtros de grupo/rank/cores movidos para
//     um painel "Mais filtros" dobravel (oculto por padrao).
//   - PERSISTENCIA TOTAL: busca, filtros, sort, scroll Y sao gravados em
//     localStorage e reaplicados ao voltar para a lista. Tambem persiste
//     entre F5 e quando o operador entra num produto e volta.
// ============================================================================

import React, { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, X, PlusCircle, RefreshCw, LayoutGrid, ListOrdered, ArrowUpDown,
  Eye, EyeOff, ChevronUp, ChevronDown,
  CheckSquare, Square, Package, Loader2, ArrowLeft, Filter, Tag, TrendingUp, AlertTriangle,
} from 'lucide-react';
import { ModePill, FilterPill } from '../components/Pills';
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
// ----------------------------------------------------------------------------
// Por que localStorage e nao URL: a lista tem MUITO estado (busca, status,
// grupo, scroll). Colocar tudo na URL polui e estoura URLs compartilhaveis.
// ============================================================================
const LS = {
  search:   'ddt_admin_list_search',
  status:   'ddt_admin_list_status',
  group:    'ddt_admin_list_group',
  sort:     'ddt_admin_list_sortByRank',
  more:     'ddt_admin_list_showMore',
  scrollY:  'ddt_admin_list_scrollY',
};

type StatusFilter = 'all' | 'published' | 'draft' | 'no_colors' | 'has_colors'
  | 'multicolor' | 'derived_colors' | 'saved_colors' | 'with_rank' | 'no_rank' | 'out_of_stock';

function loadStr(key: string, fallback = ''): string {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function loadBool(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    return v === 'true';
  } catch { return fallback; }
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
function saveBool(key: string, v: boolean) { try { localStorage.setItem(key, String(v)); } catch {} }
function saveNum(key: string, v: number) { try { localStorage.setItem(key, String(v)); } catch {} }

export function ProductListView({
  products, loading, stats,
  onBack, onReload, onEdit, onNewProduct, onOpenActions, onOpenReorder,
  selectedIds, selectionMode, setSelectionMode,
  toggleSelect, selectAll, onOpenBulkSheet, hasSelection,
}: ProductListViewProps) {
  // ───────── Estado persistido ─────────
  const [searchQuery, setSearchQueryRaw] = useState(() => loadStr(LS.search, ''));
  const [statusFilter, setStatusFilterRaw] = useState<StatusFilter>(() => {
    const v = loadStr(LS.status, 'all') as StatusFilter;
    return v || 'all';
  });
  const [groupFilter, setGroupFilterRaw] = useState<string>(() => loadStr(LS.group, 'all'));
  const [showMoreFilters, setShowMoreFiltersRaw] = useState<boolean>(() => loadBool(LS.more, false));
  const [sortByRank, setSortByRankRaw] = useState<boolean>(() => loadBool(LS.sort, true));

  // Wrappers que salvam em storage automaticamente
  const setSearchQuery = useCallback((v: string) => { setSearchQueryRaw(v); saveStr(LS.search, v); }, []);
  const setStatusFilter = useCallback((v: StatusFilter) => { setStatusFilterRaw(v); saveStr(LS.status, v); }, []);
  const setGroupFilter = useCallback((v: string) => { setGroupFilterRaw(v); saveStr(LS.group, v); }, []);
  const setShowMoreFilters = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setShowMoreFiltersRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveBool(LS.more, next);
      return next;
    });
  }, []);
  const setSortByRank = useCallback((updater: boolean | ((prev: boolean) => boolean)) => {
    setSortByRankRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      saveBool(LS.sort, next);
      return next;
    });
  }, []);

  // ───────── Scroll preservation ─────────
  // Salvamos o scrollY ao sair da tela (unmount ou blur). Ao montar, restauramos.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (!loading && !restoredRef.current) {
      const y = loadNum(LS.scrollY, 0);
      if (y > 0) {
        // setTimeout para garantir que a lista ja renderizou antes de scrollar
        setTimeout(() => window.scrollTo({ top: y, behavior: 'auto' }), 50);
      }
      restoredRef.current = true;
    }
  }, [loading]);

  // Salva scrollY a cada 250ms enquanto o usuario rolar, e ao sair da pagina.
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
      // salva posicao final ao desmontar
      saveNum(LS.scrollY, window.scrollY);
    };
  }, []);

  // ───────── Filtragem ─────────
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

    if (groupFilter !== 'all') result = result.filter(p => p._group === groupFilter);

    if (statusFilter === 'published')          result = result.filter(p => p.status === 'published');
    else if (statusFilter === 'draft')         result = result.filter(p => p.status === 'draft');
    else if (statusFilter === 'no_colors')     result = result.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0);
    else if (statusFilter === 'has_colors')    result = result.filter(p => p._availableColors.length > 0);
    else if (statusFilter === 'multicolor')    result = result.filter(p => p._isLine && !p._needsColorSelection);
    else if (statusFilter === 'derived_colors') result = result.filter(p => p._colorSource === 'derived');
    else if (statusFilter === 'saved_colors')  result = result.filter(p => p._colorSource === 'metadata');
    else if (statusFilter === 'with_rank')     result = result.filter(p => p._rank !== null);
    else if (statusFilter === 'no_rank')       result = result.filter(p => p._rank === null);
    else if (statusFilter === 'out_of_stock')  result = result.filter(p => p._stock !== null && p._stock <= 0);

    if (sortByRank) {
      result = [...result].sort((a, b) => {
        const ra = a._rank, rb = b._rank;
        if (ra === null && rb === null) return 0;
        if (ra === null) return 1;
        if (rb === null) return -1;
        return ra - rb;
      });
    }

    return result;
  }, [products, searchQuery, groupFilter, statusFilter, sortByRank]);

  const groups = useMemo(() => {
    const set = new Set(products.map(p => p._group));
    return Array.from(set).sort();
  }, [products]);

  const hasActiveFilter = groupFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim() !== '';
  const clearAll = () => {
    setSearchQuery('');
    setGroupFilter('all');
    setStatusFilter('all');
  };

  return (
    <div className="space-y-2.5 pb-24 overflow-x-hidden">
      {/* Header com voltar */}
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

      {/* 2026-04-25: SOMENTE 3 filtros principais de status.
          "Todos" vem pre-selecionado por padrao. */}
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

      {/* Linha de acoes: ordenar, reordenar, recarregar, mais filtros */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        <ModePill
          active={sortByRank}
          onClick={() => setSortByRank(s => !s)}
          icon={<ArrowUpDown size={13} />}
          label={sortByRank ? 'Ordem: Rank' : 'Ordem: Padrao'}
        />
        <ModePill
          active={false}
          onClick={() => onOpenReorder(filteredProducts)}
          icon={<ListOrdered size={13} />}
          label={hasActiveFilter ? `Reordenar (${filteredProducts.length})` : 'Reordenar'}
          accent="amber"
        />
        <button
          onClick={() => setShowMoreFilters(s => !s)}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border shrink-0 transition-colors ${
            showMoreFilters || groupFilter !== 'all'
              ? 'bg-blue-50 border-blue-200 text-blue-700'
              : 'bg-white border-zinc-200 text-zinc-500'
          }`}
          aria-label="Mais filtros"
        >
          <Filter size={12} />
          Mais filtros
          {groupFilter !== 'all' && (
            <span className="bg-blue-600 text-white text-[9px] font-bold px-1.5 rounded-full">1</span>
          )}
          {showMoreFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
        <div className="flex-1" />
        <button
          onClick={onReload}
          className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg shrink-0"
          aria-label="Atualizar"
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Mais filtros (dobravel) */}
      {showMoreFilters && (
        <div className="bg-white rounded-xl border border-zinc-200 p-2.5 space-y-2.5">
          {/* Filtro por grupo */}
          {groups.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Por grupo</p>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
                <FilterPill
                  active={groupFilter === 'all'}
                  onClick={() => setGroupFilter('all')}
                  icon={<LayoutGrid size={11} />}
                  label="Todos"
                />
                {groups.map(g => (
                  <FilterPill
                    key={g}
                    active={groupFilter === g}
                    onClick={() => setGroupFilter(g === groupFilter ? 'all' : g)}
                    icon={<Tag size={11} />}
                    label={g}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Filtros especiais */}
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Especiais</p>
            <div className="flex gap-1.5 flex-wrap">
              <FilterPill
                active={statusFilter === 'with_rank'}
                onClick={() => setStatusFilter(statusFilter === 'with_rank' ? 'all' : 'with_rank')}
                icon={<TrendingUp size={11} />}
                label={`Com rank (${stats.withRank})`}
                tone="amber"
              />
              {stats.outOfStock > 0 && (
                <FilterPill
                  active={statusFilter === 'out_of_stock'}
                  onClick={() => setStatusFilter(statusFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
                  icon={<AlertTriangle size={11} />}
                  label={`Sem estoque (${stats.outOfStock})`}
                  tone="red"
                />
              )}
              {[
                { key: 'no_colors' as StatusFilter,      label: `Sem cores (${stats.noColors})` },
                { key: 'has_colors' as StatusFilter,     label: 'Com cores' },
                { key: 'multicolor' as StatusFilter,     label: 'Multicor' },
                { key: 'no_rank' as StatusFilter,        label: 'Sem rank' },
              ].map(f => (
                <FilterPill
                  key={f.key}
                  active={statusFilter === f.key}
                  onClick={() => setStatusFilter(statusFilter === f.key ? 'all' : f.key)}
                  label={f.label}
                />
              ))}
            </div>
          </div>

          {hasActiveFilter && (
            <button
              onClick={clearAll}
              className="text-[11px] text-zinc-500 hover:text-red-600 font-medium px-2 py-1 rounded hover:bg-red-50"
            >
              Limpar todos filtros
            </button>
          )}
        </div>
      )}

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
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-400 shrink-0">
            {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
          </span>
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
          {hasActiveFilter && (
            <button
              onClick={clearAll}
              className="text-blue-600 text-xs mt-2 hover:underline"
            >
              Limpar filtros
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
// StatusTab - tab grande tocavel com contador (desktop e mobile)
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
