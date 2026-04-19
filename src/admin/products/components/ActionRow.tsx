import React from 'react';
import { ChevronRight } from 'lucide-react';

export function ActionRow({
  icon, label, onClick, disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-50 disabled:opacity-50 transition-colors"
    >
      <span className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <span className="text-sm font-medium text-zinc-800 flex-1 min-w-0 truncate">{label}</span>
      <ChevronRight size={14} className="text-zinc-300 shrink-0" />
    </button>
  );
}
