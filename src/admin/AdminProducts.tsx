// ============================================================================
// AdminProducts.tsx — RESTRUCTURE v2 (mobile-first, 2026-04-18)
// ----------------------------------------------------------------------------
// Arquitetura nova:
//
//   [Header compacto]  <- busca + contador + "Novo"
//        |
//   [Pills de modo]    <- Lista | Ordenar (editor abre full-screen)
//        |
//   [Pills de grupo]   <- scroll horizontal, sempre visiveis
//        |
//   [Chip bar: status/filtros]
//        |
//   [Lista ou Modo Ordenar]
//        |
//   [Barra de acoes] (bottom sheet) quando ha selecao
//
// Editor: full-screen com ABAS HORIZONTAIS (Info / Imagens / Cores / Posicao /
// Frete) — sem accordions empilhados.
//
// Modo Ordenar: lista reordenavel por botoes (topo/base + up/down) com preview
// da ordem final (#1, #2, #3...). Usuario nao digita numeros — so reordena.
// A ordem vira rank sequencial 1..N no metadata.rank.
//
// Escopo: SOMENTE este arquivo. Sem alterar api.ts, adminApi.ts, types.ts,
// rotas publicas, backend Medusa.
// ============================================================================

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, Save, X, Loader2, RefreshCw, Palette, Plus, Minus,
  ChevronDown, ChevronRight, Check, CheckSquare, Square,
  Eye, EyeOff, Filter, Package, AlertTriangle,
  Globe, GlobeLock, ArrowLeft, ChevronLeft, ChevronUp,
  DollarSign, Ruler, PlusCircle, Camera, Pencil, Info,
  Upload, Folder, FolderPlus, TrendingUp, ArrowUpDown, Flag, Hash,
  MoreHorizontal, ArrowUp, ArrowDown, ListOrdered, LayoutGrid,
  Trash2, Tag,
} from 'lucide-react';
import { adminFetch, MEDUSA_URL } from './adminApi';
import {
  getDefaultColorsForGroup, getColorGroupName,
  needsColorSelection, SKIP_COLOR_YARDS,
} from '../types';

// ============================================================================
// TYPES
// ============================================================================

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
  images: { id?: string; url: string }[];
  variants: any[];
  collection_id?: string;
  collection?: { id: string; title: string; handle: string } | null;
  categories?: { id: string; name: string }[];
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
  _colorConfigKey: string;
  _colorSource: 'metadata' | 'derived' | 'none';
  _variantId: string | null;
  _priceId: string | null;
  _shippingHeight: number | null;
  _shippingWidth: number | null;
  _shippingLength: number | null;
  _shippingWeight: number | null;
  _rank: number | null;
}

type ViewMode = 'list' | 'reorder';
type EditorTab = 'info' | 'images' | 'colors' | 'rank' | 'shipping';

// ============================================================================
// COLOR PALETTE
// ============================================================================

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

// ============================================================================
// SHIPPING DEFAULTS
// ============================================================================

function getDefaultShipping(yards: number | null, title: string): { height: number; width: number; length: number; weight: number } {
  if (title && /carretilha/i.test(title)) {
    return { height: 25, width: 33, length: 31, weight: 1.0 };
  }
  switch (yards) {
    case 50:   return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 100:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 200:  return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 500:  return { height: 12, width: 12, length: 19, weight: 0.4 };
    case 600:  return { height: 12, width: 18, length: 18, weight: 0.3 };
    case 1000: return { height: 15, width: 15, length: 18, weight: 0.5 };
    case 2000: return { height: 18, width: 18, length: 19, weight: 1.0 };
    case 3000: return { height: 18, width: 18, length: 27, weight: 1.0 };
    case 6000: return { height: 19, width: 19, length: 25, weight: 2.0 };
    case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 };
    default:   return { height: 12, width: 12, length: 12, weight: 0.2 };
  }
}

// ============================================================================
// GROUP DETECTION
// ============================================================================

function detectGroup(title: string, metadata: Record<string, any>): string {
  if (metadata?.grupo) return metadata.grupo;
  const t = (title || '').toUpperCase();
  if (/CARRETILHA/i.test(t)) return 'Carretilhas';
  if (/CAMIS/i.test(t)) return 'Camisas';
  if (/BON[EÉ]/i.test(t)) return 'Bones';
  if (/MALETA/i.test(t)) return 'Acessorios';
  if (/KING\s*SHARK/i.test(t)) return 'King Shark';
  if (/SHARK\s*ATTACK/i.test(t)) return 'Shark Attack';
  if (/INDON[EÉ]SIA/i.test(t) || (/\.50/i.test(t) && /FAMOSA/i.test(t))) return 'Indonesia .50';
  if (/LINHA\s*PURA|PURA/i.test(t) && !(/CARRETILHA|CAMIS|BON/i.test(t))) return 'Linha Pura';
  const yardsMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
  if (yardsMatch) return 'Dente de Tubarao';
  return 'Outros';
}

// ============================================================================
// PRODUCT PARSING
// ============================================================================

function parseProduct(p: ProductData): ParsedProduct {
  const title = p.title || '';
  const metadata = p.metadata || {};
  const variant = p.variants?.[0];

  const yardsMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
  const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : null;

  const fioMatch = title.match(/[Ff]io\s+([\d.]+)/);
  const fio = fioMatch ? fioMatch[1] : null;

  const group = detectGroup(title, metadata);
  const isLine = yards !== null;

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

  const stock = variant?.inventory_quantity ?? null;

  const fakeProduct = { title, handle: p.handle, yards, metadata } as any;
  const colorGroup = getColorGroupName(fakeProduct);
  const needsColor = needsColorSelection(fakeProduct);

  let availableColors: ColorItem[] = [];
  let colorSource: 'metadata' | 'derived' | 'none' = 'none';
  const metadataColors: ColorItem[] = metadata.available_colors || [];
  if (metadataColors.length > 0) {
    availableColors = metadataColors;
    colorSource = 'metadata';
  } else if (isLine && needsColor) {
    const storeColors = getDefaultColorsForGroup(fakeProduct);
    availableColors = storeColors.map(c => ({ name: c.name, hex: c.hex, in_stock: true }));
    colorSource = 'derived';
  }

  const colorConfigKey = availableColors
    .map(c => `${c.name}:${c.in_stock ? '1' : '0'}`)
    .sort()
    .join('|') || 'NONE';

  const defaultShipping = getDefaultShipping(yards, title);

  const rawRank = metadata.rank;
  const rank = (typeof rawRank === 'number' && !isNaN(rawRank))
    ? rawRank
    : (typeof rawRank === 'string' && rawRank.trim() !== '' && !isNaN(Number(rawRank)))
      ? Number(rawRank)
      : null;

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
    _colorSource: colorSource,
    _variantId: variant?.id || null,
    _priceId: priceFromAdmin?.id || null,
    _shippingHeight: metadata.shipping_height || defaultShipping.height,
    _shippingWidth: metadata.shipping_width || defaultShipping.width,
    _shippingLength: metadata.shipping_length || defaultShipping.length,
    _shippingWeight: metadata.shipping_weight || defaultShipping.weight,
    _rank: rank,
  };
}

// ============================================================================
// SMALL REUSABLE COMPONENTS
// ============================================================================

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

function StatusDot({ status }: { status: string }) {
  const pub = status === 'published';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${pub ? 'bg-emerald-500' : 'bg-amber-500'}`}
      title={pub ? 'Publicado' : 'Rascunho'}
    />
  );
}

function RankPill({ rank }: { rank: number | null }) {
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

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      className={`fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[120] rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-2 text-sm font-medium ${
        type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
      role="status"
    >
      {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      <span className="flex-1 min-w-0 break-words">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg shrink-0" aria-label="Fechar">
        <X size={14} />
      </button>
    </div>
  );
}

function ConfirmModal({
  title, message, confirmLabel, cancelLabel = 'Cancelar', danger = false,
  onConfirm, onClose, loading = false,
}: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[110] flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
            {danger ? <AlertTriangle size={18} className="text-red-500" /> : <Info size={18} className="text-blue-500" />}
            {title}
          </h3>
        </div>
        <div className="px-5 py-4 text-sm text-zinc-600 leading-relaxed break-words">
          {message}
        </div>
        <div className="px-5 py-3 border-t border-zinc-100 flex gap-2">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// IMAGE UPLOAD
// ============================================================================

async function uploadImageToMedusa(file: File): Promise<{ url: string }> {
  const token = localStorage.getItem('admin_token');
  if (!token) throw new Error('Nao autenticado');

  const formData = new FormData();
  formData.append('files', file);

  const auditHeaders: Record<string, string> = {};
  let sid = sessionStorage.getItem('admin_session_id');
  if (!sid) {
    sid = `sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    sessionStorage.setItem('admin_session_id', sid);
  }
  auditHeaders['X-Audit-Session-Id'] = sid;
  auditHeaders['X-Audit-Origin'] = 'admin_panel';
  auditHeaders['X-Audit-Actor-Type'] = 'admin';
  const label = localStorage.getItem('admin_actor_label');
  if (label) auditHeaders['X-Audit-Actor-Label'] = label;

  const res = await fetch(`${MEDUSA_URL}/admin/uploads`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, ...auditHeaders },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Erro ao fazer upload: ${res.status} ${errText.slice(0, 100)}`);
  }

  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return { url: data.files[0].url };
  }
  throw new Error('Resposta inesperada do servidor de upload');
}

