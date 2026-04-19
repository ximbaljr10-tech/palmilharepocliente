import React from 'react';
import { Globe, TrendingUp, Palette, Plus, Minus } from 'lucide-react';
import { ActionRow } from './ActionRow';

export function BulkActionSheet({
  count, onClose, onOpenStatus, onOpenColors, onOpenAddColor, onOpenRemoveColor, onOpenRank,
}: {
  count: number;
  onClose: () => void;
  onOpenStatus: () => void;
  onOpenColors: () => void;
  onOpenAddColor: () => void;
  onOpenRemoveColor: () => void;
  onOpenRank: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md overflow-hidden animate-slide-up-bar"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span className="block w-10 h-1 bg-zinc-300 rounded-full" />
        </div>
        <div className="px-4 pb-3 border-b border-zinc-100">
          <h3 className="text-sm font-bold text-zinc-900">Acoes em massa</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">
            {count} produto{count > 1 ? 's' : ''} selecionado{count > 1 ? 's' : ''}
          </p>
        </div>
        <div className="py-1">
          <ActionRow
            icon={<Globe size={16} className="text-blue-600" />}
            label="Publicar / Despublicar"
            onClick={() => { onClose(); onOpenStatus(); }}
          />
          <ActionRow
            icon={<TrendingUp size={16} className="text-amber-600" />}
            label="Definir posicao (ranking)"
            onClick={() => { onClose(); onOpenRank(); }}
          />
          <ActionRow
            icon={<Palette size={16} className="text-purple-600" />}
            label="Editar cores (avancado)"
            onClick={() => { onClose(); onOpenColors(); }}
          />
          <ActionRow
            icon={<Plus size={16} className="text-emerald-600" />}
            label="Adicionar cor rapidamente"
            onClick={() => { onClose(); onOpenAddColor(); }}
          />
          <ActionRow
            icon={<Minus size={16} className="text-red-600" />}
            label="Remover cor rapidamente"
            onClick={() => { onClose(); onOpenRemoveColor(); }}
          />
        </div>
        <div className="px-4 pt-2 pb-3 border-t border-zinc-100">
          <button
            onClick={onClose}
            className="w-full py-3 rounded-xl text-sm font-bold border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
