import React, { useMemo, useState } from 'react';
import {
  X, Palette, AlertTriangle, Plus, Save, Loader2, EyeOff, Eye,
} from 'lucide-react';
import { ColorDot } from '../components/ColorDot';
import { ALL_COLORS } from '../types';
import type { ColorItem, ParsedProduct } from '../types';

export function BulkColorEditor({
  products, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  onApply: (updates: { productId: string; colors: ColorItem[] }[]) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { products: ParsedProduct[]; colors: ColorItem[] }>();
    for (const p of products) {
      if (!p._needsColorSelection) continue;
      const key = p._colorConfigKey;
      if (!map.has(key)) map.set(key, { products: [], colors: [...p._availableColors] });
      map.get(key)!.products.push(p);
    }
    return Array.from(map.entries()).map(([key, val]) => ({
      key, products: val.products, originalColors: val.colors,
    }));
  }, [products]);
  const skipped = products.length - groups.reduce((s, g) => s + g.products.length, 0);

  const [groupColors, setGroupColors] = useState<Map<string, ColorItem[]>>(() => {
    const m = new Map<string, ColorItem[]>();
    groups.forEach(g => m.set(g.key, [...g.originalColors]));
    return m;
  });
  const [changedGroups, setChangedGroups] = useState<Set<string>>(new Set());

  const updateGroupColor = (groupKey: string, updater: (colors: ColorItem[]) => ColorItem[]) => {
    setGroupColors(prev => {
      const next = new Map(prev);
      next.set(groupKey, updater(next.get(groupKey) || []));
      return next;
    });
    setChangedGroups(prev => new Set(prev).add(groupKey));
  };

  const handleApply = () => {
    const updates: { productId: string; colors: ColorItem[] }[] = [];
    for (const g of groups) {
      if (changedGroups.has(g.key)) {
        const newColors = groupColors.get(g.key) || [];
        for (const p of g.products) updates.push({ productId: p.id, colors: newColors });
      }
    }
    if (updates.length === 0) { onClose(); return; }
    onApply(updates);
  };

  if (groups.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/50 z-[95] flex items-center justify-center p-3" onClick={onClose}>
        <div className="bg-white rounded-2xl p-5 max-w-sm" onClick={e => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-500 shrink-0" />
            <div>
              <p className="font-bold text-zinc-900 text-sm">Nenhum produto elegivel</p>
              <p className="text-[12px] text-zinc-600 mt-1">
                Os produtos selecionados nao aceitam variacao de cor
                (linhas 50/100/200j, carretilhas, camisas, bones).
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="mt-4 w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold"
          >
            Entendi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-4 py-3 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Palette size={18} className="text-purple-600 shrink-0" />
              <span className="truncate">Editar Cores em Massa</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {products.length - skipped} produto(s) em {groups.length} grupo(s)
              {skipped > 0 && <span className="text-amber-600"> - {skipped} sem cor ignorado(s)</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 rounded-xl shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {groups.map((group, gi) => {
            const colors = groupColors.get(group.key) || [];
            const isChanged = changedGroups.has(group.key);
            return (
              <div
                key={group.key}
                className={`rounded-xl border ${isChanged ? 'border-purple-300 bg-purple-50/30' : 'border-zinc-200 bg-zinc-50/50'} p-3 space-y-2.5`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Grupo {gi + 1} - {group.products.length} produto(s)
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {group.products.slice(0, 3).map(p => (
                        <span
                          key={p.id}
                          className="text-[10px] bg-white text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200 truncate max-w-[140px]"
                        >
                          {p.title}
                        </span>
                      ))}
                      {group.products.length > 3 && (
                        <span className="text-[10px] text-zinc-400 px-1.5 py-0.5">
                          +{group.products.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                  {isChanged && (
                    <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold shrink-0">
                      Modificado
                    </span>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Cores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.length === 0
                      ? <span className="text-[11px] text-zinc-400 italic">Sem cores</span>
                      : colors.map(c => (
                        <div
                          key={c.name}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${
                            c.in_stock
                              ? 'bg-white border-zinc-200 text-zinc-700'
                              : 'bg-red-50 border-red-200 text-red-500'
                          }`}
                        >
                          <ColorDot name={c.name} hex={c.hex} />
                          <span className={!c.in_stock ? 'line-through' : ''}>{c.name}</span>
                          <button
                            onClick={() => updateGroupColor(group.key, prev =>
                              prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc)
                            )}
                            className={`p-0.5 ${c.in_stock ? 'text-zinc-400' : 'text-emerald-500'}`}
                            aria-label="Alternar estoque"
                          >
                            {c.in_stock ? <EyeOff size={11} /> : <Eye size={11} />}
                          </button>
                          <button
                            onClick={() => updateGroupColor(group.key, prev => prev.filter(cc => cc.name !== c.name))}
                            className="p-0.5 text-zinc-300 hover:text-red-500"
                            aria-label="Remover"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ))}
                  </div>
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Adicionar</p>
                  <div className="flex flex-wrap gap-1">
                    {ALL_COLORS.filter(ac => !colors.find(c => c.name === ac.name)).map(ac => (
                      <button
                        key={ac.name}
                        onClick={() => updateGroupColor(group.key, prev =>
                          [...prev, { name: ac.name, hex: ac.hex, in_stock: true }]
                        )}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600"
                      >
                        <Plus size={10} />
                        <ColorDot name={ac.name} hex={ac.hex} />
                        <span>{ac.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-4 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={handleApply}
            disabled={saving || changedGroups.size === 0}
            className="flex-1 bg-purple-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 min-w-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="truncate">
              {saving ? 'Salvando...' : `Salvar (${changedGroups.size})`}
            </span>
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 shrink-0"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