function validateImageFile(file: File): string | null {
  const MAX_SIZE = 10 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
  if (!ALLOWED_TYPES.includes(file.type)) {
    return `Tipo nao permitido: ${file.type}. Use JPG, PNG, WebP, GIF ou AVIF.`;
  }
  if (file.size > MAX_SIZE) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximo: 10MB.`;
  }
  return null;
}

// ============================================================================
// FORM HELPERS
// ============================================================================

const INPUT_CLASS =
  'w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white';

function Field({
  label, required, icon, children,
}: {
  label: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
        {icon}
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function StatusButton({
  active, onClick, variant,
}: {
  active: boolean;
  onClick: () => void;
  variant: 'pub' | 'draft';
}) {
  const cfg = variant === 'pub'
    ? { label: 'Publicado', icon: <Eye size={14} />, activeClass: 'bg-emerald-600 text-white border-emerald-600' }
    : { label: 'Rascunho',  icon: <EyeOff size={14} />, activeClass: 'bg-amber-500 text-white border-amber-500' };
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-3 px-2 rounded-xl text-xs font-bold border transition-all min-w-0 flex items-center justify-center gap-1.5 ${
        active ? cfg.activeClass + ' shadow-sm' : 'bg-white text-zinc-600 border-zinc-200'
      }`}
    >
      {cfg.icon}
      {cfg.label}
    </button>
  );
}

// ============================================================================
// EDITOR TABS
// ============================================================================

