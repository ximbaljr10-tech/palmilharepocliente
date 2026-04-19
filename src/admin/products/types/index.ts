// ============================================================================
// Types & Constants - Admin Products Module
// ============================================================================

export interface ColorItem {
  name: string;
  hex: string;
  in_stock: boolean;
}

export interface ProductData {
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

export interface ParsedProduct extends ProductData {
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

export type ViewMode =
  | 'home'       // Dashboard inicial de ações
  | 'list'       // Lista tradicional
  | 'colors'     // Color Studio
  | 'yards'      // Yard Studio
  | 'rank'       // Rank Studio (lista reordenável)
  | 'reorder';   // Reorder mode legado (apenas dentro do list)

export type EditorTab = 'info' | 'images' | 'colors' | 'rank' | 'shipping';

// ============================================================================
// COLOR PALETTE
// ============================================================================

export const ALL_COLORS: { name: string; hex: string }[] = [
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
