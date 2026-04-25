// ============================================================================
// TabStock - Gestao de estoque do produto
// 2026-04-25: Novo componente para FRENTE 2 - ESTOQUE
// ============================================================================

import React from 'react';
import { Package, Infinity as InfinityIcon, AlertTriangle } from 'lucide-react';
import { Field, INPUT_CLASS } from '../../components/Field';

export function TabStock({
  unlimited, setUnlimited,
  stock, setStock,
}: {
  unlimited: boolean;
  setUnlimited: (v: boolean) => void;
  stock: string;
  setStock: (v: string) => void;
}) {
  const stockNumber = Number(stock);
  const stockInvalid = !unlimited && (stock !== '' && (isNaN(stockNumber) || stockNumber < 0));
  const isOutOfStock = !unlimited && stock !== '' && stockNumber === 0;

  return (
    <div className="space-y-4">
      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 space-y-3">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={unlimited}
            onChange={(e) => setUnlimited(e.target.checked)}
            className="w-5 h-5 rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <div className="flex items-center gap-2 flex-1">
            <InfinityIcon size={16} className="text-blue-600" />
            <div>
              <p className="text-sm font-semibold text-zinc-900">Estoque ilimitado</p>
              <p className="text-[11px] text-zinc-500">
                Produto sempre disponivel para compra
              </p>
            </div>
          </div>
        </label>
      </div>

      {!unlimited && (
        <div>
          <Field label="Quantidade em estoque">
            <div className="relative">
              <Package
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              />
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="Ex: 10"
                className={`${INPUT_CLASS} pl-10`}
              />
            </div>
          </Field>
          <p className="text-[11px] text-zinc-500 mt-1">
            0 = produto esgotado (bloqueia compra)
          </p>
        </div>
      )}

      {stockInvalid && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="text-red-600 shrink-0 mt-0.5" />
          <p className="text-xs text-red-700">Quantidade deve ser um numero &gt;= 0</p>
        </div>
      )}

      {isOutOfStock && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-800">
            <strong>Produto esgotado</strong> — clientes nao poderao comprar enquanto o estoque for 0.
          </div>
        </div>
      )}

      <p className="text-[11px] text-zinc-500 leading-relaxed">
        <strong>Como funciona:</strong> a cada venda concluida, o estoque e descontado automaticamente.
        Se o estoque chegar a zero, o produto aparece como &quot;esgotado&quot; no site e o botao de
        comprar fica desabilitado.
      </p>
    </div>
  );
}
