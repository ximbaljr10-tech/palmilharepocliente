import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, Save, X, Loader2, RefreshCw, Palette, Plus, Minus,
  ChevronDown, ChevronRight, Check, CheckSquare, Square,
  Eye, EyeOff, Filter, Package, Layers, AlertTriangle,
  ArrowUpDown, MinusSquare, Edit3, Globe, GlobeLock,
  Archive, RotateCcw, Trash2, MoreHorizontal, SlidersHorizontal,
  ChevronUp, Copy, Tag
} from 'lucide-react';
import { adminFetch } from './adminApi';
import { LINE_COLORS, getColorsForProduct, getColorGroupName, isNylonEsportiva, isKingLine, needsColorSelection } from '../types';

// ============ TYPES ============
interface ColorItem {
  name: string;
  hex: string;
  in_stock: boolean;
}

interface ProductData {
  id: string;
  title: string;
  handle: string;
  description: string;
  status: string;
  metadata: Record<string, any>;
  thumbnail: string;
  images: { url: string }[];
  variants: any[];
}

interface ParsedProduct extends ProductData {
  _group: string;
  _yards: number | null;
  _fio: string | null;
  _price: number;
  _priceDisplay: string;
  _stock: number | null;
  _colorGroup: string;
  _availableColors: ColorItem[];
  _isLine: boolean;
  _needsColorSelection: boolean;
  _colorConfigKey: string; // key for grouping identical color configurations
}

// ============ ALL POSSIBLE COLORS ============
const ALL_COLORS: { name: string; hex: string }[] = [
  { name: 'Preta', hex: '#1a1a1a' },
  { name: 'Branca', hex: '#f5f5f5' },
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Amarela', hex: '#eab308' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Lilas', hex: '#a855f7' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Cinza', hex: '#9ca3af' },
  { name: 'Marrom', hex: '#92400e' },
  { name: 'Multicor', hex: 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6)' },
  { name: 'Vermelha', hex: '#ef4444' },
];

function getColorHex(name: string): string {
  const c = ALL_COLORS.find(c => c.name.toLowerCase() === name.toLowerCase());
  return c?.hex || '#9ca3af';
}

// ============ PRODUCT PARSING ============
function parseProduct(p: ProductData): ParsedProduct {
  const title = p.title || '';
  const metadata = p.metadata || {};
  const variant = p.variants?.[0];

  // Extract yards
  const yardsMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
  const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : null;

  // Extract fio
  const fioMatch = title.match(/[Ff]io\s+([\d.]+)/);
  const fio = fioMatch ? fioMatch[1] : null;

  // Determine group
  let group = 'Outros';
  const titleUpper = title.toUpperCase();
  if (/CARRETILHA/i.test(titleUpper)) group = 'Carretilhas';
  else if (/CAMIS/i.test(titleUpper)) group = 'Camisas';
  else if (/BON[EÉ]/i.test(titleUpper)) group = 'Bones';
  else if (/MALETA/i.test(titleUpper)) group = 'Acessorios';
  else if (/KING\s*SHARK/i.test(titleUpper)) group = 'King Shark';
  else if (/SHARK\s*ATTACK/i.test(titleUpper)) group = 'Shark Attack';
  else if (/INDON[EÉ]SIA/i.test(titleUpper) || (/\.50/i.test(titleUpper) && /FAMOSA/i.test(titleUpper))) group = 'Indonesia .50';
  else if (/LINHA\s*PURA|PURA/i.test(titleUpper) && !(/CARRETILHA|CAMIS|BON/i.test(titleUpper))) group = 'Linha Pura';
  else if (yards !== null) group = 'Dente de Tubarao';

  const isLine = yards !== null;

  // Price
  const allPrices = variant?.prices || [];
  const brlPrice = allPrices.find((pr: any) => pr.currency_code === 'brl');
  const priceFromAdmin = brlPrice || allPrices[0];
  const priceFromStore = variant?.calculated_price?.calculated_amount;
  let price = 0;
  let priceDisplay = '--';
  if (priceFromStore != null) {
    price = Number(priceFromStore);
    priceDisplay = price.toFixed(2).replace('.', ',');
  } else if (priceFromAdmin?.amount != null) {
    price = Number(priceFromAdmin.amount);
    priceDisplay = price.toFixed(2).replace('.', ',');
  }

  // Stock
  const stock = variant?.inventory_quantity ?? null;

  // Color group detection
  const fakeProduct = { title, handle: p.handle, yards, metadata } as any;
  const colorGroup = getColorGroupName(fakeProduct);
  const availableColors: ColorItem[] = metadata.available_colors || [];

  // Check if needs color selection (same logic as store)
  const fakeForColorCheck = { title, handle: p.handle, yards, metadata } as any;
  const needsColor = needsColorSelection(fakeForColorCheck);

  // Build a config key for intelligent grouping
  const colorConfigKey = availableColors
    .map(c => `${c.name}:${c.in_stock ? '1' : '0'}`)
    .sort()
    .join('|') || 'NONE';

  return {
    ...p,
    _group: group,
    _yards: yards,
    _fio: fio,
    _price: price,
    _priceDisplay: priceDisplay,
    _stock: stock,
    _colorGroup: colorGroup,
    _availableColors: availableColors,
    _isLine: isLine,
    _needsColorSelection: needsColor,
    _colorConfigKey: colorConfigKey,
  };
}

