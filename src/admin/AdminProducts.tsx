import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, Save, X, Loader2, RefreshCw, Palette, Plus, Minus,
  ChevronDown, ChevronRight, Check, CheckSquare, Square,
  Eye, EyeOff, Filter, Package, Layers, Grid3X3, AlertTriangle,
  ArrowUpDown, MinusSquare, Edit3
} from 'lucide-react';
import { adminFetch } from './adminApi';
import { LINE_COLORS, getColorsForProduct, getColorGroupName, isNylonEsportiva, isKingLine } from '../types';

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
  _subgroup: string;
  _yards: number | null;
  _fio: string | null;
  _passes: string | null;
  _price: number;
  _priceDisplay: string;
  _stock: number | null;
  _colorGroup: string;
  _availableColors: ColorItem[];
  _isLine: boolean;
}

// ============ PRODUCT PARSING ============
function parseProduct(p: ProductData): ParsedProduct {
  const title = p.title || '';
  const metadata = p.metadata || {};
  const variant = p.variants?.[0];
  const titleUpper = title.toUpperCase();

  // Extract yards
  const yardsMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
  const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : null;

  // Extract fio
  const fioMatch = title.match(/[Ff]io\s+([\d.]+)/);
  const fio = fioMatch ? fioMatch[1] : null;

  // Extract passes
  const passesMatch = title.match(/(\d+)\s*[Pp]asse?s?/);
  const passes = passesMatch ? passesMatch[1] : null;

  // Determine group
  let group = 'Outros';
  if (/CARRETILHA/i.test(titleUpper)) group = 'Carretilhas';
  else if (/CAMIS/i.test(titleUpper)) group = 'Camisas';
  else if (/BON[EÉ]/i.test(titleUpper)) group = 'Bones';
  else if (/MALETA/i.test(titleUpper)) group = 'Acessorios';
  else if (/KING\s*SHARK/i.test(titleUpper)) group = 'King Shark';
  else if (/SHARK\s*ATTACK/i.test(titleUpper)) group = 'Shark Attack';
  else if (/INDON[EÉ]SIA/i.test(titleUpper) || /\.50/i.test(titleUpper) && /FAMOSA/i.test(titleUpper)) group = 'Indonesia .50';
  else if (/LINHA\s*PURA|PURA/i.test(titleUpper) && !(/CARRETILHA|CAMIS|BON/i.test(titleUpper))) group = 'Linha Pura';
  else if (yards !== null) group = 'Dente de Tubarao';

  // Determine if it's a line product (has yards)
  const isLine = yards !== null;

  // Subgroup: for lines, use yards + fio
  let subgroup = '';
  if (isLine) {
    subgroup = `${yards}j`;
    if (fio) subgroup += ` Fio ${fio}`;
    if (passes) subgroup += ` ${passes}P`;
  }

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

  // Color group detection using the same logic as the store
  const fakeProduct = { title, handle: p.handle, yards, metadata } as any;
  const colorGroup = getColorGroupName(fakeProduct);
  const availableColors: ColorItem[] = metadata.available_colors || [];

  return {
    ...p,
    _group: group,
    _subgroup: subgroup,
    _yards: yards,
    _fio: fio,
    _passes: passes,
    _price: price,
    _priceDisplay: priceDisplay,
    _stock: stock,
    _colorGroup: colorGroup,
    _availableColors: availableColors,
    _isLine: isLine,
  };
}

// ============ COLOR PALETTE (all possible colors) ============
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

