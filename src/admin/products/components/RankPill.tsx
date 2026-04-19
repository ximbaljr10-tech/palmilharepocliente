import React from 'react';
import { TrendingUp } from 'lucide-react';

export function RankPill({ rank }: { rank: number | null }) {
  if (rank === null) return null;
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 shrink-0"
      title={`Posicao ${rank}`}
    >
      <TrendingUp size={9} />
      #{rank}
    </span>
  );
}
