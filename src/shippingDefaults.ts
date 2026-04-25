// ============================================================================
// FONTE UNICA DE VERDADE para dimensoes de frete por tipo de produto
// ============================================================================
// Este arquivo e o UNICO lugar onde dimensoes default de frete sao definidas.
// TODOS os outros arquivos devem importar daqui.
//
// REGRA: ZERO calculo de cubagem/caixa no frontend.
// O calculo e feito 100% pela API da Superfrete.
// Este arquivo contem APENAS as dimensoes INDIVIDUAIS de cada produto.
//
// CRIADO: 2026-04-25
// ============================================================================

export interface ShippingDimensions {
  height: number;  // cm - minimo 1
  width: number;   // cm - minimo 1
  length: number;  // cm - minimo 1
  weight: number;  // kg - minimo 0.1
}

// Limites minimos absolutos - Superfrete nao aceita menores que isso.
export const MIN_DIMENSION_CM = 1;
export const MIN_WEIGHT_KG = 0.1;

/**
 * Tabela de dimensoes por JARDAS (linhas de pipa).
 * Cada entrada representa as dimensoes de UMA UNIDADE do produto.
 */
const SHIPPING_BY_YARDS: Record<number, ShippingDimensions> = {
  50:    { height: 12, width: 12, length: 12, weight: 0.2 },
  100:   { height: 12, width: 12, length: 12, weight: 0.2 },
  200:   { height: 12, width: 12, length: 12, weight: 0.2 },
  500:   { height: 12, width: 12, length: 19, weight: 0.4 },
  600:   { height: 12, width: 18, length: 18, weight: 0.3 },
  1000:  { height: 15, width: 15, length: 18, weight: 0.5 },
  2000:  { height: 18, width: 18, length: 19, weight: 1.0 },
  3000:  { height: 18, width: 18, length: 27, weight: 1.0 },
  6000:  { height: 19, width: 19, length: 25, weight: 2.0 },
  12000: { height: 21, width: 21, length: 30, weight: 3.0 },
};

/**
 * Dimensoes para CARRETILHAS.
 */
const SHIPPING_CARRETILHA: ShippingDimensions = {
  height: 25, width: 33, length: 31, weight: 1.0,
};

/**
 * Fallback SEGURO - usado APENAS quando nao e possivel identificar o tipo
 * do produto (sem jardas, sem carretilha). Dimensoes conservadoras.
 */
const SHIPPING_FALLBACK: ShippingDimensions = {
  height: 12, width: 12, length: 12, weight: 0.3,
};

/**
 * Retorna as dimensoes de frete DEFAULT para um produto com base no titulo e jardas.
 *
 * Prioridade:
 * 1. Se o titulo contem "carretilha" → usa dimensoes de carretilha
 * 2. Se tem jardas conhecidas → usa tabela por jardas
 * 3. Se nao se encaixa → usa fallback seguro
 *
 * IMPORTANTE: Esta funcao retorna SEMPRE valores validos (nunca null, nunca 0).
 */
export function getShippingDefaults(
  yards: number | null,
  title: string,
): ShippingDimensions {
  // 1. Carretilha
  if (title && /carretilha/i.test(title)) {
    return { ...SHIPPING_CARRETILHA };
  }
  // 2. Por jardas
  if (yards !== null && SHIPPING_BY_YARDS[yards]) {
    return { ...SHIPPING_BY_YARDS[yards] };
  }
  // 3. Fallback
  return { ...SHIPPING_FALLBACK };
}

// ============================================================================
// VALIDACAO RIGOROSA de dimensoes para envio a Superfrete
// ============================================================================

export interface ShippingValidationResult {
  valid: boolean;
  dimensions: ShippingDimensions;
  errors: string[];
  warnings: string[];
  usedFallback: boolean;
}

/**
 * Valida e sanitiza dimensoes de frete de um produto.
 *
 * REGRAS:
 * - height >= 1
 * - width >= 1
 * - length >= 1
 * - weight >= 0.1
 *
 * Se algum valor for invalido:
 * 1. Tenta usar o fallback por jardas/titulo
 * 2. Se AINDA for invalido → marca como erro e bloqueia
 *
 * @returns Resultado com dimensoes validadas e lista de erros/avisos
 */
export function validateShippingDimensions(
  raw: {
    height?: number | string | null;
    width?: number | string | null;
    length?: number | string | null;
    weight?: number | string | null;
  },
  productTitle: string,
  yards: number | null,
): ShippingValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let usedFallback = false;

  const toNum = (v: any): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  let h = toNum(raw.height);
  let w = toNum(raw.width);
  let l = toNum(raw.length);
  let wt = toNum(raw.weight);

  // Verificar se algum valor esta abaixo do minimo
  const needsFallback =
    h < 1 || w < 1 || l < 1 || wt < 0.1;

  if (needsFallback) {
    const defaults = getShippingDefaults(yards, productTitle);
    usedFallback = true;

    if (h < 1) {
      warnings.push(`Altura invalida (${raw.height}), usando fallback: ${defaults.height}cm`);
      h = defaults.height;
    }
    if (w < 1) {
      warnings.push(`Largura invalida (${raw.width}), usando fallback: ${defaults.width}cm`);
      w = defaults.width;
    }
    if (l < 1) {
      warnings.push(`Comprimento invalido (${raw.length}), usando fallback: ${defaults.length}cm`);
      l = defaults.length;
    }
    if (wt < 0.1) {
      warnings.push(`Peso invalido (${raw.weight}), usando fallback: ${defaults.weight}kg`);
      wt = defaults.weight;
    }
  }

  // Validacao FINAL - se mesmo com fallback ficou invalido, e ERRO
  if (h < 1) errors.push(`Altura final invalida: ${h}cm (minimo 1cm)`);
  if (w < 1) errors.push(`Largura final invalida: ${w}cm (minimo 1cm)`);
  if (l < 1) errors.push(`Comprimento final invalido: ${l}cm (minimo 1cm)`);
  if (wt < 0.1) errors.push(`Peso final invalido: ${wt}kg (minimo 0.1kg)`);

  return {
    valid: errors.length === 0,
    dimensions: { height: h, width: w, length: l, weight: wt },
    errors,
    warnings,
    usedFallback,
  };
}

/**
 * Extrai jardas do titulo do produto.
 * Retorna null se nao encontrar.
 */
export function extractYardsFromTitle(title: string): number | null {
  const match = title?.match(/(\d+)\s*(j|jds|jardas)\b/i);
  return match ? parseInt(match[1], 10) : null;
}
