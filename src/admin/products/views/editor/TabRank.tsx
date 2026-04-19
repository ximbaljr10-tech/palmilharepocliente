import React from 'react';
import { TrendingUp, Hash } from 'lucide-react';
import { Field, INPUT_CLASS } from '../../components/Field';

export interface TabRankProps {
  rank: string;
  setRank: (v: string) => void;
}

export function TabRank({ rank, setRank }: TabRankProps) {
  return (
    <>
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-sm font-bold text-amber-900 flex items-center gap-2 mb-1">
          <TrendingUp size={16} /> Como funciona a posicao manual
        </p>
        <ul className="text-[11px] text-amber-800 leading-relaxed space-y-1 pl-4 list-disc">
          <li><strong>Menor numero = mais no topo</strong> (1 aparece antes de 5).</li>
          <li>Vazio = <strong>sem prioridade</strong> (ordem normal da loja).</li>
          <li>So afeta ordem <strong>dentro da mesma lista</strong> (mesma jarda/categoria).</li>
          <li>Use o <strong>modo Ordenar</strong> na lista para reorganizar visualmente.</li>
        </ul>
      </div>

      <Field label="Posicao" icon={<Hash size={11} />}>
        <div className="flex gap-2 items-stretch">
          <input
            type="number" inputMode="numeric" min="0" step="1"
            value={rank}
            onChange={e => setRank(e.target.value)}
            className={INPUT_CLASS + ' flex-1 min-w-0'}
            placeholder="Ex: 1 (topo), 2, 3..."
          />
          {rank.trim() !== '' && (
            <button
              onClick={() => setRank('')}
              className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 hover:text-red-600 text-xs font-medium shrink-0"
            >
              Limpar
            </button>
          )}
        </div>
        {rank.trim() !== '' && !isNaN(Number(rank)) && (
          <div className="mt-3 bg-white border border-amber-200 rounded-xl px-3 py-2.5 text-[11px] text-amber-900 flex items-center gap-2">
            <TrendingUp size={12} className="shrink-0" />
            <span>Este produto aparecera na <strong>posicao #{rank}</strong> nas listagens.</span>
          </div>
        )}
      </Field>

      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Atalhos</p>
        <div className="flex flex-wrap gap-1.5">
          {['1', '2', '3', '5', '10', '20'].map(n => (
            <button
              key={n}
              onClick={() => setRank(n)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                rank === n
                  ? 'bg-amber-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-amber-50 hover:text-amber-700 border border-zinc-200'
              }`}
            >
              #{n}
            </button>
          ))}
          <button
            onClick={() => setRank('')}
            className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              rank === ''
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 border border-zinc-200'
            }`}
          >
            Sem rank
          </button>
        </div>
      </div>
    </>
  );
}