function ColorDot({ name, hex, size = 'sm', selected, disabled, onClick }: {
  name: string; hex: string; size?: 'sm' | 'md'; selected?: boolean; disabled?: boolean; onClick?: () => void;
}) {
  const sz = size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';
  const isGradient = hex.startsWith('linear');
  const isWhite = hex === '#f5f5f5';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${sz} rounded-sm shrink-0 transition-all ${
        selected ? 'ring-2 ring-offset-1 ring-emerald-500 scale-110' : ''
      } ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer hover:scale-110'}
      ${isWhite ? 'border border-zinc-300' : 'border border-zinc-200'}`}
      style={isGradient ? { background: hex } : { backgroundColor: hex }}
      title={name}
    />
  );
}

// ============ BULK COLOR MODAL ============
function BulkColorModal({ products, action, onClose, onApply, saving }: {
  products: ParsedProduct[];
  action: 'add' | 'remove' | 'toggle_stock';
  onClose: () => void;
  onApply: (productIds: string[], colorNames: string[], action: string, inStock?: boolean) => void;
  saving: boolean;
}) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [stockValue, setStockValue] = useState(true); // for toggle_stock

  const toggleColor = (name: string) => {
    setSelectedColors(prev =>
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const productIds = products.map(p => p.id);

  const titles = {
    add: 'Adicionar Cores em Massa',
    remove: 'Remover Cores em Massa',
    toggle_stock: 'Alterar Estoque de Cores em Massa',
  };

  const descriptions = {
    add: `Adicionar cores a ${products.length} produto(s) selecionado(s).`,
    remove: `Remover cores de ${products.length} produto(s) selecionado(s).`,
    toggle_stock: `Alterar disponibilidade de cores em ${products.length} produto(s).`,
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-zinc-900 text-base">{titles[action]}</h3>
            <p className="text-xs text-zinc-500 mt-0.5">{descriptions[action]}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Products being affected */}
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Produtos Selecionados</p>
            <div className="max-h-32 overflow-auto space-y-1 bg-zinc-50 rounded-xl p-2">
              {products.map(p => (
                <p key={p.id} className="text-xs text-zinc-600 truncate">{p.title}</p>
              ))}
            </div>
          </div>

          {/* Color selection */}
          <div>
            <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">
              Selecione as Cores
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_COLORS.map(c => {
                const isSelected = selectedColors.includes(c.name);
                return (
                  <button
                    key={c.name}
                    onClick={() => toggleColor(c.name)}
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                      isSelected
                        ? 'bg-zinc-900 text-white border-zinc-900'
                        : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                    }`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded-sm border border-zinc-200/50 shrink-0"
                      style={c.hex.startsWith('linear') ? { background: c.hex } : { backgroundColor: c.hex }}
                    />
                    {c.name}
                    {isSelected && <Check size={12} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Stock toggle option */}
          {action === 'toggle_stock' && (
            <div className="flex items-center gap-3">
              <p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Marcar como:</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setStockValue(true)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    stockValue ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  Em Estoque
                </button>
                <button
                  onClick={() => setStockValue(false)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    !stockValue ? 'bg-red-600 text-white border-red-600' : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  Sem Estoque
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => onApply(productIds, selectedColors, action, stockValue)}
            disabled={saving || selectedColors.length === 0}
            className="flex-1 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? 'Aplicando...' : `Aplicar a ${products.length} produto(s)`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============ INLINE COLOR EDITOR (per product) ============
function InlineColorEditor({ product, onSave, saving }: {
  product: ParsedProduct; onSave: (productId: string, colors: ColorItem[]) => void; saving: boolean;
}) {
  const [colors, setColors] = useState<ColorItem[]>(product._availableColors);
  const [changed, setChanged] = useState(false);

  // Reset when product changes
  useEffect(() => {
    setColors(product._availableColors);
    setChanged(false);
  }, [product._availableColors]);

  // Get group colors for suggestions
  const fakeP = { title: product.title, handle: product.handle, yards: product._yards } as any;
  const groupColors = getColorsForProduct(fakeP);

  const addColor = (name: string, hex: string) => {
    if (colors.find(c => c.name === name)) return;
    setColors([...colors, { name, hex, in_stock: true }]);
    setChanged(true);
  };

  const removeColor = (name: string) => {
    setColors(colors.filter(c => c.name !== name));
    setChanged(true);
  };

  const toggleStock = (name: string) => {
    setColors(colors.map(c => c.name === name ? { ...c, in_stock: !c.in_stock } : c));
    setChanged(true);
  };

  return (
    <div className="space-y-1.5">
      {/* Current colors */}
      <div className="flex flex-wrap gap-1">
        {colors.map(c => (
          <div
            key={c.name}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[10px] ${
              c.in_stock ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-red-50 border-red-200 text-red-500 line-through opacity-70'
            }`}
          >
            <ColorDot name={c.name} hex={c.hex} size="sm" />
            <span>{c.name}</span>
            <button onClick={() => toggleStock(c.name)} className={`px-0.5 ${c.in_stock ? 'text-amber-500' : 'text-emerald-500'}`}>
              {c.in_stock ? <EyeOff size={9} /> : <Eye size={9} />}
            </button>
            <button onClick={() => removeColor(c.name)} className="text-red-300 hover:text-red-500">
              <X size={9} />
            </button>
          </div>
        ))}
        {colors.length === 0 && (
          <span className="text-[10px] text-zinc-400 italic">Sem cores definidas</span>
        )}
      </div>

      {/* Add suggestions */}
      <div className="flex flex-wrap gap-0.5">
        {groupColors.filter(gc => !colors.find(c => c.name === gc.name)).slice(0, 8).map(gc => (
          <button
            key={gc.name}
            onClick={() => addColor(gc.name, gc.hex)}
            className="flex items-center gap-0.5 px-1 py-0.5 rounded border border-dashed border-zinc-300 text-[9px] text-zinc-400 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <Plus size={8} />
            <ColorDot name={gc.name} hex={gc.hex} size="sm" />
          </button>
        ))}
      </div>

      {/* Save */}
      {changed && (
        <button
          onClick={() => { onSave(product.id, colors); setChanged(false); }}
          disabled={saving}
          className="bg-purple-600 text-white px-2 py-1 rounded-md text-[10px] font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1"
        >
          {saving ? <Loader2 size={10} className="animate-spin" /> : <Save size={10} />}
          Salvar
        </button>
      )}
    </div>
  );
}

// ============ PRODUCT ROW (compact table-style) ============
function ProductRow({ product, isSelected, onToggleSelect, onSaveColors, saving }: {
  product: ParsedProduct;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSaveColors: (productId: string, colors: ColorItem[]) => void;
  saving: boolean;
}) {
  const [showColors, setShowColors] = useState(false);
  const image = product.images?.[0]?.url || product.thumbnail || '';
  const noStock = product._stock !== null && product._stock <= 0;

  return (
    <div className={`border-b border-zinc-100 last:border-b-0 transition-colors ${
      isSelected ? 'bg-emerald-50/50' : 'hover:bg-zinc-50/50'
    }`}>
      {/* Main row */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Checkbox */}
        <button onClick={onToggleSelect} className="shrink-0 text-zinc-400 hover:text-emerald-600">
          {isSelected ? <CheckSquare size={16} className="text-emerald-600" /> : <Square size={16} />}
        </button>

        {/* Image */}
        <div className="w-8 h-8 rounded-md overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
          {image ? (
            <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300">
              <Package size={12} />
            </div>
          )}
        </div>

        {/* Title + info */}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-zinc-900 truncate">{product.title}</p>
          <div className="flex items-center gap-1.5 text-[10px] text-zinc-400 mt-0.5">
            <span className="font-medium text-zinc-600">R$ {product._priceDisplay}</span>
            <span>|</span>
            <span className={noStock ? 'text-red-500 font-medium' : ''}>
              Est: {product._stock ?? '--'}
            </span>
          </div>
        </div>

        {/* Status badge */}
        <div className="shrink-0">
          {noStock ? (
            <span className="bg-red-50 text-red-600 px-1.5 py-0.5 rounded text-[9px] font-bold">Esgotado</span>
          ) : product.status === 'published' ? (
            <span className="bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded text-[9px] font-bold">Ativo</span>
          ) : (
            <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded text-[9px] font-bold">Rascunho</span>
          )}
        </div>

        {/* Color count badge */}
        <button
          onClick={() => setShowColors(!showColors)}
          className={`shrink-0 flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium border transition-all ${
            showColors ? 'bg-purple-100 border-purple-300 text-purple-700' : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-purple-300'
          }`}
        >
          <Palette size={10} />
          {product._availableColors.filter(c => c.in_stock).length}/{product._availableColors.length}
          {showColors ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        </button>
      </div>

      {/* Color editor row */}
      {showColors && (
        <div className="px-3 pb-2 pl-12">
          <InlineColorEditor product={product} onSave={onSaveColors} saving={saving} />
        </div>
      )}
    </div>
  );
}

// ============ GROUP SECTION ============
function GroupSection({ group, products, selectedIds, onToggleSelect, onToggleGroup, onSaveColors, savingId, defaultOpen }: {
  group: string;
  products: ParsedProduct[];
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onSaveColors: (productId: string, colors: ColorItem[]) => void;
  savingId: string | null;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  const allSelected = products.every(p => selectedIds.has(p.id));
  const someSelected = products.some(p => selectedIds.has(p.id)) && !allSelected;

  const activeCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const colorCount = products.reduce((sum, p) => sum + p._availableColors.filter(c => c.in_stock).length, 0);
  const totalColors = products.reduce((sum, p) => sum + p._availableColors.length, 0);

  // Subgroup by yards
  const subgroups = useMemo(() => {
    const map = new Map<string, ParsedProduct[]>();
    for (const p of products) {
      const key = p._subgroup || 'Geral';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    // Sort by yards
    return Array.from(map.entries()).sort((a, b) => {
      const ya = a[1][0]?._yards || 0;
      const yb = b[1][0]?._yards || 0;
      return ya - yb;
    });
  }, [products]);

  // Group icon based on type
  const groupIcon = (() => {
    if (group === 'King Shark') return '🦈';
    if (group === 'Shark Attack') return '⚡';
    if (group === 'Indonesia .50') return '🌏';
    if (group === 'Dente de Tubarao') return '🦷';
    if (group === 'Linha Pura') return '✨';
    if (group === 'Carretilhas') return '🎯';
    if (group === 'Camisas') return '👕';
    if (group === 'Bones') return '🧢';
    if (group === 'Acessorios') return '🧰';
    return '📦';
  })();

  return (
    <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-zinc-50/80 cursor-pointer hover:bg-zinc-100/80 transition-colors border-b border-zinc-100"
        onClick={() => setOpen(!open)}
      >
        {/* Group select */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleGroup(products.map(p => p.id)); }}
          className="shrink-0 text-zinc-400 hover:text-emerald-600"
        >
          {allSelected ? (
            <CheckSquare size={16} className="text-emerald-600" />
          ) : someSelected ? (
            <MinusSquare size={16} className="text-emerald-400" />
          ) : (
            <Square size={16} />
          )}
        </button>

        <span className="text-sm">{groupIcon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-zinc-900 text-sm">{group}</h3>
            <span className="text-[10px] text-zinc-400 font-medium">{products.length} produtos</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] text-zinc-400 mt-0.5">
            {activeCount > 0 && <span className="text-emerald-500">{activeCount} ativos</span>}
            {draftCount > 0 && <span className="text-amber-500">{draftCount} rascunhos</span>}
            {totalColors > 0 && (
              <span className="text-purple-500 flex items-center gap-0.5">
                <Palette size={9} /> {colorCount}/{totalColors} cores
              </span>
            )}
          </div>
        </div>

        {open ? <ChevronDown size={14} className="text-zinc-400 shrink-0" /> : <ChevronRight size={14} className="text-zinc-400 shrink-0" />}
      </div>

      {/* Products */}
      {open && (
        <div>
          {subgroups.map(([subKey, subProducts]) => (
            <div key={subKey}>
              {subgroups.length > 1 && subKey !== 'Geral' && (
                <div className="px-3 py-1 bg-zinc-50/50 border-b border-zinc-50">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{subKey}</span>
                </div>
              )}
              {subProducts.map(p => (
                <ProductRow
                  key={p.id}
                  product={p}
                  isSelected={selectedIds.has(p.id)}
                  onToggleSelect={() => onToggleSelect(p.id)}
                  onSaveColors={onSaveColors}
                  saving={savingId === p.id}
                />
              ))}
            </div>
          ))}
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  // Selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Bulk modal
  const [bulkAction, setBulkAction] = useState<'add' | 'remove' | 'toggle_stock' | null>(null);

  // Load products
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
      setErrorMsg('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
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

      // Update local state instantly
      setProducts(prev => prev.map(p =>
        p.id === productId
          ? { ...p, _availableColors: colors, metadata: { ...p.metadata, available_colors: colors } }
          : p
      ));

      showSuccess('Cores salvas!');
    } catch (err: any) {
      showError(`Erro: ${err.message}`);
    } finally {
      setSavingId(null);
    }
  }, []);

  // Bulk color operations
  const handleBulkApply = useCallback(async (productIds: string[], colorNames: string[], action: string, inStock?: boolean) => {
    setBulkSaving(true);
    let successCount = 0;
    let errorCount = 0;

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
        } else if (action === 'toggle_stock') {
          currentColors = currentColors.map(c =>
            colorNames.includes(c.name) ? { ...c, in_stock: !!inStock } : c
          );
        }

        const result = await adminFetch(`/admin/produtos-custom/${pid}`, {
          method: 'POST',
          body: JSON.stringify({
            metadata: { ...currentMetadata, available_colors: currentColors },
          }),
        });

        if (result.success) {
          successCount++;
          // Update local state
          setProducts(prev => prev.map(p =>
            p.id === pid
              ? { ...p, _availableColors: currentColors, metadata: { ...p.metadata, available_colors: currentColors } }
              : p
          ));
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }

    setBulkSaving(false);
    setBulkAction(null);
    setSelectedIds(new Set());

    if (errorCount === 0) {
      showSuccess(`Cores atualizadas em ${successCount} produto(s)!`);
    } else {
      showError(`${successCount} OK, ${errorCount} erros`);
    }
  }, []);

  // Helpers
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3000);
  };
  const showError = (msg: string) => {
    setErrorMsg(msg);
    setTimeout(() => setErrorMsg(null), 5000);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleGroup = (ids: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allIn = ids.every(id => next.has(id));
      if (allIn) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
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
      const q = searchQuery.toLowerCase();
      result = result.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.handle?.toLowerCase().includes(q)
      );
    }

    if (groupFilter !== 'all') {
      result = result.filter(p => p._group === groupFilter);
    }

    if (statusFilter !== 'all') {
      if (statusFilter === 'no_stock') {
        result = result.filter(p => p._stock !== null && p._stock <= 0);
      } else if (statusFilter === 'no_colors') {
        result = result.filter(p => p._isLine && p._availableColors.length === 0);
      } else {
        result = result.filter(p => p.status === statusFilter);
      }
    }

    return result;
  }, [products, searchQuery, groupFilter, statusFilter]);

  // Group products
  const groupedProducts = useMemo(() => {
    const map = new Map<string, ParsedProduct[]>();
    const groupOrder = [
      'Shark Attack', 'King Shark', 'Indonesia .50', 'Dente de Tubarao', 'Linha Pura',
      'Carretilhas', 'Camisas', 'Bones', 'Acessorios', 'Outros'
    ];

    for (const p of filteredProducts) {
      if (!map.has(p._group)) map.set(p._group, []);
      map.get(p._group)!.push(p);
    }

    return groupOrder
      .filter(g => map.has(g))
      .map(g => ({ group: g, products: map.get(g)! }))
      .concat(
        Array.from(map.entries())
          .filter(([g]) => !groupOrder.includes(g))
          .map(([group, products]) => ({ group, products }))
      );
  }, [filteredProducts]);

  // Stats
  const stats = useMemo(() => {
    const total = products.length;
    const published = products.filter(p => p.status === 'published').length;
    const draft = products.filter(p => p.status === 'draft').length;
    const noStock = products.filter(p => p._stock !== null && p._stock <= 0).length;
    const lines = products.filter(p => p._isLine).length;
    const linesNoColors = products.filter(p => p._isLine && p._availableColors.length === 0).length;

    const groups = new Set(products.map(p => p._group));

    return { total, published, draft, noStock, lines, linesNoColors, groups: Array.from(groups) };
  }, [products]);

  const selectedProducts = filteredProducts.filter(p => selectedIds.has(p.id));

  return (
    <div className="space-y-4">
      {/* ============ HEADER STATS ============ */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {[
          { label: 'Total', value: stats.total, color: 'text-zinc-700' },
          { label: 'Ativos', value: stats.published, color: 'text-emerald-600' },
          { label: 'Rascunho', value: stats.draft, color: 'text-amber-600' },
          { label: 'Esgotados', value: stats.noStock, color: 'text-red-600' },
          { label: 'Linhas', value: stats.lines, color: 'text-blue-600' },
          { label: 'Sem Cores', value: stats.linesNoColors, color: 'text-purple-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-zinc-100 p-2.5 text-center">
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* ============ MESSAGES ============ */}
      {successMsg && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 p-2.5 rounded-xl text-xs flex items-center gap-2">
          <Check size={14} /> {successMsg}
          <button onClick={() => setSuccessMsg(null)} className="ml-auto text-emerald-400 hover:text-emerald-600"><X size={14} /></button>
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-2.5 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle size={14} /> {errorMsg}
          <button onClick={() => setErrorMsg(null)} className="ml-auto text-red-400 hover:text-red-600"><X size={14} /></button>
        </div>
      )}

      {/* ============ TOOLBAR ============ */}
      <div className="space-y-2">
        {/* Search + Group filter */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar produto..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
            />
          </div>

          {/* Group filter dropdown */}
          <div className="relative">
            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none" size={14} />
            <select
              value={groupFilter}
              onChange={e => setGroupFilter(e.target.value)}
              className="pl-9 pr-8 py-2 bg-white border border-zinc-200 rounded-xl text-sm appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="all">Todos os Grupos</option>
              {stats.groups.sort().map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <button
            onClick={loadProducts}
            className="flex items-center gap-1.5 text-zinc-400 hover:text-zinc-700 text-xs bg-white px-3 py-2 rounded-xl border border-zinc-200 transition-colors shrink-0"
          >
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {/* Status filters */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'all', label: 'Todos', count: filteredProducts.length },
            { key: 'published', label: 'Ativos', count: products.filter(p => p.status === 'published').length },
            { key: 'draft', label: 'Rascunho', count: products.filter(p => p.status === 'draft').length },
            { key: 'no_stock', label: 'Esgotados', count: stats.noStock },
            { key: 'no_colors', label: 'Sem Cores', count: stats.linesNoColors },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => setStatusFilter(t.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all whitespace-nowrap ${
                statusFilter === t.key
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-500 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              {t.label}
              <span className={`ml-1 ${statusFilter === t.key ? 'text-white/60' : 'text-zinc-400'}`}>{t.count}</span>
            </button>
          ))}

          {/* View mode toggle */}
          <div className="ml-auto flex gap-0.5 bg-zinc-100 rounded-lg p-0.5">
            <button
              onClick={() => setViewMode('grouped')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'grouped' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-400'}`}
              title="Agrupado"
            >
              <Layers size={14} />
            </button>
            <button
              onClick={() => setViewMode('flat')}
              className={`p-1.5 rounded-md transition-all ${viewMode === 'flat' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-400'}`}
              title="Lista plana"
            >
              <Grid3X3 size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ============ SELECTION BAR ============ */}
      {selectedIds.size > 0 && (
        <div className="bg-zinc-900 text-white rounded-xl px-4 py-3 flex items-center gap-3 sticky top-14 z-40 shadow-lg">
          <button onClick={selectAll} className="text-xs text-zinc-300 hover:text-white underline">
            {selectedIds.size === filteredProducts.length ? 'Desmarcar todos' : 'Selecionar todos'}
          </button>
          <span className="text-xs text-zinc-400">|</span>
          <span className="text-xs text-zinc-300">{selectedIds.size} selecionado(s)</span>

          <div className="flex-1" />

          {/* Bulk actions */}
          <button
            onClick={() => setBulkAction('add')}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
          >
            <Plus size={12} /> Add Cores
          </button>
          <button
            onClick={() => setBulkAction('remove')}
            className="flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-colors"
          >
            <Minus size={12} /> Remover Cores
          </button>
          <button
            onClick={() => setBulkAction('toggle_stock')}
            className="flex items-center gap-1 px-3 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700 transition-colors"
          >
            <ArrowUpDown size={12} /> Estoque Cor
          </button>

          <button onClick={() => setSelectedIds(new Set())} className="text-zinc-400 hover:text-white ml-2">
            <X size={16} />
          </button>
        </div>
      )}

      {/* ============ PRODUCT LIST ============ */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-zinc-300 mx-auto" />
          <p className="text-zinc-400 mt-3 text-sm">Carregando produtos...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-zinc-100 text-center">
          <Package size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-400 text-sm">Nenhum produto encontrado.</p>
        </div>
      ) : viewMode === 'grouped' ? (
        <div className="space-y-3">
          {groupedProducts.map(({ group, products: gp }) => (
            <GroupSection
              key={group}
              group={group}
              products={gp}
              selectedIds={selectedIds}
              onToggleSelect={toggleSelect}
              onToggleGroup={toggleGroup}
              onSaveColors={handleSaveColors}
              savingId={savingId}
              defaultOpen={groupFilter !== 'all' || groupedProducts.length <= 3}
            />
          ))}
        </div>
      ) : (
        /* Flat view */
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {/* Select all header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-zinc-50 border-b border-zinc-100">
            <button onClick={selectAll} className="shrink-0 text-zinc-400 hover:text-emerald-600">
              {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? (
                <CheckSquare size={16} className="text-emerald-600" />
              ) : (
                <Square size={16} />
              )}
            </button>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider flex-1">
              {filteredProducts.length} produtos
            </span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Status</span>
            <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider w-16 text-center">Cores</span>
          </div>

          {filteredProducts.map(p => (
            <ProductRow
              key={p.id}
              product={p}
              isSelected={selectedIds.has(p.id)}
              onToggleSelect={() => toggleSelect(p.id)}
              onSaveColors={handleSaveColors}
              saving={savingId === p.id}
            />
          ))}
        </div>
      )}

      <p className="text-center text-[10px] text-zinc-400 pb-4">
        {filteredProducts.length} de {products.length} produtos
      </p>

      {/* ============ BULK MODAL ============ */}
      {bulkAction && selectedProducts.length > 0 && (
        <BulkColorModal
          products={selectedProducts}
          action={bulkAction}
          onClose={() => setBulkAction(null)}
          onApply={handleBulkApply}
          saving={bulkSaving}
        />
      )}
    </div>
  );
}
