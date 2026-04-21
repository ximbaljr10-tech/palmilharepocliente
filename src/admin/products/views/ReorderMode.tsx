// ============================================================================
// ReorderMode - Reordena produtos via DRAG-AND-DROP real (touch + mouse)
// ----------------------------------------------------------------------------
// FIX 2026-04-20:
//   - Botão Salvar agora é FIXO no rodapé (sempre visível, jamais some)
//   - Botão Voltar grande e claro no header
//   - Nome completo do produto visível ao clicar (expandível)
//   - Busca funciona sem perder a ordem real
//   - Botão "Abrir produto" abre o editor diretamente
//   - Mobile-first, sem scroll horizontal
// ============================================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ListOrdered, Loader2, Save, Package,
  ArrowUp, ArrowDown, ChevronUp, ChevronDown, GripVertical,
  Search, X, Pencil, Eye, RotateCcw,
} from 'lucide-react';
import { StatusDot } from '../components/StatusDot';
import type { ParsedProduct } from '../types';

export function ReorderMode({
  products, onCancel, onSave, saving, title = 'Reordenar produtos',
  onEditProduct,
}: {
  products: ParsedProduct[];
  onCancel: () => void;
  onSave: (ordered: ParsedProduct[]) => void;
  saving: boolean;
  title?: string;
  onEditProduct?: (p: ParsedProduct) => void;
}) {
  const initialOrder = () => {
    return [...products].sort((a, b) => {
      const ra = a._rank, rb = b._rank;
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    });
  };
  const [order, setOrder] = useState<ParsedProduct[]>(initialOrder);
  const [dirty, setDirty] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const listRef = useRef<HTMLDivElement | null>(null);
  const touchDragRef = useRef<{
    startY: number;
    currentIdx: number;
    elHeight: number;
  } | null>(null);

  const move = (idx: number, to: number) => {
    if (to < 0 || to >= order.length || to === idx) return;
    setOrder(prev => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  };
  const moveTop = (idx: number) => move(idx, 0);
  const moveBottom = (idx: number) => move(idx, order.length - 1);
  const reset = () => { setOrder(initialOrder()); setDirty(false); };

  // ----- HTML5 DnD (desktop) -----
  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) {}
  };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIdx !== idx) setOverIdx(idx);
  };
  const onDragLeave = () => {};
  const onDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    move(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  // ----- Touch DnD (mobile) -----
  const onTouchStart = (e: React.TouchEvent, idx: number) => {
    const t = e.touches[0];
    if (!t) return;
    const row = (e.currentTarget as HTMLElement).closest('[data-row="1"]') as HTMLElement | null;
    const h = row ? row.getBoundingClientRect().height : 60;
    touchDragRef.current = { startY: t.clientY, currentIdx: idx, elHeight: h };
    setDragIdx(idx);
    setOverIdx(idx);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const ref = touchDragRef.current;
    if (!ref || !listRef.current) return;
    e.preventDefault();
    const t = e.touches[0];
    if (!t) return;
    const rows = listRef.current.querySelectorAll<HTMLElement>('[data-row="1"]');
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (t.clientY >= r.top && t.clientY <= r.bottom) {
        if (overIdx !== i) setOverIdx(i);
        break;
      }
    }
  };
  const onTouchEnd = () => {
    const ref = touchDragRef.current;
    if (ref && overIdx !== null && overIdx !== ref.currentIdx) {
      move(ref.currentIdx, overIdx);
    }
    touchDragRef.current = null;
    setDragIdx(null);
    setOverIdx(null);
  };

  const isHomeScope = /destaque da home|top 3|em alta/i.test(title);

  // Count visible items when searching
  const visibleCount = useMemo(() => {
    if (!search) return order.length;
    const q = search.toLowerCase().trim();
    return order.filter(p =>
      p.title?.toLowerCase().includes(q) ||
      p.handle?.toLowerCase().includes(q) ||
      p._group?.toLowerCase().includes(q)
    ).length;
  }, [order, search]);

  return (
    <div className="fixed inset-0 bg-zinc-50 z-40 flex flex-col overflow-hidden">
      {/* ===== HEADER ===== */}
      <div className="bg-white border-b border-zinc-200 px-3 py-2.5 flex items-center gap-2 shrink-0 shadow-sm">
        <button
          onClick={onCancel}
          className="flex items-center gap-1.5 px-3 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl shrink-0 font-medium text-xs"
          aria-label="Voltar"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Voltar</span>
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
            <ListOrdered size={14} className="text-amber-600 shrink-0" />
            <span className="truncate">{title}</span>
          </h2>
          <p className="text-[10px] text-zinc-500 truncate">
            {order.length} produto(s) {dirty && '· alterado'}
          </p>
        </div>
        {dirty && (
          <button
            onClick={reset}
            className="px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-100 shrink-0 flex items-center gap-1"
          >
            <RotateCcw size={12} />
            Desfazer
          </button>
        )}
      </div>

      {/* ===== INFO BANNER ===== */}
      <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[11px] text-amber-900 shrink-0">
        Arraste pela alca <strong>⋮⋮</strong> ou use as setas. Primeiro = <strong>#1</strong> (topo).
        {isHomeScope && (
          <span className="block mt-0.5 text-[10px] text-amber-800/90">
            <strong>Posicoes 1-3 = TOP da Home</strong>, <strong>4-6 = Em Alta</strong>. Salve para aplicar na loja.
          </span>
        )}
      </div>

      {/* ===== SEARCH ===== */}
      <div className="bg-white border-b border-zinc-200 px-3 py-2 shrink-0">
        <div className="flex items-center gap-2 bg-zinc-50 rounded-xl px-3 py-1.5 border border-zinc-200 focus-within:border-amber-400 focus-within:bg-white transition-colors">
          <Search size={14} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar produto por nome..."
            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="p-0.5 text-zinc-400 hover:text-zinc-600 shrink-0"
              aria-label="Limpar busca"
            >
              <X size={14} />
            </button>
          )}
        </div>
        {search && (
          <p className="text-[10px] text-zinc-400 mt-1 px-1">
            Mostrando {visibleCount} de {order.length} • a ordem real nao muda com a busca
          </p>
        )}
      </div>

      {/* ===== LIST ===== */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div
          ref={listRef}
          className="max-w-2xl mx-auto px-2 py-2"
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          {order.map((p, idx) => {
            const image = p.images?.[0]?.url || p.thumbnail || '';
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;

            if (search) {
              const q = search.toLowerCase().trim();
              const hit =
                p.title?.toLowerCase().includes(q) ||
                p.handle?.toLowerCase().includes(q) ||
                p._group?.toLowerCase().includes(q);
              if (!hit) return null;
            }
            const isExpanded = expandedId === p.id;

            const rowClass = [
              'bg-white rounded-xl border mb-1.5 p-2 flex items-center gap-1.5 shadow-sm',
              'transition-all duration-150',
              isDragging ? 'opacity-40 scale-[0.98] border-amber-400' : 'border-zinc-200',
              isOver ? 'ring-2 ring-amber-400 border-amber-400' : '',
            ].join(' ');

            return (
              <div
                key={p.id}
                data-row="1"
                draggable
                onDragStart={(e) => onDragStart(e, idx)}
                onDragOver={(e) => onDragOver(e, idx)}
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e, idx)}
                onDragEnd={onDragEnd}
                className={rowClass}
              >
                {/* DRAG HANDLE */}
                <button
                  type="button"
                  onTouchStart={(e) => onTouchStart(e, idx)}
                  className="shrink-0 w-7 h-10 flex items-center justify-center text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-md cursor-grab active:cursor-grabbing touch-manipulation"
                  style={{ touchAction: 'none' }}
                  aria-label="Arrastar para reordenar"
                >
                  <GripVertical size={16} />
                </button>

                {/* POSITION */}
                <div className="shrink-0 w-8 flex flex-col items-center">
                  <span className="text-lg font-black text-amber-600 leading-none">{idx + 1}</span>
                  {isHomeScope && idx < 3 && (
                    <span className="mt-0.5 text-[7px] font-black uppercase tracking-wider bg-red-600 text-white px-1 rounded leading-none py-[1px]">TOP</span>
                  )}
                  {isHomeScope && idx >= 3 && idx < 6 && (
                    <span className="mt-0.5 text-[7px] font-black uppercase tracking-wider bg-zinc-900 text-white px-1 rounded leading-none py-[1px]">ALTA</span>
                  )}
                </div>

                {/* IMAGE */}
                <div className="w-9 h-9 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                  {image
                    ? <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package size={10} /></div>}
                </div>

                {/* NAME + INFO */}
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                  className="flex-1 min-w-0 text-left"
                  title={p.title}
                >
                  <p className={`text-[11px] font-semibold text-zinc-900 leading-tight ${isExpanded ? 'whitespace-normal break-words' : 'line-clamp-2'}`}>
                    {p.title}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                    <StatusDot status={p.status} />
                    <span className="text-[10px] text-zinc-500">R$ {p._priceDisplay}</span>
                    {p._yards && <span className="text-[10px] text-zinc-400">{p._yards}j</span>}
                    {p._rank !== null && (
                      <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1 rounded">
                        rank #{p._rank}
                      </span>
                    )}
                  </div>
                </button>

                {/* EDIT BUTTON */}
                {onEditProduct && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (dirty) {
                        const ok = window.confirm(
                          'Voce tem reordenacoes nao salvas. Se abrir o produto agora, essas mudancas serao perdidas. Deseja continuar?'
                        );
                        if (!ok) return;
                      }
                      onEditProduct(p);
                    }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 touch-manipulation"
                    aria-label="Abrir produto"
                    title="Editar produto"
                  >
                    <Pencil size={12} />
                  </button>
                )}

                {/* ARROWS */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveTop(idx)}
                    disabled={idx === 0}
                    className="w-6 h-5 flex items-center justify-center rounded bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-20 touch-manipulation text-[10px]"
                    aria-label="Ao topo"
                    title="Topo"
                  >
                    <ChevronUp size={12} />
                  </button>
                  <button
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-6 h-5 flex items-center justify-center rounded bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-20 touch-manipulation"
                    aria-label="Subir"
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === order.length - 1}
                    className="w-6 h-5 flex items-center justify-center rounded bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-20 touch-manipulation"
                    aria-label="Descer"
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    onClick={() => moveBottom(idx)}
                    disabled={idx === order.length - 1}
                    className="w-6 h-5 flex items-center justify-center rounded bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-20 touch-manipulation"
                    aria-label="Ao final"
                    title="Base"
                  >
                    <ChevronDown size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== FIXED FOOTER - SAVE BUTTON (ALWAYS VISIBLE) ===== */}
      <div
        className="bg-white border-t border-zinc-200 px-3 py-2.5 shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-2">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-bold border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={() => onSave(order)}
            disabled={!dirty || saving}
            className={`flex-[2] py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
              dirty
                ? 'bg-amber-600 text-white hover:bg-amber-700 shadow-lg shadow-amber-600/30'
                : 'bg-zinc-200 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Salvando...' : dirty ? 'Salvar Ordem' : 'Sem alteracoes'}
          </button>
        </div>
        {dirty && (
          <p className="text-center text-[10px] text-amber-600 font-medium mt-1.5">
            Voce tem alteracoes nao salvas. Clique em "Salvar Ordem" para aplicar.
          </p>
        )}
      </div>
    </div>
  );
}
