// ============================================================================
// ReorderMode - Reordena produtos via DRAG-AND-DROP real (touch + mouse)
// ----------------------------------------------------------------------------
// - Handle (grip) à esquerda de cada item inicia o drag.
// - Touch: long-press curto no grip captura e arrasta suavemente no mobile.
// - Desktop: HTML5 drag-and-drop nativo.
// - Fallback: setas ↑/↓ e topo/base ainda disponíveis para acessibilidade
//   e para quando o gesto de arrastar não for conveniente.
//
// O ranking persiste como 1..N em `metadata.rank` via applyReorder
// (useBulkActions) — nenhuma API nova foi introduzida.
// ============================================================================

import React, { useRef, useState } from 'react';
import {
  ArrowLeft, ListOrdered, Loader2, Save, Package,
  ArrowUp, ArrowDown, ChevronUp, ChevronDown, GripVertical,
} from 'lucide-react';
import { StatusDot } from '../components/StatusDot';
import type { ParsedProduct } from '../types';

export function ReorderMode({
  products, onCancel, onSave, saving, title = 'Reordenar produtos',
}: {
  products: ParsedProduct[];
  onCancel: () => void;
  onSave: (ordered: ParsedProduct[]) => void;
  saving: boolean;
  title?: string;
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

  // índice do item sendo arrastado e do hover (para visual feedback)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  // refs para manipulação de touch custom
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

  // --------------------- HTML5 DnD (desktop) ---------------------
  const onDragStart = (e: React.DragEvent, idx: number) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    // precisa setar algum dado pro FF aceitar o drag
    try { e.dataTransfer.setData('text/plain', String(idx)); } catch (_) {}
  };
  const onDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (overIdx !== idx) setOverIdx(idx);
  };
  const onDragLeave = () => {
    // não zera o overIdx instantaneamente — fica o último
  };
  const onDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) { setDragIdx(null); setOverIdx(null); return; }
    move(dragIdx, idx);
    setDragIdx(null);
    setOverIdx(null);
  };
  const onDragEnd = () => { setDragIdx(null); setOverIdx(null); };

  // --------------------- Touch DnD (mobile) ---------------------
  // Só inicia quando o toque acontece NO handle (grip). O handle tem
  // touch-action: none para não conflitar com o scroll.
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
    e.preventDefault(); // evita scroll enquanto arrasta
    const t = e.touches[0];
    if (!t) return;

    // descobre em qual item está o ponto do dedo
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

  // Marca visual quando estamos reordenando o "Destaque da Home" — aí as
  // posições 1–3 e 4–6 ganham rótulo especial.
  const isHomeScope = /destaque da home|top 3|em alta/i.test(title);

  return (
    <div className="fixed inset-0 bg-zinc-50 z-40 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-zinc-200 px-3 py-2.5 flex items-center gap-2 shrink-0 shadow-sm">
        <button
          onClick={onCancel}
          className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl shrink-0"
          aria-label="Cancelar"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
            <ListOrdered size={14} className="text-amber-600 shrink-0" />
            <span className="truncate">{title}</span>
          </h2>
          <p className="text-[10px] text-zinc-500 truncate">
            {order.length} produto(s) • arraste o <strong>•⋮•</strong> ou use as setas
          </p>
        </div>
        {dirty && (
          <button
            onClick={reset}
            className="px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-100 shrink-0"
          >
            Desfazer
          </button>
        )}
        <button
          onClick={() => onSave(order)}
          disabled={!dirty || saving}
          className="bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar ordem
        </button>
      </div>

      <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[11px] text-amber-900 shrink-0">
        A ordem aqui vira a posição na loja. Primeiro = <strong>#1</strong> (topo), segundo = #2, e assim por diante.
        {isHomeScope && (
          <span className="block mt-1 text-[10px] text-amber-800/90">
            Nesta tela: <strong>posições 1–3 = TOP da Home</strong>, <strong>4–6 = Em Alta</strong>.
          </span>
        )}
      </div>

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

            // Classe visual:
            //  - item sendo arrastado: opaco e levemente escalado
            //  - item alvo (hover): linha indicadora
            const rowClass = [
              'bg-white rounded-xl border mb-1.5 p-2 flex items-center gap-2 shadow-sm',
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
                {/* DRAG HANDLE — único elemento que dispara drag por toque */}
                <button
                  type="button"
                  onTouchStart={(e) => onTouchStart(e, idx)}
                  className="shrink-0 w-8 h-10 flex items-center justify-center text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-md cursor-grab active:cursor-grabbing touch-manipulation"
                  style={{ touchAction: 'none' }}
                  aria-label="Arrastar para reordenar"
                  title="Arrastar para reordenar"
                >
                  <GripVertical size={18} />
                </button>

                <div className="shrink-0 w-10 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Pos</span>
                  <span className="text-lg font-black text-amber-600 leading-none">{idx + 1}</span>
                  {isHomeScope && idx < 3 && (
                    <span className="mt-0.5 text-[8px] font-black uppercase tracking-wider bg-red-600 text-white px-1 rounded leading-none py-[1px]">TOP</span>
                  )}
                  {isHomeScope && idx >= 3 && idx < 6 && (
                    <span className="mt-0.5 text-[8px] font-black uppercase tracking-wider bg-zinc-900 text-white px-1 rounded leading-none py-[1px]">ALTA</span>
                  )}
                </div>

                <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                  {image
                    ? <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package size={12} /></div>}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-zinc-900 truncate">{p.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <StatusDot status={p.status} />
                    <span className="text-[10px] text-zinc-500">R$ {p._priceDisplay}</span>
                    {p._yards && <span className="text-[10px] text-zinc-400">{p._yards}j</span>}
                    {p._fio && <span className="text-[10px] text-zinc-400">fio {p._fio}</span>}
                  </div>
                </div>

                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Subir"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === order.length - 1}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Descer"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveTop(idx)}
                    disabled={idx === 0}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Ao topo"
                    title="Topo"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveBottom(idx)}
                    disabled={idx === order.length - 1}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Ao final"
                    title="Base"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
