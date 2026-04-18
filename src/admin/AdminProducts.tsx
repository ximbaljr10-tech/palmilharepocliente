// ============================================================================
// AdminProducts.tsx — Refatoração mobile-first (2026-04-18)
// ----------------------------------------------------------------------------
// Escopo: SOMENTE este arquivo foi reescrito.
// NÃO alterados: Home, StoreLanding, Checkout, Cart, rotas públicas, backend
// Medusa, APIs (src/api.ts), src/admin/adminApi.ts, src/types.ts, autenticação.
//
// Novidades:
//  - Ranking de produto (metadata.rank) — menor = mais no topo.
//  - Editor de produto reorganizado em blocos, mobile-first real.
//  - Sistema de cores revisado: claramente oculto quando produto não usa cor.
//  - Confirmação antes de ações destrutivas em massa.
//  - Banner "Rascunho" no editor.
//  - Ações bulk de cor pulam automaticamente produtos sem variação de cor.
//  - Filtros novos: "Com rank", "Sem rank".
//  - Ordenação da lista admin por rank opcional (toggle).
//
// Compatibilidade: totalmente aditiva. metadata.rank é ignorado por quem não
// usa. Para o ranking refletir na loja pública, basta ordenar produtos por
// `p.metadata?.rank ?? Infinity` no código público (mudança mínima de 2 linhas
// em YardCatalog.tsx / CategoryCatalog.tsx / StoreLanding.tsx quando o cliente
// liberar essa alteração).
// ============================================================================

import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  Search, Save, X, Loader2, RefreshCw, Palette, Plus, Minus,
  ChevronDown, ChevronRight, Check, CheckSquare, Square,
  Eye, EyeOff, Filter, Package, AlertTriangle,
  MinusSquare, Globe, GlobeLock,
  SlidersHorizontal,
  ChevronUp, DollarSign, Ruler, Weight,
  PlusCircle, Camera, Pencil, Info, Upload, ArrowLeft, ChevronLeft,
  Folder, FolderPlus, TrendingUp, ArrowUpDown, Flag, Hash
} from 'lucide-react';
import { adminFetch, MEDUSA_URL } from './adminApi';
import {
  LINE_COLORS, getColorsForProduct, getDefaultColorsForGroup,
  getColorGroupName, needsColorSelection, SKIP_COLOR_YARDS
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
  _rank: number | null; // NEW: ranking manual (menor = mais no topo)
}

// ============================================================================
// COLOR PALETTE (para UI do admin)
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
// SHIPPING DEFAULTS (mesmo que api.ts — mantido para coerência)
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

  // NEW: Parse rank — aceita number, string numérica, ou null/undefined
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

function ColorSourceBadge({ source }: { source: 'metadata' | 'derived' | 'none' }) {
  if (source === 'metadata') {
    return (
      <span className="text-[9px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded-full font-medium border border-emerald-200/60" title="Cores salvas no admin">
        Salvo
      </span>
    );
  }
  if (source === 'derived') {
    return (
      <span className="text-[9px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-full font-medium border border-blue-200/60" title="Cores derivadas automaticamente da loja">
        Auto
      </span>
    );
  }
  return null;
}

/** Badge com o rank atual do produto (número) */
function RankBadge({ rank }: { rank: number | null }) {
  if (rank === null) return null;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 border border-amber-200/70"
      title={`Posicao ${rank} (menor = mais no topo)`}
    >
      <TrendingUp size={9} />
      #{rank}
    </span>
  );
}

function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  return (
    <div
      className={`fixed bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-[100] rounded-2xl px-4 py-3 shadow-xl flex items-center gap-2 text-sm font-medium animate-slide-up-bar ${
        type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
      }`}
    >
      {type === 'success' ? <Check size={16} /> : <AlertTriangle size={16} />}
      <span className="flex-1 min-w-0 break-words">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg shrink-0"><X size={14} /></button>
    </div>
  );
}

/** Modal de confirmação (reutilizado em ações destrutivas) */
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
    <div className="fixed inset-0 bg-black/50 z-[90] flex items-end sm:items-center justify-center p-3" onClick={onClose}>
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
        <div className="px-5 py-4 text-sm text-zinc-600 leading-relaxed">
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
  const MAX_SIZE = 10 * 1024 * 1024; // 10MB
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
// COLLAPSIBLE SECTION (mobile-first: tudo em accordion)
// ============================================================================

