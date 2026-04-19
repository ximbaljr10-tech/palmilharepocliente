// ============================================================================
// ProductListView - Lista tradicional com filtros, busca e ações em massa
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  Search, X, PlusCircle, RefreshCw, LayoutGrid, ListOrdered, ArrowUpDown,
  Tag, Filter, Eye, EyeOff, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  CheckSquare, Square, Package, Loader2, ArrowLeft,
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

export function ProductListView({
  products, loading, stats,
  onBack, onReload, onEdit, onNewProduct, onOpenActions, onOpenReorder,
  selectedIds, selectionMode, setSelectionMode,
  toggleSelect, selectAll, onOpenBulkSheet, hasSelection,
}: ProductListViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [sortByRank, setSortByRank] = useState(true);

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
        <h2 className="text-sm font-bold text-zinc-700 flex-1 truncate">Lista de Produtos</h2>
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

      {/* Mode pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        <ModePill
          active={true}
          onClick={() => {}}
          icon={<LayoutGrid size={13} />}
          label="Lista"
        />
        <ModePill
          active={false}
          onClick={() => onOpenReorder(filteredProducts)}
          icon={<ListOrdered size={13} />}
          label={hasActiveFilter ? `Ordenar (${filteredProducts.length})` : 'Ordenar'}
          accent="amber"
        />
        <div className="flex-1" />
        <ModePill
          active={sortByRank}
          onClick={() => setSortByRank(s => !s)}
          icon={<ArrowUpDown size={13} />}
          label={sortByRank ? 'Ordem: Rank' : 'Ordem: Padrao'}
        />
        <button
          onClick={onReload}
          className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg shrink-0"
          aria-label="Atualizar"
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Grupo pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        <FilterPill active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} icon={<LayoutGrid size={11} />} label="Todos" />
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

      {/* Status pills */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} icon={<Filter size={11} />} label="Todos status" />
        <FilterPill
          active={statusFilter === 'published'}
          onClick={() => setStatusFilter(statusFilter === 'published' ? 'all' : 'published')}
          icon={<Eye size={11} />}
          label="Publicados"
          tone="emerald"
        />
        <FilterPill
          active={statusFilter === 'draft'}
          onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
          icon={<EyeOff size={11} />}
          label="Rascunhos"
          tone="amber"
        />
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
        <button
          onClick={() => setShowMoreFilters(s => !s)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 shrink-0"
        >
          <Filter size={11} />
          Mais
          {showMoreFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {showMoreFilters && (
        <div className="bg-white rounded-xl border border-zinc-200 px-2.5 py-2">
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'no_colors',      label: `Sem cores (${stats.noColors})` },
              { key: 'has_colors',     label: 'Com cores' },
              { key: 'multicolor',     label: 'Multicor' },
              { key: 'derived_colors', label: 'Auto-derivadas' },
              { key: 'saved_colors',   label: 'Cores salvas' },
              { key: 'no_rank',        label: 'Sem rank' },
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
              onClick={() => { setSearchQuery(''); setGroupFilter('all'); setStatusFilter('all'); }}
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

      {/* Barra de ações em massa (sticky bottom) */}
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
