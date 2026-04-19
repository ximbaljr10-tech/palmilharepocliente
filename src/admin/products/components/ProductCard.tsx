import React from 'react';
import {
  CheckSquare, Square, Package, Palette, MoreHorizontal,
} from 'lucide-react';
import { StatusDot } from './StatusDot';
import type { ParsedProduct } from '../types';

export function ProductCard({
  product, isSelected, onToggleSelect, onOpenActions, onEdit, selectionMode,
}: {
  product: ParsedProduct;
  isSelected: boolean;
  onToggleSelect: () => void;
  onOpenActions: (p: ParsedProduct) => void;
  onEdit: (p: ParsedProduct) => void;
  selectionMode: boolean;
}) {
  const image = product.images?.[0]?.url || product.thumbnail || '';
  const isMulticolor = product._isLine && !product._needsColorSelection;
  const inStockColors = product._availableColors.filter(c => c.in_stock);

  return (
    <div
      className={`flex items-stretch gap-2 px-2.5 py-2.5 border-b border-zinc-100 last:border-b-0 transition-colors ${
        isSelected ? 'bg-blue-50/60' : 'hover:bg-zinc-50/50'
      }`}
    >
      {selectionMode && (
        <button
          onClick={onToggleSelect}
          className="shrink-0 flex items-center touch-manipulation px-1"
          aria-label="Selecionar"
        >
          {isSelected
            ? <CheckSquare size={20} className="text-blue-600" />
            : <Square size={20} className="text-zinc-300" />}
        </button>
      )}

      <button
        onClick={() => onEdit(product)}
        className="w-14 h-14 rounded-xl overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200 relative touch-manipulation"
        aria-label="Editar produto"
      >
        {image ? (
          <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-zinc-300">
            <Package size={18} />
          </div>
        )}
        {product._rank !== null && (
          <span className="absolute top-0 left-0 bg-amber-500 text-white text-[10px] font-bold px-1.5 rounded-br-lg leading-4">
            #{product._rank}
          </span>
        )}
      </button>

      <button
        onClick={() => onEdit(product)}
        className="flex-1 min-w-0 text-left touch-manipulation"
      >
        <p className="text-[13px] font-semibold text-zinc-900 leading-tight line-clamp-2 break-words">
          {product.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
          <StatusDot status={product.status} />
          <span className="text-[11px] font-bold text-zinc-700">R$ {product._priceDisplay}</span>
          {product._yards && (
            <span className="text-[10px] text-zinc-500 bg-zinc-100 px-1.5 py-0.5 rounded">{product._yards}j</span>
          )}
          {product._stock !== null && product._stock <= 0 && (
            <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-semibold">
              Sem estoque
            </span>
          )}
          {isMulticolor && (
            <span className="text-[9px] bg-gradient-to-r from-red-100 via-yellow-100 to-blue-100 text-zinc-700 px-1.5 py-0.5 rounded font-medium border border-zinc-200/50">
              Multicor
            </span>
          )}
        </div>
        {product._isLine && product._needsColorSelection && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap min-w-0">
            <Palette size={10} className="text-purple-500 shrink-0" />
            <div className="flex -space-x-1 shrink-0">
              {inStockColors.slice(0, 6).map(c => (
                <span
                  key={c.name}
                  className="w-3.5 h-3.5 rounded-full border-2 border-white"
                  style={c.hex.startsWith('linear') ? { background: c.hex } : { backgroundColor: c.hex }}
                  title={c.name}
                />
              ))}
            </div>
            <span className="text-[10px] text-zinc-500 shrink-0">
              {inStockColors.length}/{product._availableColors.length}
            </span>
            {product._colorSource === 'derived' && (
              <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded border border-blue-200/60 font-medium shrink-0">
                Auto
              </span>
            )}
          </div>
        )}
      </button>

      <button
        onClick={() => onOpenActions(product)}
        className="shrink-0 p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl self-start touch-manipulation"
        aria-label="Acoes"
      >
        <MoreHorizontal size={18} />
      </button>
    </div>
  );
}
