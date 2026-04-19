import React from 'react';
import { AlertTriangle, Info, Loader2 } from 'lucide-react';

export function ConfirmModal({
  title, message, confirmLabel, cancelLabel = 'Cancelar', danger = false,
  onConfirm, onClose, loading = false,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
            {danger
              ? <AlertTriangle size={18} className="text-red-500" />
              : <Info size={18} className="text-blue-500" />}
            {title}
          </h3>
        </div>
        <div className="px-5 py-4 text-sm text-zinc-600 leading-relaxed break-words">
          {message}
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
