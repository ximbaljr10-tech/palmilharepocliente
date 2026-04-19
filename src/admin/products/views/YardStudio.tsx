// ============================================================================
// YardStudio - Gestão por Jardas
// Agrupa produtos por jarda para aplicar ações em massa por jarda
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Ruler, ChevronRight, Search, Package,
  Palette, TrendingUp, Globe,
} from 'lucide-react';
import type { ParsedProduct } from '../types';

interface YardBucket {
  yards: number | null;
  label: string;
  products: ParsedProduct[];
  publishedCount: number;
  draftCount: number;
  withColorsCount: number;
  withRankCount: number;
}

export interface YardStudioProps {
  products: ParsedProduct[];
  onBack: () => void;
  onEditProduct: (p: ParsedProduct) => void;
  onYardAction: (
    products: ParsedProduct[],
    action: 'edit_colors' | 'bulk_rank' | 'bulk_status' | 'reorder'
  ) => void;
}

export function YardStudio({
  products, onBack, onEditProduct, onYardAction,
}: YardStudioProps) {
  const [search, setSearch] = useState('');

  const buckets = useMemo<YardBucket[]>(() => {
    const map = new Map<string, YardBucket>();
    for (const p of products) {
      const key = p._yards === null ? 'none' : String(p._yards);
      if (!map.has(key)) {
        map.set(key, {
          yards: p._yards,
          label: p._yards === null ? 'Sem jarda' : `${p._yards} jardas`,
          products: [],
          publishedCount: 0,
          draftCount: 0,
          withColorsCount: 0,
          withRankCount: 0,
        });
      }
      const b = map.get(key)!;
      b.products.push(p);
      if (p.status === 'published') b.publishedCount++; else b.draftCount++;
      if (p._availableColors.length > 0) b.withColorsCount++;
      if (p._rank !== null) b.withRankCount++;
    }
    // Ordena: yards numéricas crescente, "sem jarda" no final
    return Array.from(map.values()).sort((a, b) => {
      if (a.yards === null) return 1;
      if (b.yards === null) return -1;
      return a.yards - b.yards;
    });
  }, [products]);

  const filteredBuckets = search
    ? buckets.filter(b => b.label.toLowerCase().includes(search.toLowerCase()))
    : buckets;

  return (
    <div className="space-y-2.5 pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 -mt-1">
        <button onClick={onBack} className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-xl" aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
            <Ruler size={14} className="text-blue-600 shrink-0" />
            Gerenciar por Jardas
          </h2>
          <p className="text-[11px] text-zinc-500 truncate">
            {buckets.length} jardas · {products.length} produtos
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar jarda (ex: 3000)..."
            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Explicação rápida */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-3 py-2 text-[11px] text-blue-900 flex items-start gap-2">
        <Ruler size={12} className="shrink-0 mt-0.5 text-blue-500" />
        <span>
          Clique numa jarda para ver os produtos e aplicar <strong>ações em massa</strong> apenas naquela categoria.
        </span>
      </div>

      {/* Lista de jardas */}
      {filteredBuckets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
          <Ruler size={28} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Nenhuma jarda encontrada</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredBuckets.map(b => (
            <YardBucketCard
              key={b.yards === null ? 'none' : String(b.yards)}
              bucket={b}
              onEditProduct={onEditProduct}
              onAction={(a) => onYardAction(b.products, a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------- Yard Bucket Card -----------------------

function YardBucketCard({
  bucket, onEditProduct, onAction,
}: {
  bucket: YardBucket;
  onEditProduct: (p: ParsedProduct) => void;
  onAction: (a: 'edit_colors' | 'bulk_rank' | 'bulk_status' | 'reorder') => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-zinc-50/50"
      >
        <div className="w-11 h-11 rounded-xl bg-blue-100 text-blue-600 flex flex-col items-center justify-center shrink-0 leading-none">
          <span className="text-base font-black">
            {bucket.yards !== null ? bucket.yards : '—'}
          </span>
          <span className="text-[8px] font-semibold uppercase tracking-wide">
            {bucket.yards !== null ? 'jds' : 'n/a'}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-zinc-900 truncate">{bucket.label}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded">
              {bucket.products.length} total
            </span>
            {bucket.publishedCount > 0 && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">
                {bucket.publishedCount} pub
              </span>
            )}
            {bucket.draftCount > 0 && (
              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                {bucket.draftCount} rasc
              </span>
            )}
            {bucket.withRankCount > 0 && (
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <TrendingUp size={8} /> {bucket.withRankCount}
              </span>
            )}
          </div>
        </div>
        <ChevronRight
          size={16}
          className={`text-zinc-300 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-3 pt-2.5 pb-3 bg-zinc-50/30 space-y-2.5">
          {/* Ações em massa para toda a jarda */}
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Acoes para TODOS os {bucket.products.length} produtos desta jarda
            </p>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => onAction('bulk_status')}
                className="px-2 py-2 rounded-xl bg-blue-600 text-white text-[11px] font-bold hover:bg-blue-700 flex items-center justify-center gap-1 min-w-0"
              >
                <Globe size={12} />
                <span className="truncate">Publicar/Ocultar</span>
              </button>
              <button
                onClick={() => onAction('edit_colors')}
                className="px-2 py-2 rounded-xl bg-purple-600 text-white text-[11px] font-bold hover:bg-purple-700 flex items-center justify-center gap-1 min-w-0"
              >
                <Palette size={12} />
                <span className="truncate">Editar Cores</span>
              </button>
              <button
                onClick={() => onAction('bulk_rank')}
                className="px-2 py-2 rounded-xl bg-amber-600 text-white text-[11px] font-bold hover:bg-amber-700 flex items-center justify-center gap-1 min-w-0"
              >
                <TrendingUp size={12} />
                <span className="truncate">Definir Rank</span>
              </button>
              <button
                onClick={() => onAction('reorder')}
                className="px-2 py-2 rounded-xl bg-zinc-900 text-white text-[11px] font-bold hover:bg-zinc-800 flex items-center justify-center gap-1 min-w-0"
              >
                <Package size={12} />
                <span className="truncate">Reordenar</span>
              </button>
            </div>
          </div>

          {/* Lista compacta dos produtos */}
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">
              Produtos desta jarda ({bucket.products.length})
            </p>
            <div className="space-y-1 max-h-80 overflow-y-auto">
              {bucket.products.slice(0, 20).map(p => (
                <button
                  key={p.id}
                  onClick={() => onEditProduct(p)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-blue-300 text-left"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    p.status === 'published' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`} />
                  <span className="text-[11px] text-zinc-700 truncate flex-1 min-w-0">{p.title}</span>
                  <span className="text-[10px] text-zinc-400 shrink-0">R$ {p._priceDisplay}</span>
                  {p._rank !== null && (
                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1 py-0.5 rounded font-bold shrink-0">
                      #{p._rank}
                    </span>
                  )}
                </button>
              ))}
              {bucket.products.length > 20 && (
                <p className="text-[10px] text-zinc-400 italic px-2">
                  +{bucket.products.length - 20} produto(s)...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
