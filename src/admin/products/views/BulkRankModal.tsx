import React, { useState } from 'react';
import {
  X, TrendingUp, ListOrdered, Hash, Check, Save, Loader2,
} from 'lucide-react';
import { Field, INPUT_CLASS } from '../components/Field';
import type { ParsedProduct } from '../types';

function ModeCard({
  active, onClick, icon, title, desc, danger = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
}) {
  const activeClass = danger ? 'border-red-300 bg-red-50' : 'border-amber-400 bg-amber-50';
  return (
    <button
      onClick={onClick}
      className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
        active ? activeClass : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        danger ? 'bg-red-100 text-red-600' : active ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'
      }`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900">{title}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{desc}</p>
      </div>
      {active && <Check size={16} className={danger ? 'text-red-500 shrink-0' : 'text-amber-600 shrink-0'} />}
    </button>
  );
}

export function BulkRankModal({
  products, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  onApply: (
    productIds: string[],
    rankOrOpts: number | null | { __sequential: true; start: number }
  ) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [mode, setMode] = useState<'set' | 'clear' | 'sequential'>('sequential');
  const [rankValue, setRankValue] = useState('1');
  const [startValue, setStartValue] = useState('1');

  const handleApply = () => {
    if (mode === 'clear') { onApply(products.map(p => p.id), null); return; }
    if (mode === 'set') {
      const n = Number(rankValue);
      if (isNaN(n) || n < 0) return;
      onApply(products.map(p => p.id), Math.floor(n));
      return;
    }
    const start = Number(startValue);
    if (isNaN(start) || start < 0) return;
    onApply(products.map(p => p.id), { __sequential: true, start: Math.floor(start) });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-amber-600 shrink-0" />
              <span className="truncate">Posicao em massa</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">{products.length} produto(s)</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 rounded-xl shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <ModeCard
            active={mode === 'sequential'}
            onClick={() => setMode('sequential')}
            icon={<ListOrdered size={16} />}
            title="Sequencial (recomendado)"
            desc="Primeiro selecionado = #1, segundo = #2..."
          />
          <ModeCard
            active={mode === 'set'}
            onClick={() => setMode('set')}
            icon={<Hash size={16} />}
            title="Mesmo numero para todos"
            desc="Todos recebem a mesma posicao."
          />
          <ModeCard
            active={mode === 'clear'}
            onClick={() => setMode('clear')}
            icon={<X size={16} />}
            title="Limpar posicao"
            desc="Remove o rank - volta a ordem padrao."
            danger
          />

          {mode === 'set' && (
            <Field label="Posicao">
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={rankValue}
                onChange={e => setRankValue(e.target.value)}
                className={INPUT_CLASS}
                placeholder="1"
              />
            </Field>
          )}
          {mode === 'sequential' && (
            <Field label="Comecar em">
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={startValue}
                onChange={e => setStartValue(e.target.value)}
                className={INPUT_CLASS}
                placeholder="1"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Produtos na ordem atual viram {startValue || '?'},
                {' '}{Number(startValue) + 1 || '?'},
                {' '}{Number(startValue) + 2 || '?'}...
              </p>
            </Field>
          )}
        </div>

        <div className="border-t border-zinc-100 px-4 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex-1 bg-amber-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 min-w-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="truncate">
              {saving
                ? 'Aplicando...'
                : mode === 'clear'
                  ? 'Limpar'
                  : mode === 'set'
                    ? `Aplicar #${rankValue}`
                    : 'Aplicar sequencial'}
            </span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 shrink-0"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
