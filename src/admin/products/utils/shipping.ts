// ============================================================================
// Shipping defaults por tipo de produto / jarda
// ============================================================================

export function getDefaultShipping(
  yards: number | null,
  title: string,
): { height: number; width: number; length: number; weight: number } {
  if (title && /carretilha/i.test(title)) {
    return { height: 25, width: 33, length: 31, weight: 1.0 };
  }
  switch (yards) {
    case 50:    return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 100:   return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 200:   return { height: 12, width: 12, length: 12, weight: 0.2 };
    case 500:   return { height: 12, width: 12, length: 19, weight: 0.4 };
    case 600:   return { height: 12, width: 18, length: 18, weight: 0.3 };
    case 1000:  return { height: 15, width: 15, length: 18, weight: 0.5 };
    case 2000:  return { height: 18, width: 18, length: 19, weight: 1.0 };
    case 3000:  return { height: 18, width: 18, length: 27, weight: 1.0 };
    case 6000:  return { height: 19, width: 19, length: 25, weight: 2.0 };
    case 12000: return { height: 21, width: 21, length: 30, weight: 3.0 };
    default:    return { height: 12, width: 12, length: 12, weight: 0.2 };
  }
}
