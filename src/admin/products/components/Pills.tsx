// ============================================================================
// Pills - Reusable pill components for filters and modes
// ============================================================================

import React from 'react';

export function StatTile({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: 'zinc' | 'emerald' | 'amber' | 'blue';
}) {
  const tones: Record<string, string> = {
    zinc:    'border-zinc-100 text-zinc-800',
    emerald: 'border-emerald-100 text-emerald-700',
    amber:   'border-amber-100 text-amber-700',
    blue:    'border-blue-100 text-blue-700',
  };
  const labelTones: Record<string, string> = {
    zinc:    'text-zinc-400',
    emerald: 'text-emerald-500',
    amber:   'text-amber-500',
    blue:    'text-blue-500',
  };
  return (
    <div className={`bg-white rounded-xl border ${tones[tone]} px-2 py-1.5 text-center min-w-0`}>
      <p className={`text-[9px] font-bold ${labelTones[tone]} uppercase tracking-wider truncate`}>{label}</p>
      <p className="text-base font-bold truncate">{value}</p>
    </div>
  );
}

export function ModePill({
  active, onClick, icon, label, accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: 'amber';
}) {
  const base = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all shrink-0 whitespace-nowrap';
  const activeStyle = accent === 'amber'
    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
    : 'bg-zinc-900 text-white border-zinc-900 shadow-sm';
  const inactive = accent === 'amber'
    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300';
  return (
    <button onClick={onClick} className={`${base} ${active ? activeStyle : inactive}`}>
      {icon}
      {label}
    </button>
  );
}

export function FilterPill({
  active, onClick, icon, label, tone,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  tone?: 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const base = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all shrink-0 whitespace-nowrap';
  const activeColors: Record<string, string> = {
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    amber:   'bg-amber-600 text-white border-amber-600',
    red:     'bg-red-600 text-white border-red-600',
    blue:    'bg-blue-600 text-white border-blue-600',
    default: 'bg-zinc-900 text-white border-zinc-900',
  };
  const inactiveColors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    red:     'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    blue:    'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    default: 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300',
  };
  const key = tone || 'default';
  return (
    <button onClick={onClick} className={`${base} ${active ? activeColors[key] : inactiveColors[key]}`}>
      {icon}
      {label}
    </button>
  );
}