function EditorTabs({
  current, onChange, errors,
}: {
  current: EditorTab;
  onChange: (t: EditorTab) => void;
  errors: Partial<Record<EditorTab, boolean>>;
}) {
  const tabs: { id: EditorTab; label: string; icon: React.ReactNode }[] = [
    { id: 'info',     label: 'Info',     icon: <Package size={14} /> },
    { id: 'images',   label: 'Imagens',  icon: <Camera size={14} /> },
    { id: 'colors',   label: 'Cores',    icon: <Palette size={14} /> },
    { id: 'rank',     label: 'Posicao',  icon: <TrendingUp size={14} /> },
    { id: 'shipping', label: 'Frete',    icon: <Ruler size={14} /> },
  ];
  return (
    <div
      className="flex gap-1 overflow-x-auto scrollbar-hide px-2 py-2 bg-zinc-50 border-b border-zinc-200"
      role="tablist"
    >
      {tabs.map(t => {
        const active = current === t.id;
        const hasError = errors[t.id];
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all relative ${
              active
                ? 'bg-white text-blue-700 border border-blue-200 shadow-sm'
                : 'bg-transparent text-zinc-500 hover:bg-white/60 hover:text-zinc-700'
            }`}
          >
            {t.icon}
            {t.label}
            {hasError && (
              <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// PRODUCT EDITOR — full-screen com abas horizontais
// ============================================================================

function ProductEditor({
  product, allGroups, onSave, onClose, saving,
}: {
  product: ParsedProduct | null;
  allGroups: string[];
  onSave: (data: any) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !product;

  const [tab, setTab] = useState<EditorTab>('info');

  const [title, setTitle] = useState(product?.title || '');
  const [handle, setHandle] = useState(product?.handle || '');
  const [description, setDescription] = useState(product?.description || '');
  const [status, setStatus] = useState(product?.status || 'draft');
  const [price, setPrice] = useState(product ? product._price.toFixed(2) : '');
  const [shHeight, setShHeight] = useState(String(product?._shippingHeight || ''));
  const [shWidth, setShWidth] = useState(String(product?._shippingWidth || ''));
  const [shLength, setShLength] = useState(String(product?._shippingLength || ''));
  const [shWeight, setShWeight] = useState(String(product?._shippingWeight || ''));
  const [images, setImages] = useState<{ id?: string; url: string; file?: File }[]>(product?.images || []);
  const [errors, setErrors] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [grupo, setGrupo] = useState(product?.metadata?.grupo || product?._group || '');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  const [rank, setRank] = useState<string>(
    product?._rank !== null && product?._rank !== undefined ? String(product._rank) : ''
  );

  const needsColorFromProduct = product ? product._needsColorSelection : false;
  const [colors, setColors] = useState<ColorItem[]>(product?._availableColors || []);
  const [colorChanged, setColorChanged] = useState(false);

  const currentYards = useMemo(() => {
    const m = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
    return m ? parseInt(m[1], 10) : null;
  }, [title]);

  const showColorSection = useMemo(() => {
    if (product) return needsColorFromProduct;
    if (currentYards === null) return false;
    return !SKIP_COLOR_YARDS.includes(currentYards);
  }, [product, needsColorFromProduct, currentYards]);

  const tabErrors = useMemo((): Partial<Record<EditorTab, boolean>> => {
    const out: Partial<Record<EditorTab, boolean>> = {};
    if (!title.trim()) out.info = true;
    if (!price || Number(price) <= 0) out.info = true;
    if (rank.trim() !== '' && (isNaN(Number(rank)) || Number(rank) < 0)) out.rank = true;
    return out;
  }, [title, price, rank]);

  const handleAutoHandle = (t: string) => {
    if (isNew || !product?.handle) {
      setHandle(
        t.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
      );
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    setErrors([]);
    const newErrors: string[] = [];
    const newImages: { url: string }[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const validationError = validateImageFile(file);
      if (validationError) { newErrors.push(`${file.name}: ${validationError}`); continue; }
      try {
        const result = await uploadImageToMedusa(file);
        newImages.push(result);
      } catch (err: any) {
        newErrors.push(`${file.name}: ${err.message}`);
      }
    }
    if (newImages.length > 0) setImages(prev => [...prev, ...newImages]);
    if (newErrors.length > 0) setErrors(newErrors);
    setUploadingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (idx: number) => setImages(prev => prev.filter((_, i) => i !== idx));
  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };
  const makePrimary = (idx: number) => moveImage(idx, 0);

  const handleSubmit = () => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Titulo obrigatorio');
    if (!price || Number(price) <= 0) errs.push('Preco invalido');
    let rankValue: number | null = null;
    if (rank.trim() !== '') {
      const n = Number(rank);
      if (isNaN(n) || n < 0) errs.push('Posicao deve ser um numero >= 0');
      else rankValue = Math.floor(n);
    }
    if (errs.length > 0) {
      setErrors(errs);
      if (!title.trim() || !price || Number(price) <= 0) setTab('info');
      else if (rank.trim() !== '') setTab('rank');
      return;
    }

    const finalGroup = showNewGroup && newGroupName.trim() ? newGroupName.trim() : grupo;

    onSave({
      title: title.trim(),
      handle: handle.trim() || undefined,
      description: description.trim(),
      status,
      price: Number(price),
      shipping_height: Number(shHeight) || null,
      shipping_width: Number(shWidth) || null,
      shipping_length: Number(shLength) || null,
      shipping_weight: Number(shWeight) || null,
      images: images.map(i => i.url),
      grupo: finalGroup,
      rank: rankValue,
      colors: colorChanged ? colors : undefined,
      isNew,
    });
  };

  return (
    <div className="fixed inset-0 bg-zinc-50 z-50 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-zinc-200 px-3 py-2.5 flex items-center gap-2 shrink-0 shadow-sm">
        <button onClick={onClose} className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl shrink-0" aria-label="Voltar">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5 truncate">
            {isNew
              ? <><PlusCircle size={14} className="text-emerald-600 shrink-0" /> Novo produto</>
              : <><Pencil size={14} className="text-blue-600 shrink-0" /> <span className="truncate">{product?.title || 'Editar'}</span></>
            }
          </h2>
          <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
            <StatusDot status={status} />
            <span className="text-[10px] text-zinc-500 font-medium">
              {status === 'published' ? 'Publicado' : 'Rascunho'}
            </span>
            {!isNew && product?._rank !== null && product?._rank !== undefined && (
              <RankPill rank={product._rank} />
            )}
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span>{saving ? '...' : 'Salvar'}</span>
        </button>
      </div>

      <EditorTabs current={tab} onChange={setTab} errors={tabErrors} />

      {!isNew && status === 'draft' && (
        <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[11px] text-amber-900 flex items-center gap-2 shrink-0">
          <Flag size={12} className="shrink-0" />
          <span className="flex-1 min-w-0"><strong>Modo Rascunho</strong> — voce pode editar e testar livremente. Nao aparece na loja.</span>
        </div>
      )}

      {errors.length > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-3 py-2 text-[12px] text-red-700 shrink-0">
          <div className="flex items-start gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              {errors.map((e, i) => <p key={i} className="break-words">- {e}</p>)}
            </div>
            <button onClick={() => setErrors([])} className="text-red-400 p-1 shrink-0"><X size={14} /></button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-3 py-4 pb-28 space-y-3">

          {tab === 'info' && (
            <>
              <Field label="Titulo" required>
                <input
                  value={title}
                  onChange={e => { setTitle(e.target.value); handleAutoHandle(e.target.value); }}
                  className={INPUT_CLASS}
                  placeholder="Ex: SHARK ATTACK 3000j Fio 4.4"
                />
              </Field>

              <Field label="URL (handle)">
                <input
                  value={handle}
                  onChange={e => setHandle(e.target.value)}
                  className={INPUT_CLASS + ' font-mono text-zinc-600'}
                  placeholder="shark-attack-3000j"
                />
              </Field>

              <Field label="Preco" required icon={<DollarSign size={11} />}>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 text-sm">R$</span>
                  <input
                    type="number" inputMode="decimal" step="0.01" min="0"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    className={INPUT_CLASS + ' pl-10'}
                    placeholder="45.90"
                  />
                </div>
              </Field>

              <Field label="Status">
                <div className="flex gap-2">
                  <StatusButton active={status === 'published'} onClick={() => setStatus('published')} variant="pub" />
                  <StatusButton active={status === 'draft'}     onClick={() => setStatus('draft')}     variant="draft" />
                </div>
                <p className="text-[10px] text-zinc-400 mt-1.5">
                  Produtos em rascunho podem ser editados e testados sem aparecer na loja.
                </p>
              </Field>

              <Field label="Grupo / Marca" icon={<Folder size={11} />}>
                {!showNewGroup ? (
                  <div className="flex gap-2">
                    <select
                      value={grupo}
                      onChange={e => setGrupo(e.target.value)}
                      className={INPUT_CLASS + ' flex-1 min-w-0 bg-white'}
                    >
                      <option value="">Detectar automaticamente</option>
                      {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <button
                      onClick={() => setShowNewGroup(true)}
                      className="px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-zinc-500 hover:border-blue-400 hover:text-blue-600 text-xs font-medium flex items-center gap-1 shrink-0"
                    >
                      <FolderPlus size={14} /> Novo
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      className={INPUT_CLASS + ' flex-1 min-w-0 border-blue-300 bg-blue-50/30'}
                      placeholder="Nome do novo grupo..."
                      autoFocus
                    />
                    <button
                      onClick={() => { setShowNewGroup(false); setNewGroupName(''); }}
                      className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 text-xs shrink-0"
                    >
                      Cancelar
                    </button>
                  </div>
                )}
              </Field>

              <Field label="Descricao">
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={4}
                  className={INPUT_CLASS + ' resize-y'}
                  placeholder="Descricao do produto (suporta HTML)..."
                />
              </Field>
            </>
          )}

          {tab === 'images' && (
            <>
              {images.length > 0 ? (
                <div className="grid grid-cols-3 gap-2">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative aspect-square rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
                      <img src={img.url} alt={`Img ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      {idx === 0 && (
                        <span className="absolute top-0 left-0 right-0 bg-blue-600/85 text-white text-[9px] text-center py-0.5 font-bold uppercase tracking-wider">
                          Principal
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between p-1.5 bg-gradient-to-t from-black/60 to-transparent">
                        <div className="flex gap-1">
                          {idx > 0 && (
                            <button onClick={() => moveImage(idx, idx - 1)} className="w-6 h-6 bg-white/95 rounded-md flex items-center justify-center text-zinc-700 shadow" aria-label="Esquerda">
                              <ChevronLeft size={12} />
                            </button>
                          )}
                          {idx < images.length - 1 && (
                            <button onClick={() => moveImage(idx, idx + 1)} className="w-6 h-6 bg-white/95 rounded-md flex items-center justify-center text-zinc-700 shadow" aria-label="Direita">
                              <ChevronRight size={12} />
                            </button>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {idx !== 0 && (
                            <button onClick={() => makePrimary(idx)} className="w-6 h-6 bg-blue-500/95 rounded-md flex items-center justify-center text-white shadow" aria-label="Principal" title="Tornar principal">
                              <ArrowUp size={12} />
                            </button>
                          )}
                          <button onClick={() => removeImage(idx)} className="w-6 h-6 bg-red-500/95 rounded-md flex items-center justify-center text-white shadow" aria-label="Remover">
                            <X size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-6 text-center text-[12px] text-zinc-500">
                  <Camera size={24} className="mx-auto mb-2 text-zinc-300" />
                  Nenhuma imagem ainda. Adicione abaixo.
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="w-full border-2 border-dashed border-zinc-300 hover:border-blue-400 rounded-xl py-5 flex flex-col items-center justify-center gap-1.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50/30 disabled:opacity-50"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 size={22} className="animate-spin text-blue-500" />
                    <span className="text-xs font-medium text-blue-600">Fazendo upload...</span>
                  </>
                ) : (
                  <>
                    <Upload size={20} />
                    <span className="text-xs font-semibold">Adicionar imagens</span>
                    <span className="text-[10px] text-zinc-400">JPG, PNG, WebP (max 10MB)</span>
                  </>
                )}
              </button>
              <p className="text-[10px] text-zinc-400 flex items-start gap-1">
                <Info size={10} className="shrink-0 mt-0.5" />
                A primeira imagem e a principal (aparece no catalogo).
              </p>
            </>
          )}

          {tab === 'colors' && (
            <>
              {!showColorSection ? (
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
              ) : (
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
                        <span key={c.name} className="flex items-center gap-1 bg-white px-2 py-1 rounded-full border border-purple-200 text-[11px] font-medium text-zinc-700">
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
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${c.in_stock ? 'bg-white border-zinc-200' : 'bg-red-50 border-red-200'}`}
                          >
                            <ColorDot name={c.name} hex={c.hex} size="lg" />
                            <span className={`flex-1 min-w-0 text-sm font-medium truncate ${c.in_stock ? 'text-zinc-800' : 'text-red-400 line-through'}`}>
                              {c.name}
                            </span>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 ${c.in_stock ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                              {c.in_stock ? 'Em estoque' : 'Sem estoque'}
                            </span>
                            <button
                              onClick={() => {
                                setColors(prev => prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc));
                                setColorChanged(true);
                              }}
                              className="p-1.5 text-zinc-400 hover:text-blue-600 shrink-0"
                              aria-label="Alternar estoque"
                              title="Alternar estoque"
                            >
                              {c.in_stock ? <EyeOff size={14} /> : <Eye size={14} />}
                            </button>
                            <button
                              onClick={() => { setColors(prev => prev.filter(cc => cc.name !== c.name)); setColorChanged(true); }}
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
              )}
            </>
          )}

          {tab === 'rank' && (
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
                    <button onClick={() => setRank('')} className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 hover:text-red-600 text-xs font-medium shrink-0">
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
          )}

          {tab === 'shipping' && (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <Field label="Altura (cm)">
                  <input type="number" inputMode="decimal" step="0.1" min="0" value={shHeight} onChange={e => setShHeight(e.target.value)} className={INPUT_CLASS} placeholder="12" />
                </Field>
                <Field label="Largura (cm)">
                  <input type="number" inputMode="decimal" step="0.1" min="0" value={shWidth} onChange={e => setShWidth(e.target.value)} className={INPUT_CLASS} placeholder="12" />
                </Field>
                <Field label="Comprimento (cm)">
                  <input type="number" inputMode="decimal" step="0.1" min="0" value={shLength} onChange={e => setShLength(e.target.value)} className={INPUT_CLASS} placeholder="19" />
                </Field>
                <Field label="Peso (kg)">
                  <input type="number" inputMode="decimal" step="0.01" min="0" value={shWeight} onChange={e => setShWeight(e.target.value)} className={INPUT_CLASS} placeholder="0.5" />
                </Field>
              </div>
              {(() => {
                const m = title?.match(/([0-9]+)\s*UNIDADES?/i);
                const unidades = m ? parseInt(m[1], 10) : 1;
                const peso = Number(shWeight) || 0;
                if (unidades < 2 || peso <= 0) return null;
                const pesoPorUnidade = peso / unidades;
                if (pesoPorUnidade < 0.04) {
                  return (
                    <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                      <div>
                        <strong>Peso suspeito:</strong> {unidades} unidades com {peso} kg
                        ({(pesoPorUnidade * 1000).toFixed(1)} g/unidade).
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              <p className="text-[10px] text-zinc-400 flex items-start gap-1">
                <Info size={10} className="shrink-0 mt-0.5" />
                Dimensoes usadas pelo SuperFrete. Para packs, pese o pacote completo.
              </p>
            </>
          )}

        </div>
      </div>

      <div
        className="sm:hidden bg-white border-t border-zinc-200 px-3 py-2 shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-blue-600 text-white px-4 py-3.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Salvando...' : isNew ? 'Criar Produto' : 'Salvar alteracoes'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// PRODUCT CARD — compacto
// ============================================================================

function ProductCard({
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
        <button onClick={onToggleSelect} className="shrink-0 flex items-center touch-manipulation px-1" aria-label="Selecionar">
          {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-zinc-300" />}
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

      <button onClick={() => onEdit(product)} className="flex-1 min-w-0 text-left touch-manipulation">
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
            <span className="text-[10px] text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-semibold">Sem estoque</span>
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

// ============================================================================
// PRODUCT ACTION SHEET
// ============================================================================

function ProductActionSheet({
  product, onClose, onEdit, onStatusChange, onQuickRank, saving,
}: {
  product: ParsedProduct;
  onClose: () => void;
  onEdit: (p: ParsedProduct) => void;
  onStatusChange: (id: string, s: string) => void;
  onQuickRank: (id: string) => void;
  saving: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md overflow-hidden animate-slide-up-bar"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span className="block w-10 h-1 bg-zinc-300 rounded-full" />
        </div>

        <div className="px-4 pb-3 border-b border-zinc-100 flex items-center gap-2">
          <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
            {product.images?.[0]?.url
              ? <img src={product.images[0].url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              : <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package size={14} /></div>}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-zinc-900 truncate">{product.title}</p>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <StatusDot status={product.status} />
              <span className="text-[10px] text-zinc-500">R$ {product._priceDisplay}</span>
              {product._rank !== null && <RankPill rank={product._rank} />}
            </div>
          </div>
        </div>

        <div className="py-1">
          <ActionRow icon={<Pencil size={16} className="text-blue-600" />} label="Editar produto" onClick={() => { onClose(); onEdit(product); }} />
          <ActionRow icon={<TrendingUp size={16} className="text-amber-600" />} label={product._rank !== null ? `Posicao: #${product._rank}` : 'Definir posicao'} onClick={() => { onClose(); onQuickRank(product.id); }} />
          {product.status === 'published' ? (
            <ActionRow icon={<GlobeLock size={16} className="text-amber-600" />} label="Despublicar (virar rascunho)" onClick={() => { onStatusChange(product.id, 'draft'); onClose(); }} disabled={saving} />
          ) : (
            <ActionRow icon={<Globe size={16} className="text-emerald-600" />} label="Publicar na loja" onClick={() => { onStatusChange(product.id, 'published'); onClose(); }} disabled={saving} />
          )}
        </div>

        <div className="px-4 pt-2 pb-3 border-t border-zinc-100">
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

function ActionRow({
  icon, label, onClick, disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-zinc-50 disabled:opacity-50 transition-colors"
    >
      <span className="w-8 h-8 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">{icon}</span>
      <span className="text-sm font-medium text-zinc-800 flex-1 min-w-0 truncate">{label}</span>
      <ChevronRight size={14} className="text-zinc-300 shrink-0" />
    </button>
  );
}

// ============================================================================
// QUICK RANK POPUP
// ============================================================================

function QuickRankPopup({
  product, onApply, onClose, saving,
}: {
  product: ParsedProduct;
  onApply: (id: string, rank: number | null) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [rank, setRank] = useState(product._rank !== null ? String(product._rank) : '');

  const apply = () => {
    if (rank.trim() === '') { onApply(product.id, null); return; }
    const n = Number(rank);
    if (!isNaN(n) && n >= 0) onApply(product.id, Math.floor(n));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-600 shrink-0" />
            <span className="truncate">Definir posicao</span>
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{product.title}</p>
        </div>
        <div className="px-4 py-3 space-y-2.5">
          <div className="flex gap-2 items-stretch">
            <input
              type="number" inputMode="numeric" min="0" step="1"
              value={rank}
              onChange={e => setRank(e.target.value)}
              className={INPUT_CLASS + ' flex-1 min-w-0'}
              placeholder="Ex: 1, 2, 3..."
              autoFocus
            />
            {rank.trim() !== '' && (
              <button onClick={() => setRank('')} className="px-3 rounded-xl border border-zinc-200 text-zinc-500 text-xs font-medium shrink-0">
                Limpar
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {['1', '2', '3', '5', '10'].map(n => (
              <button
                key={n}
                onClick={() => setRank(n)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                  rank === n ? 'bg-amber-600 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-amber-50 hover:text-amber-700'
                }`}
              >
                #{n}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-zinc-500">
            Menor = mais no topo. Deixe vazio para remover.
          </p>
        </div>
        <div className="px-4 py-3 border-t border-zinc-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600">
            Cancelar
          </button>
          <button
            onClick={apply}
            disabled={saving}
            className="flex-1 bg-amber-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BULK ACTION SHEET
// ============================================================================

function BulkActionSheet({
  count, onClose, onOpenStatus, onOpenColors, onOpenAddColor, onOpenRemoveColor, onOpenRank,
}: {
  count: number;
  onClose: () => void;
  onOpenStatus: () => void;
  onOpenColors: () => void;
  onOpenAddColor: () => void;
  onOpenRemoveColor: () => void;
  onOpenRank: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-end justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl w-full max-w-md overflow-hidden animate-slide-up-bar"
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex justify-center pt-2 pb-1">
          <span className="block w-10 h-1 bg-zinc-300 rounded-full" />
        </div>
        <div className="px-4 pb-3 border-b border-zinc-100">
          <h3 className="text-sm font-bold text-zinc-900">Acoes em massa</h3>
          <p className="text-[11px] text-zinc-500 mt-0.5">{count} produto{count > 1 ? 's' : ''} selecionado{count > 1 ? 's' : ''}</p>
        </div>
        <div className="py-1">
          <ActionRow icon={<Globe size={16} className="text-blue-600" />} label="Publicar / Despublicar" onClick={() => { onClose(); onOpenStatus(); }} />
          <ActionRow icon={<TrendingUp size={16} className="text-amber-600" />} label="Definir posicao (ranking)" onClick={() => { onClose(); onOpenRank(); }} />
          <ActionRow icon={<Palette size={16} className="text-purple-600" />} label="Editar cores (avancado)" onClick={() => { onClose(); onOpenColors(); }} />
          <ActionRow icon={<Plus size={16} className="text-emerald-600" />} label="Adicionar cor rapidamente" onClick={() => { onClose(); onOpenAddColor(); }} />
          <ActionRow icon={<Minus size={16} className="text-red-600" />} label="Remover cor rapidamente" onClick={() => { onClose(); onOpenRemoveColor(); }} />
        </div>
        <div className="px-4 pt-2 pb-3 border-t border-zinc-100">
          <button onClick={onClose} className="w-full py-3 rounded-xl text-sm font-bold border border-zinc-200 text-zinc-600 hover:bg-zinc-50">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BULK STATUS MODAL
// ============================================================================

function BulkStatusModal({ products, onApply, onClose, saving }: {
  products: ParsedProduct[];
  onApply: (productIds: string[], newStatus: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const publishedCount = products.filter(p => p.status === 'published').length;
  const draftCount = products.filter(p => p.status === 'draft').length;
  const [confirmUnpub, setConfirmUnpub] = useState(false);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-4 py-3 border-b border-zinc-100">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Globe size={18} className="text-blue-600 shrink-0" />
              <span className="truncate">Publicar / Despublicar</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {products.length} produto(s): {publishedCount} pub, {draftCount} rascunho
            </p>
          </div>
          <div className="px-4 py-4 space-y-2">
            <button
              onClick={() => onApply(products.map(p => p.id), 'published')}
              disabled={saving}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Globe size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Publicar todos</p>
                <p className="text-[11px] text-zinc-500 truncate">{products.length} produto(s) visiveis na loja</p>
              </div>
              {saving ? <Loader2 size={16} className="animate-spin text-zinc-400 shrink-0" /> : <ChevronRight size={16} className="text-zinc-300 shrink-0" />}
            </button>
            <button
              onClick={() => setConfirmUnpub(true)}
              disabled={saving}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left disabled:opacity-50"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <GlobeLock size={18} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Despublicar todos</p>
                <p className="text-[11px] text-zinc-500 truncate">Ocultar da loja (rascunho)</p>
              </div>
              <ChevronRight size={16} className="text-zinc-300 shrink-0" />
            </button>
          </div>
          <div className="px-4 py-3 border-t border-zinc-100">
            <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400">
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {confirmUnpub && (
        <ConfirmModal
          title="Despublicar produtos?"
          message={<>Voce esta prestes a <strong>despublicar {products.length} produto(s)</strong>. Eles ficarao ocultos da loja publica ate serem publicados novamente.</>}
          confirmLabel="Sim, despublicar"
          danger
          loading={saving}
          onConfirm={() => { setConfirmUnpub(false); onApply(products.map(p => p.id), 'draft'); }}
          onClose={() => setConfirmUnpub(false)}
        />
      )}
    </>
  );
}

// ============================================================================
// BULK COLOR EDITOR
// ============================================================================

function BulkColorEditor({ products, onApply, onClose, saving }: {
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
    const m = new Map();
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
                Os produtos selecionados nao aceitam variacao de cor (linhas 50/100/200j, carretilhas, camisas, bones).
              </p>
            </div>
          </div>
          <button onClick={onClose} className="mt-4 w-full py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold">
            Entendi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[88vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
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
              <div key={group.key} className={`rounded-xl border ${isChanged ? 'border-purple-300 bg-purple-50/30' : 'border-zinc-200 bg-zinc-50/50'} p-3 space-y-2.5`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                      Grupo {gi + 1} - {group.products.length} produto(s)
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {group.products.slice(0, 3).map(p => (
                        <span key={p.id} className="text-[10px] bg-white text-zinc-600 px-1.5 py-0.5 rounded border border-zinc-200 truncate max-w-[140px]">
                          {p.title}
                        </span>
                      ))}
                      {group.products.length > 3 && (
                        <span className="text-[10px] text-zinc-400 px-1.5 py-0.5">+{group.products.length - 3}</span>
                      )}
                    </div>
                  </div>
                  {isChanged && <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold shrink-0">Modificado</span>}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Cores</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.length === 0 ? <span className="text-[11px] text-zinc-400 italic">Sem cores</span> : colors.map(c => (
                      <div key={c.name} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${c.in_stock ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-red-50 border-red-200 text-red-500'}`}>
                        <ColorDot name={c.name} hex={c.hex} />
                        <span className={!c.in_stock ? 'line-through' : ''}>{c.name}</span>
                        <button onClick={() => updateGroupColor(group.key, prev => prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc))} className={`p-0.5 ${c.in_stock ? 'text-zinc-400' : 'text-emerald-500'}`} aria-label="Alternar estoque">
                          {c.in_stock ? <EyeOff size={11} /> : <Eye size={11} />}
                        </button>
                        <button onClick={() => updateGroupColor(group.key, prev => prev.filter(cc => cc.name !== c.name))} className="p-0.5 text-zinc-300 hover:text-red-500" aria-label="Remover">
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
                        onClick={() => updateGroupColor(group.key, prev => [...prev, { name: ac.name, hex: ac.hex, in_stock: true }])}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600"
                      >
                        <Plus size={10} /><ColorDot name={ac.name} hex={ac.hex} /><span>{ac.name}</span>
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
            <span className="truncate">{saving ? 'Salvando...' : `Salvar (${changedGroups.size})`}</span>
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 shrink-0">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// QUICK BULK COLOR (Add / Remove rapido)
// ============================================================================

function QuickBulkColorModal({
  products, action, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  action: 'add' | 'remove';
  onApply: (productIds: string[], colorNames: string[], action: string) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const eligible = products.filter(p => p._needsColorSelection);
  const skipped = products.length - eligible.length;
  const toggleColor = (name: string) => setSelectedColors(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base truncate">
              {action === 'add' ? 'Adicionar Cores' : 'Remover Cores'}
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {eligible.length} produto(s) receberao a acao
              {skipped > 0 && <span className="text-amber-600"> - {skipped} ignorado(s)</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 rounded-xl shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {skipped > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 mb-3 flex items-start gap-2">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>{skipped} produto(s) sem variacao de cor serao pulados.</span>
            </div>
          )}
          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Selecione as cores</p>
          <div className="flex flex-wrap gap-1.5">
            {ALL_COLORS.map(c => {
              const isSelected = selectedColors.includes(c.name);
              return (
                <button
                  key={c.name}
                  onClick={() => toggleColor(c.name)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-all ${
                    isSelected ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-600 border-zinc-200'
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

        <div className="border-t border-zinc-100 px-4 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={() => onApply(eligible.map(p => p.id), selectedColors, action)}
            disabled={saving || selectedColors.length === 0 || eligible.length === 0}
            className={`flex-1 text-white px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 min-w-0 ${
              action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : action === 'add' ? <Plus size={16} /> : <Minus size={16} />}
            <span className="truncate">
              {saving ? 'Aplicando...' : `${action === 'add' ? 'Add' : 'Remover'} ${selectedColors.length} em ${eligible.length}`}
            </span>
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 shrink-0">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BULK RANK MODAL
// ============================================================================

function BulkRankModal({
  products, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  onApply: (productIds: string[], rankOrOpts: number | null | { __sequential: true; start: number }) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [mode, setMode] = useState<'set' | 'clear' | 'sequential'>('sequential');
  const [rankValue, setRankValue] = useState('1');
  const [startValue, setStartValue] = useState('1');

  const handleApply = () => {
    if (mode === 'clear') { onApply(products.map(p => p.id), null); return; }
    if (mode === 'set') {
      const n = Number(rankValue);
      if (isNaN(n) || n < 0) return;
      onApply(products.map(p => p.id), Math.floor(n));
      return;
    }
    const start = Number(startValue);
    if (isNaN(start) || start < 0) return;
    onApply(products.map(p => p.id), { __sequential: true, start: Math.floor(start) });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[95] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-amber-600 shrink-0" />
              <span className="truncate">Posicao em massa</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">{products.length} produto(s)</p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 rounded-xl shrink-0"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          <ModeCard
            active={mode === 'sequential'}
            onClick={() => setMode('sequential')}
            icon={<ListOrdered size={16} />}
            title="Sequencial (recomendado)"
            desc="Primeiro selecionado = #1, segundo = #2..."
          />
          <ModeCard
            active={mode === 'set'}
            onClick={() => setMode('set')}
            icon={<Hash size={16} />}
            title="Mesmo numero para todos"
            desc="Todos recebem a mesma posicao."
          />
          <ModeCard
            active={mode === 'clear'}
            onClick={() => setMode('clear')}
            icon={<X size={16} />}
            title="Limpar posicao"
            desc="Remove o rank - volta a ordem padrao."
            danger
          />

          {mode === 'set' && (
            <Field label="Posicao">
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={rankValue}
                onChange={e => setRankValue(e.target.value)}
                className={INPUT_CLASS}
                placeholder="1"
              />
            </Field>
          )}
          {mode === 'sequential' && (
            <Field label="Comecar em">
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={startValue}
                onChange={e => setStartValue(e.target.value)}
                className={INPUT_CLASS}
                placeholder="1"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Produtos na ordem atual viram {startValue || '?'}, {Number(startValue) + 1 || '?'}, {Number(startValue) + 2 || '?'}...
              </p>
            </Field>
          )}
        </div>

        <div className="border-t border-zinc-100 px-4 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex-1 bg-amber-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 min-w-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="truncate">
              {saving ? 'Aplicando...' : mode === 'clear' ? 'Limpar' : mode === 'set' ? `Aplicar #${rankValue}` : 'Aplicar sequencial'}
            </span>
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 shrink-0">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModeCard({
  active, onClick, icon, title, desc, danger = false,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
  danger?: boolean;
}) {
  const activeClass = danger ? 'border-red-300 bg-red-50' : 'border-amber-400 bg-amber-50';
  return (
    <button
      onClick={onClick}
      className={`w-full p-3 rounded-xl border text-left transition-all flex items-start gap-2.5 ${
        active ? activeClass : 'border-zinc-200 bg-white hover:border-zinc-300'
      }`}
    >
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
        danger ? 'bg-red-100 text-red-600' : active ? 'bg-amber-100 text-amber-700' : 'bg-zinc-100 text-zinc-500'
      }`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-zinc-900">{title}</p>
        <p className="text-[11px] text-zinc-500 mt-0.5">{desc}</p>
      </div>
      {active && <Check size={16} className={danger ? 'text-red-500 shrink-0' : 'text-amber-600 shrink-0'} />}
    </button>
  );
}

// ============================================================================
// REORDER MODE
// ============================================================================

function ReorderMode({
  products, onCancel, onSave, saving,
}: {
  products: ParsedProduct[];
  onCancel: () => void;
  onSave: (ordered: ParsedProduct[]) => void;
  saving: boolean;
}) {
  const initialOrder = () => {
    return [...products].sort((a, b) => {
      const ra = a._rank, rb = b._rank;
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return ra - rb;
    });
  };
  const [order, setOrder] = useState<ParsedProduct[]>(initialOrder);
  const [dirty, setDirty] = useState(false);

  const move = (idx: number, to: number) => {
    if (to < 0 || to >= order.length) return;
    setOrder(prev => {
      const next = [...prev];
      const [item] = next.splice(idx, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDirty(true);
  };
  const moveTop = (idx: number) => move(idx, 0);
  const moveBottom = (idx: number) => move(idx, order.length - 1);
  const reset = () => { setOrder(initialOrder()); setDirty(false); };

  return (
    <div className="fixed inset-0 bg-zinc-50 z-40 flex flex-col overflow-hidden">
      <div className="bg-white border-b border-zinc-200 px-3 py-2.5 flex items-center gap-2 shrink-0 shadow-sm">
        <button onClick={onCancel} className="p-2 text-zinc-500 hover:bg-zinc-100 rounded-xl shrink-0" aria-label="Cancelar">
          <ArrowLeft size={20} />
        </button>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-zinc-900 flex items-center gap-1.5">
            <ListOrdered size={14} className="text-amber-600 shrink-0" />
            Reordenar produtos
          </h2>
          <p className="text-[10px] text-zinc-500 truncate">
            {order.length} produto(s) - use as setas para reorganizar
          </p>
        </div>
        {dirty && (
          <button onClick={reset} className="px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-500 hover:bg-zinc-100 shrink-0">
            Desfazer
          </button>
        )}
        <button
          onClick={() => onSave(order)}
          disabled={!dirty || saving}
          className="bg-amber-600 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5 shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar ordem
        </button>
      </div>

      <div className="bg-amber-50 border-b border-amber-200 px-3 py-2 text-[11px] text-amber-900 shrink-0">
        A ordem aqui vira a posicao na loja. Primeiro = <strong>#1</strong> (topo), segundo = #2, e assim por diante.
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto px-2 py-2">
          {order.map((p, idx) => {
            const image = p.images?.[0]?.url || p.thumbnail || '';
            return (
              <div key={p.id} className="bg-white rounded-xl border border-zinc-200 mb-1.5 p-2 flex items-center gap-2 shadow-sm">
                <div className="shrink-0 w-9 flex flex-col items-center">
                  <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Pos</span>
                  <span className="text-lg font-black text-amber-600 leading-none">{idx + 1}</span>
                </div>
                <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
                  {image
                    ? <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    : <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package size={12} /></div>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-zinc-900 truncate">{p.title}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <StatusDot status={p.status} />
                    <span className="text-[10px] text-zinc-500">R$ {p._priceDisplay}</span>
                    {p._yards && <span className="text-[10px] text-zinc-400">{p._yards}j</span>}
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => move(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Subir"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => move(idx, idx + 1)}
                    disabled={idx === order.length - 1}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-amber-100 hover:text-amber-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Descer"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button
                    onClick={() => moveTop(idx)}
                    disabled={idx === 0}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Ao topo"
                    title="Topo"
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    onClick={() => moveBottom(idx)}
                    disabled={idx === order.length - 1}
                    className="w-8 h-6 flex items-center justify-center rounded-md bg-zinc-100 text-zinc-600 hover:bg-blue-100 hover:text-blue-700 disabled:opacity-30 disabled:hover:bg-zinc-100 touch-manipulation"
                    aria-label="Ao final"
                    title="Base"
                  >
                    <ChevronDown size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function AdminProducts() {
  const [products, setProducts] = useState<ParsedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [sortByRank, setSortByRank] = useState(true);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [showBulkColors, setShowBulkColors] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkRank, setShowBulkRank] = useState(false);
  const [quickBulkAction, setQuickBulkAction] = useState<'add' | 'remove' | null>(null);

  const [editingProduct, setEditingProduct] = useState<ParsedProduct | null | undefined>(undefined);
  const [editSaving, setEditSaving] = useState(false);

  const [actionSheetProduct, setActionSheetProduct] = useState<ParsedProduct | null>(null);
  const [quickRankProductId, setQuickRankProductId] = useState<string | null>(null);

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

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const patchMetadata = async (productId: string, patch: Record<string, any>) => {
    const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
    const currentMetadata = productData.product?.metadata || {};
    const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
      method: 'POST',
      body: JSON.stringify({ metadata: { ...currentMetadata, ...patch } }),
    });
    if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro');
    return { ...currentMetadata, ...patch };
  };

  const handleStatusChange = useCallback(async (productId: string, newStatus: string) => {
    setSavingId(productId);
    try {
      const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
        method: 'POST',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro');
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, status: newStatus } : p));
      showToast(`Produto ${newStatus === 'published' ? 'publicado' : 'despublicado'}!`, 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, []);

  const handleQuickRankApply = useCallback(async (productId: string, rank: number | null) => {
    setSavingId(productId);
    try {
      const newMeta = await patchMetadata(productId, { rank });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, metadata: newMeta, _rank: rank } : p));
      setQuickRankProductId(null);
      showToast(rank === null ? 'Posicao removida' : `Posicao atualizada: #${rank}`, 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, []);

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
    setSelectionMode(false);
    showToast(
      fail === 0 ? `${ok} produto(s) ${newStatus === 'published' ? 'publicado(s)' : 'despublicado(s)'}!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  const handleBulkColorApply = useCallback(async (updates: { productId: string; colors: ColorItem[] }[]) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;
    for (const { productId, colors } of updates) {
      try {
        const newMeta = await patchMetadata(productId, { available_colors: colors });
        ok++;
        const configKey = colors.map(c => `${c.name}:${c.in_stock ? '1' : '0'}`).sort().join('|') || 'NONE';
        setProducts(prev => prev.map(p =>
          p.id === productId
            ? { ...p, _availableColors: colors, metadata: newMeta, _colorConfigKey: configKey, _colorSource: 'metadata' as const }
            : p
        ));
      } catch { fail++; }
    }
    setBulkSaving(false);
    setShowBulkColors(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
    showToast(
      fail === 0 ? `Cores atualizadas em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  const handleQuickBulkColorApply = useCallback(async (productIds: string[], colorNames: string[], action: string) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;

    for (const pid of productIds) {
      try {
        const productData = await adminFetch(`/admin/produtos-custom/${pid}`);
        const currentMetadata = productData.product?.metadata || {};
        let currentColors: ColorItem[] = currentMetadata.available_colors || [];
        if (currentColors.length === 0) {
          const product = products.find(p => p.id === pid);
          if (product && product._colorSource === 'derived') {
            currentColors = [...product._availableColors];
          }
        }
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
          body: JSON.stringify({ metadata: { ...currentMetadata, available_colors: currentColors } }),
        });
        if (result.success) {
          ok++;
          const configKey = currentColors.map(c => `${c.name}:${c.in_stock ? '1' : '0'}`).sort().join('|') || 'NONE';
          setProducts(prev => prev.map(p =>
            p.id === pid
              ? { ...p, _availableColors: currentColors, metadata: { ...p.metadata, available_colors: currentColors }, _colorConfigKey: configKey, _colorSource: 'metadata' as const }
              : p
          ));
        } else fail++;
      } catch { fail++; }
    }

    setBulkSaving(false);
    setQuickBulkAction(null);
    setSelectedIds(new Set());
    setSelectionMode(false);
    showToast(
      fail === 0 ? `Cores ${action === 'add' ? 'adicionadas' : 'removidas'} em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, [products]);

  const handleBulkRankApply = useCallback(async (productIds: string[], rankOrOpts: number | null | { __sequential: true; start: number }) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;
    const isSequential = rankOrOpts !== null && typeof rankOrOpts === 'object' && (rankOrOpts as any).__sequential;
    const startValue = isSequential ? (rankOrOpts as any).start : 0;

    for (let i = 0; i < productIds.length; i++) {
      const pid = productIds[i];
      const rankToSet: number | null = isSequential ? startValue + i : (rankOrOpts as number | null);
      try {
        const newMeta = await patchMetadata(pid, { rank: rankToSet });
        ok++;
        setProducts(prev => prev.map(p => p.id === pid ? { ...p, metadata: newMeta, _rank: rankToSet } : p));
      } catch { fail++; }
    }

    setBulkSaving(false);
    setShowBulkRank(false);
    setSelectedIds(new Set());
    setSelectionMode(false);
    showToast(
      fail === 0
        ? isSequential ? `Posicao sequencial aplicada em ${ok} produto(s)!`
        : rankOrOpts === null ? `Posicao removida de ${ok} produto(s)` : `Posicao #${rankOrOpts} aplicada em ${ok} produto(s)!`
        : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  const handleReorderSave = useCallback(async (ordered: ParsedProduct[]) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;
    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      const newRank = i + 1;
      if (p._rank === newRank) { ok++; continue; }
      try {
        const newMeta = await patchMetadata(p.id, { rank: newRank });
        ok++;
        setProducts(prev => prev.map(pp => pp.id === p.id ? { ...pp, metadata: newMeta, _rank: newRank } : pp));
      } catch { fail++; }
    }
    setBulkSaving(false);
    setViewMode('list');
    showToast(
      fail === 0 ? `Ordem salva em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  const handleProductSave = useCallback(async (data: any) => {
    setEditSaving(true);
    try {
      if (data.isNew) {
        const metadataPayload: Record<string, any> = {
          shipping_height: data.shipping_height,
          shipping_width: data.shipping_width,
          shipping_length: data.shipping_length,
          shipping_weight: data.shipping_weight,
        };
        if (data.grupo) metadataPayload.grupo = data.grupo;
        if (data.colors && data.colors.length > 0) metadataPayload.available_colors = data.colors;
        if (data.rank !== null && data.rank !== undefined) metadataPayload.rank = data.rank;

        const result = await adminFetch('/admin/produtos-custom', {
          method: 'POST',
          body: JSON.stringify({
            title: data.title,
            handle: data.handle,
            description: data.description,
            status: data.status,
            price: data.price,
            images: data.images,
            metadata: metadataPayload,
          }),
        });
        if (!result.success && !result.product) throw new Error(result.errors?.join(', ') || 'Erro ao criar');
        showToast('Produto criado com sucesso!', 'success');
        setEditingProduct(undefined);
        loadProducts();
      } else {
        const productId = editingProduct?.id;
        if (!productId) throw new Error('ID nao encontrado');

        const productData = await adminFetch(`/admin/produtos-custom/${productId}`);
        const currentMetadata = productData.product?.metadata || {};

        const metadataUpdate: Record<string, any> = {
          ...currentMetadata,
          shipping_height: data.shipping_height,
          shipping_width: data.shipping_width,
          shipping_length: data.shipping_length,
          shipping_weight: data.shipping_weight,
        };
        if (data.grupo) metadataUpdate.grupo = data.grupo;
        if (data.colors !== undefined) metadataUpdate.available_colors = data.colors;
        metadataUpdate.rank = data.rank;

        const updatePayload: any = {
          title: data.title,
          handle: data.handle,
          description: data.description,
          status: data.status,
          metadata: metadataUpdate,
        };

        if (data.price && editingProduct && data.price !== editingProduct._price) {
          updatePayload.price = data.price;
          if (editingProduct._variantId) updatePayload.variant_id = editingProduct._variantId;
          if (editingProduct._priceId) updatePayload.price_id = editingProduct._priceId;
        }

        const currentUrls = (editingProduct?.images || []).map(i => i.url);
        const newUrls = data.images || [];
        if (JSON.stringify(currentUrls) !== JSON.stringify(newUrls)) {
          updatePayload.images = newUrls;
        }

        const result = await adminFetch(`/admin/produtos-custom/${productId}`, {
          method: 'POST',
          body: JSON.stringify(updatePayload),
        });
        if (!result.success) throw new Error(result.errors?.join(', ') || 'Erro ao salvar');

        showToast('Produto atualizado!', 'success');
        setEditingProduct(undefined);
        loadProducts();
      }
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setEditSaving(false);
    }
  }, [editingProduct]);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

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

    if (groupFilter !== 'all') result = result.filter(p => p._group === groupFilter);

    if (statusFilter === 'published') result = result.filter(p => p.status === 'published');
    else if (statusFilter === 'draft') result = result.filter(p => p.status === 'draft');
    else if (statusFilter === 'no_colors') result = result.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0);
    else if (statusFilter === 'has_colors') result = result.filter(p => p._availableColors.length > 0);
    else if (statusFilter === 'multicolor') result = result.filter(p => p._isLine && !p._needsColorSelection);
    else if (statusFilter === 'derived_colors') result = result.filter(p => p._colorSource === 'derived');
    else if (statusFilter === 'saved_colors') result = result.filter(p => p._colorSource === 'metadata');
    else if (statusFilter === 'with_rank') result = result.filter(p => p._rank !== null);
    else if (statusFilter === 'no_rank') result = result.filter(p => p._rank === null);
    else if (statusFilter === 'out_of_stock') result = result.filter(p => p._stock !== null && p._stock <= 0);

    if (sortByRank) {
      result = [...result].sort((a, b) => {
        const ra = a._rank, rb = b._rank;
        if (ra === null && rb === null) return 0;
        if (ra === null) return 1;
        if (rb === null) return -1;
        return ra - rb;
      });
    }

    return result;
  }, [products, searchQuery, groupFilter, statusFilter, sortByRank]);

  const groups = useMemo(() => {
    const set = new Set(products.map(p => p._group));
    return Array.from(set).sort();
  }, [products]);

  const stats = useMemo(() => ({
    total: products.length,
    published: products.filter(p => p.status === 'published').length,
    draft: products.filter(p => p.status === 'draft').length,
    noColors: products.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0).length,
    withRank: products.filter(p => p._rank !== null).length,
    outOfStock: products.filter(p => p._stock !== null && p._stock <= 0).length,
  }), [products]);

  const selectedProducts = filteredProducts.filter(p => selectedIds.has(p.id));
  const hasSelection = selectedIds.size > 0;

  const selectAll = () => {
    if (selectedIds.size === filteredProducts.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(filteredProducts.map(p => p.id)));
  };

  const hasActiveFilter = groupFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim() !== '';

  if (viewMode === 'reorder') {
    return (
      <>
        <ReorderMode
          products={filteredProducts}
          onCancel={() => setViewMode('list')}
          onSave={handleReorderSave}
          saving={bulkSaving}
        />
        {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      </>
    );
  }

  return (
    <div className="space-y-2.5 pb-24 overflow-x-hidden">
      <div className="grid grid-cols-4 gap-1.5">
        <StatTile label="Total" value={stats.total} tone="zinc" />
        <StatTile label="Pub" value={stats.published} tone="emerald" />
        <StatTile label="Rasc" value={stats.draft} tone="amber" />
        <StatTile label="Rank" value={stats.withRank} tone="blue" />
      </div>

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-1.5 px-2.5 py-2">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar por nome, handle, grupo..."
            className="flex-1 min-w-0 text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-zinc-300 hover:text-zinc-500 shrink-0">
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => setEditingProduct(null)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shrink-0"
            aria-label="Novo produto"
          >
            <PlusCircle size={14} />
            <span className="hidden sm:inline">Novo</span>
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
        <ModePill
          active={viewMode === 'list'}
          onClick={() => setViewMode('list')}
          icon={<LayoutGrid size={13} />}
          label="Lista"
        />
        <ModePill
          active={false}
          onClick={() => setViewMode('reorder')}
          icon={<ListOrdered size={13} />}
          label={hasActiveFilter ? `Ordenar (${filteredProducts.length})` : 'Ordenar'}
          accent="amber"
        />
        <div className="flex-1" />
        <ModePill
          active={sortByRank}
          onClick={() => setSortByRank(s => !s)}
          icon={<ArrowUpDown size={13} />}
          label={sortByRank ? 'Ordem: Rank' : 'Ordem: Padrao'}
        />
        <button
          onClick={loadProducts}
          className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg shrink-0"
          aria-label="Atualizar"
          title="Atualizar"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        <FilterPill active={groupFilter === 'all'} onClick={() => setGroupFilter('all')} icon={<LayoutGrid size={11} />} label="Todos" />
        {groups.map(g => (
          <FilterPill
            key={g}
            active={groupFilter === g}
            onClick={() => setGroupFilter(g === groupFilter ? 'all' : g)}
            icon={<Tag size={11} />}
            label={g}
          />
        ))}
      </div>

      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1 pb-0.5">
        <FilterPill active={statusFilter === 'all'} onClick={() => setStatusFilter('all')} icon={<Filter size={11} />} label="Todos status" />
        <FilterPill
          active={statusFilter === 'published'}
          onClick={() => setStatusFilter(statusFilter === 'published' ? 'all' : 'published')}
          icon={<Eye size={11} />}
          label="Publicados"
          tone="emerald"
        />
        <FilterPill
          active={statusFilter === 'draft'}
          onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')}
          icon={<EyeOff size={11} />}
          label="Rascunhos"
          tone="amber"
        />
        <FilterPill
          active={statusFilter === 'with_rank'}
          onClick={() => setStatusFilter(statusFilter === 'with_rank' ? 'all' : 'with_rank')}
          icon={<TrendingUp size={11} />}
          label={`Com rank (${stats.withRank})`}
          tone="amber"
        />
        {stats.outOfStock > 0 && (
          <FilterPill
            active={statusFilter === 'out_of_stock'}
            onClick={() => setStatusFilter(statusFilter === 'out_of_stock' ? 'all' : 'out_of_stock')}
            icon={<AlertTriangle size={11} />}
            label={`Sem estoque (${stats.outOfStock})`}
            tone="red"
          />
        )}
        <button
          onClick={() => setShowMoreFilters(s => !s)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 shrink-0"
        >
          <Filter size={11} />
          Mais
          {showMoreFilters ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </button>
      </div>

      {showMoreFilters && (
        <div className="bg-white rounded-xl border border-zinc-200 px-2.5 py-2">
          <div className="flex gap-1.5 flex-wrap">
            {[
              { key: 'no_colors',      label: `Sem cores (${stats.noColors})` },
              { key: 'has_colors',     label: 'Com cores' },
              { key: 'multicolor',     label: 'Multicor' },
              { key: 'derived_colors', label: 'Auto-derivadas' },
              { key: 'saved_colors',   label: 'Cores salvas' },
              { key: 'no_rank',        label: 'Sem rank' },
            ].map(f => (
              <FilterPill
                key={f.key}
                active={statusFilter === f.key}
                onClick={() => setStatusFilter(statusFilter === f.key ? 'all' : f.key)}
                label={f.label}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && filteredProducts.length > 0 && (
        <div className="flex items-center gap-2 px-1 min-w-0">
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-1.5 text-[11px] text-zinc-600 hover:text-zinc-900 font-medium px-2 py-1.5 rounded-lg hover:bg-zinc-100 touch-manipulation"
            >
              <CheckSquare size={13} />
              Selecionar
            </button>
          ) : (
            <>
              <button
                onClick={selectAll}
                className="flex items-center gap-1 text-[11px] text-zinc-700 font-semibold px-2 py-1.5 rounded-lg hover:bg-zinc-100 touch-manipulation min-w-0"
              >
                {selectedIds.size === filteredProducts.length ? (
                  <CheckSquare size={14} className="text-blue-600 shrink-0" />
                ) : (
                  <Square size={14} className="text-zinc-300 shrink-0" />
                )}
                <span className="truncate">
                  {selectedIds.size === 0
                    ? 'Selecionar todos'
                    : selectedIds.size === filteredProducts.length
                      ? 'Desmarcar todos'
                      : `${selectedIds.size} marcado(s)`
                  }
                </span>
              </button>
              <button
                onClick={() => { setSelectionMode(false); setSelectedIds(new Set()); }}
                className="text-[11px] text-zinc-400 hover:text-red-500 px-2 py-1.5 rounded-lg shrink-0"
              >
                Sair
              </button>
            </>
          )}
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-400 shrink-0">
            {filteredProducts.length} produto{filteredProducts.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={28} className="animate-spin text-zinc-300 mx-auto" />
          <p className="text-zinc-400 mt-3 text-sm">Carregando produtos...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white p-10 rounded-2xl border border-zinc-100 text-center">
          <Package size={32} className="text-zinc-200 mx-auto mb-2" />
          <p className="text-zinc-500 text-sm font-medium">Nenhum produto encontrado</p>
          {hasActiveFilter && (
            <button
              onClick={() => { setSearchQuery(''); setGroupFilter('all'); setStatusFilter('all'); }}
              className="text-blue-600 text-xs mt-2 hover:underline"
            >
              Limpar filtros
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
              onOpenActions={(prod) => setActionSheetProduct(prod)}
              onEdit={(prod) => setEditingProduct(prod)}
              selectionMode={selectionMode}
            />
          ))}
        </div>
      )}

      {hasSelection && (
        <div
          className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <button
            onClick={() => setShowBulkSheet(true)}
            className="w-full max-w-md mx-auto bg-zinc-900 text-white py-3.5 rounded-2xl text-sm font-bold shadow-2xl flex items-center justify-center gap-2 hover:bg-zinc-800 transition-colors"
          >
            <span className="bg-blue-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
            <span>Acoes em massa</span>
            <ChevronUp size={14} />
          </button>
        </div>
      )}

      {showBulkSheet && hasSelection && (
        <BulkActionSheet
          count={selectedIds.size}
          onClose={() => setShowBulkSheet(false)}
          onOpenStatus={() => setShowBulkStatus(true)}
          onOpenColors={() => setShowBulkColors(true)}
          onOpenAddColor={() => setQuickBulkAction('add')}
          onOpenRemoveColor={() => setQuickBulkAction('remove')}
          onOpenRank={() => setShowBulkRank(true)}
        />
      )}

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

      {showBulkRank && selectedProducts.length > 0 && (
        <BulkRankModal
          products={selectedProducts}
          onApply={handleBulkRankApply}
          onClose={() => setShowBulkRank(false)}
          saving={bulkSaving}
        />
      )}

      {actionSheetProduct && (
        <ProductActionSheet
          product={actionSheetProduct}
          onClose={() => setActionSheetProduct(null)}
          onEdit={(p) => setEditingProduct(p)}
          onStatusChange={handleStatusChange}
          onQuickRank={(pid) => setQuickRankProductId(pid)}
          saving={savingId === actionSheetProduct.id}
        />
      )}

      {quickRankProductId && (() => {
        const p = products.find(pp => pp.id === quickRankProductId);
        return p ? (
          <QuickRankPopup
            product={p}
            onApply={handleQuickRankApply}
            onClose={() => setQuickRankProductId(null)}
            saving={savingId === p.id}
          />
        ) : null;
      })()}

      {editingProduct !== undefined && (
        <ProductEditor
          product={editingProduct}
          allGroups={groups}
          onSave={handleProductSave}
          onClose={() => setEditingProduct(undefined)}
          saving={editSaving}
        />
      )}

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </div>
  );
}

// ============================================================================
// SMALL UI HELPERS (pills e tiles usados no main)
// ============================================================================

function StatTile({ label, value, tone }: { label: string; value: number; tone: 'zinc' | 'emerald' | 'amber' | 'blue' }) {
  const tones: Record<string, string> = {
    zinc:    'border-zinc-100 text-zinc-800',
    emerald: 'border-emerald-100 text-emerald-700',
    amber:   'border-amber-100 text-amber-700',
    blue:    'border-blue-100 text-blue-700',
  };
  const labelTones: Record<string, string> = {
    zinc:    'text-zinc-400',
    emerald: 'text-emerald-500',
    amber:   'text-amber-500',
    blue:    'text-blue-500',
  };
  return (
    <div className={`bg-white rounded-xl border ${tones[tone]} px-2 py-1.5 text-center min-w-0`}>
      <p className={`text-[9px] font-bold ${labelTones[tone]} uppercase tracking-wider truncate`}>{label}</p>
      <p className="text-base font-bold truncate">{value}</p>
    </div>
  );
}

function ModePill({
  active, onClick, icon, label, accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  accent?: 'amber';
}) {
  const base = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-all shrink-0 whitespace-nowrap';
  const activeStyle = accent === 'amber'
    ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
    : 'bg-zinc-900 text-white border-zinc-900 shadow-sm';
  const inactive = accent === 'amber'
    ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
    : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300';
  return (
    <button onClick={onClick} className={`${base} ${active ? activeStyle : inactive}`}>
      {icon}
      {label}
    </button>
  );
}

function FilterPill({
  active, onClick, icon, label, tone,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
  tone?: 'emerald' | 'amber' | 'red' | 'blue';
}) {
  const base = 'flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all shrink-0 whitespace-nowrap';
  const activeColors: Record<string, string> = {
    emerald: 'bg-emerald-600 text-white border-emerald-600',
    amber:   'bg-amber-600 text-white border-amber-600',
    red:     'bg-red-600 text-white border-red-600',
    blue:    'bg-blue-600 text-white border-blue-600',
    default: 'bg-zinc-900 text-white border-zinc-900',
  };
  const inactiveColors: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    amber:   'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
    red:     'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
    blue:    'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    default: 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300',
  };
  const key = tone || 'default';
  return (
    <button onClick={onClick} className={`${base} ${active ? activeColors[key] : inactiveColors[key]}`}>
      {icon}
      {label}
    </button>
  );
}
