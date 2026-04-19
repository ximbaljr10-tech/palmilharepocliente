import React, { useState } from 'react';
import { TrendingUp, Save, Loader2 } from 'lucide-react';
import { INPUT_CLASS } from './Field';
import type { ParsedProduct } from '../types';

export function QuickRankPopup({
  product, onApply, onClose, saving,
}: {
  product: ParsedProduct;
  onApply: (id: string, rank: number | null) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [rank, setRank] = useState(product._rank !== null ? String(product._rank) : '');

  const apply = () => {
    if (rank.trim() === '') { onApply(product.id, null); return; }
    const n = Number(rank);
    if (!isNaN(n) && n >= 0) onApply(product.id, Math.floor(n));
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-600 shrink-0" />
            <span className="truncate">Definir posicao</span>
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{product.title}</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex gap-2 items-stretch">
            <input
              type="number" inputMode="numeric" min="0" step="1"
              value={rank}
              onChange={e => setRank(e.target.value)}
              className={INPUT_CLASS + ' flex-1 min-w-0'}
              placeholder="Ex: 1, 2, 3..."
              autoFocus
            />
            {rank.trim() !== '' && (
              <button
                onClick={() => setRank('')}
                className="px-3 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-medium shrink-0"
              >
                Limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['1', '2', '3', '5', '10'].map(n => (
              <button
                key={n}
                onClick={() => setRank(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  rank === n
                    ? 'bg-amber-600 text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-amber-50 hover:text-amber-700'
                }`}
              >
                #{n}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-500">
            Menor = mais no topo. Deixe vazio para remover.
          </p>
        </div>
        <div className="px-4 py-3 border-t border-zinc-100 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600"
          >
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={saving}
            className="flex-1 bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
