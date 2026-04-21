import React from 'react';
import { TrendingUp, Medal, Flame } from 'lucide-react';

/**
 * RankPill — mostra a posição manual do produto.
 *
 * A partir desta versão, diferenciamos visualmente 3 faixas — alinhadas com
 * o que é renderizado na Home da loja (`StoreLanding`):
 *   • #1–#3  → "TOP N"     (vermelho, medalha)     — topo da Home
 *   • #4–#6  → "ALTA #N"   (preto, flame)          — faixa "Em Alta"
 *   • #7+    → "#N"        (âmbar, trending)       — ranking genérico
 *
 * Isso deixa óbvio pro admin, sem precisar decorar, o que acontece na loja
 * conforme ele arrasta os produtos.
 */
export function RankPill({ rank }: { rank: number | null }) {
  if (rank === null) return null;

  if (rank >= 1 && rank <= 3) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-red-600 text-white shrink-0"
        title={`TOP ${rank} — aparece no topo da Home`}
      >
        <Medal size={9} />
        TOP {rank}
      </span>
    );
  }

  if (rank >= 4 && rank <= 6) {
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-black bg-zinc-900 text-white shrink-0"
        title={`Em Alta (#${rank}) — aparece na faixa "Em Alta" da Home`}
      >
        <Flame size={9} />
        ALTA #{rank}
      </span>
    );
  }

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
