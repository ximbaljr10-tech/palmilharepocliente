import React, { useState } from 'react';
import { X, Info, Check, Plus, Minus, Loader2 } from 'lucide-react';
import { ColorDot } from '../components/ColorDot';
import { ALL_COLORS } from '../types';
import type { ParsedProduct } from '../types';

export function QuickBulkColorModal({
  products, action, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  action: 'add' | 'remove';
  onApply: (productIds: string[], colorNames: string[], action: 'add' | 'remove') => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const eligible = products.filter(p => p._needsColorSelection);
  const skipped = products.length - eligible.length;
  const toggleColor = (name: string) =>
    setSelectedColors(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base truncate">
              {action === 'add' ? 'Adicionar Cores' : 'Remover Cores'}
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {eligible.length} produto(s) receberao a acao
              {skipped > 0 && <span className="text-amber-600"> - {skipped} ignorado(s)</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 rounded-xl shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {skipped > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 mb-3 flex items-start gap-2">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>{skipped} produto(s) sem variacao de cor serao pulados.</span>
            </div>
          )}
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">
            Selecione as cores
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_COLORS.map(c => {
              const isSelected = selectedColors.includes(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => toggleColor(c.name)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  <ColorDot name={c.name} hex={c.hex} />
                  {c.name}
                  {isSelected && <Check size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-zinc-100 px-4 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={() => onApply(eligible.map(p => p.id), selectedColors, action)}
            disabled={saving || selectedColors.length === 0 || eligible.length === 0}
            className={`flex-1 text-white px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 min-w-0 ${
              action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving
              ? <Loader2 size={16} className="animate-spin" />
              : action === 'add' ? <Plus size={16} /> : <Minus size={16} />}
            <span className="truncate">
              {saving
                ? 'Aplicando...'
                : `${action === 'add' ? 'Add' : 'Remover'} ${selectedColors.length} em ${eligible.length}`}
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
