import React from 'react';
import { Eye, EyeOff } from 'lucide-react';

export const INPUT_CLASS =
  'w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white';

export function Field({
  label, required, icon, children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

export function StatusButton({
  active, onClick, variant,
}: {
  active: boolean;
  onClick: () => void;
  variant: 'pub' | 'draft';
}) {
  const cfg = variant === 'pub'
    ? { label: 'Publicado', icon: <Eye size={14} />, activeClass: 'bg-emerald-600 text-white border-emerald-600' }
    : { label: 'Rascunho',  icon: <EyeOff size={14} />, activeClass: 'bg-amber-500 text-white border-amber-500' };
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 px-2 rounded-xl text-xs font-bold border transition-all min-w-0 flex items-center justify-center gap-1.5 ${
        active ? cfg.activeClass + ' shadow-sm' : 'bg-white text-zinc-600 border-zinc-200'
      }`}
    >
      {cfg.icon}
      {cfg.label}
    </button>
  );
}
