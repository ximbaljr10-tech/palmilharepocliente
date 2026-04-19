import React, { useState } from 'react';
import {
  ArrowLeft, ListOrdered, Loader2, Save, Package,
  ArrowUp, ArrowDown, ChevronUp, ChevronDown,
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

  const move = (idx: number, to: number) => {
    if (to < 0 || to >= order.length) return;
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
            {title}
          </h2>
          <p className="text-[10px] text-zinc-500 truncate">
            {order.length} produto(s) - use as setas para reorganizar
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
        A ordem aqui vira a posicao na loja. Primeiro = <strong>#1</strong> (topo), segundo = #2, e assim por diante.
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-2 py-2">
          {order.map((p, idx) => {
            const image = p.images?.[0]?.url || p.thumbnail || '';
            return (
              <div key={p.id} className="bg-white rounded-xl border border-zinc-200 mb-1.5 p-2 flex items-center gap-2 shadow-sm">
                <div className="shrink-0 w-9 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Pos</span>
                  <span className="text-lg font-black text-amber-600 leading-none">{idx + 1}</span>
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
