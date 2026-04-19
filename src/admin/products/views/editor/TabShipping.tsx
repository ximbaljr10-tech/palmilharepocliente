import React from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { Field, INPUT_CLASS } from '../../components/Field';

export interface TabShippingProps {
  title: string;
  shHeight: string; setShHeight: (v: string) => void;
  shWidth: string; setShWidth: (v: string) => void;
  shLength: string; setShLength: (v: string) => void;
  shWeight: string; setShWeight: (v: string) => void;
}

export function TabShipping({
  title,
  shHeight, setShHeight, shWidth, setShWidth,
  shLength, setShLength, shWeight, setShWeight,
}: TabShippingProps) {
  const m = title?.match(/([0-9]+)\s*UNIDADES?/i);
  const unidades = m ? parseInt(m[1], 10) : 1;
  const peso = Number(shWeight) || 0;
  const pesoPorUnidade = unidades > 0 ? peso / unidades : 0;
  const alerta = unidades >= 2 && peso > 0 && pesoPorUnidade < 0.04;

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <Field label="Altura (cm)">
          <input type="number" inputMode="decimal" step="0.1" min="0"
            value={shHeight} onChange={e => setShHeight(e.target.value)}
            className={INPUT_CLASS} placeholder="12" />
        </Field>
        <Field label="Largura (cm)">
          <input type="number" inputMode="decimal" step="0.1" min="0"
            value={shWidth} onChange={e => setShWidth(e.target.value)}
            className={INPUT_CLASS} placeholder="12" />
        </Field>
        <Field label="Comprimento (cm)">
          <input type="number" inputMode="decimal" step="0.1" min="0"
            value={shLength} onChange={e => setShLength(e.target.value)}
            className={INPUT_CLASS} placeholder="19" />
        </Field>
        <Field label="Peso (kg)">
          <input type="number" inputMode="decimal" step="0.01" min="0"
            value={shWeight} onChange={e => setShWeight(e.target.value)}
            className={INPUT_CLASS} placeholder="0.5" />
        </Field>
      </div>
      {alerta && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <div>
            <strong>Peso suspeito:</strong> {unidades} unidades com {peso} kg
            ({(pesoPorUnidade * 1000).toFixed(1)} g/unidade).
          </div>
        </div>
      )}
      <p className="text-[10px] text-zinc-400 flex items-start gap-1">
        <Info size={10} className="shrink-0 mt-0.5" />
        Dimensoes usadas pelo SuperFrete. Para packs, pese o pacote completo.
      </p>
    </>
  );
}
