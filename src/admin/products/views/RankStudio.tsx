// ============================================================================
// RankStudio - Gerenciar ranking/ordem de produtos de forma simples
// Mostra 3 caminhos: por grupo, por jarda, ou geral.
// Dentro de cada, entra em modo Reorder.
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, TrendingUp, ChevronRight, ListOrdered,
  Ruler, Tag, LayoutGrid, Search, Package,
} from 'lucide-react';
import type { ParsedProduct } from '../types';

type RankScope = 'all' | 'group' | 'yard';

export interface RankStudioProps {
  products: ParsedProduct[];
  onBack: () => void;
  onOpenReorder: (products: ParsedProduct[], label: string) => void;
}

export function RankStudio({ products, onBack, onOpenReorder }: RankStudioProps) {
  const [scope, setScope] = useState<RankScope>('group');
  const [search, setSearch] = useState('');

  // Groups
  const groups = useMemo(() => {
    const map = new Map<string, ParsedProduct[]>();
    for (const p of products) {
      if (!map.has(p._group)) map.set(p._group, []);
      map.get(p._group)!.push(p);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [products]);

  // Yards
  const yards = useMemo(() => {
    const map = new Map<string, ParsedProduct[]>();
    for (const p of products) {
      const key = p._yards === null ? 'none' : String(p._yards);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return Array.from(map.entries())
      .map(([key, items]) => ({
        key,
        label: key === 'none' ? 'Sem jarda' : `${key} jardas`,
        yards: key === 'none' ? null : Number(key),
        items,
      }))
      .sort((a, b) => {
        if (a.yards === null) return 1;
        if (b.yards === null) return -1;
        return a.yards - b.yards;
      });
  }, [products]);

  const withRankCount = products.filter(p => p._rank !== null).length;

  return (
    <div className="space-y-2.5 pb-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 -mt-1">
        <button onClick={onBack} className="p-1.5 text-zinc-500 hover:bg-zinc-100 rounded-xl" aria-label="Voltar">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-amber-600 shrink-0" />
            Ajustar Ranking
          </h2>
          <p className="text-[11px] text-zinc-500 truncate">
            {withRankCount} com rank · {products.length - withRankCount} sem rank
          </p>
        </div>
      </div>

      {/* Explicação simples */}
      <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5 text-[12px] text-amber-900">
        <p className="font-bold mb-1 flex items-center gap-1.5">
          <ListOrdered size={13} /> Como funciona
        </p>
        <p className="text-[11px] leading-relaxed">
          Escolha uma <strong>categoria</strong> e arraste os produtos na ordem que voce quer que apareçam na loja.
          O produto no topo = posicao #1.
        </p>
      </div>

      {/* Atalho: reordenar tudo */}
      <button
        onClick={() => onOpenReorder(products, 'Todos os produtos')}
        className="w-full bg-zinc-900 text-white rounded-2xl p-3 flex items-center gap-3 hover:bg-zinc-800 active:scale-[0.99]"
      >
        <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shrink-0">
          <LayoutGrid size={18} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-bold">Reordenar TUDO</p>
          <p className="text-[11px] text-white/70 truncate">
            Arrasta todos os {products.length} produtos juntos
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-white/70" />
      </button>

      {/* Scope switcher */}
      <div className="flex gap-1.5">
        <ScopeBtn active={scope === 'group'} label={`Por Grupo (${groups.length})`} icon={<Tag size={12} />} onClick={() => setScope('group')} />
        <ScopeBtn active={scope === 'yard'}  label={`Por Jarda (${yards.length})`}  icon={<Ruler size={12} />} onClick={() => setScope('yard')} />
      </div>

      {/* Search */}
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar categoria..."
            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
        </div>
      </div>

      {/* Lista conforme scope */}
      <div className="space-y-1.5">
        {scope === 'group' && groups
          .filter(g => !search || g.name.toLowerCase().includes(search.toLowerCase()))
          .map(g => (
            <CategoryCard
              key={g.name}
              label={g.name}
              subtitle={`${g.items.length} produto(s)`}
              withRank={g.items.filter(p => p._rank !== null).length}
              onClick={() => onOpenReorder(g.items, g.name)}
              icon={<Tag size={18} />}
            />
          ))}

        {scope === 'yard' && yards
          .filter(y => !search || y.label.toLowerCase().includes(search.toLowerCase()))
          .map(y => (
            <CategoryCard
              key={y.key}
              label={y.label}
              subtitle={`${y.items.length} produto(s)`}
              withRank={y.items.filter(p => p._rank !== null).length}
              onClick={() => onOpenReorder(y.items, y.label)}
              icon={<Ruler size={18} />}
            />
          ))}
      </div>
    </div>
  );
}

function ScopeBtn({
  active, label, icon, onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-semibold border transition-all flex items-center justify-center gap-1.5 min-w-0 ${
        active
          ? 'bg-amber-600 text-white border-amber-600'
          : 'bg-white text-zinc-600 border-zinc-200'
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function CategoryCard({
  label, subtitle, withRank, onClick, icon,
}: {
  label: string;
  subtitle: string;
  withRank: number;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-xl border border-zinc-200 p-3 flex items-center gap-3 text-left hover:border-amber-300 active:scale-[0.99]"
    >
      <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900 truncate">{label}</p>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className="text-[11px] text-zinc-500 truncate">{subtitle}</span>
          {withRank > 0 && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0">
              <TrendingUp size={9} /> {withRank} com rank
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-zinc-300 shrink-0" />
    </button>
  );
}
