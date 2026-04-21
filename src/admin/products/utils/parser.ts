// ============================================================================
// Product parser + group detection + color helpers
// ============================================================================

import {
  getDefaultColorsForGroup, getColorGroupName, needsColorSelection,
} from '../../../types';
import type { ColorItem, ParsedProduct, ProductData } from '../types';
import { ALL_COLORS } from '../types';
import { getDefaultShipping } from './shipping';

export function getColorHex(name: string): string {
  const c = ALL_COLORS.find(c => c.name.toLowerCase() === name.toLowerCase());
  return c?.hex || '#9ca3af';
}

export function detectGroup(title: string, metadata: Record<string, any>): string {
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

export function buildColorConfigKey(colors: ColorItem[]): string {
  return colors
    .map(c => `${c.name}:${c.in_stock ? '1' : '0'}`)
    .sort()
    .join('|') || 'NONE';
}

export function parseProduct(p: ProductData): ParsedProduct {
  const title = p.title || '';
  const metadata = p.metadata || {};
  const variant = p.variants?.[0];

  const yardsMatch = title.match(/(\d+)\s*(j|jds|jardas)\b/i);
  const yards = yardsMatch ? parseInt(yardsMatch[1], 10) : null;

  const fioMatch = title.match(/[Ff]io\s+([\d.]+)/);
  const fio = fioMatch ? fioMatch[1] : null;

  const group = detectGroup(title, metadata);
  const isLine = yards !== null;

  // ============================================================================
  // PRICE PARSING — Medusa V2 retorna REAIS (decimal) em ambas as APIs:
  //
  //   • Store API (`calculated_price.calculated_amount`): REAIS decimal.
  //     Ex.: 45.4 → R$ 45,40.
  //
  //   • Admin API (`variant.prices[].amount`): TAMBÉM REAIS decimal.
  //     Ex.: 45.4 → R$ 45,40.  Confirmado via curl na API real.
  //
  // BUG CORRIGIDO: o parser anterior tratava `prices[].amount` como centavos
  // e dividia por 100, fazendo R$ 45,40 virar R$ 0,45 no admin. Agora
  // tratamos ambas as origens como REAIS — que é o formato real do Medusa V2.
  // ============================================================================
  const allPrices = variant?.prices || [];
  const brlPrice = allPrices.find((pr: any) => pr.currency_code === 'brl');
  const priceFromAdmin = brlPrice || allPrices[0];
  const priceFromStore = variant?.calculated_price?.calculated_amount;
  let price = 0;
  let priceDisplay = '--';
  if (priceFromStore != null) {
    // Store API — reais (decimal).
    price = Number(priceFromStore);
    priceDisplay = price.toFixed(2).replace('.', ',');
  } else if (priceFromAdmin?.amount != null) {
    // Admin API — TAMBÉM reais (decimal) no Medusa V2.
    price = Number(priceFromAdmin.amount);
    if (!Number.isFinite(price)) price = 0;
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

  const colorConfigKey = buildColorConfigKey(availableColors);

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
