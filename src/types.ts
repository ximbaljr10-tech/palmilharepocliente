export interface Product {
  id: string;
  medusa_id?: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  price: number;
  image_url: string;
  images?: string[];
  yards: number | null;
  variant_id?: string;
  metadata?: Record<string, any>;
  shipping?: {
    height: number;
    width: number;
    length: number;
    weight: number;
  };
  // Estoque (2026-04-25 FRENTE 2)
  stock?: number | null;
  unlimited_stock?: boolean;
}

// Helper central para saber se um produto esta disponivel para compra.
// Regra: unlimited_stock=true → sempre disponivel. Caso contrario, stock>0.
// Se stock for null/undefined → tratamos como disponivel (compatibilidade com
// produtos antigos que ainda nao tem o campo salvo).
export function isProductAvailable(p: Pick<Product, 'stock' | 'unlimited_stock'>): boolean {
  if (p.unlimited_stock === true) return true;
  if (p.stock === null || p.stock === undefined) return true;
  return Number(p.stock) > 0;
}

// Quantidade maxima que pode ser colocada no carrinho para esse produto.
// Retorna Infinity para ilimitado ou para produtos sem campo de estoque definido.
export function maxCartQuantity(p: Pick<Product, 'stock' | 'unlimited_stock'>): number {
  if (p.unlimited_stock === true) return Infinity;
  if (p.stock === null || p.stock === undefined) return Infinity;
  return Math.max(0, Number(p.stock));
}

export type ColorMode = 'sortida' | 'prioridade';

export interface ColorPreference {
  mode: ColorMode;
  color_1?: string;
  color_2?: string;
  color_3?: string;
  observation?: string;
}

export interface CartItem extends Product {
  quantity: number;
  color_preference?: ColorPreference;
}

// ============ COLOR GROUPS ============
// Group 1: Nylon Esportiva (Indonésia lines)
// Group 2: King (King Shark lines)
// Group 3: Other standard lines (500j-12000j, not Nylon/King)

export type ColorLineItem = { name: string; hex: string };

// Group 1 — NYLON ESPORTIVA (Indonésia)
const COLORS_NYLON_ESPORTIVA: ColorLineItem[] = [
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Branca', hex: '#f5f5f5' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Preta', hex: '#1a1a1a' },
  { name: 'Marrom', hex: '#92400e' },
  { name: 'Multicor', hex: 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6)' },
];

// Group 2 — KING SHARK
const COLORS_KING: ColorLineItem[] = [
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Verde', hex: '#22c55e' },
];

// Group 3 — OTHER STANDARD LINES (500j-12000j, not Nylon/King)
const COLORS_OTHER_LINES: ColorLineItem[] = [
  { name: 'Cinza', hex: '#9ca3af' },
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Amarela', hex: '#eab308' },
  { name: 'Lilás', hex: '#a855f7' },
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Branca', hex: '#f5f5f5' },
  { name: 'Laranja', hex: '#f97316' },
];

/**
 * Detect if product is Nylon Esportiva (Indonésia lines).
 * Matches titles containing "indonésia" or "indonesia" (case-insensitive).
 */
export function isNylonEsportiva(product: Product): boolean {
  const t = (product.title || '').toLowerCase();
  return /indon[eé]sia/i.test(t);
}

/**
 * Detect if product is King Shark line.
 * Matches titles containing "king shark" or "king" at the start (case-insensitive).
 */
export function isKingLine(product: Product): boolean {
  const t = (product.title || '').toLowerCase();
  return /\bking\b/i.test(t);
}

/**
 * Get the color group name for display purposes.
 */
export function getColorGroupName(product: Product): string {
  if (isNylonEsportiva(product)) return 'Nylon Esportiva';
  if (isKingLine(product)) return 'King';
  return '';
}

/**
 * Get the default color list for a product based on its group (title-based).
 * Used as fallback when no admin-configured colors exist.
 */
export function getDefaultColorsForGroup(product: Product): ColorLineItem[] {
  if (isNylonEsportiva(product)) return COLORS_NYLON_ESPORTIVA;
  if (isKingLine(product)) return COLORS_KING;
  return COLORS_OTHER_LINES;
}

/**
 * Get the correct color list for a product.
 * 
 * Priority:
 * 1. If metadata.available_colors exists (admin has configured colors),
 *    return ONLY the in-stock colors from that list.
 * 2. Otherwise, return the default group-based colors (title matching).
 * 
 * This ensures synchronization between admin and store:
 * - Admin saves available_colors with in_stock flags
 * - Store shows only in-stock colors to customers
 * - If admin hasn't configured anything, store shows all group defaults
 */
export function getColorsForProduct(product: Product): ColorLineItem[] {
  const adminColors = product.metadata?.available_colors;
  if (Array.isArray(adminColors) && adminColors.length > 0) {
    // Admin has configured colors — show only in-stock ones
    // This is THE source of truth when present
    return adminColors
      .filter((c: any) => c.in_stock !== false) // Include if in_stock is true or undefined
      .map((c: any) => ({
        name: c.name,
        hex: c.hex || LINE_COLORS.find(lc => 
          lc.name === c.name || 
          lc.name.toLowerCase() === (c.name || '').toLowerCase() ||
          lc.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '') === (c.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        )?.hex || '#9ca3af',
      }));
  }
  // Fallback: group-based defaults
  return getDefaultColorsForGroup(product);
}

/**
 * Master list of ALL possible colors (union of all groups).
 * Used for rendering color badges in cart/checkout/admin where we need
 * to look up any color by name regardless of group.
 */
export const LINE_COLORS: ColorLineItem[] = [
  { name: 'Preta', hex: '#1a1a1a' },
  { name: 'Branca', hex: '#f5f5f5' },
  { name: 'Verde', hex: '#22c55e' },
  { name: 'Laranja', hex: '#f97316' },
  { name: 'Amarela', hex: '#eab308' },
  { name: 'Rosa', hex: '#ec4899' },
  { name: 'Lilás', hex: '#a855f7' },
  { name: 'Lilas', hex: '#a855f7' }, // Alias without accent (admin saves this)
  { name: 'Azul', hex: '#3b82f6' },
  { name: 'Cinza', hex: '#9ca3af' },
  { name: 'Marrom', hex: '#92400e' },
  { name: 'Multicor', hex: 'linear-gradient(135deg, #ef4444, #eab308, #22c55e, #3b82f6)' },
  // Legacy: keep old name mapped so existing orders still render
  { name: 'Roxa', hex: '#a855f7' },
  { name: 'Vermelha', hex: '#ef4444' },
];

// Yards that skip color selection (default: sortida)
export const SKIP_COLOR_YARDS = [50, 100, 200];

/**
 * Determines if a product needs color priority selection.
 * Lines (products with yards) that are NOT 50/100/200 need it.
 * Non-line products (carretilha, camisas, bone) don't need it.
 */
export function needsColorSelection(product: Product): boolean {
  if (!product.yards) return false; // Not a line product
  if (SKIP_COLOR_YARDS.includes(product.yards)) return false;
  return true;
}

export interface ShippingOption {
  id: number;
  name: string;
  price: number;
  delivery_time: number;
  // Package legado no formato { dimensions: { h, w, l }, weight, format }
  // (compat com metadata.package_dimensions antigo).
  package: any;
  // 2026-04-25 FIX CAIXA IDEAL: formato FLAT retornado pela Superfrete,
  // exatamente do jeito que o backend /store/shipping-quote devolve.
  // Salvamos isso para enviar de volta ao criar o pedido.
  ideal_package?: {
    weight: number;
    height: number;
    width: number;
    length: number;
    format: string;
  } | null;
}
