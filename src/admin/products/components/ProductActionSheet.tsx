import React from 'react';
import { Pencil, TrendingUp, Globe, GlobeLock, Package } from 'lucide-react';
import { StatusDot } from './StatusDot';
import { RankPill } from './RankPill';
import { ActionRow } from './ActionRow';
import type { ParsedProduct } from '../types';

export function ProductActionSheet({
  product, onClose, onEdit, onStatusChange, onQuickRank, saving,
}: {
  product: ParsedProduct;
  onClose: () => void;
  onEdit: (p: ParsedProduct) => void;
  onStatusChange: (id: string, s: string) => void;
  onQuickRank: (id: string) => void;
  saving: boolean;
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

        <div className="px-4 pb-3 border-b border-zinc-100 flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
            {product.images?.[0]?.url
              ? <img src={product.images[0].url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package size={14} /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-zinc-900 truncate">{product.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <StatusDot status={product.status} />
              <span className="text-[10px] text-zinc-500">R$ {product._priceDisplay}</span>
              {product._rank !== null && <RankPill rank={product._rank} />}
            </div>
          </div>
        </div>

        <div className="py-1">
          <ActionRow
            icon={<Pencil size={16} className="text-blue-600" />}
            label="Editar produto"
            onClick={() => { onClose(); onEdit(product); }}
          />
          <ActionRow
            icon={<TrendingUp size={16} className="text-amber-600" />}
            label={product._rank !== null ? `Posicao: #${product._rank}` : 'Definir posicao'}
            onClick={() => { onClose(); onQuickRank(product.id); }}
          />
          {product.status === 'published' ? (
            <ActionRow
              icon={<GlobeLock size={16} className="text-amber-600" />}
              label="Despublicar (virar rascunho)"
              onClick={() => { onStatusChange(product.id, 'draft'); onClose(); }}
              disabled={saving}
            />
          ) : (
            <ActionRow
              icon={<Globe size={16} className="text-emerald-600" />}
              label="Publicar na loja"
              onClick={() => { onStatusChange(product.id, 'published'); onClose(); }}
              disabled={saving}
            />
          )}
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
