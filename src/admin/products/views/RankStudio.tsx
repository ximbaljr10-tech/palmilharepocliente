// ============================================================================
// RankStudio - Gerenciar ranking/ordem de produtos de forma simples
// Mostra caminhos: por grupo, por jarda, ou destaques da Home.
// Dentro de cada, entra em modo Reorder (drag & drop real).
// ============================================================================

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, TrendingUp, ChevronRight, ListOrdered,
  Ruler, Tag, Search, Flame, Medal,
} from 'lucide-react';
import type { ParsedProduct } from '../types';

type RankScope = 'all' | 'group' | 'yard';

// 2026-04-25: persistir scope+busca entre navegacoes.
// Quando o operador volta ao RankStudio apos editar um produto, o scope
// e a busca ficam como estavam — nao precisa refazer filtros.
const RANK_SCOPE_KEY = 'ddt_admin_rank_scope';
const RANK_SEARCH_KEY = 'ddt_admin_rank_search';

function loadScope(): RankScope {
  try {
    const v = localStorage.getItem(RANK_SCOPE_KEY);
    if (v === 'group' || v === 'yard' || v === 'all') return v;
  } catch {}
  return 'group';
}
function loadSearch(): string {
  try { return localStorage.getItem(RANK_SEARCH_KEY) || ''; } catch { return ''; }
}

export interface RankStudioProps {
  products: ParsedProduct[];
  onBack: () => void;
  onOpenReorder: (products: ParsedProduct[], label: string) => void;
}

export function RankStudio({ products, onBack, onOpenReorder }: RankStudioProps) {
  const [scope, setScopeState] = useState<RankScope>(() => loadScope());
  const [search, setSearchState] = useState(() => loadSearch());

  const setScope = (s: RankScope) => {
    setScopeState(s);
    try { localStorage.setItem(RANK_SCOPE_KEY, s); } catch {}
  };
  const setSearch = (v: string) => {
    setSearchState(v);
    try { localStorage.setItem(RANK_SEARCH_KEY, v); } catch {}
  };

  // Produtos publicados para fluxo de destaque (Home).
  // Para "Em Alta / Top 3" pegamos apenas publicados — faz sentido na loja.
  const publishedProducts = useMemo(
    () => products.filter(p => p.status === 'published'),
    [products]
  );

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
  const publishedWithRank = publishedProducts.filter(p => p._rank !== null).length;

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
          Arraste o item pela alça <strong>⋮⋮</strong> (ou use as setas) para reordenar.
          O produto no <strong>topo = posição #1</strong>. Na Home da loja, os 3 primeiros
          viram <strong>TOP 1-3</strong> e os 3 seguintes viram a faixa <strong>"Em Alta"</strong>.
        </p>
      </div>

      {/* DESTAQUE: Home (Top 3 + Em Alta) — atalho principal */}
      <button
        onClick={() => onOpenReorder(publishedProducts, 'Destaque da Home (Top 3 + Em Alta)')}
        className="w-full bg-gradient-to-br from-red-600 to-amber-600 text-white rounded-2xl p-3 flex items-center gap-3 shadow-sm hover:shadow-md active:scale-[0.99] transition-all"
      >
        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
          <Flame size={18} />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <Medal size={13} /> Destaque da Home
          </p>
          <p className="text-[11px] text-white/90 truncate">
            Defina TOP 1–3 + Em Alta • {publishedProducts.length} publicados, {publishedWithRank} com rank
          </p>
        </div>
        <ChevronRight size={18} className="shrink-0 text-white/80" />
      </button>

      {/* 2026-04-25: removido botao "Reordenar TUDO" — nao fazia sentido
          ordenar rascunhos junto com publicados. O usuario escolhe por
          grupo ou por jarda abaixo. */}

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