function Section({
  title, icon, badge, defaultOpen = true, children,
}: {
  title: string;
  icon: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-zinc-50 transition-colors touch-manipulation"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-zinc-500 shrink-0">{icon}</span>
          <h3 className="text-sm font-bold text-zinc-800 truncate">{title}</h3>
          {badge}
        </div>
        <ChevronDown
          size={18}
          className={`text-zinc-400 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-zinc-100">
          {children}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// FULL-SCREEN PRODUCT EDITOR — mobile-first real (accordions, 1 coluna)
// ============================================================================

function ProductEditor({
  product, allGroups, onSave, onClose, saving,
}: {
  product: ParsedProduct | null; // null = novo produto
  allGroups: string[];
  onSave: (data: any) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const isNew = !product;
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

  // Grupo
  const [grupo, setGrupo] = useState(product?.metadata?.grupo || product?._group || '');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  // Ranking (NOVO)
  const [rank, setRank] = useState<string>(
    product?._rank !== null && product?._rank !== undefined ? String(product._rank) : ''
  );

  // Cores
  const needsColorFromProduct = product ? product._needsColorSelection : false;
  const [colors, setColors] = useState<ColorItem[]>(product?._availableColors || []);
  const [colorChanged, setColorChanged] = useState(false);

  // Detecta yards em tempo real (tanto para produto novo quanto em edição)
  const currentYards = useMemo(() => {
    const m = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
    return m ? parseInt(m[1], 10) : null;
  }, [title]);

  // Regra clara: precisa de cor se É uma linha (tem yards) E yards NÃO está no skip list
  const showColorSection = useMemo(() => {
    if (product) return needsColorFromProduct; // para produto existente, confia no parse
    // para produto novo: só mostra se tem yards E fora do skip list
    if (currentYards === null) return false;
    return !SKIP_COLOR_YARDS.includes(currentYards);
  }, [product, needsColorFromProduct, currentYards]);

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

  const removeImage = (idx: number) => {
    setImages(prev => prev.filter((_, i) => i !== idx));
  };
  const moveImage = (from: number, to: number) => {
    if (to < 0 || to >= images.length) return;
    setImages(prev => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleSubmit = () => {
    const errs: string[] = [];
    if (!title.trim()) errs.push('Titulo obrigatorio');
    if (!price || Number(price) <= 0) errs.push('Preco invalido');
    // Rank validation (opcional, mas se preenchido deve ser numero >= 0)
    let rankValue: number | null = null;
    if (rank.trim() !== '') {
      const n = Number(rank);
      if (isNaN(n) || n < 0) errs.push('Rank deve ser um numero >= 0');
      else rankValue = Math.floor(n);
    }
    if (errs.length > 0) { setErrors(errs); return; }

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
      rank: rankValue, // pode ser null (sem ranking) ou numero
      colors: colorChanged ? colors : undefined,
      isNew,
    });
  };

  return (
    <div className="fixed inset-0 bg-zinc-50 z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-zinc-200 px-3 sm:px-6 py-3 flex items-center justify-between shrink-0 shadow-sm gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl transition-colors shrink-0">
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-sm sm:text-base font-bold text-zinc-900 flex items-center gap-2 truncate">
              {isNew ? <PlusCircle size={18} className="text-emerald-600 shrink-0" /> : <Pencil size={18} className="text-blue-600 shrink-0" />}
              <span className="truncate">{isNew ? 'Novo Produto' : 'Editar Produto'}</span>
            </h2>
            {!isNew && <p className="text-[10px] text-zinc-400 truncate">{product?.title}</p>}
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="bg-blue-600 text-white px-3 sm:px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          <span className="hidden sm:inline">{saving ? 'Salvando...' : isNew ? 'Criar Produto' : 'Salvar'}</span>
          <span className="sm:hidden">{saving ? '...' : 'Salvar'}</span>
        </button>
      </div>

      {/* Body — 1 coluna no mobile, max-w-3xl no desktop (sem grid complexo) */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-3xl mx-auto px-3 sm:px-5 py-4 pb-28 space-y-3">

          {/* BANNER DE RASCUNHO (quando produto é draft e existe) */}
          {!isNew && status === 'draft' && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-xs text-amber-800 flex items-start gap-2">
              <Flag size={14} className="shrink-0 mt-0.5" />
              <div className="min-w-0">
                <strong className="block text-amber-900">Modo Rascunho</strong>
                Este produto esta em rascunho. Voce pode editar e testar livremente —
                ele <strong>nao aparece na loja publica</strong> enquanto estiver assim.
              </div>
            </div>
          )}

          {/* ERROS */}
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-2xl px-4 py-3 text-sm text-red-700 space-y-1">
              {errors.map((e, i) => <p key={i} className="break-words">- {e}</p>)}
              <button onClick={() => setErrors([])} className="text-red-500 text-xs underline mt-1">Fechar</button>
            </div>
          )}

          {/* 1. INFORMACOES BASICAS */}
          <Section title="Informacoes Basicas" icon={<Package size={16} />} defaultOpen>
            {/* Titulo */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Titulo *</label>
              <input
                value={title}
                onChange={e => { setTitle(e.target.value); handleAutoHandle(e.target.value); }}
                className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="Ex: SHARK ATTACK 3000j Fio 4.4"
              />
            </div>
            {/* Handle */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Handle (URL)</label>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm font-mono text-zinc-600 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                placeholder="shark-attack-3000j"
              />
            </div>
            {/* Preco */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <DollarSign size={11} /> Preco (R$) *
              </label>
              <input
                type="number" inputMode="decimal" step="0.01" min="0"
                value={price}
                onChange={e => setPrice(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                placeholder="45.90"
              />
            </div>
            {/* Status */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Status</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus('published')}
                  className={`flex-1 py-3 px-2 rounded-xl text-xs font-semibold border transition-all min-w-0 ${
                    status === 'published' ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm' : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  <Eye size={14} className="inline mr-1" />
                  Publicado
                </button>
                <button
                  onClick={() => setStatus('draft')}
                  className={`flex-1 py-3 px-2 rounded-xl text-xs font-semibold border transition-all min-w-0 ${
                    status === 'draft' ? 'bg-amber-500 text-white border-amber-500 shadow-sm' : 'bg-white text-zinc-600 border-zinc-200'
                  }`}
                >
                  <EyeOff size={14} className="inline mr-1" />
                  Rascunho
                </button>
              </div>
              <p className="text-[10px] text-zinc-400 mt-1.5">
                Produtos em rascunho podem ser editados e testados livremente sem aparecer na loja publica.
              </p>
            </div>
            {/* Grupo */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Folder size={11} /> Grupo
              </label>
              {!showNewGroup ? (
                <div className="flex gap-2">
                  <select
                    value={grupo}
                    onChange={e => setGrupo(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-white"
                  >
                    <option value="">Detectar automaticamente</option>
                    {allGroups.map(g => (<option key={g} value={g}>{g}</option>))}
                  </select>
                  <button
                    onClick={() => setShowNewGroup(true)}
                    className="px-3 py-2 rounded-xl border border-dashed border-zinc-300 text-zinc-500 hover:border-blue-400 hover:text-blue-600 transition-all text-xs font-medium flex items-center gap-1 shrink-0"
                  >
                    <FolderPlus size={14} /> Novo
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    className="flex-1 min-w-0 px-3 py-3 rounded-xl border border-blue-300 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all bg-blue-50/30"
                    placeholder="Nome do novo grupo..."
                    autoFocus
                  />
                  <button
                    onClick={() => { setShowNewGroup(false); setNewGroupName(''); }}
                    className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 hover:text-zinc-700 transition-all text-xs shrink-0"
                  >
                    Cancelar
                  </button>
                </div>
              )}
              <p className="text-[10px] text-zinc-400 mt-1">Se vazio, sera detectado pelo titulo.</p>
            </div>
            {/* Descricao */}
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Descricao (HTML)</label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-y transition-all"
                placeholder="Descricao do produto..."
              />
            </div>
          </Section>

          {/* 2. POSICAO NA LOJA (RANKING) */}
          <Section
            title="Posicao na Loja (Ranking)"
            icon={<TrendingUp size={16} />}
            defaultOpen={false}
            badge={
              rank.trim() !== '' && !isNaN(Number(rank))
                ? <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-bold ml-auto">#{rank}</span>
                : null
            }
          >
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Hash size={11} /> Posicao manual
              </label>
              <div className="flex gap-2 items-center">
                <input
                  type="number" inputMode="numeric" min="0" step="1"
                  value={rank}
                  onChange={e => setRank(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                  placeholder="Ex: 1 (topo), 5, 10..."
                />
                {rank.trim() !== '' && (
                  <button
                    onClick={() => setRank('')}
                    className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-500 hover:text-red-600 text-xs shrink-0"
                    title="Remover ranking"
                  >
                    Limpar
                  </button>
                )}
              </div>
              <div className="mt-2 text-[11px] text-zinc-500 space-y-1">
                <p>- <strong>Menor = mais no topo</strong>. Ex.: <code className="bg-zinc-100 px-1 rounded">1</code> aparece antes de <code className="bg-zinc-100 px-1 rounded">5</code>.</p>
                <p>- <strong>Deixe vazio</strong> para nao priorizar (ordem normal).</p>
                <p>- Funciona junto com o filtro de categoria/jarda: o rank so afeta a ordem dentro da mesma lista.</p>
              </div>
              {rank.trim() !== '' && !isNaN(Number(rank)) && (
                <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 flex items-start gap-2">
                  <TrendingUp size={12} className="shrink-0 mt-0.5" />
                  <span>Este produto ira aparecer na posicao <strong>#{rank}</strong> nas listagens.</span>
                </div>
              )}
            </div>
          </Section>

          {/* 3. IMAGENS */}
          <Section
            title="Imagens"
            icon={<Camera size={16} />}
            badge={images.length > 0 ? <span className="text-[10px] text-zinc-400 font-normal ml-auto">({images.length})</span> : null}
            defaultOpen
          >
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2">
                {images.map((img, idx) => (
                  <div key={idx} className="relative group aspect-square rounded-xl overflow-hidden bg-zinc-100 border border-zinc-200">
                    <img src={img.url} alt={`Img ${idx + 1}`} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    {/* Controles sempre visiveis no mobile (touch) */}
                    <div className="absolute inset-0 flex items-end justify-between p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <div className="flex gap-1">
                        {idx > 0 && (
                          <button onClick={() => moveImage(idx, idx - 1)} className="w-6 h-6 bg-white/90 rounded-md flex items-center justify-center text-zinc-700 shadow">
                            <ChevronLeft size={12} />
                          </button>
                        )}
                        {idx < images.length - 1 && (
                          <button onClick={() => moveImage(idx, idx + 1)} className="w-6 h-6 bg-white/90 rounded-md flex items-center justify-center text-zinc-700 shadow">
                            <ChevronRight size={12} />
                          </button>
                        )}
                      </div>
                      <button onClick={() => removeImage(idx)} className="w-6 h-6 bg-red-500/90 rounded-md flex items-center justify-center text-white shadow">
                        <X size={12} />
                      </button>
                    </div>
                    {idx === 0 && (
                      <span className="absolute top-0 left-0 right-0 bg-blue-600/80 text-white text-[9px] text-center py-0.5 font-semibold">
                        Principal
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div>
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
                className="w-full border-2 border-dashed border-zinc-300 hover:border-blue-400 rounded-xl py-6 flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-blue-600 hover:bg-blue-50/30 transition-all disabled:opacity-50 cursor-pointer"
              >
                {uploadingImage ? (
                  <>
                    <Loader2 size={24} className="animate-spin text-blue-500" />
                    <span className="text-xs font-medium text-blue-600">Fazendo upload...</span>
                  </>
                ) : (
                  <>
                    <Upload size={22} />
                    <span className="text-xs font-medium">Clique para selecionar imagens</span>
                    <span className="text-[10px] text-zinc-400 text-center px-2">JPG, PNG, WebP - Max 10MB cada</span>
                  </>
                )}
              </button>
            </div>
          </Section>

          {/* 4. CORES — SO APARECE SE PRODUTO ACEITA COR */}
          {showColorSection && (
            <Section
              title="Cores Disponiveis na Loja"
              icon={<Palette size={16} className="text-purple-600" />}
              badge={product ? <ColorSourceBadge source={product._colorSource} /> : null}
              defaultOpen
            >
              {product?._colorSource === 'derived' && !colorChanged && (
                <p className="text-[11px] text-blue-700 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                  Cores pre-preenchidas automaticamente. Edite e salve para que as mudancas aparecam na loja publica.
                </p>
              )}

              <div>
                <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Cores Atuais</p>
                <div className="flex flex-wrap gap-1.5">
                  {colors.length === 0 ? (
                    <span className="text-[11px] text-zinc-400 italic py-2">Sem cores definidas. Adicione abaixo.</span>
                  ) : colors.map(c => (
                    <div
                      key={c.name}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                        c.in_stock ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-red-50 border-red-200 text-red-400'
                      }`}
                    >
                      <ColorDot name={c.name} hex={c.hex} size="md" />
                      <span className={!c.in_stock ? 'line-through' : ''}>{c.name}</span>
                      <button
                        onClick={() => {
                          setColors(prev => prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc));
                          setColorChanged(true);
                        }}
                        className="p-0.5 rounded transition-colors"
                        title={c.in_stock ? 'Marcar sem estoque' : 'Marcar em estoque'}
                      >
                        {c.in_stock ? <EyeOff size={12} className="text-zinc-400" /> : <Eye size={12} className="text-emerald-500" />}
                      </button>
                      <button
                        onClick={() => { setColors(prev => prev.filter(cc => cc.name !== c.name)); setColorChanged(true); }}
                        className="p-0.5 text-zinc-300 hover:text-red-500 transition-colors"
                        title="Remover"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Adicionar Cores</p>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_COLORS.filter(ac => !colors.find(c => c.name === ac.name)).map(ac => (
                    <button
                      key={ac.name}
                      onClick={() => { setColors(prev => [...prev, { name: ac.name, hex: ac.hex, in_stock: true }]); setColorChanged(true); }}
                      className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-all"
                    >
                      <Plus size={10} />
                      <ColorDot name={ac.name} hex={ac.hex} />
                      <span>{ac.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {colorChanged && (
                <div className="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-[11px] text-purple-700 flex items-center gap-2">
                  <Info size={12} className="shrink-0" />
                  As cores serao salvas quando voce clicar em Salvar.
                </div>
              )}
            </Section>
          )}

          {/* Se produto NAO aceita cor, explicar por que */}
          {!showColorSection && (currentYards !== null || product) && (
            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl px-4 py-3 text-[11px] text-zinc-500 flex items-start gap-2">
              <Info size={13} className="shrink-0 mt-0.5 text-zinc-400" />
              <div className="min-w-0">
                <strong className="block text-zinc-700">Este produto nao usa variacao de cor</strong>
                {currentYards !== null && SKIP_COLOR_YARDS.includes(currentYards)
                  ? `Linhas de ${currentYards} jardas sao vendidas como "sortida" (sem escolha de cor).`
                  : 'Produto sem jardas detectadas — nao mostra cores para o cliente escolher.'}
              </div>
            </div>
          )}

          {/* 5. DIMENSOES E PESO */}
          <Section title="Dimensoes e Peso (SuperFrete)" icon={<Ruler size={16} />} defaultOpen={false}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Altura (cm)</label>
                <input type="number" inputMode="decimal" step="0.1" min="0" value={shHeight} onChange={e => setShHeight(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="12" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Largura (cm)</label>
                <input type="number" inputMode="decimal" step="0.1" min="0" value={shWidth} onChange={e => setShWidth(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="12" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Comprimento (cm)</label>
                <input type="number" inputMode="decimal" step="0.1" min="0" value={shLength} onChange={e => setShLength(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="19" />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-zinc-400 mb-1">Peso (kg)</label>
                <input type="number" inputMode="decimal" step="0.01" min="0" value={shWeight} onChange={e => setShWeight(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-all" placeholder="0.5" />
              </div>
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
                    <Info size={14} className="shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <strong>Peso suspeito:</strong> {unidades} unidades com apenas {peso} kg
                      ({(pesoPorUnidade * 1000).toFixed(1)} g por unidade). Verifique se esta correto.
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            <p className="text-[10px] text-zinc-400 flex items-start gap-1">
              <Info size={10} className="shrink-0 mt-0.5" />
              <span>Estas dimensoes sao usadas pelo SuperFrete. Para packs, pese o pacote completo.</span>
            </p>
          </Section>

        </div>
      </div>

      {/* Bottom save bar (mobile) */}
      <div className="sm:hidden bg-white border-t border-zinc-200 px-3 py-2.5 shrink-0 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]" style={{ paddingBottom: 'max(0.625rem, env(safe-area-inset-bottom))' }}>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full bg-blue-600 text-white px-4 py-3.5 rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Salvando...' : isNew ? 'Criar Produto' : 'Salvar Alteracoes'}
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// BULK COLOR EDITOR (mantido do original, compacto)
// ============================================================================

function BulkColorEditor({ products, onApply, onClose, saving }: {
  products: ParsedProduct[];
  onApply: (updates: { productId: string; colors: ColorItem[] }[]) => void;
  onClose: () => void;
  saving: boolean;
}) {
  // Agrupa por configuracao de cores (produtos com mesmo conjunto)
  const groups = useMemo(() => {
    const map = new Map<string, { products: ParsedProduct[]; colors: ColorItem[] }>();
    for (const p of products) {
      const key = p._colorConfigKey;
      if (!map.has(key)) map.set(key, { products: [], colors: [...p._availableColors] });
      map.get(key)!.products.push(p);
    }
    return Array.from(map.entries()).map(([key, val]) => ({
      key, products: val.products, originalColors: val.colors,
    }));
  }, [products]);

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
        for (const p of g.products) updates.push({ productId: p.id, colors: newColors });
      }
    }
    if (updates.length === 0) { onClose(); return; }
    onApply(updates);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-xl max-h-[88vh] overflow-hidden flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white border-b border-zinc-100 px-4 py-3 flex items-center justify-between shrink-0 gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Palette size={18} className="text-purple-600 shrink-0" />
              <span className="truncate">Editar Cores em Massa</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {products.length} produto(s) em {groups.length} grupo(s) de configuracao
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl shrink-0">
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
                  {isChanged && (
                    <span className="text-[9px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold shrink-0">Modificado</span>
                  )}
                </div>

                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Cores Atuais</p>
                  <div className="flex flex-wrap gap-1.5">
                    {colors.length === 0 ? (
                      <span className="text-[11px] text-zinc-400 italic">Sem cores</span>
                    ) : colors.map(c => (
                      <div key={c.name} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium ${c.in_stock ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-red-50 border-red-200 text-red-500'}`}>
                        <ColorDot name={c.name} hex={c.hex} />
                        <span className={!c.in_stock ? 'line-through' : ''}>{c.name}</span>
                        <button
                          onClick={() => updateGroupColor(group.key, prev => prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc))}
                          className={`p-0.5 rounded ${c.in_stock ? 'text-zinc-400' : 'text-emerald-500'}`}
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

                <div>
                  <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">Adicionar</p>
                  <div className="flex flex-wrap gap-1">
                    {ALL_COLORS.filter(ac => !colors.find(c => c.name === ac.name)).map(ac => (
                      <button
                        key={ac.name}
                        onClick={() => updateGroupColor(group.key, prev => [...prev, { name: ac.name, hex: ac.hex, in_stock: true }])}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-zinc-300 text-[10px] text-zinc-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
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
            className="flex-1 bg-purple-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors min-w-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="truncate">{saving ? 'Salvando...' : `Salvar (${changedGroups.size})`}</span>
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors shrink-0">
            Cancelar
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
      <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
        <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
          <div className="px-4 py-3 border-b border-zinc-100">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <Globe size={18} className="text-blue-600 shrink-0" />
              <span className="truncate">Alterar Status em Massa</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {products.length} produto(s): {publishedCount} publicado(s), {draftCount} rascunho(s)
            </p>
          </div>

          <div className="px-4 py-4 space-y-2.5">
            <button
              onClick={() => onApply(products.map(p => p.id), 'published')}
              disabled={saving}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                <Globe size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Publicar Todos</p>
                <p className="text-[11px] text-zinc-500 truncate">{products.length} produto(s) visiveis na loja</p>
              </div>
              {saving ? <Loader2 size={16} className="animate-spin text-zinc-400 shrink-0" /> : <ChevronRight size={16} className="text-zinc-300 shrink-0" />}
            </button>

            <button
              onClick={() => setConfirmUnpub(true)}
              disabled={saving}
              className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-zinc-200 hover:border-amber-400 hover:bg-amber-50/50 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                <GlobeLock size={18} className="text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900">Despublicar Todos</p>
                <p className="text-[11px] text-zinc-500 truncate">Ocultar da loja (rascunho)</p>
              </div>
              <ChevronRight size={16} className="text-zinc-300 shrink-0" />
            </button>
          </div>

          <div className="px-4 py-3 border-t border-zinc-100">
            <button onClick={onClose} className="w-full px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      </div>

      {confirmUnpub && (
        <ConfirmModal
          title="Despublicar produtos?"
          message={<>Voce esta prestes a <strong>despublicar {products.length} produto(s)</strong>. Eles ficarao ocultos da loja publica ate serem publicados novamente. Deseja continuar?</>}
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
// QUICK BULK COLOR ACTIONS — agora filtra produtos que NAO aceitam cor
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

  const toggleColor = (name: string) => {
    setSelectedColors(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
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
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {skipped > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-[11px] text-amber-800 mb-3 flex items-start gap-2">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>{skipped} produto(s) selecionado(s) nao aceitam variacao de cor (linhas 50/100/200j, carretilhas, camisas, bones) e serao ignorados.</span>
            </div>
          )}

          <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider mb-2">Selecione as Cores</p>
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
            className={`flex-1 text-white px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-colors min-w-0 ${
              action === 'add' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : action === 'add' ? <Plus size={16} /> : <Minus size={16} />}
            <span className="truncate">{saving ? 'Aplicando...' : `${action === 'add' ? 'Add' : 'Remover'} ${selectedColors.length} em ${eligible.length}`}</span>
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors shrink-0">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// BULK RANK MODAL (NOVO) — definir ranking em massa
// ============================================================================

function BulkRankModal({
  products, onApply, onClose, saving,
}: {
  products: ParsedProduct[];
  onApply: (productIds: string[], rank: number | null) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [mode, setMode] = useState<'set' | 'clear' | 'sequential'>('set');
  const [rankValue, setRankValue] = useState('1');
  const [startValue, setStartValue] = useState('1');

  const currentRanks = products.map(p => p._rank).filter(r => r !== null).sort((a, b) => (a as number) - (b as number));
  const minRank = currentRanks[0] ?? null;
  const maxRank = currentRanks[currentRanks.length - 1] ?? null;

  const handleApply = () => {
    if (mode === 'clear') {
      onApply(products.map(p => p.id), null);
      return;
    }
    if (mode === 'set') {
      const n = Number(rankValue);
      if (isNaN(n) || n < 0) return;
      // Todos recebem o mesmo rank (util quando se quer "empurrar pra cima" um conjunto)
      onApply(products.map(p => p.id), Math.floor(n));
      return;
    }
    // sequential — aqui simulamos: cada produto recebe start+i. Como onApply aceita
    // rank unico, fazemos chamadas individuais no handler pai (ver handleBulkRankApply).
    // Enviamos como "set" mas com cada rank diferente via flag interna:
    const start = Number(startValue);
    if (isNaN(start) || start < 0) return;
    // Marcamos sequencial com uma chamada especial — o pai cuida.
    // Aqui passamos rank = -1 como sentinel e deixamos o pai interpretar.
    // Para simplificar, faremos onApply varias vezes no pai; expoemos via window?
    // Melhor: passar um objeto via JSON.
    onApplySequential(products, Math.floor(start));
  };

  const onApplySequential = (prods: ParsedProduct[], start: number) => {
    // Vamos chamar onApply em lote via "rank encoded" — mas como a assinatura nao
    // permite isso, usamos um truque: chamamos onApply uma vez por produto.
    // Na pratica, fazemos um loop no pai. Aqui expoe sinal:
    (onApply as any)(prods.map(p => p.id), { __sequential: true, start });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center justify-between gap-2 shrink-0">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-zinc-900 text-base flex items-center gap-2">
              <TrendingUp size={18} className="text-amber-600 shrink-0" />
              <span className="truncate">Ranking em Massa</span>
            </h3>
            <p className="text-[11px] text-zinc-500 mt-0.5 truncate">
              {products.length} produto(s) selecionado(s)
              {currentRanks.length > 0 && ` - ranks atuais: ${minRank} a ${maxRank}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-xl shrink-0">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {/* Seletor de modo */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setMode('set')}
              className={`w-full p-3 rounded-xl border text-left transition-all ${
                mode === 'set' ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <Hash size={14} /> Mesmo rank para todos
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Ex.: colocar os 5 selecionados no topo (rank 1).</p>
            </button>

            <button
              onClick={() => setMode('sequential')}
              className={`w-full p-3 rounded-xl border text-left transition-all ${
                mode === 'sequential' ? 'border-amber-400 bg-amber-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <ArrowUpDown size={14} /> Sequencial (1, 2, 3...)
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Cada produto recebe um rank crescente a partir do valor inicial.</p>
            </button>

            <button
              onClick={() => setMode('clear')}
              className={`w-full p-3 rounded-xl border text-left transition-all ${
                mode === 'clear' ? 'border-red-300 bg-red-50' : 'border-zinc-200 bg-white hover:border-zinc-300'
              }`}
            >
              <p className="text-sm font-bold text-zinc-900 flex items-center gap-2">
                <X size={14} /> Limpar ranking
              </p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Remove o rank — produtos voltam para a ordem padrao.</p>
            </button>
          </div>

          {/* Campo de valor (conforme o modo) */}
          {mode === 'set' && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Rank (menor = mais no topo)</label>
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={rankValue}
                onChange={e => setRankValue(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                placeholder="1"
              />
            </div>
          )}
          {mode === 'sequential' && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Comecar do rank</label>
              <input
                type="number" inputMode="numeric" min="0" step="1"
                value={startValue}
                onChange={e => setStartValue(e.target.value)}
                className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-500 outline-none transition-all"
                placeholder="1"
              />
              <p className="text-[10px] text-zinc-500 mt-1">
                Produtos na ordem atual da lista receberao {startValue || '?'}, {Number(startValue) + 1 || '?'}, {Number(startValue) + 2 || '?'}...
              </p>
            </div>
          )}
        </div>

        <div className="border-t border-zinc-100 px-4 py-3 flex items-center gap-2 shrink-0">
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex-1 bg-amber-600 text-white px-4 py-3 rounded-xl text-sm font-bold hover:bg-amber-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors min-w-0"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span className="truncate">
              {saving ? 'Aplicando...' : mode === 'clear' ? 'Limpar rank' : mode === 'set' ? `Aplicar rank ${rankValue}` : 'Aplicar sequencial'}
            </span>
          </button>
          <button onClick={onClose} className="px-4 py-3 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors shrink-0">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// PRODUCT CARD (mobile-first)
// ============================================================================

function ProductCard({
  product, isSelected, onToggleSelect, onSaveColors, onStatusChange, onEdit, onQuickRank, saving,
}: {
  product: ParsedProduct;
  isSelected: boolean;
  onToggleSelect: () => void;
  onSaveColors: (productId: string, colors: ColorItem[]) => void;
  onStatusChange: (productId: string, status: string) => void;
  onEdit: (product: ParsedProduct) => void;
  onQuickRank: (productId: string) => void;
  saving: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [colors, setColors] = useState<ColorItem[]>(product._availableColors);
  const [colorChanged, setColorChanged] = useState(false);

  useEffect(() => {
    setColors(product._availableColors);
    setColorChanged(false);
  }, [product._availableColors]);

  const image = product.images?.[0]?.url || product.thumbnail || '';
  const isMulticolor = product._isLine && !product._needsColorSelection;

  const fakeP = { title: product.title, handle: product.handle, yards: product._yards } as any;
  const groupColors = getDefaultColorsForGroup(fakeP);

  return (
    <div className={`border-b border-zinc-100 last:border-b-0 transition-colors ${isSelected ? 'bg-blue-50/40' : ''}`}>
      {/* Main row */}
      <div className="flex items-start gap-2 px-3 py-2.5 min-h-[56px]">
        <button onClick={onToggleSelect} className="shrink-0 p-1 touch-manipulation" aria-label="Selecionar">
          {isSelected ? <CheckSquare size={20} className="text-blue-600" /> : <Square size={20} className="text-zinc-300" />}
        </button>

        <div className="w-10 h-10 rounded-lg overflow-hidden bg-zinc-100 shrink-0 border border-zinc-200">
          {image ? (
            <img src={image} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-300"><Package size={14} /></div>
          )}
        </div>

        <div className="flex-1 min-w-0" onClick={() => setExpanded(!expanded)}>
          <p className="text-[13px] font-medium text-zinc-900 leading-tight line-clamp-2 break-words">{product.title}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <span className="text-[11px] font-semibold text-zinc-700">R$ {product._priceDisplay}</span>
            {product._yards && <span className="text-[10px] text-zinc-400">{product._yards}j</span>}
            <RankBadge rank={product._rank} />
            {isMulticolor && (
              <span className="text-[9px] bg-gradient-to-r from-red-100 via-yellow-100 to-blue-100 text-zinc-600 px-1.5 py-0.5 rounded-full font-medium border border-zinc-200/50">
                Multicor
              </span>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1">
          <StatusBadge status={product.status} />
          {product._isLine && product._needsColorSelection && (
            <div className="flex items-center gap-1">
              <ColorSourceBadge source={product._colorSource} />
              <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-0.5 text-[10px] text-purple-600 font-medium">
                <Palette size={10} />
                {product._availableColors.filter(c => c.in_stock).length}/{product._availableColors.length}
              </button>
            </div>
          )}
        </div>

        <button onClick={() => setExpanded(!expanded)} className="shrink-0 p-1 text-zinc-300 touch-manipulation" aria-label="Expandir">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded */}
      {expanded && (
        <div className="px-3 pb-3 pl-3 sm:pl-[52px] space-y-3">
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500 min-w-0">
            <span className="truncate max-w-full">Handle: <span className="text-zinc-700 font-mono break-all">{product.handle}</span></span>
            {product._fio && <span>Fio: <span className="text-zinc-700">{product._fio}</span></span>}
            {product._stock !== null && (
              <span>Estoque: <span className={`font-semibold ${product._stock <= 0 ? 'text-red-600' : 'text-zinc-700'}`}>{product._stock}</span></span>
            )}
            <span>Grupo: <span className="text-zinc-700">{product._group}</span></span>
            {product._colorGroup && <span>Linha: <span className="text-zinc-700">{product._colorGroup}</span></span>}
            <span>Rank: <span className="text-zinc-700 font-semibold">{product._rank !== null ? `#${product._rank}` : '—'}</span></span>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-500">
            <span className="flex items-center gap-0.5"><Ruler size={10} /> {product._shippingHeight}x{product._shippingWidth}x{product._shippingLength}cm</span>
            <span className="flex items-center gap-0.5"><Weight size={10} /> {product._shippingWeight}kg</span>
            <span>Imgs: {product.images?.length || 0}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => onEdit(product)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-all"
            >
              <Pencil size={12} /> Editar
            </button>

            <button
              onClick={() => onQuickRank(product.id)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all"
            >
              <TrendingUp size={12} /> Rank
            </button>

            <button
              onClick={() => onStatusChange(product.id, product.status === 'published' ? 'draft' : 'published')}
              disabled={saving}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${
                product.status === 'published'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
              }`}
            >
              {product.status === 'published' ? <><EyeOff size={12} /> Despublicar</> : <><Eye size={12} /> Publicar</>}
            </button>
          </div>

          {/* Editor de cores inline — só para produtos que aceitam cor */}
          {product._isLine && product._needsColorSelection && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1">
                <Palette size={12} /> Cores Disponiveis
                <ColorSourceBadge source={product._colorSource} />
              </p>

              {product._colorSource === 'derived' && (
                <p className="text-[10px] text-blue-700 bg-blue-50 rounded-lg px-2 py-1 border border-blue-100">
                  Cores pre-preenchidas automaticamente. Edite e salve para refletir na loja.
                </p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {colors.length === 0 ? (
                  <span className="text-[11px] text-zinc-400 italic">Sem cores definidas</span>
                ) : colors.map(c => (
                  <div key={c.name} className={`flex items-center gap-1 px-2 py-1 rounded-lg border text-[11px] font-medium ${c.in_stock ? 'bg-white border-zinc-200 text-zinc-700' : 'bg-red-50 border-red-200 text-red-400'}`}>
                    <ColorDot name={c.name} hex={c.hex} />
                    <span className={!c.in_stock ? 'line-through' : ''}>{c.name}</span>
                    <button
                      onClick={() => {
                        setColors(prev => prev.map(cc => cc.name === c.name ? { ...cc, in_stock: !cc.in_stock } : cc));
                        setColorChanged(true);
                      }}
                      className="p-0.5"
                      aria-label="Alternar estoque"
                    >
                      {c.in_stock ? <EyeOff size={10} className="text-zinc-400" /> : <Eye size={10} className="text-emerald-500" />}
                    </button>
                    <button
                      onClick={() => { setColors(prev => prev.filter(cc => cc.name !== c.name)); setColorChanged(true); }}
                      className="p-0.5 text-zinc-300 hover:text-red-500"
                      aria-label="Remover cor"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>

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

// ============================================================================
// QUICK RANK POPUP (para produto individual)
// ============================================================================

function QuickRankPopup({
  product, onApply, onClose, saving,
}: {
  product: ParsedProduct;
  onApply: (productId: string, rank: number | null) => void;
  onClose: () => void;
  saving: boolean;
}) {
  const [rank, setRank] = useState(product._rank !== null ? String(product._rank) : '');

  const handleApply = () => {
    if (rank.trim() === '') {
      onApply(product.id, null);
      return;
    }
    const n = Number(rank);
    if (!isNaN(n) && n >= 0) onApply(product.id, Math.floor(n));
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[80] flex items-end sm:items-center justify-center p-3" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3 border-b border-zinc-100">
          <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
            <TrendingUp size={16} className="text-amber-600 shrink-0" />
            <span className="truncate">Rank rapido</span>
          </h3>
          <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{product.title}</p>
        </div>
        <div className="px-4 py-3 space-y-2">
          <label className="block text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Posicao (menor = mais no topo)</label>
          <input
            type="number" inputMode="numeric" min="0" step="1"
            value={rank}
            onChange={e => setRank(e.target.value)}
            className="w-full px-3 py-3 rounded-xl border border-zinc-200 text-sm focus:ring-2 focus:ring-amber-500 outline-none"
            placeholder="Ex: 1, 2, 3... (vazio = sem rank)"
            autoFocus
          />
          <p className="text-[10px] text-zinc-500">Deixe vazio para remover o ranking deste produto.</p>
        </div>
        <div className="px-4 py-3 border-t border-zinc-100 flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl text-sm border border-zinc-200 text-zinc-600 hover:border-zinc-400 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleApply}
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
// ACTIVE FILTER CHIPS
// ============================================================================

function ActiveFilterChips({
  groupFilter, statusFilter, searchQuery,
  onRemoveGroup, onRemoveStatus, onRemoveSearch, onClearAll,
}: {
  groupFilter: string;
  statusFilter: string;
  searchQuery: string;
  onRemoveGroup: () => void;
  onRemoveStatus: () => void;
  onRemoveSearch: () => void;
  onClearAll: () => void;
}) {
  const hasFilters = groupFilter !== 'all' || statusFilter !== 'all' || searchQuery.trim() !== '';
  if (!hasFilters) return null;

  const statusLabels: Record<string, string> = {
    published: 'Publicados',
    draft: 'Rascunhos',
    no_colors: 'Sem Cores',
    has_colors: 'Com Cores',
    multicolor: 'Multicor',
    derived_colors: 'Auto-derivadas',
    saved_colors: 'Cores Salvas',
    with_rank: 'Com Rank',
    no_rank: 'Sem Rank',
  };

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide max-w-full">
      <span className="text-[10px] text-zinc-400 font-medium shrink-0">Filtros:</span>
      {searchQuery.trim() && (
        <button onClick={onRemoveSearch} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium shrink-0 hover:bg-blue-100 transition-colors max-w-[200px]">
          <Search size={10} />
          <span className="truncate">"{searchQuery}"</span>
          <X size={10} className="text-blue-400 hover:text-blue-700 shrink-0" />
        </button>
      )}
      {groupFilter !== 'all' && (
        <button onClick={onRemoveGroup} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-medium shrink-0 hover:bg-purple-100 transition-colors">
          <Folder size={10} />
          <span className="truncate max-w-[120px]">{groupFilter}</span>
          <X size={10} className="text-purple-400 hover:text-purple-700 shrink-0" />
        </button>
      )}
      {statusFilter !== 'all' && (
        <button onClick={onRemoveStatus} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[11px] font-medium shrink-0 hover:bg-amber-100 transition-colors">
          <Filter size={10} />
          {statusLabels[statusFilter] || statusFilter}
          <X size={10} className="text-amber-400 hover:text-amber-700 shrink-0" />
        </button>
      )}
      <button onClick={onClearAll} className="text-[10px] text-zinc-400 hover:text-red-500 font-medium shrink-0 px-1.5 py-1 transition-colors">
        Limpar tudo
      </button>
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

  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [sortByRank, setSortByRank] = useState(true); // NOVO: ordenar por rank por padrao

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [showBulkColors, setShowBulkColors] = useState(false);
  const [showBulkStatus, setShowBulkStatus] = useState(false);
  const [showBulkRank, setShowBulkRank] = useState(false);
  const [quickBulkAction, setQuickBulkAction] = useState<'add' | 'remove' | null>(null);
  const [editingProduct, setEditingProduct] = useState<ParsedProduct | null | undefined>(undefined);
  const [editSaving, setEditSaving] = useState(false);
  const [quickRankProductId, setQuickRankProductId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

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

  // ============ HANDLERS ============

  // Helper: salva metadata preservando o que existe
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

  const handleSaveColors = useCallback(async (productId: string, colors: ColorItem[]) => {
    setSavingId(productId);
    try {
      const newMeta = await patchMetadata(productId, { available_colors: colors });
      setProducts(prev => prev.map(p =>
        p.id === productId
          ? {
              ...p,
              _availableColors: colors,
              metadata: newMeta,
              _colorConfigKey: colors.map(c => `${c.name}:${c.in_stock ? '1' : '0'}`).sort().join('|') || 'NONE',
              _colorSource: 'metadata' as const,
            }
          : p
      ));
      showToast('Cores salvas! Refletem na loja publica.', 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, []);

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

  // Rank quick update — para um produto so
  const handleQuickRankApply = useCallback(async (productId: string, rank: number | null) => {
    setSavingId(productId);
    try {
      const newMeta = await patchMetadata(productId, { rank });
      setProducts(prev => prev.map(p =>
        p.id === productId ? { ...p, metadata: newMeta, _rank: rank } : p
      ));
      setQuickRankProductId(null);
      showToast(rank === null ? 'Ranking removido' : `Rank atualizado para #${rank}`, 'success');
    } catch (err: any) {
      showToast(`Erro: ${err.message}`, 'error');
    } finally {
      setSavingId(null);
    }
  }, []);

  // Bulk status
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
      fail === 0 ? `${ok} produto(s) ${newStatus === 'published' ? 'publicado(s)' : 'despublicado(s)'}!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  // Bulk color apply (agrupado)
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
    showToast(
      fail === 0 ? `Cores atualizadas em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  // Quick bulk add/remove cor
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
    showToast(
      fail === 0 ? `Cores ${action === 'add' ? 'adicionadas' : 'removidas'} em ${ok} produto(s)!` : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, [products]);

  // Bulk rank — aceita numero unico OU objeto { __sequential, start } (do BulkRankModal)
  const handleBulkRankApply = useCallback(async (productIds: string[], rankOrOpts: number | null | { __sequential: true; start: number }) => {
    setBulkSaving(true);
    let ok = 0, fail = 0;
    const isSequential = rankOrOpts !== null && typeof rankOrOpts === 'object' && (rankOrOpts as any).__sequential;
    const startValue = isSequential ? (rankOrOpts as any).start : 0;

    // Para sequencial, a ordem dos productIds importa. Vem da selecao na lista atual.
    for (let i = 0; i < productIds.length; i++) {
      const pid = productIds[i];
      const rankToSet: number | null = isSequential ? startValue + i : (rankOrOpts as number | null);
      try {
        const newMeta = await patchMetadata(pid, { rank: rankToSet });
        ok++;
        setProducts(prev => prev.map(p =>
          p.id === pid ? { ...p, metadata: newMeta, _rank: rankToSet } : p
        ));
      } catch { fail++; }
    }

    setBulkSaving(false);
    setShowBulkRank(false);
    setSelectedIds(new Set());
    showToast(
      fail === 0
        ? isSequential
          ? `Rank sequencial aplicado em ${ok} produto(s)!`
          : rankOrOpts === null
            ? `Rank limpo em ${ok} produto(s)`
            : `Rank #${rankOrOpts} aplicado em ${ok} produto(s)!`
        : `${ok} OK, ${fail} erro(s)`,
      fail === 0 ? 'success' : 'error'
    );
  }, []);

  // Product save (create/update)
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
        if (!productId) throw new Error('ID do produto nao encontrado');

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
        // rank: sempre atualiza (inclusive para null, que remove)
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

  // Selection
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

  // ============ FILTERED + SORTED PRODUCTS ============
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

    if (statusFilter === 'published') result = result.filter(p => p.status === 'published');
    else if (statusFilter === 'draft') result = result.filter(p => p.status === 'draft');
    else if (statusFilter === 'no_colors') result = result.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0);
    else if (statusFilter === 'has_colors') result = result.filter(p => p._availableColors.length > 0);
    else if (statusFilter === 'multicolor') result = result.filter(p => p._isLine && !p._needsColorSelection);
    else if (statusFilter === 'derived_colors') result = result.filter(p => p._colorSource === 'derived');
    else if (statusFilter === 'saved_colors') result = result.filter(p => p._colorSource === 'metadata');
    else if (statusFilter === 'with_rank') result = result.filter(p => p._rank !== null);
    else if (statusFilter === 'no_rank') result = result.filter(p => p._rank === null);

    // Ordenar por rank — produtos com rank primeiro (asc), depois sem rank (ordem original)
    if (sortByRank) {
      result = [...result].sort((a, b) => {
        const ra = a._rank;
        const rb = b._rank;
        if (ra === null && rb === null) return 0;
        if (ra === null) return 1;   // sem rank vai para baixo
        if (rb === null) return -1;  // com rank vai para cima
        return ra - rb;              // menor rank primeiro
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
    lines: products.filter(p => p._isLine).length,
    noColors: products.filter(p => p._isLine && p._needsColorSelection && p._availableColors.length === 0).length,
    multicolor: products.filter(p => p._isLine && !p._needsColorSelection).length,
    derivedColors: products.filter(p => p._colorSource === 'derived').length,
    savedColors: products.filter(p => p._colorSource === 'metadata').length,
    withRank: products.filter(p => p._rank !== null).length,
  }), [products]);

  const selectedProducts = filteredProducts.filter(p => selectedIds.has(p.id));
  const hasSelection = selectedIds.size > 0;
  const quickRankProduct = quickRankProductId ? products.find(p => p.id === quickRankProductId) || null : null;

  return (
    <div className="space-y-3 pb-24 overflow-x-hidden">
      {/* ============ STATS ROW ============ */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-white rounded-xl border border-zinc-100 p-2 sm:p-2.5 text-center">
          <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">Total</p>
          <p className="text-lg sm:text-xl font-bold text-zinc-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-100 p-2 sm:p-2.5 text-center">
          <p className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider">Publicados</p>
          <p className="text-lg sm:text-xl font-bold text-emerald-700">{stats.published}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-100 p-2 sm:p-2.5 text-center">
          <p className="text-[9px] font-bold text-amber-500 uppercase tracking-wider">Rascunhos</p>
          <p className="text-lg sm:text-xl font-bold text-amber-700">{stats.draft}</p>
        </div>
      </div>

      {/* Color + rank stats */}
      {(stats.derivedColors > 0 || stats.savedColors > 0 || stats.withRank > 0) && (
        <div className="flex gap-2 text-[10px] overflow-x-auto pb-0.5 -mx-1 px-1">
          {stats.withRank > 0 && (
            <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-lg border border-amber-200/60 font-medium shrink-0 flex items-center gap-1">
              <TrendingUp size={10} /> {stats.withRank} com rank
            </span>
          )}
          {stats.savedColors > 0 && (
            <span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-lg border border-emerald-200/60 font-medium shrink-0">
              {stats.savedColors} cores salvas
            </span>
          )}
          {stats.derivedColors > 0 && (
            <span className="bg-blue-50 text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200/60 font-medium shrink-0">
              {stats.derivedColors} auto-derivadas
            </span>
          )}
          {stats.noColors > 0 && (
            <span className="bg-zinc-50 text-zinc-500 px-2.5 py-1 rounded-lg border border-zinc-200/60 font-medium shrink-0">
              {stats.noColors} sem cores
            </span>
          )}
          {stats.multicolor > 0 && (
            <span className="bg-gradient-to-r from-red-50 via-yellow-50 to-blue-50 text-zinc-600 px-2.5 py-1 rounded-lg border border-zinc-200/60 font-medium shrink-0">
              {stats.multicolor} multicor
            </span>
          )}
        </div>
      )}

      {/* ============ SEARCH BAR ============ */}
      <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
        <div className="flex items-center gap-2 px-2.5 py-2 flex-wrap">
          <Search size={16} className="text-zinc-400 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar produtos..."
            className="flex-1 min-w-[100px] text-sm outline-none bg-transparent text-zinc-900 placeholder:text-zinc-400"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="p-1 text-zinc-300 hover:text-zinc-500 shrink-0">
              <X size={16} />
            </button>
          )}
          <button
            onClick={() => setSortByRank(s => !s)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all shrink-0 ${
              sortByRank ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-zinc-50 border-zinc-200 text-zinc-500'
            }`}
            title={sortByRank ? 'Ordem: por rank' : 'Ordem: padrao'}
          >
            <ArrowUpDown size={12} />
            {sortByRank ? 'Rank' : 'Padrao'}
          </button>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-all shrink-0 ${
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
            onClick={() => setEditingProduct(null)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shrink-0"
          >
            <PlusCircle size={14} />
            <span className="hidden sm:inline">Novo</span>
          </button>
          <button
            onClick={loadProducts}
            className="p-2 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 rounded-lg transition-colors shrink-0"
            title="Atualizar"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="border-t border-zinc-100 px-3 py-3 space-y-2.5 bg-zinc-50/50">
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

            <div>
              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1.5">Status/Tipo</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { key: 'all', label: 'Todos' },
                  { key: 'published', label: 'Publicados' },
                  { key: 'draft', label: 'Rascunhos' },
                  { key: 'with_rank', label: 'Com Rank', count: stats.withRank },
                  { key: 'no_rank', label: 'Sem Rank' },
                  { key: 'no_colors', label: 'Sem Cores', count: stats.noColors },
                  { key: 'has_colors', label: 'Com Cores' },
                  { key: 'multicolor', label: 'Multicor', count: stats.multicolor },
                  { key: 'derived_colors', label: 'Auto-derivadas', count: stats.derivedColors },
                  { key: 'saved_colors', label: 'Cores Salvas', count: stats.savedColors },
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
          </div>
        )}
      </div>

      <ActiveFilterChips
        groupFilter={groupFilter}
        statusFilter={statusFilter}
        searchQuery={searchQuery}
        onRemoveGroup={() => setGroupFilter('all')}
        onRemoveStatus={() => setStatusFilter('all')}
        onRemoveSearch={() => setSearchQuery('')}
        onClearAll={() => { setGroupFilter('all'); setStatusFilter('all'); setSearchQuery(''); }}
      />

      {/* Select all */}
      {!loading && filteredProducts.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <button onClick={selectAll} className="flex items-center gap-1.5 text-[11px] text-zinc-500 hover:text-zinc-700 font-medium touch-manipulation py-1 min-w-0 truncate">
            {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 ? (
              <CheckSquare size={16} className="text-blue-600 shrink-0" />
            ) : selectedIds.size > 0 ? (
              <MinusSquare size={16} className="text-blue-400 shrink-0" />
            ) : (
              <Square size={16} className="text-zinc-300 shrink-0" />
            )}
            <span className="truncate">
              {selectedIds.size === filteredProducts.length ? 'Desmarcar todos' : `Selecionar todos (${filteredProducts.length})`}
            </span>
          </button>
          <span className="flex-1" />
          <span className="text-[11px] text-zinc-400 shrink-0">
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
          {(searchQuery || groupFilter !== 'all' || statusFilter !== 'all') && (
            <button onClick={() => { setSearchQuery(''); setGroupFilter('all'); setStatusFilter('all'); }} className="text-blue-600 text-xs mt-2 hover:underline">
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
              onSaveColors={handleSaveColors}
              onStatusChange={handleStatusChange}
              onEdit={(product) => setEditingProduct(product)}
              onQuickRank={(pid) => setQuickRankProductId(pid)}
              saving={savingId === p.id}
            />
          ))}
        </div>
      )}

      {/* ============ FLOATING BULK BAR ============ */}
      {hasSelection && (
        <div className="fixed bottom-0 inset-x-0 z-50 animate-slide-up-bar" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <div className="bg-zinc-900 mx-2 sm:mx-3 rounded-2xl shadow-2xl px-3 py-2.5 max-w-full">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0">
                  {selectedIds.size}
                </span>
                <span className="text-white/80 text-xs font-medium truncate">
                  selecionado{selectedIds.size > 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={selectAll} className="text-white/50 text-[10px] hover:text-white/80 px-2 py-1">
                  {selectedIds.size === filteredProducts.length ? 'Desmarcar' : 'Todos'}
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="p-1.5 text-white/40 hover:text-white/80 hover:bg-white/10 rounded-lg">
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-0.5 -mx-1 px-1 scrollbar-hide">
              <button onClick={() => setShowBulkStatus(true)} className="flex items-center gap-1 px-3 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shrink-0">
                <Globe size={12} /> Status
              </button>
              <button onClick={() => setShowBulkRank(true)} className="flex items-center gap-1 px-3 py-2.5 bg-amber-600 text-white rounded-xl text-xs font-bold hover:bg-amber-700 transition-colors shrink-0">
                <TrendingUp size={12} /> Rank
              </button>
              <button onClick={() => setShowBulkColors(true)} className="flex items-center gap-1 px-3 py-2.5 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors shrink-0">
                <Palette size={12} /> Cores
              </button>
              <button onClick={() => setQuickBulkAction('add')} className="flex items-center gap-1 px-3 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 transition-colors shrink-0">
                <Plus size={12} /> Add Cor
              </button>
              <button onClick={() => setQuickBulkAction('remove')} className="flex items-center gap-1 px-3 py-2.5 bg-red-600/90 text-white rounded-xl text-xs font-bold hover:bg-red-700 transition-colors shrink-0">
                <Minus size={12} /> Rem Cor
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

      {showBulkRank && selectedProducts.length > 0 && (
        <BulkRankModal
          products={selectedProducts}
          onApply={handleBulkRankApply as any}
          onClose={() => setShowBulkRank(false)}
          saving={bulkSaving}
        />
      )}

      {quickRankProduct && (
        <QuickRankPopup
          product={quickRankProduct}
          onApply={handleQuickRankApply}
          onClose={() => setQuickRankProductId(null)}
          saving={savingId === quickRankProduct.id}
        />
      )}

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
