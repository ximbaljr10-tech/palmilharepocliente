// ============================================================================
// TESTES DA LOGICA DE ESTOQUE
// 2026-04-25 FRENTE 2 - Testa helpers isProductAvailable e maxCartQuantity
// ============================================================================

import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src', 'types.ts');
const OUT_DIR = join(__dirname, '_tmp');
const OUT = join(OUT_DIR, 'types.js');
mkdirSync(OUT_DIR, { recursive: true });

execSync(
  `npx esbuild ${SRC} --bundle --format=esm --outfile=${OUT} --platform=neutral --loader:.ts=ts`,
  { stdio: 'inherit' }
);

const { isProductAvailable, maxCartQuantity } = await import(OUT);

let passed = 0, failed = 0;
const assert = (cond, label) => {
  if (cond) { passed++; console.log(`  ok    ${label}`); }
  else       { failed++; console.error(`  FAIL  ${label}`); }
};

console.log('\n=== TESTE: isProductAvailable ===');
assert(isProductAvailable({ unlimited_stock: true, stock: 0 }) === true, 'unlimited=true + stock=0 → disponivel');
assert(isProductAvailable({ unlimited_stock: true }) === true, 'unlimited=true sem stock → disponivel');
assert(isProductAvailable({ unlimited_stock: false, stock: 10 }) === true, 'unlimited=false + stock=10 → disponivel');
assert(isProductAvailable({ unlimited_stock: false, stock: 1 }) === true, 'unlimited=false + stock=1 → disponivel');
assert(isProductAvailable({ unlimited_stock: false, stock: 0 }) === false, 'unlimited=false + stock=0 → ESGOTADO');
assert(isProductAvailable({ stock: 0 }) === false, 'sem unlimited + stock=0 → ESGOTADO');
assert(isProductAvailable({ stock: null }) === true, 'stock=null → compativel (disponivel)');
assert(isProductAvailable({}) === true, 'produto sem campos de estoque → compat (disponivel)');
assert(isProductAvailable({ unlimited_stock: false, stock: -5 }) === false, 'stock negativo → esgotado');

console.log('\n=== TESTE: maxCartQuantity ===');
assert(maxCartQuantity({ unlimited_stock: true }) === Infinity, 'unlimited → Infinity');
assert(maxCartQuantity({ unlimited_stock: true, stock: 5 }) === Infinity, 'unlimited sobrepoe stock');
assert(maxCartQuantity({ unlimited_stock: false, stock: 10 }) === 10, 'stock=10 → max=10');
assert(maxCartQuantity({ unlimited_stock: false, stock: 0 }) === 0, 'stock=0 → max=0');
assert(maxCartQuantity({ stock: null }) === Infinity, 'stock null → Infinity (compat)');
assert(maxCartQuantity({ unlimited_stock: false, stock: -3 }) === 0, 'stock negativo → max=0');

console.log(`\n=== RESUMO ===\nPassou: ${passed}\nFalhou: ${failed}\n`);
process.exit(failed > 0 ? 1 : 0);
