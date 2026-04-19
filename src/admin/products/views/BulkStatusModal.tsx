import React, { useState } from 'react';
import { Globe, GlobeLock, ChevronRight, Loader2 } from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import type { ParsedProduct } from '../types';

export function BulkStatusModal({
  products, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  onApply: (productIds: string[], newStatus: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const [confirmUnpub, setConfirmUnpub] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
        <div
          className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-4 py-3 border-b border-zinc-100">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Globe size={18} className="text-blue-600 shrink-0" />
              <span className="truncate">Publicar / Despublicar</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {products.length} produto(s): {publishedCount} pub, {draftCount} rascunho
            </p>
          </div>
          <div className="px-4 py-4 space-y-2">
            <button
              onClick={() => onApply(products.map(p => p.id), 'published')}
              disabled={saving}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Globe size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Publicar todos</p>
                <p className="text-[11px] text-zinc-500 truncate">
                  {products.length} produto(s) visiveis na loja
                </p>
              </div>
              {saving
                ? <Loader2 size={16} className="animate-spin text-zinc-400 shrink-0" />
                : <ChevronRight size={16} className="text-zinc-300 shrink-0" />}
            </button>
            <button
              onClick={() => setConfirmUnpub(true)}
              disabled={saving}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <GlobeLock size={18} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Despublicar todos</p>
                <p className="text-[11px] text-zinc-500 truncate">Ocultar da loja (rascunho)</p>
              </div>
              <ChevronRight size={16} className="text-zinc-300 shrink-0" />
            </button>
          </div>
          <div className="px-4 py-3 border-t border-zinc-100">
            <button
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {confirmUnpub && (
        <ConfirmModal
          title="Despublicar produtos?"
          message={
            <>
              Voce esta prestes a <strong>despublicar {products.length} produto(s)</strong>.
              Eles ficarao ocultos da loja publica ate serem publicados novamente.
            </>
          }
          confirmLabel="Sim, despublicar"
          danger
          loading={saving}
          onConfirm={() => {
            setConfirmUnpub(false);
            onApply(products.map(p => p.id), 'draft');
          }}
          onClose={() => setConfirmUnpub(false)}
        />
      )}
    </>
  );
}
