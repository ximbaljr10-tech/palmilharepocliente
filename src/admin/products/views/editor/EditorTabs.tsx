import React from 'react';
import { Package, Camera, Palette, TrendingUp, Ruler } from 'lucide-react';
import type { EditorTab } from '../../types';

export function EditorTabs({
  current, onChange, errors,
}: {
  current: EditorTab;
  onChange: (t: EditorTab) => void;
  errors: Partial<Record<EditorTab, boolean>>;
}) {
  const tabs: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
    { id: 'info',     label: 'Info',     icon: <Package size={14} /> },
    { id: 'images',   label: 'Imagens',  icon: <Camera size={14} /> },
    { id: 'colors',   label: 'Cores',    icon: <Palette size={14} /> },
    { id: 'rank',     label: 'Posicao',  icon: <TrendingUp size={14} /> },
    { id: 'shipping', label: 'Frete',    icon: <Ruler size={14} /> },
  ];
  return (
    <div
      className="flex gap-1 overflow-x-auto scrollbar-hide px-2 py-2 bg-zinc-50 border-b border-zinc-200"
      role="tablist"
    >
      {tabs.map(t => {
        const active = current === t.id;
        const hasError = errors[t.id];
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all relative ${
              active
                ? 'bg-white text-blue-700 border border-blue-200 shadow-sm'
                : 'bg-transparent text-zinc-500 hover:bg-white/60 hover:text-zinc-700'
            }`}
          >
            {t.icon}
            {t.label}
            {hasError && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}
