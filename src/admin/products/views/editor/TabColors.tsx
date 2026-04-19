import React from 'react';
import {
  Palette, Info, Eye, EyeOff, Plus, Trash2,
} from 'lucide-react';
import { SKIP_COLOR_YARDS } from '../../../../types';
import { ColorDot } from '../../components/ColorDot';
import { ALL_COLORS } from '../../types';
import type { ColorItem, ParsedProduct } from '../../types';

export interface TabColorsProps {
  product: ParsedProduct | null;
  colors: ColorItem[];
  setColors: React.Dispatch<React.SetStateAction<ColorItem[]>>;
  colorChanged: boolean;
  setColorChanged: (v: boolean) => void;
  currentYards: number | null;
  showColorSection: boolean;
}

export function TabColors({
  product, colors, setColors, colorChanged, setColorChanged,
  currentYards, showColorSection,
}: TabColorsProps) {
  if (!showColorSection) {
    return (
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 text-center">
        <div className="w-12 h-12 rounded-full bg-zinc-200 mx-auto mb-3 flex items-center justify-center">
          <Palette size={20} className="text-zinc-400" />
        </div>
        <p className="text-sm font-bold text-zinc-700 mb-1">
          Este produto nao usa variacao de cor
        </p>
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          {currentYards !== null && SKIP_COLOR_YARDS.includes(currentYards)
            ? `Linhas de ${currentYards} jardas sao vendidas como "sortida" — o cliente nao escolhe cor.`
            : 'Produtos sem jardas detectadas (carretilhas, camisas, bones) nao mostram cores para o cliente.'}
        </p>
      </div>
    );
  }

  return (
    <>
      {product?._colorSource === 'derived' && !colorChanged && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 text-[11px] text-blue-700 flex items-start gap-2">
          <Info size={12} className="shrink-0 mt-0.5" />
          <span>
            Cores pre-preenchidas automaticamente (linha <strong>{product._colorGroup || 'padrao'}</strong>).
            Edite e salve para personalizar.
          </span>
        </div>
      )}

      <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-2xl p-3">
        <p className="text-[10px] font-bold text-purple-600 uppercase tracking-wider mb-2 flex items-center gap-1">
          <Eye size={10} /> Preview na loja
        </p>
        <div className="flex flex-wrap gap-1.5">
          {colors.filter(c => c.in_stock).length === 0 ? (
            <span className="text-[11px] text-purple-400 italic">O cliente nao vera cores disponiveis</span>
          ) : colors.filter(c => c.in_stock).map(c => (
            <span
              key={c.name}
              className="flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-purple-200 text-[11px] font-medium text-zinc-700"
            >
              <ColorDot name={c.name} hex={c.hex} size="md" />
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
          Cores configuradas ({colors.length})
        </p>
        {colors.length === 0 ? (
          <p className="text-[11px] text-zinc-400 italic py-2">Sem cores. Adicione abaixo.</p>
        ) : (
          <div className="space-y-1.5">
            {colors.map(c => (
              <div
                key={c.name}
                className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${
                  c.in_stock ? 'bg-white border-zinc-200' : 'bg-red-50 border-red-200'
                }`}
              >
                <ColorDot name={c.name} hex={c.hex} size="lg" />
                <span className={`flex-1 min-w-0 text-sm font-medium truncate ${
                  c.in_stock ? 'text-zinc-800' : 'text-red-400 line-through'
                }`}>
                  {c.name}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${
                  c.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'
                }`}>
                  {c.in_stock ? 'Em estoque' : 'Sem estoque'}
                </span>
                <button
                  onClick={() => {
                    setColors(prev => prev.map(cc =>
                      cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc
                    ));
                    setColorChanged(true);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-blue-600 shrink-0"
                  aria-label="Alternar estoque"
                  title="Alternar estoque"
                >
                  {c.in_stock ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => {
                    setColors(prev => prev.filter(cc => cc.name !== c.name));
                    setColorChanged(true);
                  }}
                  className="p-1.5 text-zinc-400 hover:text-red-500 shrink-0"
                  aria-label="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {ALL_COLORS.some(ac => !colors.find(c => c.name === ac.name)) && (
        <div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">
            Adicionar cor
          </p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_COLORS.filter(ac => !colors.find(c => c.name === ac.name)).map(ac => (
              <button
                key={ac.name}
                onClick={() => {
                  setColors(prev => [...prev, { name: ac.name, hex: ac.hex, in_stock: true }]);
                  setColorChanged(true);
                }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-600 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50"
              >
                <Plus size={11} />
                <ColorDot name={ac.name} hex={ac.hex} size="md" />
                <span>{ac.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {colorChanged && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-3 py-2 text-[11px] text-purple-700 flex items-center gap-2">
          <Info size={12} className="shrink-0" />
          Cores sao salvas quando voce clicar em <strong>Salvar</strong> no topo.
        </div>
      )}
    </>
  );
}
