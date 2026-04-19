import React from 'react';
import { Check, AlertTriangle, X } from 'lucide-react';

export function Toast({
  message, type, onClose,
}: {
  message: string;
  type: 'success' | 'error';
  onClose: () => void;
}) {
  return (
    <div
      className={`fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[120] rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2 text-sm font-medium ${
        type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
      role="status"
    >
      {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      <span className="flex-1 min-w-0 break-words">{message}</span>
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/20 rounded-lg shrink-0"
        aria-label="Fechar"
      >
        <X size={14} />
      </button>
    </div>
  );
}