// ============ SMALL REUSABLE COMPONENTS ============

function ColorDot({ name, hex, size = 'sm' }: { name: string; hex: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'w-3 h-3', md: 'w-4 h-4', lg: 'w-5 h-5' };
  const isGradient = hex.startsWith('linear');
  const isWhite = hex === '#f5f5f5';
  return (
    <span
      className={`${sizes[size]} rounded-full shrink-0 inline-block ${isWhite ? 'border border-zinc-300' : 'border border-zinc-200/50'}`}
      style={isGradient ? { background: hex } : { backgroundColor: hex }}
      title={name}
    />
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'published') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Publicado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/60">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Rascunho
    </span>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div className={`fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[100] rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2 text-sm font-medium animate-slide-up-bar ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
    }`}>
      {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      <span className="flex-1">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg"><X size={14} /></button>
    </div>
  );
}

// ============ INTELLIGENT BULK COLOR EDITOR ============
// Groups products by identical color configs and shows grouped editing cards
function BulkColorEditor({ products, onApply, onClose, saving }: {
  products: ParsedProduct[];
  onApply: (updates: { productId: string; colors: ColorItem[] }[]) => void;
  onClose: () => void;
  saving: boolean;
}) {
  // Group products by their color configuration key
  const groups = useMemo(() => {
    const map = new Map<string, { products: ParsedProduct[]; colors: ColorItem[] }>();
    for (const p of products) {
      const key = p._colorConfigKey;
      if (!map.has(key)) {
        map.set(key, { products: [], colors: [...p._availableColors] });
      }
      map.get(key)!.products.push(p);
    }
    return Array.from(map.entries()).map(([key, val]) => ({
      key,
      products: val.products,
      originalColors: val.colors,
    }));
  }, [products]);

  // State: editable colors per group
  const [groupColors, setGroupColors] = useState<Map<string, ColorItem[]>>(() => {
    const m = new Map();
    groups.forEach(g => m.set(g.key, [...g.originalColors]));
    return m;
  });

  const [changedGroups, setChangedGroups] = useState<Set<string>>(new Set());

  const updateGroupColor = (groupKey: string, updater: (colors: ColorItem[]) => ColorItem[]) => {
    setGroupColors(prev => {
      const next = new Map(prev);
      const current = next.get(groupKey) as ColorItem[] | undefined;
      next.set(groupKey, updater(current || []));
      return next;
    });
    setChangedGroups(prev => new Set(prev).add(groupKey));
  };

  const handleApply = () => {
    const updates: { productId: string; colors: ColorItem[] }[] = [];
    for (const g of groups) {
      if (changedGroups.has(g.key)) {
        const newColors = groupColors.get(g.key) || [];
        for (const p of g.products) {
          updates.push({ productId: p.id, colors: newColors });
        }
      }
    }
    if (updates.length === 0) {
      onClose();
      return;
    }
    onApply(updates);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[85vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Palette size={18} className="text-purple-600" />
              Editar Cores em Massa
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {products.length} produto(s) em {groups.length} grupo(s) de configuracao
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {groups.map((group, gi) => {
            const colors = groupColors.get(group.key) || [];
            const isChanged = changedGroups.has(group.key);

            return (
              <div key={group.key} className={`rounded-xl border ${isChanged ? 'border-purple-300 bg-purple-50/30' : 'border-zinc-200 bg-zinc-50/50'} p-4 space-y-3`}>
                {/* Group header */}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                      Grupo {gi + 1} - {group.products.length} produto(s)
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {group.products.slice(0, 3).map(p => (
                        <span key={p.id} className="text-[10px] bg-white text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200 truncate max-w-[150px]">
                          {p.title}
                        </span>
                      ))}
                      {group.products.length > 3 && (
                        <span className="text-[10px] text-zinc-400 px-1.5 py-0.5">
                          +{group.products.length - 3} mais
                        </span>
                      )}
                    </div>
                  </div>
                  {isChanged && (
                    <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">
                      Modificado
                    </span>
                  )}
                </div>

                {/* Current colors as editable chips */}
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Cores Atuais</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.length === 0 ? (
                      <span className="text-[11px] text-zinc-400 italic">Sem cores definidas</span>
                    ) : colors.map(c => (
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
                          className={`p-0.5 rounded ${c.in_stock ? 'text-zinc-400 hover:text-amber-600' : 'text-emerald-500 hover:text-emerald-700'}`}
                          title={c.in_stock ? 'Marcar sem estoque' : 'Marcar em estoque'}
                        >
                          {c.in_stock ? <EyeOff size={11} /> : <Eye size={11} />}
                        </button>
                        <button
                          onClick={() => updateGroupColor(group.key, prev => prev.filter(cc => cc.name !== c.name))}
                          className="p-0.5 text-zinc-300 hover:text-red-500"
                          title="Remover cor"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add colors */}
                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Adicionar Cores</p>
                  <div className="flex flex-wrap gap-1">
                    {ALL_COLORS.filter(ac => !colors.find(c => c.name === ac.name)).map(ac => (
                      <button
                        key={ac.name}
                        onClick={() => updateGroupColor(group.key, prev => [...prev, { name: ac.name, hex: ac.hex, in_stock: true }])}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-colors"
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

        {/* Footer */}
        <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-5 py-4 flex items-center gap-3 shrink-0">
          <button
            onClick={handleApply}
            disabled={saving || changedGroups.size === 0}
            className="flex-1 bg-purple-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Salvando...' : `Salvar Alteracoes (${changedGroups.size} grupo${changedGroups.size > 1 ? 's' : ''})`}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ BULK STATUS MODAL ============
function BulkStatusModal({ products, onApply, onClose, saving }: {
  products: ParsedProduct[];
  onApply: (productIds: string[], newStatus: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
            <Globe size={18} className="text-blue-600" />
            Alterar Status em Massa
          </h3>
          <p className="text-xs text-zinc-500 mt-0.5">
            {products.length} produto(s) selecionado(s): {publishedCount} publicado(s), {draftCount} rascunho(s)
          </p>
        </div>

        <div className="px-5 py-5 space-y-3">
          {/* Publish all */}
          <button
            onClick={() => onApply(products.map(p => p.id), 'published')}
            disabled={saving}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 group-hover:bg-emerald-200 transition-colors">
              <Globe size={20} className="text-emerald-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-zinc-900">Publicar Todos</p>
              <p className="text-[11px] text-zinc-500">
                Todos os {products.length} produtos ficarao visiveis na loja
              </p>
            </div>
            {saving ? <Loader2 size={16} className="animate-spin text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-300" />}
          </button>

          {/* Unpublish all */}
          <button
            onClick={() => onApply(products.map(p => p.id), 'draft')}
            disabled={saving}
            className="w-full flex items-center gap-3 p-4 rounded-xl border border-zinc-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left group"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 group-hover:bg-amber-200 transition-colors">
              <GlobeLock size={20} className="text-amber-600" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-zinc-900">Despublicar Todos</p>
              <p className="text-[11px] text-zinc-500">
                Todos os {products.length} produtos ficarao ocultos na loja (rascunho)
              </p>
            </div>
            {saving ? <Loader2 size={16} className="animate-spin text-zinc-400" /> : <ChevronRight size={16} className="text-zinc-300" />}
          </button>
        </div>

        <div className="px-5 py-4 border-t border-zinc-100">
          <button
            onClick={onClose}
            className="w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ QUICK BULK COLOR ACTIONS (add/remove specific colors) ============
function QuickBulkColorModal({ products, action, onApply, onClose, saving }: {
  products: ParsedProduct[];
  action: 'add' | 'remove';
  onApply: (productIds: string[], colorNames: string[], action: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);

  const toggleColor = (name: string) => {
    setSelectedColors(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[80vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-zinc-900 text-base">
              {action === 'add' ? 'Adicionar Cores' : 'Remover Cores'}
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              {action === 'add' ? 'Adicionar' : 'Remover'} cores de {products.length} produto(s)
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3">Selecione as Cores</p>
          <div className="flex flex-wrap gap-2">
            {ALL_COLORS.map(c => {
              const isSelected = selectedColors.includes(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => toggleColor(c.name)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    isSelected
                      ? 'bg-zinc-900 text-white border-zinc-900'
                      : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <ColorDot name={c.name} hex={c.hex} />
                  {c.name}
                  {isSelected && <Check size={12} />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => onApply(products.map(p => p.id), selectedColors, action)}
            disabled={saving || selectedColors.length === 0}
            className={`flex-1 text-white px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors ${
              action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : action === 'add' ? <Plus size={16} /> : <Minus size={16} />}
            {saving ? 'Aplicando...' : `${action === 'add' ? 'Adicionar' : 'Remover'} ${selectedColors.length} cor(es)`}
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ PRODUCT CARD (mobile-first) ============
function ProductCard({ product, isSelected, onToggleSelect, onSaveColors, onStatusChange, saving }: {
  product: ParsedProduct;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSaveColors: (productId: string, colors: ColorItem[]) => void;
  onStatusChange: (productId: string, status: string) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editingColors, setEditingColors] = useState(false);
  const [colors, setColors] = useState<ColorItem[]>(product._availableColors);
  const [colorChanged, setColorChanged] = useState(false);

  useEffect(() => {
    setColors(product._availableColors);
    setColorChanged(false);
  }, [product._availableColors]);

  const image = product.images?.[0]?.url || product.thumbnail || '';
  const isMulticolor = product._isLine && !product._needsColorSelection;

  // Get group colors for suggestions
  const fakeP = { title: product.title, handle: product.handle, yards: product._yards } as any;
  const groupColors = getColorsForProduct(fakeP);

  return (
    <div className={`border-b border-zinc-100 last:border-b-0 transition-colors ${
      isSelected ? 'bg-blue-50/40' : ''
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 min-h-[56px]">
        {/* Checkbox */}
        <button onClick={onToggleSelect} className="shrink-0 p-0.5 touch-manipulation">
          {isSelected ? (
            <CheckSquare size={20} className="text-blue-600" />
          ) : (
            <Square size={20} className="text-zinc-300" />
          )}
        </button>

        {/* Image */}
        <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
          {image ? (
            <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300">
              <Package size={14} />
            </div>
          )}
        </div>

        {/* Title + meta */}
        <div className="flex-1 min-w-0" onClick={() => setExpanded(!expanded)}>
          <p className="text-[13px] font-medium text-zinc-900 truncate leading-tight">{product.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <span className="text-[11px] font-semibold text-zinc-700">R$ {product._priceDisplay}</span>
            {product._yards && (
              <span className="text-[10px] text-zinc-400">{product._yards}j</span>
            )}
            {isMulticolor && (
              <span className="text-[9px] bg-gradient-to-r from-red-100 via-yellow-100 to-blue-100 text-zinc-600 px-1.5 py-0.5 rounded-full font-medium border border-zinc-200/50">
                Multicor
              </span>
            )}
          </div>
        </div>

        {/* Status + color count */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <StatusBadge status={product.status} />
          {product._isLine && product._needsColorSelection && (
            <button
              onClick={() => { setExpanded(!expanded); setEditingColors(true); }}
              className="flex items-center gap-0.5 text-[10px] text-purple-600 font-medium"
            >
              <Palette size={10} />
              {product._availableColors.filter(c => c.in_stock).length}/{product._availableColors.length}
            </button>
          )}
        </div>

        {/* Expand */}
        <button onClick={() => setExpanded(!expanded)} className="shrink-0 p-1 text-zinc-300 touch-manipulation">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-3 pb-3 pl-[52px] space-y-3">
          {/* Quick info row */}
          <div className="flex flex-wrap gap-2 text-[11px] text-zinc-500">
            <span>Handle: <span className="text-zinc-700 font-mono">{product.handle}</span></span>
            {product._fio && <span>Fio: <span className="text-zinc-700">{product._fio}</span></span>}
            {product._stock !== null && <span>Estoque: <span className={`font-semibold ${product._stock <= 0 ? 'text-red-600' : 'text-zinc-700'}`}>{product._stock}</span></span>}
            <span>Grupo: <span className="text-zinc-700">{product._group}</span></span>
            {product._colorGroup && <span>Linha: <span className="text-zinc-700">{product._colorGroup}</span></span>}
          </div>

          {/* Status toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-zinc-500">Status:</span>
            <button
              onClick={() => onStatusChange(product.id, product.status === 'published' ? 'draft' : 'published')}
              disabled={saving}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                product.status === 'published'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              {product.status === 'published' ? <><EyeOff size={12} /> Despublicar</> : <><Eye size={12} /> Publicar</>}
            </button>
          </div>

          {/* Color editor (for line products that need color selection) */}
          {product._isLine && product._needsColorSelection && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                <Palette size={12} /> Cores Disponiveis na Loja
              </p>

              {/* Current colors */}
              <div className="flex flex-wrap gap-1.5">
                {colors.length === 0 ? (
                  <span className="text-[11px] text-zinc-400 italic">Sem cores definidas</span>
                ) : colors.map(c => (
                  <div
                    key={c.name}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium ${
                      c.in_stock ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-red-50 border-red-200 text-red-400'
                    }`}
                  >
                    <ColorDot name={c.name} hex={c.hex} />
                    <span className={!c.in_stock ? 'line-through' : ''}>{c.name}</span>
                    <button
                      onClick={() => {
                        setColors(prev => prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc));
                        setColorChanged(true);
                      }}
                      className="p-0.5"
                    >
                      {c.in_stock ? <EyeOff size={10} className="text-zinc-400" /> : <Eye size={10} className="text-emerald-500" />}
                    </button>
                    <button
                      onClick={() => { setColors(prev => prev.filter(cc => cc.name !== c.name)); setColorChanged(true); }}
                      className="p-0.5 text-zinc-300 hover:text-red-500"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add color suggestions */}
              <div className="flex flex-wrap gap-1">
                {groupColors.filter(gc => !colors.find(c => c.name === gc.name)).map(gc => (
                  <button
                    key={gc.name}
                    onClick={() => { setColors(prev => [...prev, { name: gc.name, hex: gc.hex, in_stock: true }]); setColorChanged(true); }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
                  >
                    <Plus size={9} /> <ColorDot name={gc.name} hex={gc.hex} /> {gc.name}
                  </button>
                ))}
              </div>

              {/* Save button */}
              {colorChanged && (
                <button
                  onClick={() => { onSaveColors(product.id, colors); setColorChanged(false); }}
                  disabled={saving}
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-[11px] font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors"
                >
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  Salvar Cores
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============ MAIN COMPONENT ============
export default function AdminProducts() {
  const [products, setProducts] = useState<ParsedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modals
  const [showBulkColors, setShowBulkColors] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [quickBulkAction, setQuickBulkAction] = useState<'add' | 'remove' | null>(null);
  const [showBulkActions, setShowBulkActions] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  // Load
  useEffect(() => { loadProducts(); }, []);

  const loadProducts = async () => {
    setLoading(true);
    try {
      let all: any[] = [];
      let offset = 0;
      const limit = 100;
      let total = 0;
      do {
        const data = await adminFetch(`/admin/produtos-custom?limit=${limit}&offset=${offset}`);
        const batch = data.products || [];
        all = [...all, ...batch];
        total = data.count || all.length;
        offset += limit;
      } while (offset < total);

      setProducts(all.map(parseProduct));
    } catch (err: any) {
      if (err.message?.includes('autenticado') || err.message?.includes('expirada')) {
        localStorage.removeItem('admin_token');
        window.location.reload();
      }
      showToast('Erro ao carregar produtos', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helpers
  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Save colors for single product
  const handleSaveColors = useCallback(async (productId: string, colors: ColorItem[]) => {
    setSavingId(productId);
    try {
      const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
      const currentMetadata = productData.product?.metadata || {};

      const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
        method: 'POST',
        body: JSON.stringify({
          metadata: { ...currentMetadata, available_colors: colors },
        }),
      });

      if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro');

      setProducts(prev => prev.map(p =>
        p.id === productId
          ? { ...p, _availableColors: colors, metadata: { ...p.metadata, available_colors: colors }, _colorConfigKey: colors.map(c => `${c.name}:${c.in_stock ? '1' : '0'}`).sort().join('|') || 'NONE' }
          : p
      ));

      showToast('Cores salvas!', 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, []);

  // Change status for single product
  const handleStatusChange = useCallback(async (productId: string, newStatus: string) => {
    setSavingId(productId);
    try {
      const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });

      if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro');

      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, status: newStatus } : p
      ));

      showToast(`Produto ${newStatus === 'published' ? 'publicado' : 'despublicado'}!`, 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, []);

  // Bulk status change
  const handleBulkStatusApply = useCallback(async (productIds: string[], newStatus: string) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;

    for (const pid of productIds) {
      try {
        const result = await adminFetch(`/admin/produtos-custom/${pid}`, {
          method: 'POST',
          body: JSON.stringify({ status: newStatus }),
        });
        if (result.success) {
          ok++;
          setProducts(prev => prev.map(p => p.id === pid ? { ...p, status: newStatus } : p));
        } else fail++;
      } catch { fail++; }
    }

    setBulkSaving(false);
    setShowBulkStatus(false);
    setSelectedIds(new Set());
    showToast(
      fail === 0
        ? `${ok} produto(s) ${newStatus === 'published' ? 'publicado(s)' : 'despublicado(s)'}!`
        : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  // Bulk color apply (intelligent grouped)
  const handleBulkColorApply = useCallback(async (updates: { productId: string; colors: ColorItem[] }[]) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;

    for (const { productId, colors } of updates) {
      try {
        const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
        const currentMetadata = productData.product?.metadata || {};

        const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
          method: 'POST',
          body: JSON.stringify({
            metadata: { ...currentMetadata, available_colors: colors },
          }),
        });

        if (result.success) {
          ok++;
          const configKey = colors.map(c => `${c.name}:${c.in_stock ? '1' : '0'}`).sort().join('|') || 'NONE';
          setProducts(prev => prev.map(p =>
            p.id === productId
              ? { ...p, _availableColors: colors, metadata: { ...p.metadata, available_colors: colors }, _colorConfigKey: configKey }
              : p
          ));
        } else fail++;
      } catch { fail++; }
    }

    setBulkSaving(false);
    setShowBulkColors(false);
    setSelectedIds(new Set());
    showToast(
      fail === 0 ? `Cores atualizadas em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  // Quick bulk add/remove colors
  const handleQuickBulkColorApply = useCallback(async (productIds: string[], colorNames: string[], action: string) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;

    for (const pid of productIds) {
      try {
        const productData = await adminFetch(`/admin/produtos-custom/${pid}`);
        const currentMetadata = productData.product?.metadata || {};
        let currentColors: ColorItem[] = currentMetadata.available_colors || [];

        if (action === 'add') {
          for (const name of colorNames) {
            if (!currentColors.find(c => c.name === name)) {
              currentColors.push({ name, hex: getColorHex(name), in_stock: true });
            }
          }
        } else if (action === 'remove') {
          currentColors = currentColors.filter(c => !colorNames.includes(c.name));
        }

        const result = await adminFetch(`/admin/produtos-custom/${pid}`, {
          method: 'POST',
          body: JSON.stringify({
            metadata: { ...currentMetadata, available_colors: currentColors },
          }),
        });

        if (result.success) {
          ok++;
          const configKey = currentColors.map(c => `${c.name}:${c.in_stock ? '1' : '0'}`).sort().join('|') || 'NONE';
          setProducts(prev => prev.map(p =>
            p.id === pid
              ? { ...p, _availableColors: currentColors, metadata: { ...p.metadata, available_colors: currentColors }, _colorConfigKey: configKey }
              : p
          ));
        } else fail++;
      } catch { fail++; }
    }

    setBulkSaving(false);
    setQuickBulkAction(null);
    setSelectedIds(new Set());
    showToast(
      fail === 0 ? `Cores ${action === 'add' ? 'adicionadas' : 'removidas'} em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  // Selection helpers
  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  // Filter products
  const filteredProducts = useMemo(() => {
    let result = products;

    if (searchQuery) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.handle?.toLowerCase().includes(q) ||
        p._group?.toLowerCase().includes(q)
      );
    }

    if (groupFilter !== 'all') {
      result = result.filter(p => p._group === groupFilter);
    }

    if (statusFilter === 'published') {
      result = result.filter(p => p.status === 'published');
    } else if (statusFilter === 'draft') {
      result = result.filter(p => p.status === 'draft');
    } else if (statusFilter === 'no_colors') {
      result = result.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0);
    } else if (statusFilter === 'has_colors') {
      result = result.filter(p => p._availableColors.length > 0);
    } else if (statusFilter === 'multicolor') {
      result = result.filter(p => p._isLine && !p._needsColorSelection);
    }

    return result;
  }, [products, searchQuery, groupFilter, statusFilter]);

  // Groups
  const groups = useMemo(() => {
    const set = new Set(products.map(p => p._group));
    return Array.from(set).sort();
  }, [products]);

  // Stats
  const stats = useMemo(() => ({
    total: products.length,
    published: products.filter(p => p.status === 'published').length,
    draft: products.filter(p => p.status === 'draft').length,
    lines: products.filter(p => p._isLine).length,
    noColors: products.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0).length,
    multicolor: products.filter(p => p._isLine && !p._needsColorSelection).length,
  }), [products]);

  const selectedProducts = filteredProducts.filter(p => selectedIds.has(p.id));
  const hasSelection = selectedIds.size > 0;

  return (
    <div className="space-y-3 pb-24">
      {/* ============ STATS ROW ============ */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-zinc-100 p-2.5 text-center">
          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Total</p>
          <p className="text-xl font-bold text-zinc-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 p-2.5 text-center">
          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Publicados</p>
          <p className="text-xl font-bold text-emerald-700">{stats.published}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 p-2.5 text-center">
          <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Rascunhos</p>
          <p className="text-xl font-bold text-amber-700">{stats.draft}</p>
        </div>
      </div>

      {/* ============ SEARCH BAR ============ */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <Search size={18} className="text-zinc-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar produtos por nome, handle..."
            className="flex-1 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-zinc-300 hover:text-zinc-500">
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
              showFilters || groupFilter !== 'all' || statusFilter !== 'all'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-zinc-50 border-zinc-200 text-zinc-500'
            }`}
          >
            <SlidersHorizontal size={12} />
            Filtros
            {(groupFilter !== 'all' || statusFilter !== 'all') && (
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </button>
          <button
            onClick={loadProducts}
            className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors"
            title="Atualizar"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="border-t border-zinc-100 px-3 py-3 space-y-2.5 bg-zinc-50/50">
            {/* Group filter */}
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Grupo/Marca</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setGroupFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                    groupFilter === 'all' ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  Todos
                </button>
                {groups.map(g => (
                  <button
                    key={g}
                    onClick={() => setGroupFilter(g === groupFilter ? 'all' : g)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      groupFilter === g ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            </div>

            {/* Status filter */}
            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Status/Tipo</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'published', label: 'Publicados' },
                  { key: 'draft', label: 'Rascunhos' },
                  { key: 'no_colors', label: 'Sem Cores', count: stats.noColors },
                  { key: 'has_colors', label: 'Com Cores' },
                  { key: 'multicolor', label: 'Multicor', count: stats.multicolor },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key === statusFilter ? 'all' : f.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all ${
                      statusFilter === f.key ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'
                    }`}
                  >
                    {f.label}
                    {f.count !== undefined && <span className="ml-1 opacity-60">{f.count}</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear filters */}
            {(groupFilter !== 'all' || statusFilter !== 'all') && (
              <button
                onClick={() => { setGroupFilter('all'); setStatusFilter('all'); }}
                className="text-[11px] text-blue-600 font-medium flex items-center gap-1 hover:underline"
              >
                <X size={12} /> Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* ============ SELECT ALL BAR ============ */}
      {!loading && filteredProducts.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <button onClick={selectAll} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 font-medium touch-manipulation py-1">
            {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? (
              <CheckSquare size={16} className="text-blue-600" />
            ) : selectedIds.size > 0 ? (
              <MinusSquare size={16} className="text-blue-400" />
            ) : (
              <Square size={16} className="text-zinc-300" />
            )}
            {selectedIds.size === filteredProducts.length ? 'Desmarcar todos' : `Selecionar todos (${filteredProducts.length})`}
          </button>
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-400">
            {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* ============ PRODUCT LIST ============ */}
      {loading ? (
        <div className="text-center py-20">
          <Loader2 size={28} className="animate-spin text-zinc-300 mx-auto" />
          <p className="text-zinc-400 mt-3 text-sm">Carregando produtos...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-zinc-100 text-center">
          <Package size={36} className="text-zinc-200 mx-auto mb-3" />
          <p className="text-zinc-500 text-sm font-medium">Nenhum produto encontrado</p>
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-blue-600 text-xs mt-2 hover:underline">
              Limpar busca
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
          {filteredProducts.map(p => (
            <ProductCard
              key={p.id}
              product={p}
              isSelected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onSaveColors={handleSaveColors}
              onStatusChange={handleStatusChange}
              saving={savingId === p.id}
            />
          ))}
        </div>
      )}

      {/* ============ FLOATING BULK ACTION BAR ============ */}
      {hasSelection && (
        <div className="fixed bottom-0 inset-x-0 z-50 animate-slide-up-bar" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-zinc-900 mx-3 rounded-2xl shadow-2xl px-4 py-3">
            {/* Top line: count + close */}
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
                  {selectedIds.size}
                </span>
                <span className="text-white/80 text-xs font-medium">
                  produto{selectedIds.size > 1 ? 's' : ''} selecionado{selectedIds.size > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={selectAll}
                  className="text-white/50 text-[10px] hover:text-white/80 px-2 py-1"
                >
                  {selectedIds.size === filteredProducts.length ? 'Desmarcar' : 'Todos'}
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/10 rounded-lg"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1">
              {/* Status */}
              <button
                onClick={() => setShowBulkStatus(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shrink-0"
              >
                <Globe size={14} />
                Status
              </button>

              {/* Intelligent Color Editor */}
              <button
                onClick={() => setShowBulkColors(true)}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors shrink-0"
              >
                <Palette size={14} />
                Editar Cores
              </button>

              {/* Quick add colors */}
              <button
                onClick={() => setQuickBulkAction('add')}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0"
              >
                <Plus size={14} />
                Add Cor
              </button>

              {/* Quick remove colors */}
              <button
                onClick={() => setQuickBulkAction('remove')}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-red-600/90 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors shrink-0"
              >
                <Minus size={14} />
                Remover Cor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============ MODALS ============ */}
      {showBulkStatus && selectedProducts.length > 0 && (
        <BulkStatusModal
          products={selectedProducts}
          onApply={handleBulkStatusApply}
          onClose={() => setShowBulkStatus(false)}
          saving={bulkSaving}
        />
      )}

      {showBulkColors && selectedProducts.length > 0 && (
        <BulkColorEditor
          products={selectedProducts}
          onApply={handleBulkColorApply}
          onClose={() => setShowBulkColors(false)}
          saving={bulkSaving}
        />
      )}

      {quickBulkAction && selectedProducts.length > 0 && (
        <QuickBulkColorModal
          products={selectedProducts}
          action={quickBulkAction}
          onApply={handleQuickBulkColorApply}
          onClose={() => setQuickBulkAction(null)}
          saving={bulkSaving}
        />
      )}

      {/* ============ TOAST ============ */}
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
