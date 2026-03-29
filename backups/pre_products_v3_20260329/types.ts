export interface Product {
  id: string;
  medusa_id?: string;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  price: number;
  image_url: string;
  yards: number | null;
  variant_id?: string;
  metadata?: Record<string, any>;
  shipping?: {
    height: number;
    width: number;
    length: number;
    weight: number;
  };
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
 * Get the correct color list for a product based on its group.
 * Returns the group-specific colors.
 */
export function getColorsForProduct(product: Product): ColorLineItem[] {
  if (isNylonEsportiva(product)) return COLORS_NYLON_ESPORTIVA;
  if (isKingLine(product)) return COLORS_KING;
  return COLORS_OTHER_LINES;
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
  package: any;
}
