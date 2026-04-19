// ============================================================================
// ColorStudio - Área especializada em gerenciar cores
// Mostra grupos de produtos com mesma config de cor para operar em massa
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, Palette, Plus, Minus, AlertTriangle, ChevronRight, Search,
  Ruler, Tag,
} from 'lucide-react';
import { ColorDot } from '../components/ColorDot';
import type { ParsedProduct } from '../types';

interface GroupBucket {
  key: string;
  label: string;
  subtitle: string;
  products: ParsedProduct[];
  colors: { name: string; hex: string; in_stock: boolean }[];
  hasIssue: boolean; // sem cor ou com cor 0 em estoque
}

export interface ColorStudioProps {
  products: ParsedProduct[];
  onBack: () => void;
  onEditGroup: (products: ParsedProduct[]) => void;
  onQuickAdd: (products: ParsedProduct[]) => void;
  onQuickRemove: (products: ParsedProduct[]) => void;
  onEditProduct: (p: ParsedProduct) => void;
}

export function ColorStudio({
  products, onBack, onEditGroup, onQuickAdd, onQuickRemove, onEditProduct,
}: ColorStudioProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'no_colors' | 'derived' | 'saved'>('all');

  // Apenas produtos que usam cores
  const colorableProducts = useMemo(
    () => products.filter(p => p._needsColorSelection),
    [products]
  );

  // Agrupa por configuração de cor (mesmo config = mesmo bucket)
  const buckets = useMemo<GroupBucket[]>(() => {
    let filtered = colorableProducts;
    if (filter === 'no_colors') filtered = filtered.filter(p => p._availableColors.length === 0);
    if (filter === 'derived')   filtered = filtered.filter(p => p._colorSource === 'derived');
    if (filter === 'saved')     filtered = filtered.filter(p => p._colorSource === 'metadata');

    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(q) || p._group.toLowerCase().includes(q)
      );
    }

    // Chave: grupo + colorConfigKey (para ter buckets mais intuitivos)
    const map = new Map<string, GroupBucket>();
    for (const p of filtered) {
      const key = `${p._group}::${p._colorConfigKey}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: p._group,
          subtitle: p._yards ? `${p._yards} jardas` : (p._colorGroup || 'Sem jarda'),
          products: [],
          colors: p._availableColors.map(c => ({ name: c.name, hex: c.hex, in_stock: c.in_stock })),
          hasIssue: p._availableColors.length === 0,
        });
      }
      map.get(key)!.products.push(p);
    }
    return Array.from(map.values()).sort((a, b) => b.products.length - a.products.length);
  }, [colorableProducts, search, filter]);

  const totalProducts = colorableProducts.length;
  const withoutColors = colorableProducts.filter(p => p._availableColors.length === 0).length;

  return (
    <div className="space-y-2.5 pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 -mt-1">
        <button onClick={onBack} className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-xl" aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
            <Palette size={14} className="text-purple-600 shrink-0" />
            Gerenciar Cores
          </h2>
          <p className="text-[11px] text-zinc-500 truncate">
            {totalProducts} produto(s) com variacao de cor · {buckets.length} grupos
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
            placeholder="Buscar grupo ou produto..."
            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
        {([
          { k: 'all',       label: `Todos (${colorableProducts.length})` },
          { k: 'no_colors', label: `Sem cores (${withoutColors})` },
          { k: 'derived',   label: 'Automaticas' },
          { k: 'saved',     label: 'Salvas' },
        ] as const).map(f => (
          <button
            key={f.k}
            onClick={() => setFilter(f.k as any)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold border shrink-0 whitespace-nowrap ${
              filter === f.k
                ? 'bg-purple-600 text-white border-purple-600'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-purple-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {withoutColors > 0 && filter === 'all' && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-[12px] text-red-800 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <strong>{withoutColors} produto(s) sem cor configurada.</strong>
            {' '}Filtre por "Sem cores" para resolver rapidamente.
          </div>
        </div>
      )}

      {/* Lista de buckets */}
      {buckets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-zinc-100 p-8 text-center">
          <Palette size={28} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-sm text-zinc-500">Nenhum grupo encontrado</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {buckets.map(bucket => (
            <BucketCard
              key={bucket.key}
              bucket={bucket}
              onEditGroup={() => onEditGroup(bucket.products)}
              onQuickAdd={() => onQuickAdd(bucket.products)}
              onQuickRemove={() => onQuickRemove(bucket.products)}
              onEditSingle={onEditProduct}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ----------------------- Bucket Card -----------------------

function BucketCard({
  bucket, onEditGroup, onQuickAdd, onQuickRemove, onEditSingle,
}: {
  bucket: GroupBucket;
  onEditGroup: () => void;
  onQuickAdd: () => void;
  onQuickRemove: () => void;
  onEditSingle: (p: ParsedProduct) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const inStockCount = bucket.colors.filter(c => c.in_stock).length;

  return (
    <div className={`bg-white rounded-xl border ${bucket.hasIssue ? 'border-red-200 bg-red-50/30' : 'border-zinc-200'} overflow-hidden`}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full p-3 flex items-center gap-3 text-left hover:bg-zinc-50/50"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          bucket.hasIssue ? 'bg-red-100 text-red-600' : 'bg-purple-100 text-purple-600'
        }`}>
          {bucket.hasIssue
            ? <AlertTriangle size={18} />
            : <Palette size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 flex-wrap">
            <p className="text-sm font-bold text-zinc-900 truncate">{bucket.label}</p>
            <span className="text-[10px] bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded shrink-0">
              {bucket.products.length} produto(s)
            </span>
            <span className="text-[10px] text-zinc-400 shrink-0 flex items-center gap-0.5">
              <Ruler size={9} /> {bucket.subtitle}
            </span>
          </div>
          {bucket.colors.length > 0 ? (
            <div className="flex items-center gap-1 mt-1">
              <div className="flex -space-x-1">
                {bucket.colors.slice(0, 8).map(c => (
                  <span
                    key={c.name}
                    className={`w-3.5 h-3.5 rounded-full border-2 border-white ${!c.in_stock ? 'opacity-30' : ''}`}
                    style={c.hex.startsWith('linear') ? { background: c.hex } : { backgroundColor: c.hex }}
                    title={`${c.name}${c.in_stock ? '' : ' (sem estoque)'}`}
                  />
                ))}
              </div>
              <span className="text-[10px] text-zinc-500 ml-0.5">
                {inStockCount}/{bucket.colors.length} ativas
              </span>
            </div>
          ) : (
            <p className="text-[11px] text-red-600 mt-0.5 font-semibold">Sem cores configuradas</p>
          )}
        </div>
        <ChevronRight
          size={16}
          className={`text-zinc-300 shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-3 pt-2.5 pb-3 bg-zinc-50/30 space-y-2.5">
          {/* Ações em massa para ESTE grupo */}
          <div className="grid grid-cols-3 gap-1.5">
            <button
              onClick={onEditGroup}
              className="px-2 py-2 rounded-xl bg-purple-600 text-white text-[11px] font-bold hover:bg-purple-700 flex items-center justify-center gap-1 min-w-0"
            >
              <Palette size={12} />
              <span className="truncate">Editar</span>
            </button>
            <button
              onClick={onQuickAdd}
              className="px-2 py-2 rounded-xl bg-emerald-600 text-white text-[11px] font-bold hover:bg-emerald-700 flex items-center justify-center gap-1 min-w-0"
            >
              <Plus size={12} />
              <span className="truncate">+ Cor</span>
            </button>
            <button
              onClick={onQuickRemove}
              className="px-2 py-2 rounded-xl bg-red-600 text-white text-[11px] font-bold hover:bg-red-700 flex items-center justify-center gap-1 min-w-0"
            >
              <Minus size={12} />
              <span className="truncate">- Cor</span>
            </button>
          </div>

          {/* Lista dos produtos no grupo (compacta) */}
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
              <Tag size={9} /> Produtos neste grupo
            </p>
            <div className="space-y-1">
              {bucket.products.slice(0, 10).map(p => (
                <button
                  key={p.id}
                  onClick={() => onEditSingle(p)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white border border-zinc-200 hover:border-blue-300 text-left"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                  <span className="text-[11px] text-zinc-700 truncate flex-1 min-w-0">{p.title}</span>
                  <ChevronRight size={12} className="text-zinc-300 shrink-0" />
                </button>
              ))}
              {bucket.products.length > 10 && (
                <p className="text-[10px] text-zinc-400 italic px-2">
                  +{bucket.products.length - 10} produto(s)...
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
